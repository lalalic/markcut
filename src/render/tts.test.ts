import { describe, expect, it, vi, beforeEach } from "vitest";
import { existsSync, mkdirSync, copyFileSync } from "node:fs";

// Mock filesystem and child_process before importing tts
vi.mock("node:child_process", () => ({
  execSync: vi.fn(),
}));

vi.mock("node:fs", async () => {
  const actual = await vi.importActual("node:fs");
  return {
    ...(actual as any),
    existsSync: vi.fn(),
    mkdirSync: vi.fn(),
    copyFileSync: vi.fn(),
  };
});

// Need to mock path.dirname too
vi.mock("node:path", async () => {
  const actual = await vi.importActual("node:path");
  return {
    ...(actual as any),
    dirname: vi.fn(() => "/tmp/tts"),
  };
});

import { execSync } from "node:child_process";
import { generateTTS, listVoices } from "./tts";

beforeEach(() => {
  vi.clearAllMocks();
  (mkdirSync as any).mockReturnValue(undefined);

  // By default, output file exists after TTS runs (success case)
  (existsSync as any).mockImplementation((path: string) => {
    if (path.endsWith(".wav")) return true;
    return false;
  });
});

// ── CLI Template Substitution ──────────────────────────────────────────────

describe("generateTTS — CLI variable substitution", () => {
  it("uses default edge-tts CLI when no cli provided", () => {
    (execSync as any).mockReturnValue(Buffer.from(""));
    const result = generateTTS("Hello world", "/tmp/tts/test.wav", {
      voice: "en-US-GuyNeural",
    });

    expect(result).toBe("/tmp/tts/test.wav");
    expect(execSync).toHaveBeenCalledWith(
      'edge-tts --voice "en-US-GuyNeural" --text "Hello world" --write-media "/tmp/tts/test.wav"',
      { stdio: "pipe" },
    );
  });

  it("substitutes all built-in variables in custom CLI template", () => {
    (execSync as any).mockReturnValue(Buffer.from(""));
    const result = generateTTS("Narration text", "/tmp/tts/out.wav", {
      cli: 'my-tts --speaker {voice} --input {text} --output {output} --speed {rate} --ref {refAudio}',
      voice: "speaker_42",
      rate: "+20%",
      refAudio: "./ref.wav",
    });

    expect(result).toBe("/tmp/tts/out.wav");
    expect(execSync).toHaveBeenCalledWith(
      'my-tts --speaker speaker_42 --input Narration text --output /tmp/tts/out.wav --speed +20% --ref ./ref.wav',
      { stdio: "pipe" },
    );
  });

  it("substitutes extra options from options map", () => {
    (execSync as any).mockReturnValue(Buffer.from(""));
    generateTTS("test", "/tmp/tts/t.wav", {
      cli: "{engine} --model {model} --text {text} --out {output}",
      options: { engine: "mlx-audio", model: "speecht5" },
    });

    expect(execSync).toHaveBeenCalledWith(
      "mlx-audio --model speecht5 --text test --out /tmp/tts/t.wav",
      { stdio: "pipe" },
    );
  });

  it("omits empty variables from substitution (template unchanged)", () => {
    (execSync as any).mockReturnValue(Buffer.from(""));
    generateTTS("hello", "/tmp/tts/x.wav", {
      cli: "cmd --text {text} --out {output}{rate}",
      // rate omitted intentionally
    });

    expect(execSync).toHaveBeenCalledWith(
      "cmd --text hello --out /tmp/tts/x.wav{rate}",
      { stdio: "pipe" },
    );
  });

  it("handles text with special characters", () => {
    (execSync as any).mockReturnValue(Buffer.from(""));
    generateTTS("It's a \"great\" day!", "/tmp/tts/s.wav", {
      cli: "echo {text} > {output}",
    });

    expect(execSync).toHaveBeenCalledWith(
      'echo It\'s a "great" day! > /tmp/tts/s.wav',
      { stdio: "pipe" },
    );
  });
});

// ── Copy Mode ──────────────────────────────────────────────────────────────

describe("generateTTS — copy mode", () => {
  it("copies refAudio to output path when cli is 'copy'", () => {
    (existsSync as any).mockImplementation((path: string) => {
      if (path === "./ref.wav") return true;
      if (path.endsWith(".wav")) return true;
      return false;
    });
    (copyFileSync as any).mockReturnValue(undefined);

    const result = generateTTS("ignored in copy mode", "/tmp/tts/copy.wav", {
      cli: "copy",
      refAudio: "./ref.wav",
    });

    expect(result).toBe("/tmp/tts/copy.wav");
    expect(copyFileSync).toHaveBeenCalledWith("./ref.wav", "/tmp/tts/copy.wav");
    expect(execSync).not.toHaveBeenCalled();
  });

  it("returns empty string when refAudio missing in copy mode", () => {
    const result = generateTTS("text", "/tmp/tts/c.wav", { cli: "copy" });
    expect(result).toBe("");
    expect(copyFileSync).not.toHaveBeenCalled();
  });

  it("returns empty string when refAudio file doesn't exist", () => {
    (existsSync as any).mockImplementation(() => false);

    const result = generateTTS("text", "/tmp/tts/c.wav", {
      cli: "copy",
      refAudio: "./nonexistent.wav",
    });
    expect(result).toBe("");
  });
});

// ── ffmpeg fallback ────────────────────────────────────────────────────────

describe("generateTTS — ffmpeg fallback", () => {
  it("converts generated MP3 to WAV when wav not found", () => {
    // Output .wav doesn't exist, but .mp3 does
    (existsSync as any).mockImplementation((path: string) => {
      if (path.endsWith(".mp3")) return true;
      if (path.endsWith(".wav")) return false;
      return false;
    });
    (execSync as any).mockReturnValue(Buffer.from(""));

    const result = generateTTS("hello", "/tmp/tts/conv.wav", {
      cli: "some-tts --text {text} --out {output}",
    });

    // execSync called 3 times: TTS, ffmpeg, rm
    expect(execSync).toHaveBeenCalledTimes(3);
    expect(result).toBe("/tmp/tts/conv.wav");
  });

  it("returns mp3 path when ffmpeg conversion fails", () => {
    (existsSync as any).mockImplementation((path: string) => {
      if (path.endsWith(".mp3")) return true;
      return false;
    });
    // First execSync (TTS) succeeds, second (ffmpeg) throws
    (execSync as any)
      .mockReturnValueOnce(Buffer.from(""))
      .mockImplementationOnce(() => { throw new Error("ffmpeg not found"); });

    const result = generateTTS("hello", "/tmp/tts/conv.wav", {
      cli: "some-tts --text {text} --out {output}",
    });

    expect(result).toBe("/tmp/tts/conv.mp3");
  });
});

// ── Failure handling ───────────────────────────────────────────────────────

describe("generateTTS — failure handling", () => {
  it("returns empty string when execSync throws", () => {
    (execSync as any).mockImplementation(() => {
      throw new Error("command not found");
    });

    const result = generateTTS("hello", "/tmp/tts/fail.wav");
    expect(result).toBe("");
  });

  it("returns empty string when output file doesn't exist after TTS", () => {
    (existsSync as any).mockReturnValue(false);
    (execSync as any).mockReturnValue(Buffer.from(""));

    const result = generateTTS("hello", "/tmp/tts/nope.wav");
    expect(result).toBe("");
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
