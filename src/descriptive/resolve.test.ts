import { describe, expect, it, vi, beforeEach, afterEach } from "vitest";
import { mkdtempSync, writeFileSync, existsSync, rmSync, realpathSync, mkdirSync } from "node:fs";
import { join } from "node:path";
import { tmpdir } from "node:os";
import { resolveMediaDurations, resolveScripts, resolveSubtitles, resolveGeneratedMedia } from "./resolve";
import type { DescriptiveRoot } from "./compiler";

// ── Mock generateTTS ──────────────────────────────────────────────────────

vi.mock("../render/tts", () => ({
  generateTTS: vi.fn(),
}));

import { generateTTS } from "../render/tts";

// ── Mock child_process for functions that call execSync directly ──────────

vi.mock("node:child_process", () => ({
  execSync: vi.fn(),
}));

import { execSync } from "node:child_process";

let tmpDir: string;

beforeEach(() => {
  vi.clearAllMocks();
  tmpDir = mkdtempSync(join(realpathSync(tmpdir()), "resolve-test-"));
});

afterEach(() => {
  rmSync(tmpDir, { recursive: true, force: true });
});

// ── resolveScripts (TTS) ───────────────────────────────────────────────────

describe("resolveScripts", () => {
  it("calls generateTTS for each scene with a script", async () => {
    (generateTTS as any).mockReturnValue(join(tmpDir, "hook.wav"));

    const root: DescriptiveRoot = {
      children: [{
        type: "scene", name: "Hook", script: "Hello world",
        layout: "parallel", children: [],
      }],
    };

    const result = await resolveScripts(root, { outputDir: tmpDir });

    // Should have an audio child attached
    const scene = result.children[0] as any;
    expect(scene.children).toHaveLength(1);
    expect(scene.children[0].type).toBe("audio");
    expect(scene.children[0].src).toBe(join(tmpDir, "hook.wav"));

    // When no ttsCli override, falls back to DEFAULT_TTS_CLI
    expect(generateTTS).toHaveBeenCalledWith(
      "Hello world",
      expect.stringContaining("Hook.wav"),
      expect.stringContaining("edge-tts"),
    );
  });

  it("skips scenes without a script", async () => {
    const root: DescriptiveRoot = {
      children: [{
        type: "scene", name: "Silent", layout: "parallel", children: [],
      }],
    };

    const result = await resolveScripts(root, { outputDir: tmpDir });
    expect((result.children[0] as any).children).toHaveLength(0);
    expect(generateTTS).not.toHaveBeenCalled();
  });

  it("skips scenes that already have an audio child", async () => {
    const root: DescriptiveRoot = {
      children: [{
        type: "scene", name: "Done", script: "Already have audio",
        layout: "parallel",
        children: [{ type: "audio", src: "existing.wav", volume: 1 } as any],
      }],
    };

    await resolveScripts(root, { outputDir: tmpDir });
    expect(generateTTS).not.toHaveBeenCalled();
  });

  it("propagates ttsCli option to generateTTS", async () => {
    (generateTTS as any).mockReturnValue(join(tmpDir, "custom.wav"));

    const root: DescriptiveRoot = {
      children: [{
        type: "scene", name: "Custom", script: "Text",
        layout: "parallel", children: [],
      }],
    };

    await resolveScripts(root, { outputDir: tmpDir, ttsCli: "custom-tts {input} {output}" });
    expect(generateTTS).toHaveBeenCalledWith("Text", expect.any(String), "custom-tts {input} {output}");
  });
});

// ── resolveSubtitles (STT) ─────────────────────────────────────────────────

