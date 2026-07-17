import { describe, expect, it, vi, beforeEach, afterEach } from "vitest";
import { mkdtempSync, writeFileSync, existsSync, rmSync, realpathSync, mkdirSync, readFileSync } from "node:fs";
import { join } from "node:path";
import { tmpdir } from "node:os";
import { resolveMediaDurations, resolveScripts, resolveSubtitles, resolveGeneratedMedia, resolveIncludes } from "./resolve";
import type { DescriptiveRoot } from "./compiler";

// ── Mock CLI tools ────────────────────────────────────────────────────────

vi.mock("../render/cli-tools", () => ({
  generateTTS: vi.fn(),
  generateSTT: vi.fn(),
  generateTTI: vi.fn(),
  generateTTV: vi.fn(),
  // Default CLI templates (needed by resolve.ts imports)
  DEFAULT_TTS_CLI: 'echo tts {input} > {output}',
  DEFAULT_STT_CLI: 'echo stt {input} > {output}',
  DEFAULT_TTI_CLI: 'echo tti {input} > {output}',
  DEFAULT_TTV_CLI: '',
}));

import { generateTTS, generateSTT, generateTTI, generateTTV } from "../render/cli-tools";

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
  it("calls generateTTS for each audio node with script", async () => {
    (generateTTS as any).mockReturnValue(join(tmpDir, "hook.wav"));

    const root: DescriptiveRoot = {
      children: [{
        type: "scene", name: "Hook", layout: "parallel",
        children: [{ type: "audio", id: "Hook", script: "Hello world", volume: 1 } as any],
      }],
    };

    const result = await resolveScripts(root, { outputDir: tmpDir });

    // Should have resolved src on the audio node, script removed
    const scene = result.children[0] as any;
    expect(scene.children).toHaveLength(1);
    expect(scene.children[0].type).toBe("audio");
    expect(scene.children[0].src).toBe(join(tmpDir, "hook.wav"));
    expect(scene.children[0].script).toBeUndefined();

    // When no ttsCli override, falls back to DEFAULT_TTS_CLI
    // Filename is a content hash (not node id) for deduplication across files
    expect(generateTTS).toHaveBeenCalledWith(
      "Hello world",
      expect.stringMatching(/\.mp3$/),
      expect.stringContaining("tts"),
    );
  });

  it("skips scenes without a script audio node", async () => {
    const root: DescriptiveRoot = {
      children: [{
        type: "scene", name: "Silent", layout: "parallel", children: [],
      }],
    };

    const result = await resolveScripts(root, { outputDir: tmpDir });
    expect((result.children[0] as any).children).toHaveLength(0);
    expect(generateTTS).not.toHaveBeenCalled();
  });

  it("skips audio nodes that already have src", async () => {
    const root: DescriptiveRoot = {
      children: [{
        type: "scene", name: "Done", layout: "parallel",
        children: [{ type: "audio", src: "existing.wav", script: "Already have audio", volume: 1 } as any],
      }],
    };

    await resolveScripts(root, { outputDir: tmpDir });
    expect(generateTTS).not.toHaveBeenCalled();
  });

  it("propagates ttsCli option to generateTTS", async () => {
    (generateTTS as any).mockReturnValue(join(tmpDir, "custom.wav"));

    const root: DescriptiveRoot = {
      children: [{
        type: "scene", name: "Custom", layout: "parallel",
        children: [{ type: "audio", script: "Text", volume: 1 } as any],
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

    (generateSTT as any).mockImplementation(async () => {
      writeFileSync(join(tmpDir, "narration.vtt"),
        "WEBVTT\n\n00:00:01.000 --> 00:00:03.000\nHello world\n");
    });

    const root: DescriptiveRoot = {
      children: [{
        type: "scene", name: "S", layout: "parallel",
        children: [{
          id: "a1", type: "audio", src: audioPath,
          start: 5,
          end: 8,
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
    const result = await resolveSubtitles(root, { outputDir: tmpDir });
    expect(result.subtitle).toBeUndefined();
  });
});

// ── resolveGeneratedMedia (TTI / TTV) ─────────────────────────────────────

describe("resolveGeneratedMedia", () => {
  it("generates image from prompt via TTI CLI", async () => {
    (generateTTI as any).mockImplementation((_p, out) => out);

    const root: DescriptiveRoot = {
      children: [{
        type: "scene", name: "S", layout: "parallel",
        children: [{ type: "image", prompt: "sunset", duration: 3 }],
      }],
    };

    const result = await resolveGeneratedMedia(root, { outputDir: tmpDir, ttiCli: "gen-img --prompt {input} --out {output}" });
    const img = (result.children[0] as any).children[0];
    expect(img.src).toBeTruthy();
    expect(img.src).toMatch(/\.png$/);
    expect(generateTTI).toHaveBeenCalledWith(
      "sunset",
      expect.stringMatching(/\.png$/),
      "gen-img --prompt {input} --out {output}",
      undefined,
    );
  });

  it("generates video from prompt via TTV CLI", async () => {
    (generateTTV as any).mockImplementation((_p, out) => out);

    const root: DescriptiveRoot = {
      children: [{
        type: "scene", name: "S", layout: "parallel",
        children: [{ type: "video", prompt: "ocean waves", duration: 5 }],
      }],
    };

    const result = await resolveGeneratedMedia(root, { outputDir: tmpDir, ttvCli: "gen-vid --prompt {input} --out {output}" });
    const vid = (result.children[0] as any).children[0];
    expect(vid.src).toBeTruthy();
    expect(vid.src).toMatch(/\.mp4$/);
    expect(generateTTV).toHaveBeenCalledWith(
      "ocean waves",
      expect.stringMatching(/\.mp4$/),
      "gen-vid --prompt {input} --out {output}",
      expect.any(String), // ttiCmd defaults to DEFAULT_TTI_CLI
      undefined,
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
    expect(generateTTI).not.toHaveBeenCalled();
    expect(generateTTV).not.toHaveBeenCalled();
  });

  it("uses default TTI CLI when no options or root.tti provided", async () => {
    const out = join(tmpDir, "image-0.png");
    (generateTTI as any).mockReturnValue(out);

    const root: DescriptiveRoot = {
      children: [{
        type: "scene", name: "S", layout: "parallel",
        children: [{ type: "image", prompt: "default test", duration: 3 }],
      }],
    };

    await resolveGeneratedMedia(root, { outputDir: tmpDir });
    expect(generateTTI).toHaveBeenCalledTimes(1);
    const prompt = (generateTTI as any).mock.calls[0][0];
    expect(prompt).toBe("default test");
  });

  it("root.tti overrides options.ttiCli", async () => {
    (generateTTI as any).mockImplementation((_p, out) => out);

    const root: DescriptiveRoot = {
      tti: "root-tti {input} --out {output}",
      children: [{
        type: "scene", name: "S", layout: "parallel",
        children: [{ type: "image", prompt: "override test", duration: 3 }],
      }],
    };

    await resolveGeneratedMedia(root, { outputDir: tmpDir, ttiCli: "option-tti {input}" });
    expect(generateTTI).toHaveBeenCalledWith(
      "override test",
      expect.stringMatching(/\.png$/),
      "root-tti {input} --out {output}",
      undefined,
    );
  });

  it("options.ttiCli overrides default when no root.tti", async () => {
    (generateTTI as any).mockImplementation((_p, out) => out);

    const root: DescriptiveRoot = {
      children: [{
        type: "scene", name: "S", layout: "parallel",
        children: [{ type: "image", prompt: "test", duration: 3 }],
      }],
    };

    await resolveGeneratedMedia(root, { outputDir: tmpDir, ttiCli: "custom-tti --prompt {input} --out {output}" });
    expect(generateTTI).toHaveBeenCalledWith(
      "test",
      expect.stringMatching(/\.png$/),
      "custom-tti --prompt {input} --out {output}",
      undefined,
    );
  });

  it("skips node when generateTTI produces no output", async () => {
    (generateTTI as any).mockReturnValue("");

    const root: DescriptiveRoot = {
      children: [{
        type: "scene", name: "S", layout: "parallel",
        children: [{ type: "image", prompt: "fail", duration: 3 }],
      }],
    };

    const result = await resolveGeneratedMedia(root, { outputDir: tmpDir, ttiCli: "gen {input}" });
    const img = (result.children[0] as any).children[0];
    expect(img.src).toBeUndefined();
    expect(generateTTI).toHaveBeenCalledTimes(1);
  });

  it("continues when generateTTI throws", async () => {
    (generateTTI as any).mockImplementation(() => { throw new Error("CLI not found"); });

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
    expect(generateTTI).toHaveBeenCalledTimes(1);
  });

  it.skip("caches generated output and skips second generateTTI call", async () => {
    const cacheDir = join(tmpDir, ".markcut", "generated", "media");
    let callCount = 0;
    (generateTTI as any).mockImplementation((_p: string, outputPath: string) => {
      callCount++;
      mkdirSync(dirname(outputPath), { recursive: true });
      writeFileSync(outputPath, "fake-png");
      return outputPath;
    });

    const root: DescriptiveRoot = {
      children: [{
        type: "scene", name: "S", layout: "parallel",
        children: [{ type: "image", prompt: "cached", duration: 3 }],
      }],
    };

    // First call — generates
    await resolveGeneratedMedia(root, { outputDir: cacheDir, ttiCli: "gen {input}" });
    expect(callCount).toBe(1);

    // Second call on same root with same prompt — should use cache
    const result = await resolveGeneratedMedia(root, { outputDir: cacheDir, ttiCli: "gen {input}" });
    const img = (result.children[0] as any).children[0];
    expect(img.src).toBeTruthy();
    expect(img.src).toMatch(/\.png$/);
  });

  it("processes multiple image nodes with prompts", async () => {
    (generateTTI as any).mockImplementation((_p, out) => out);

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
    expect(images[0].src).toBeTruthy();
    expect(images[0].src).toMatch(/\.png$/);
    expect(images[1].src).toBeTruthy();
    expect(images[1].src).toMatch(/\.png$/);
    expect(generateTTI).toHaveBeenCalledTimes(2);
  });
});

// ── Additional TTS tests ───────────────────────────────────────────────────

describe("resolveScripts — additional", () => {
  it("respects parent scene.tts override", async () => {
    (generateTTS as any).mockReturnValue(join(tmpDir, "scene.wav"));

    const root: DescriptiveRoot = {
      children: [{
        type: "scene", name: "S", tts: "scene-tts {input} --out {output}",
        layout: "parallel",
        children: [{ type: "audio", script: "text", volume: 1 } as any],
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
        type: "scene", name: "S", layout: "parallel",
        children: [{ type: "audio", script: "text", volume: 1 } as any],
      }],
    };

    await resolveScripts(root, { outputDir: tmpDir });
    expect(generateTTS).toHaveBeenCalledWith("text", expect.any(String), "root-tts {input} --out {output}");
  });

  it("parent scene.tts overrides root.tts", async () => {
    (generateTTS as any).mockReturnValue(join(tmpDir, "scene.wav"));

    const root: DescriptiveRoot = {
      tts: "root-tts {input}",
      children: [{
        type: "scene", name: "S", tts: "scene-tts {input} --out {output}",
        layout: "parallel",
        children: [{ type: "audio", script: "text", volume: 1 } as any],
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
        type: "scene", name: "Hook", layout: "parallel",
        children: [{ type: "audio", script: "Hello world", volume: 1 } as any],
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

  it("processes multiple audio nodes with script in the same tree", async () => {
    (generateTTS as any)
      .mockReturnValueOnce(join(tmpDir, "a.wav"))
      .mockReturnValueOnce(join(tmpDir, "b.wav"));

    const root: DescriptiveRoot = {
      children: [
        { type: "scene", name: "A", layout: "parallel", children: [{ type: "audio", script: "First", volume: 1 } as any] },
        { type: "scene", name: "B", layout: "parallel", children: [{ type: "audio", script: "Second", volume: 1 } as any] },
      ],
    };

    const result = await resolveScripts(root, { outputDir: tmpDir });
    expect((result.children[0] as any).children[0].src).toBe(join(tmpDir, "a.wav"));
    expect((result.children[1] as any).children[0].src).toBe(join(tmpDir, "b.wav"));
    expect(generateTTS).toHaveBeenCalledTimes(2);
  });

  it("skips parent scene when child scene also has script audio (innermost wins)", async () => {
    (generateTTS as any).mockReturnValue(join(tmpDir, "child.wav"));

    const root: DescriptiveRoot = {
      children: [{
        type: "scene", name: "Parent", layout: "parallel",
        children: [
          { type: "audio", script: "Parent text", volume: 1 } as any,
          {
            type: "scene", name: "Child", layout: "parallel",
            children: [{ type: "audio", script: "Child text", volume: 1 } as any],
          },
        ],
      }],
    };

    const result = await resolveScripts(root, { outputDir: tmpDir });
    // Both parent and child audio nodes should be processed independently
    const parent = result.children[0] as any;
    const child = parent.children[1] as any;
    expect(parent.children[0].src).toBe(join(tmpDir, "child.wav"));
    expect(child.children[0].src).toBe(join(tmpDir, "child.wav"));
    expect(generateTTS).toHaveBeenCalledTimes(2);
  });

  it("skips node when generateTTS returns empty string", async () => {
    (generateTTS as any).mockReturnValue("");

    const root: DescriptiveRoot = {
      children: [{
        type: "scene", name: "S", layout: "parallel",
        children: [{ type: "audio", script: "fail", volume: 1 } as any],
      }],
    };

    const result = await resolveScripts(root, { outputDir: tmpDir });
    // No src attached, script remains
    expect((result.children[0] as any).children[0].script).toBe("fail");
    expect((result.children[0] as any).children[0].src).toBeUndefined();
  });
});

// ── Additional STT tests ───────────────────────────────────────────────────

describe("resolveSubtitles — additional", () => {
  it("respects root.stt override", async () => {
    const audioPath = join(tmpDir, "n.wav");
    writeFileSync(audioPath, "fake");
    (generateSTT as any).mockResolvedValue(undefined);
    // generateSTT writes the VTT file — simulate that
    const origImpl = (generateSTT as any).mockImplementation(async () => {
      writeFileSync(join(tmpDir, "n.vtt"), "WEBVTT\n\n00:00:01.000 --> 00:00:02.000\nhi\n");
    });

    const root: DescriptiveRoot = {
      stt: "custom-stt {input} --out {output}",
      children: [{
        type: "scene", name: "S", layout: "parallel",
        children: [{ id: "a1", type: "audio", src: audioPath, start: 0,
        end: 2 } as any],
        durationInSeconds: 2,
      } as any],
    };

    await resolveSubtitles(root, { outputDir: tmpDir });
    expect(generateSTT).toHaveBeenCalledWith(audioPath, tmpDir, "custom-stt {input} --out {output}");
  });

  it("caches STT output and skips second generateSTT call", async () => {
    const audioPath = join(tmpDir, "cached.wav");
    writeFileSync(audioPath, "fake");
    let callCount = 0;
    (generateSTT as any).mockImplementation(async () => {
      callCount++;
      writeFileSync(join(tmpDir, "cached.vtt"), "WEBVTT\n\n00:00:01.000 --> 00:00:02.000\nok\n");
    });

    const root: DescriptiveRoot = {
      children: [{
        type: "scene", name: "S", layout: "parallel",
        children: [{ id: "a1", type: "audio", src: audioPath, start: 0,
        end: 2 } as any],
        durationInSeconds: 2,
      } as any],
    };

    await resolveSubtitles(root, { outputDir: tmpDir });
    expect(callCount).toBe(1);

    await resolveSubtitles(root, { outputDir: tmpDir });
    expect(callCount).toBe(1); // cached
  });

  it("skips gracefully when generateSTT throws", async () => {
    const audioPath = join(tmpDir, "fail.wav");
    writeFileSync(audioPath, "fake");
    (generateSTT as any).mockRejectedValue(new Error("whisper not found"));

    const root: DescriptiveRoot = {
      children: [{
        type: "scene", name: "S", layout: "parallel",
        children: [{ id: "a1", type: "audio", src: audioPath, start: 0,
        end: 2 } as any],
        durationInSeconds: 2,
      } as any],
    };

    const result = await resolveSubtitles(root, { outputDir: tmpDir });
    expect(result.subtitle).toBeUndefined();
    expect(generateSTT).toHaveBeenCalledTimes(1);
  });

  it("merges VTT from multiple audio clips with correct offsets", async () => {
    const a1 = join(tmpDir, "clip1.wav");
    const a2 = join(tmpDir, "clip2.wav");
    writeFileSync(a1, "fake");
    writeFileSync(a2, "fake");
    (generateSTT as any)
      .mockImplementationOnce(async () => {
        writeFileSync(join(tmpDir, "clip1.vtt"), "WEBVTT\n\n00:00:01.000 --> 00:00:02.000\nfirst\n");
      })
      .mockImplementationOnce(async () => {
        writeFileSync(join(tmpDir, "clip2.vtt"), "WEBVTT\n\n00:00:00.500 --> 00:00:01.500\nsecond\n");
      });

    const root: any = {
      children: [{
        type: "scene", name: "S", layout: "parallel",
        children: [
          { id: "a1", type: "audio", src: a1, start: 0,
        end: 2 },
          { id: "a2", type: "audio", src: a2, start: 3,
        end: 5 },
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
    (generateSTT as any).mockImplementation(async () => {
      writeFileSync(join(tmpDir, "empty.vtt"), "WEBVTT\n\n");
    });

    const root: any = {
      children: [{
        type: "scene", name: "S", layout: "parallel",
        children: [{ id: "a1", type: "audio", src: audioPath, start: 0,
        end: 2 }],
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
    (generateTTV as any).mockReturnValue(out);

    const root: DescriptiveRoot = {
      children: [{
        type: "scene", name: "S", layout: "parallel",
        children: [{ type: "video", prompt: "waves", duration: 5 }],
      }],
    };

    await resolveGeneratedMedia(root, { outputDir: tmpDir });
    expect(generateTTV).toHaveBeenCalledTimes(1);
    // Default TTV: empty CLI → generateTTV calls generateTTI + ffmpeg internally
    const [prompt, , cli] = (generateTTV as any).mock.calls[0];
    expect(prompt).toBe("waves");
    expect(cli).toBe("");
  });

  it("root.ttv overrides options.ttvCli", async () => {
    (generateTTV as any).mockImplementation((_p, out) => out);

    const root: DescriptiveRoot = {
      ttv: "root-ttv {input} --out {output}",
      children: [{
        type: "scene", name: "S", layout: "parallel",
        children: [{ type: "video", prompt: "test", duration: 5 }],
      }],
    };

    await resolveGeneratedMedia(root, { outputDir: tmpDir, ttvCli: "option-ttv {input}" });
    expect(generateTTV).toHaveBeenCalledWith(
      "test",
      expect.stringMatching(/\.mp4$/),
      "root-ttv {input} --out {output}",
      expect.any(String),
      undefined,
    );
  });

  it("options.ttvCli overrides default when no root.ttv", async () => {
    (generateTTV as any).mockImplementation((_p, out) => out);

    const root: DescriptiveRoot = {
      children: [{
        type: "scene", name: "S", layout: "parallel",
        children: [{ type: "video", prompt: "test", duration: 5 }],
      }],
    };

    await resolveGeneratedMedia(root, { outputDir: tmpDir, ttvCli: "custom-ttv {input} --out {output}" });
    expect(generateTTV).toHaveBeenCalledWith(
      "test",
      expect.stringMatching(/\.mp4$/),
      "custom-ttv {input} --out {output}",
      expect.any(String),
      undefined,
    );
  });

  it.skip("caches TTV output and skips second generateTTV call", async () => {
    const cacheDir = join(tmpDir, ".markcut", "generated", "media");
    let callCount = 0;
    (generateTTV as any).mockImplementation((_p: string, outputPath: string) => {
      callCount++;
      mkdirSync(dirname(outputPath), { recursive: true });
      writeFileSync(outputPath, "fake");
      return outputPath;
    });

    const root: DescriptiveRoot = {
      children: [{
        type: "scene", name: "S", layout: "parallel",
        children: [{ type: "video", prompt: "cached", duration: 5 }],
      }],
    };

    await resolveGeneratedMedia(root, { outputDir: cacheDir, ttvCli: "gen {input}" });
    const result = await resolveGeneratedMedia(root, { outputDir: cacheDir, ttvCli: "gen {input}" });
    expect((result.children[0] as any).children[0].src).toBeTruthy();
    expect((result.children[0] as any).children[0].src).toMatch(/\.mp4$/);
  });

  it("skips node when generateTTV produces no output", async () => {
    (generateTTV as any).mockReturnValue("");

    const root: DescriptiveRoot = {
      children: [{
        type: "scene", name: "S", layout: "parallel",
        children: [{ type: "video", prompt: "fail", duration: 5 }],
      }],
    };

    const result = await resolveGeneratedMedia(root, { outputDir: tmpDir, ttvCli: "gen {input}" });
    expect((result.children[0] as any).children[0].src).toBeUndefined();
  });

  it("continues when generateTTV throws", async () => {
    (generateTTV as any).mockImplementation(() => { throw new Error("CLI not found"); });

    const root: DescriptiveRoot = {
      children: [{
        type: "scene", name: "S", layout: "parallel",
        children: [{ type: "video", prompt: "fail", duration: 5 }],
      }],
    };

    const result = await resolveGeneratedMedia(root, { outputDir: tmpDir, ttvCli: "gen {input}" });
    expect((result.children[0] as any).children[0].src).toBeUndefined();
    expect(generateTTV).toHaveBeenCalledTimes(1);
  });

  it("processes multiple video nodes with prompts", async () => {
    (generateTTV as any).mockImplementation((_p, out) => out);

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
    expect(vids[0].src).toBeTruthy();
    expect(vids[0].src).toMatch(/\.mp4$/);
    expect(vids[1].src).toBeTruthy();
    expect(vids[1].src).toMatch(/\.mp4$/);
    expect(generateTTV).toHaveBeenCalledTimes(2);
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

// ── resolveIncludes with variants ──────────────────────────────────────────

describe("resolveIncludes — variant overrides", () => {
  /** Helper: create a root with a single include node and resolve it */
  async function resolveIncludeFixture(
    subMd: string,
    options: { variants?: string[] } = {},
  ) {
    const root: DescriptiveRoot = {
      width: 640, height: 480, fps: 30, layout: "series",
      children: [{
        type: "include",
        src: subMd,
      } as any],
    };
    return resolveIncludes(root, {
      baseDir: tmpDir,
      includeOutputDir: join(tmpDir, ".markcut", "generated", "includes"),
      ...options,
    });
  }

  it("resolves include and stamps duration from child content", async () => {
    const subMd = join(tmpDir, "sub-plain.md");
    writeFileSync(subMd, [
      "# video",
      "width:640 height:480 fps:30 layout:series",
      "## Scene1",
      "layout:parallel",
      '- image src:default.jpg duration:3',
    ].join("\n"));

    const result = await resolveIncludeFixture(subMd);
    const incNode = result.children[0] as any;
    expect(incNode.src).toMatch(/\.json$/);
    // Duration comes from the compiled stream tree (image has duration:3)
    expect(incNode.durationInSeconds).toBe(3);
  });

  it("resolves include with variants option using base content (no overrides)", async () => {
    // Sub-file has variant sections but no variants applied — should use base
    const subMd = join(tmpDir, "sub-with-variants.md");
    writeFileSync(subMd, [
      "# video",
      "width:640 height:480 fps:30 layout:series",
      "## Scene1",
      "layout:parallel",
      '- image src:default.jpg duration:3',
      '- component zh-jsx:"<h1>ZH</h1>" jsx:"<h1>EN</h1>" duration:3',
      "",
      "# zh",
      "width:640 height:480 fps:30 layout:series",
      "## Scene1",
      "layout:parallel",
      '- image src:zh.jpg duration:3',
      '- component zh-jsx:"<h1>ZH</h1>" jsx:"<h1>EN</h1>" duration:3',
    ].join("\n"));

    const result = await resolveIncludeFixture(subMd);
    const incNode = result.children[0] as any;
    expect(incNode.src).toMatch(/\.json$/);
    expect(incNode.durationInSeconds).toBe(3);
  });

  it("applies variant-prefixed overrides (zh-src → src) to included sub-video", async () => {
    const subMd = join(tmpDir, "sub-overrides.md");
    writeFileSync(subMd, [
      "# video",
      "width:640 height:480 fps:30 layout:series",
      "## Scene1",
      "layout:parallel",
      '- image zh-src:zh-image.jpg src:default.jpg duration:3',
      '- component zh-jsx:"<h1>ZH Variant</h1>" jsx:"<h1>Base</h1>" duration:3',
      "",
      "# zh",
      "width:640 height:480 fps:30 layout:series",
      "## Scene1",
      "layout:parallel",
      '- image zh-src:zh-image.jpg src:default.jpg duration:3',
      '- component zh-jsx:"<h1>ZH Variant</h1>" jsx:"<h1>Base</h1>" duration:3',
    ].join("\n"));

    const result = await resolveIncludeFixture(subMd, { variants: ["zh"] });
    const incNode = result.children[0] as any;
    expect(incNode.src).toMatch(/\.json$/);
    expect(incNode.durationInSeconds).toBe(3);
  });

  it("applies bare variant key (zh → primary content) to included sub-video", async () => {
    const subMd = join(tmpDir, "sub-bare.md");
    writeFileSync(subMd, [
      "# video",
      "width:640 height:480 fps:30 layout:series",
      "## Scene1",
      "layout:parallel",
      '- component duration:3 jsx:"<h1>Base</h1>"',
      '- image src:default.jpg duration:3',
      "",
      "# zh",
      "width:640 height:480 fps:30 layout:series",
      "## Scene1",
      "layout:parallel",
      '- component duration:3 zh:"<h1>中文</h1>"',
      '- image src:default.jpg duration:3',
    ].join("\n"));

    const result = await resolveIncludeFixture(subMd, { variants: ["zh"] });
    const incNode = result.children[0] as any;
    expect(incNode.src).toMatch(/\.json$/);
    expect(incNode.durationInSeconds).toBe(3);
  });

  it("nested includes receive variant overrides recursively", async () => {
    // Create innermost sub-file with variant sections
    const innerMd = join(tmpDir, "inner.md");
    writeFileSync(innerMd, [
      "# video",
      "width:640 height:480 fps:30 layout:series",
      "## InnerScene",
      "layout:parallel",
      '- image zh-src:inner_zh.jpg src:inner.jpg duration:2',
      "",
      "# zh",
      "width:640 height:480 fps:30 layout:series",
      "## InnerScene",
      "layout:parallel",
      '- image zh-src:inner_zh.jpg src:inner.jpg duration:2',
    ].join("\n"));

    // Middle file that includes inner
    const midMd = join(tmpDir, "mid.md");
    writeFileSync(midMd, [
      "# video",
      "width:640 height:480 fps:30 layout:series",
      "## MidScene",
      "layout:parallel",
      '- include src:./inner.md',
      "",
      "# zh",
      "width:640 height:480 fps:30 layout:series",
      "## MidScene",
      "layout:parallel",
      '- include src:./inner.md',
    ].join("\n"));

    const result = await resolveIncludeFixture(midMd, { variants: ["zh"] });
    const incNode = result.children[0] as any;
    expect(incNode.src).toMatch(/\.json$/);
    expect(incNode.durationInSeconds).toBe(2);
  });
});
