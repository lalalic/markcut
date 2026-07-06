import { describe, expect, it, vi, beforeEach, afterEach } from "vitest";
import { mkdtempSync, writeFileSync, existsSync, rmSync, realpathSync } from "node:fs";
import { join } from "node:path";
import { tmpdir } from "node:os";

// Only mock child_process — filesystem is real (uses temp dirs)
vi.mock("node:child_process", () => ({
  execSync: vi.fn(),
}));

import { execSync } from "node:child_process";
import { generateTTS, listVoices } from "./tts";

let tmpDir: string;

beforeEach(() => {
  vi.clearAllMocks();
  tmpDir = mkdtempSync(join(realpathSync(tmpdir()), "tts-test-"));
});

afterEach(() => {
  rmSync(tmpDir, { recursive: true, force: true });
});

// ── CLI Template Substitution ──────────────────────────────────────────────

describe("generateTTS — CLI variable substitution", () => {
  it("uses default edge-tts CLI when no cli provided", () => {
    const out = join(tmpDir, "test.wav");
    // execSync writes the output file
    (execSync as any).mockImplementation(() => { writeFileSync(out, ""); });
    const result = generateTTS("Hello world", out);

    expect(result).toBe(out);
    expect(execSync).toHaveBeenCalledWith(
      'edge-tts --voice "en-US-GuyNeural" --text "Hello world" --write-media "' + out + '"',
      { stdio: "pipe" },
    );
    expect(existsSync(out)).toBe(true);
  });

  it("substitutes {input} and {output} in custom CLI template", () => {
    const out = join(tmpDir, "out.wav");
    (execSync as any).mockImplementation(() => { writeFileSync(out, ""); });
    const result = generateTTS(
      "Narration text",
      out,
      'my-tts --speaker speaker_42 --text {input} --output {output} --speed +20% --ref ./ref.wav',
    );

    expect(result).toBe(out);
    expect(execSync).toHaveBeenCalledWith(
      'my-tts --speaker speaker_42 --text Narration text --output ' + out + ' --speed +20% --ref ./ref.wav',
      { stdio: "pipe" },
    );
    expect(existsSync(out)).toBe(true);
  });

  it("handles text with special characters", () => {
    const out = join(tmpDir, "s.wav");
    (execSync as any).mockImplementation(() => { writeFileSync(out, ""); });
    generateTTS("It's a \"great\" day!", out, "echo {input} > {output}");

    // The implementation escapes double quotes with backslash for shell safety
    expect(execSync).toHaveBeenCalledWith(
      'echo It\'s a \\"great\\" day! > ' + out,
      { stdio: "pipe" },
    );
  });
});

// ── ffmpeg fallback ────────────────────────────────────────────────────────

describe("generateTTS — ffmpeg fallback", () => {
  it("converts generated MP3 to WAV when wav not found, using real files", () => {
    const wavPath = join(tmpDir, "conv.wav");
    const mp3Path = join(tmpDir, "conv.mp3");

    // execSync writes an MP3 (not WAV), then fake ffmpeg + rm convert it
    (execSync as any)
      .mockImplementationOnce(() => { writeFileSync(mp3Path, "fake-mp3"); })
      .mockImplementationOnce(() => { writeFileSync(wavPath, "fake-wav"); })
      .mockImplementationOnce(() => { rmSync(mp3Path); });

    const result = generateTTS("hello", wavPath, "some-tts --text {input} --out {output}");

    // execSync called 3 times: TTS, ffmpeg, rm
    expect(execSync).toHaveBeenCalledTimes(3);
    expect(result).toBe(wavPath);
    expect(existsSync(wavPath)).toBe(true);
    expect(existsSync(mp3Path)).toBe(false);
  });

  it("returns mp3 path when ffmpeg conversion fails, using real files", () => {
    const wavPath = join(tmpDir, "conv.wav");
    const mp3Path = join(tmpDir, "conv.mp3");

    // execSync writes MP3; ffmpeg execSync throws
    (execSync as any)
      .mockImplementationOnce(() => { writeFileSync(mp3Path, "fake-mp3"); })
      .mockImplementationOnce(() => { throw new Error("ffmpeg not found"); });

    const result = generateTTS("hello", wavPath, "some-tts --text {input} --out {output}");

    expect(result).toBe(mp3Path);
    expect(existsSync(mp3Path)).toBe(true);
    expect(existsSync(wavPath)).toBe(false);
  });
});

// ── Failure handling ───────────────────────────────────────────────────────

describe("generateTTS — failure handling", () => {
  it("returns empty string when execSync throws", () => {
    const out = join(tmpDir, "fail.wav");
    (execSync as any).mockImplementation(() => {
      throw new Error("command not found");
    });

    const result = generateTTS("hello", out);
    expect(result).toBe("");
    expect(existsSync(out)).toBe(false);
  });

  it("returns empty string when output file doesn't exist after TTS", () => {
    const out = join(tmpDir, "nope.wav");
    // execSync succeeds but writes nothing
    (execSync as any).mockReturnValue(Buffer.from(""));

    const result = generateTTS("hello", out);
    expect(result).toBe("");
    expect(existsSync(out)).toBe(false);
  });
});

// ── listVoices ─────────────────────────────────────────────────────────────

describe("listVoices", () => {
  it("parses voice names from edge-tts output", () => {
    (execSync as any).mockReturnValue(
      "Name: en-US-GuyNeural\nName: en-US-JennyNeural\n",
    );

    const voices = listVoices();
    expect(voices).toEqual(["en-US-GuyNeural", "en-US-JennyNeural"]);
  });

  it("returns empty array on failure", () => {
    (execSync as any).mockImplementation(() => {
      throw new Error("edge-tts not installed");
    });

    const voices = listVoices();
    expect(voices).toEqual([]);
  });
});