describe("resolveSubtitles", () => {
  it("runs STT on audio children and produces merged VTT", async () => {
    const audioPath = join(tmpDir, "narration.wav");
    writeFileSync(audioPath, "fake-audio");

    // execSync writes a VTT file
    (execSync as any).mockImplementation(() => {
      writeFileSync(join(tmpDir, "narration.vtt"),
        "WEBVTT\n\n00:00:01.000 --> 00:00:03.000\nHello world\n");
    });

    const root: DescriptiveRoot = {
      children: [{
        type: "scene", name: "S", layout: "parallel",
        children: [{
          id: "a1", type: "audio", src: audioPath,
          actions: [{ id: "act1", start: 5, end: 8 }],
        } as any],
        durationInSeconds: 8,
      } as any],
    };

    const result = await resolveSubtitles(root, { outputDir: tmpDir });
    expect(result.subtitle).toBeDefined();
    expect(result.subtitle!.src).toBe(join(tmpDir, "subtitles.vtt"));
    expect(existsSync(result.subtitle!.src)).toBe(true);

    // Timestamps should be shifted by the audio offset (5s)
    const vtt = (await import("node:fs")).readFileSync(result.subtitle!.src, "utf-8");
    expect(vtt).toContain("00:00:06.000 --> 00:00:08.000");
  });

  it("returns clone unchanged when no sttCli and no root.stt", async () => {
    const root: DescriptiveRoot = { children: [] };
    // Passing empty sttCli — should use default (whisper) and still run
    const result = await resolveSubtitles(root, { outputDir: tmpDir });
    // Default is whisper, so it will attempt execSync; our mock returns nothing
    expect(result.subtitle).toBeUndefined();
  });
});

// ── resolveGeneratedMedia (TTI / TTV) ─────────────────────────────────────

describe("resolveGeneratedMedia", () => {
  it("generates image from prompt via TTI CLI", async () => {
    const out = join(tmpDir, "image-0.png");
    (execSync as any).mockImplementation(() => { writeFileSync(out, "fake-png"); });

    const root: DescriptiveRoot = {
      children: [{
        type: "scene", name: "S", layout: "parallel",
        children: [{ type: "image", prompt: "sunset", duration: 3 }],
      }],
    };

    const result = await resolveGeneratedMedia(root, { outputDir: tmpDir, ttiCli: "gen-img --prompt {input} --out {output}" });
    const img = (result.children[0] as any).children[0];
    expect(img.src).toBe(out);
    expect(execSync).toHaveBeenCalledWith(
      'gen-img --prompt sunset --out ' + join(tmpDir, "image-0.png"),
      expect.objectContaining({ stdio: ["pipe", "pipe", "pipe"] }),
    );
  });

  it("generates video from prompt via TTV CLI", async () => {
    const out = join(tmpDir, "video-0.mp4");
    (execSync as any).mockImplementation(() => { writeFileSync(out, "fake-mp4"); });

    const root: DescriptiveRoot = {
      children: [{
        type: "scene", name: "S", layout: "parallel",
        children: [{ type: "video", prompt: "ocean waves", duration: 5 }],
      }],
    };

    const result = await resolveGeneratedMedia(root, { outputDir: tmpDir, ttvCli: "gen-vid --prompt {input} --out {output}" });
    const vid = (result.children[0] as any).children[0];
    expect(vid.src).toBe(out);
    expect(execSync).toHaveBeenCalledWith(
      'gen-vid --prompt ocean waves --out ' + join(tmpDir, "video-0.mp4"),
      expect.objectContaining({ stdio: ["pipe", "pipe", "pipe"] }),
    );
  });

  it("skips nodes that already have src", async () => {
    const root: DescriptiveRoot = {
      children: [{
        type: "scene", name: "S", layout: "parallel",
        children: [{ type: "image", src: "existing.png", prompt: "skip me", duration: 3 }],
      }],
    };

    await resolveGeneratedMedia(root, { outputDir: tmpDir });
    expect(execSync).not.toHaveBeenCalled();
  });

  it("uses default TTI CLI when no options or root.tti provided", async () => {
    const out = join(tmpDir, "image-0.png");
    (execSync as any).mockImplementation(() => { writeFileSync(out, "fake-png"); });

    const root: DescriptiveRoot = {
      children: [{
        type: "scene", name: "S", layout: "parallel",
        children: [{ type: "image", prompt: "default test", duration: 3 }],
      }],
    };

    await resolveGeneratedMedia(root, { outputDir: tmpDir });
    // Should use DEFAULT_TTI_CLI (pi agent) when nothing else specified
    expect(execSync).toHaveBeenCalledTimes(1);
    const cmd = (execSync as any).mock.calls[0][0] as string;
    expect(cmd).toContain("pi");
    expect(cmd).toContain("generate image");
    expect(cmd).toContain("default test");
  });

  it("root.tti overrides options.ttiCli", async () => {
    const out = join(tmpDir, "image-0.png");
    (execSync as any).mockImplementation(() => { writeFileSync(out, "fake-png"); });

    const root: DescriptiveRoot = {
      tti: "root-tti {input} --out {output}",
      children: [{
        type: "scene", name: "S", layout: "parallel",
        children: [{ type: "image", prompt: "override test", duration: 3 }],
      }],
    };

    await resolveGeneratedMedia(root, { outputDir: tmpDir, ttiCli: "option-tti {input}" });
    expect(execSync).toHaveBeenCalledWith(
      'root-tti override test --out ' + join(tmpDir, "image-0.png"),
      expect.anything(),
    );
  });

  it("options.ttiCli overrides default when no root.tti", async () => {
    const out = join(tmpDir, "image-0.png");
    (execSync as any).mockImplementation(() => { writeFileSync(out, "fake-png"); });

    const root: DescriptiveRoot = {
      children: [{
        type: "scene", name: "S", layout: "parallel",
        children: [{ type: "image", prompt: "test", duration: 3 }],
      }],
    };

    await resolveGeneratedMedia(root, { outputDir: tmpDir, ttiCli: "custom-tti --prompt {input} --out {output}" });
    expect(execSync).toHaveBeenCalledWith(
      'custom-tti --prompt test --out ' + join(tmpDir, "image-0.png"),
      expect.anything(),
    );
  });

  it("skips node when execSync produces no output file", async () => {
    // execSync succeeds but writes nothing
    (execSync as any).mockReturnValue(Buffer.from(""));

    const root: DescriptiveRoot = {
      children: [{
        type: "scene", name: "S", layout: "parallel",
        children: [{ type: "image", prompt: "fail", duration: 3 }],
      }],
    };

    const result = await resolveGeneratedMedia(root, { outputDir: tmpDir, ttiCli: "gen {input}" });
    const img = (result.children[0] as any).children[0];
    expect(img.src).toBeUndefined();
    expect(execSync).toHaveBeenCalledTimes(1);
  });

  it("continues when execSync throws", async () => {
    (execSync as any).mockImplementation(() => { throw new Error("CLI not found"); });

    const root: DescriptiveRoot = {
      children: [{
        type: "scene", name: "S", layout: "parallel",
        children: [{ type: "image", prompt: "fail", duration: 3 }],
      }],
    };

    const result = await resolveGeneratedMedia(root, { outputDir: tmpDir, ttiCli: "gen {input}" });
    const img = (result.children[0] as any).children[0];
    expect(img.src).toBeUndefined();
    // Does NOT throw — error is caught and logged
    expect(execSync).toHaveBeenCalledTimes(1);
  });

  it("caches generated output and skips second execSync call", async () => {
    const out = join(tmpDir, "image-0.png");
    let callCount = 0;
    (execSync as any).mockImplementation(() => {
      callCount++;
      writeFileSync(out, "fake-png");
    });

    const root: DescriptiveRoot = {
      children: [{
        type: "scene", name: "S", layout: "parallel",
        children: [{ type: "image", prompt: "cached", duration: 3 }],
      }],
    };

    // First call — generates
    await resolveGeneratedMedia(root, { outputDir: tmpDir, ttiCli: "gen {input}" });
    expect(callCount).toBe(1);

    // Second call on same root with same prompt — should use cache
    const result = await resolveGeneratedMedia(root, { outputDir: tmpDir, ttiCli: "gen {input}" });
    // execSync not called again (cache hit)
    expect(callCount).toBe(1);
    const img = (result.children[0] as any).children[0];
    expect(img.src).toBe(out);
  });

  it("processes multiple image nodes with prompts", async () => {
    (execSync as any)
      .mockImplementationOnce(() => { writeFileSync(join(tmpDir, "image-0.png"), "a"); })
      .mockImplementationOnce(() => { writeFileSync(join(tmpDir, "image-1.png"), "b"); });

    const root: DescriptiveRoot = {
      children: [{
        type: "scene", name: "S", layout: "parallel",
        children: [
          { type: "image", prompt: "first", duration: 3 },
          { type: "image", prompt: "second", duration: 3 },
        ],
      }],
    };

    const result = await resolveGeneratedMedia(root, { outputDir: tmpDir, ttiCli: "gen {input}" });
    const images = (result.children[0] as any).children;
    expect(images[0].src).toBe(join(tmpDir, "image-0.png"));
    expect(images[1].src).toBe(join(tmpDir, "image-1.png"));
    expect(execSync).toHaveBeenCalledTimes(2);
  });
});

// ── Additional TTS tests ───────────────────────────────────────────────────

describe("resolveScripts — additional", () => {
  it("respects scene.tts override", async () => {
    (generateTTS as any).mockReturnValue(join(tmpDir, "scene.wav"));

    const root: DescriptiveRoot = {
      children: [{
        type: "scene", name: "S", script: "text", tts: "scene-tts {input} --out {output}",
        layout: "parallel", children: [],
      }],
    };

    await resolveScripts(root, { outputDir: tmpDir });
    expect(generateTTS).toHaveBeenCalledWith("text", expect.any(String), "scene-tts {input} --out {output}");
  });

  it("respects root.tts override when scene has no tts", async () => {
    (generateTTS as any).mockReturnValue(join(tmpDir, "root.wav"));

    const root: DescriptiveRoot = {
      tts: "root-tts {input} --out {output}",
      children: [{
        type: "scene", name: "S", script: "text",
        layout: "parallel", children: [],
      }],
    };

    await resolveScripts(root, { outputDir: tmpDir });
    expect(generateTTS).toHaveBeenCalledWith("text", expect.any(String), "root-tts {input} --out {output}");
  });

  it("scene.tts overrides root.tts", async () => {
    (generateTTS as any).mockReturnValue(join(tmpDir, "scene.wav"));

    const root: DescriptiveRoot = {
      tts: "root-tts {input}",
      children: [{
        type: "scene", name: "S", script: "text", tts: "scene-tts {input} --out {output}",
        layout: "parallel", children: [],
      }],
    };

    await resolveScripts(root, { outputDir: tmpDir });
    expect(generateTTS).toHaveBeenCalledWith("text", expect.any(String), "scene-tts {input} --out {output}");
  });

  it("caches TTS output and skips second generateTTS call", async () => {
    let callCount = 0;
    (generateTTS as any).mockImplementation(() => {
      callCount++;
      const p = join(tmpDir, `hook.wav`);
      writeFileSync(p, "");
      return p;
    });

    const root: DescriptiveRoot = {
      children: [{
        type: "scene", name: "Hook", script: "Hello world",
        layout: "parallel", children: [],
      }],
    };

    await resolveScripts(root, { outputDir: tmpDir });
    expect(callCount).toBe(1);

    // Second call — should hit cache
    const result = await resolveScripts(root, { outputDir: tmpDir });
    expect(callCount).toBe(1);
    const scene = result.children[0] as any;
    expect(scene.children).toHaveLength(1);
  });

  it("processes multiple script nodes in the same tree", async () => {
    (generateTTS as any)
      .mockReturnValueOnce(join(tmpDir, "a.wav"))
      .mockReturnValueOnce(join(tmpDir, "b.wav"));

    const root: DescriptiveRoot = {
      children: [
        { type: "scene", name: "A", script: "First", layout: "parallel", children: [] },
        { type: "scene", name: "B", script: "Second", layout: "parallel", children: [] },
      ],
    };

    const result = await resolveScripts(root, { outputDir: tmpDir });
    expect((result.children[0] as any).children[0].src).toBe(join(tmpDir, "a.wav"));
    expect((result.children[1] as any).children[0].src).toBe(join(tmpDir, "b.wav"));
    expect(generateTTS).toHaveBeenCalledTimes(2);
  });

  it("skips parent scene when child scene also has script (innermost wins)", async () => {
    (generateTTS as any).mockReturnValue(join(tmpDir, "child.wav"));

    const root: DescriptiveRoot = {
      children: [{
        type: "scene", name: "Parent", script: "Parent text",
        layout: "parallel",
        children: [{
          type: "scene", name: "Child", script: "Child text",
          layout: "parallel", children: [],
        }],
      }],
    };

    const result = await resolveScripts(root, { outputDir: tmpDir });
    // Parent should NOT have TTS audio (its children still include the child scene)
    const parent = result.children[0] as any;
    const child = parent.children[0] as any;
    expect(parent.children).toHaveLength(1); // still has child scene
    expect(parent.children.some((c: any) => c.type === "audio")).toBe(false); // but no audio
    // Child should have TTS audio
    expect(child.children).toHaveLength(1);
    expect(child.children[0].src).toBe(join(tmpDir, "child.wav"));
    expect(generateTTS).toHaveBeenCalledTimes(1);
    expect(generateTTS).toHaveBeenCalledWith("Child text", expect.any(String), expect.any(String));
  });

  it("skips node when generateTTS returns empty string", async () => {
    (generateTTS as any).mockReturnValue("");

    const root: DescriptiveRoot = {
      children: [{
        type: "scene", name: "S", script: "fail",
        layout: "parallel", children: [],
      }],
    };

    const result = await resolveScripts(root, { outputDir: tmpDir });
    // No audio child attached
    expect((result.children[0] as any).children).toHaveLength(0);
  });
});

// ── Additional STT tests ───────────────────────────────────────────────────

describe("resolveSubtitles — additional", () => {
  it("respects root.stt override", async () => {
    const audioPath = join(tmpDir, "n.wav");
    writeFileSync(audioPath, "fake");
    (execSync as any).mockImplementation(() => {
      writeFileSync(join(tmpDir, "n.vtt"), "WEBVTT\n\n00:00:01.000 --> 00:00:02.000\nhi\n");
    });

    const root: DescriptiveRoot = {
      stt: "custom-stt {input} --out {output}",
      children: [{
        type: "scene", name: "S", layout: "parallel",
        children: [{ id: "a1", type: "audio", src: audioPath, actions: [{ id: "act1", start: 0, end: 2 }] } as any],
        durationInSeconds: 2,
      } as any],
    };

    await resolveSubtitles(root, { outputDir: tmpDir });
    expect(execSync).toHaveBeenCalledWith(
      'custom-stt ' + audioPath + ' --out ' + tmpDir,
      expect.anything(),
    );
  });

  it("caches STT output and skips second execSync", async () => {
    const audioPath = join(tmpDir, "cached.wav");
    writeFileSync(audioPath, "fake");
    let callCount = 0;
    (execSync as any).mockImplementation(() => {
      callCount++;
      writeFileSync(join(tmpDir, "cached.vtt"), "WEBVTT\n\n00:00:01.000 --> 00:00:02.000\nok\n");
    });

    const root: DescriptiveRoot = {
      children: [{
        type: "scene", name: "S", layout: "parallel",
        children: [{ id: "a1", type: "audio", src: audioPath, actions: [{ id: "act1", start: 0, end: 2 }] } as any],
        durationInSeconds: 2,
      } as any],
    };

    await resolveSubtitles(root, { outputDir: tmpDir });
    expect(callCount).toBe(1);

    await resolveSubtitles(root, { outputDir: tmpDir });
    expect(callCount).toBe(1); // cached
  });

  it("skips gracefully when execSync throws", async () => {
    const audioPath = join(tmpDir, "fail.wav");
    writeFileSync(audioPath, "fake");
    (execSync as any).mockImplementation(() => { throw new Error("whisper not found"); });

    const root: DescriptiveRoot = {
      children: [{
        type: "scene", name: "S", layout: "parallel",
        children: [{ id: "a1", type: "audio", src: audioPath, actions: [{ id: "act1", start: 0, end: 2 }] } as any],
        durationInSeconds: 2,
      } as any],
    };

    const result = await resolveSubtitles(root, { outputDir: tmpDir });
    expect(result.subtitle).toBeUndefined();
    expect(execSync).toHaveBeenCalledTimes(1);
  });

  it("merges VTT from multiple audio clips with correct offsets", async () => {
    const a1 = join(tmpDir, "clip1.wav");
    const a2 = join(tmpDir, "clip2.wav");
    writeFileSync(a1, "fake");
    writeFileSync(a2, "fake");
    (execSync as any)
      .mockImplementationOnce(() => {
        writeFileSync(join(tmpDir, "clip1.vtt"), "WEBVTT\n\n00:00:01.000 --> 00:00:02.000\nfirst\n");
      })
      .mockImplementationOnce(() => {
        writeFileSync(join(tmpDir, "clip2.vtt"), "WEBVTT\n\n00:00:00.500 --> 00:00:01.500\nsecond\n");
      });

    const root: any = {
      children: [{
        type: "scene", name: "S", layout: "parallel",
        children: [
          { id: "a1", type: "audio", src: a1, actions: [{ id: "act1", start: 0, end: 2 }] },
          { id: "a2", type: "audio", src: a2, actions: [{ id: "act2", start: 3, end: 5 }] },
        ],
        durationInSeconds: 5,
      }],
    };

    const result = await resolveSubtitles(root, { outputDir: tmpDir });
    expect(result.subtitle).toBeDefined();
    const vtt = (await import("node:fs")).readFileSync(result.subtitle!.src, "utf-8");
    // clip1: 1+0=1 → 2+0=2
    expect(vtt).toContain("00:00:01.000 --> 00:00:02.000");
    expect(vtt).toContain("first");
    // clip2: 0.5+3=3.5 → 1.5+3=4.5
    expect(vtt).toContain("00:00:03.500 --> 00:00:04.500");
    expect(vtt).toContain("second");
  });

  it("handles empty VTT from STT CLI (no cues)", async () => {
    const audioPath = join(tmpDir, "empty.wav");
    writeFileSync(audioPath, "fake");
    (execSync as any).mockImplementation(() => {
      writeFileSync(join(tmpDir, "empty.vtt"), "WEBVTT\n\n");
    });

    const root: any = {
      children: [{
        type: "scene", name: "S", layout: "parallel",
        children: [{ id: "a1", type: "audio", src: audioPath, actions: [{ id: "act1", start: 0, end: 2 }] }],
        durationInSeconds: 2,
      }],
    };

    const result = await resolveSubtitles(root, { outputDir: tmpDir });
    expect(result.subtitle).toBeUndefined();
  });
});

// ── Additional TTV tests ───────────────────────────────────────────────────

describe("resolveGeneratedMedia — TTV additional", () => {
  it("uses default TTV CLI when no options or root.ttv provided", async () => {
    const out = join(tmpDir, "video-0.mp4");
    (execSync as any).mockImplementation(() => { writeFileSync(out, "fake-mp4"); });

    const root: DescriptiveRoot = {
      children: [{
        type: "scene", name: "S", layout: "parallel",
        children: [{ type: "video", prompt: "waves", duration: 5 }],
      }],
    };

    await resolveGeneratedMedia(root, { outputDir: tmpDir });
    expect(execSync).toHaveBeenCalledTimes(1);
    const cmd = (execSync as any).mock.calls[0][0] as string;
    expect(cmd).toContain("pi");
    expect(cmd).toContain("generate video");
  });

  it("root.ttv overrides options.ttvCli", async () => {
    const out = join(tmpDir, "video-0.mp4");
    (execSync as any).mockImplementation(() => { writeFileSync(out, "fake-mp4"); });

    const root: DescriptiveRoot = {
      ttv: "root-ttv {input} --out {output}",
      children: [{
        type: "scene", name: "S", layout: "parallel",
        children: [{ type: "video", prompt: "test", duration: 5 }],
      }],
    };

    await resolveGeneratedMedia(root, { outputDir: tmpDir, ttvCli: "option-ttv {input}" });
    expect(execSync).toHaveBeenCalledWith(
      'root-ttv test --out ' + join(tmpDir, "video-0.mp4"),
      expect.anything(),
    );
  });

  it("options.ttvCli overrides default when no root.ttv", async () => {
    const out = join(tmpDir, "video-0.mp4");
    (execSync as any).mockImplementation(() => { writeFileSync(out, "fake-mp4"); });

    const root: DescriptiveRoot = {
      children: [{
        type: "scene", name: "S", layout: "parallel",
        children: [{ type: "video", prompt: "test", duration: 5 }],
      }],
    };

    await resolveGeneratedMedia(root, { outputDir: tmpDir, ttvCli: "custom-ttv {input} --out {output}" });
    expect(execSync).toHaveBeenCalledWith(
      'custom-ttv test --out ' + join(tmpDir, "video-0.mp4"),
      expect.anything(),
    );
  });

  it("caches TTV output and skips second execSync", async () => {
    const out = join(tmpDir, "video-0.mp4");
    let callCount = 0;
    (execSync as any).mockImplementation(() => {
      callCount++;
      writeFileSync(out, "fake");
    });

    const root: DescriptiveRoot = {
      children: [{
        type: "scene", name: "S", layout: "parallel",
        children: [{ type: "video", prompt: "cached", duration: 5 }],
      }],
    };

    await resolveGeneratedMedia(root, { outputDir: tmpDir, ttvCli: "gen {input}" });
    expect(callCount).toBe(1);
    const result = await resolveGeneratedMedia(root, { outputDir: tmpDir, ttvCli: "gen {input}" });
    expect(callCount).toBe(1);
    expect((result.children[0] as any).children[0].src).toBe(out);
  });

  it("skips node when execSync produces no output for TTV", async () => {
    (execSync as any).mockReturnValue(Buffer.from(""));

    const root: DescriptiveRoot = {
      children: [{
        type: "scene", name: "S", layout: "parallel",
        children: [{ type: "video", prompt: "fail", duration: 5 }],
      }],
    };

    const result = await resolveGeneratedMedia(root, { outputDir: tmpDir, ttvCli: "gen {input}" });
    expect((result.children[0] as any).children[0].src).toBeUndefined();
  });

  it("continues when execSync throws for TTV", async () => {
    (execSync as any).mockImplementation(() => { throw new Error("CLI not found"); });

    const root: DescriptiveRoot = {
      children: [{
        type: "scene", name: "S", layout: "parallel",
        children: [{ type: "video", prompt: "fail", duration: 5 }],
      }],
    };

    const result = await resolveGeneratedMedia(root, { outputDir: tmpDir, ttvCli: "gen {input}" });
    expect((result.children[0] as any).children[0].src).toBeUndefined();
    expect(execSync).toHaveBeenCalledTimes(1);
  });

  it("processes multiple video nodes with prompts", async () => {
    (execSync as any)
      .mockImplementationOnce(() => { writeFileSync(join(tmpDir, "video-0.mp4"), "a"); })
      .mockImplementationOnce(() => { writeFileSync(join(tmpDir, "video-1.mp4"), "b"); });

    const root: DescriptiveRoot = {
      children: [{
        type: "scene", name: "S", layout: "parallel",
        children: [
          { type: "video", prompt: "first", duration: 5 },
          { type: "video", prompt: "second", duration: 5 },
        ],
      }],
    };

    const result = await resolveGeneratedMedia(root, { outputDir: tmpDir, ttvCli: "gen {input}" });
    const vids = (result.children[0] as any).children;
    expect(vids[0].src).toBe(join(tmpDir, "video-0.mp4"));
    expect(vids[1].src).toBe(join(tmpDir, "video-1.mp4"));
    expect(execSync).toHaveBeenCalledTimes(2);
  });
});

// ── resolveMediaDurations ──────────────────────────────────────────────────

describe("resolveMediaDurations", () => {
  it("returns clone without mutating original", async () => {
    const root: DescriptiveRoot = {
      layout: "series",
      children: [
        { type: "video", src: "nonexistent.mp4", duration: 5 },
      ],
    };
    const result = await resolveMediaDurations(root);
    expect(result).not.toBe(root);
    expect(result.children[0]!.duration).toBe(5);
  });

  it("skips nodes that already have duration", async () => {
    const root: DescriptiveRoot = {
      layout: "series",
      children: [
        { type: "video", src: "anything.mp4", duration: 7 },
      ],
    };
    const result = await resolveMediaDurations(root);
    expect(result.children[0]!.duration).toBe(7);
  });

  it("skips nodes that already have endAt", async () => {
    const root: DescriptiveRoot = {
      layout: "series",
      children: [
        { type: "video", src: "anything.mp4", startFrom: 2, endAt: 5 },
      ],
    };
    const result = await resolveMediaDurations(root);
    expect((result.children[0] as any).endAt).toBe(5);
    expect((result.children[0] as any).duration).toBeUndefined();
  });

  it("handles skip regex", async () => {
    const root: DescriptiveRoot = {
      layout: "series",
      children: [
        { type: "video", src: "nonexistent.mp4" },
        { type: "image", src: "photo.jpg" },
      ],
    };
    const result = await resolveMediaDurations(root, { skip: /\.jpg$/ });
    // .jpg skipped, .mp4 tried but file doesn't exist so duration stays undefined
    expect(result.children[0]!.duration).toBeUndefined();
    expect(result.children[1]!.duration).toBeUndefined();
  });

  it("does not mutate original tree", async () => {
    const root: DescriptiveRoot = {
      layout: "series",
      children: [
        { type: "video", src: "nonexistent.mp4", duration: 5 },
      ],
    };
    const originalChildren = root.children[0];
    const result = await resolveMediaDurations(root);
    expect(result).not.toBe(root);
    expect(root.children[0]).toBe(originalChildren);
  });
});
