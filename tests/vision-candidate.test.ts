import { execSync } from "node:child_process";
import { existsSync, mkdirSync, readFileSync, rmSync, writeFileSync } from "node:fs";
import { basename, join, resolve } from "node:path";
import { afterAll, beforeAll, describe, expect, it } from "vitest";

process.env.MARKCUT_VTT_CLI = "printf 'whole video'";
process.env.MARKCUT_AGENT_CLI = "printf '{}'";

const { main } = await import("../src/vision/cli.mjs");
const {
  cacheKey,
  normalizeTranscript,
  validateAgainstTranscript,
} = await import("../src/vision/candidate.mjs");

const ROOT = resolve(__dirname, "tmp", `vision-candidate-${Date.now()}`);
const SKIP_STT_ROOT = join(ROOT, "skip-stt");

function quote(value: string): string {
  return `'${value.replace(/'/g, "'\\''")}'`;
}

function createVideo(dir: string, name: string, duration = 3): string {
  const path = join(dir, name);
  execSync(
    `ffmpeg -y -f lavfi -i testsrc=size=180x320:rate=10:duration=${duration} ` +
    `-f lavfi -i sine=frequency=640:duration=${duration} -shortest ` +
    `-c:v libx264 -preset ultrafast -crf 30 -pix_fmt yuv420p -c:a aac ${quote(path)}`,
    { stdio: "pipe" },
  );
  return path;
}

function evidenceResponse(options: { uncertainty?: boolean; quote?: string } = {}): object {
  return {
    summary: "A short visible test moment",
    speech: {
      supplied: Boolean(options.quote),
      speakers: options.quote ? ["Host"] : [],
      keyQuoteAlignment: options.quote ? [{
        quote: options.quote,
        start: 0,
        end: 1,
        alignment: "The visible host is speaking during this cue.",
        evidence: "0.0-1.0 transcript cue while the host faces camera",
      }] : [],
    },
    people: [],
    scenes: [{
      start: 0,
      end: 1,
      event: "A stationary test pattern is visible",
      onScreenText: [],
      shotChange: false,
      visualQuality: "acceptable",
      audioQuality: "unclear",
      evidence: "0.0-1.0 sampled frames show the pattern",
    }],
    narrative: {
      setup: null,
      tension: null,
      turn: null,
      payoff: null,
      selfContained: true,
      contextNeeded: "",
    },
    hooks: [],
    emotionalHighlights: [],
    weakRegions: [],
    suggestedCuts: [],
    verticalFit: {
      suitability: "good",
      cropFeasibility: "acceptable",
      trackingFeasibility: "unclear",
      subjectSafety: "The frame leaves room for a vertical crop",
      evidence: "0.0-1.0 sampled frames",
    },
    editSuggestions: [],
    observableEvidence: [{
      start: 0,
      end: 1,
      observation: "The sample test pattern remains visible",
      evidence: "sampled frames at 0.0 and 1.0 seconds",
    }],
    uncertainty: options.uncertainty === false ? [] : [{
      claim: "Speech content cannot be verified from frames alone",
      reason: "The candidate analysis path does not perform its own STT",
    }],
  };
}

function fixture(path: string, value: unknown): string {
  writeFileSync(path, typeof value === "string" ? value : JSON.stringify(value));
  return path;
}

describe("candidate-only vision", () => {
  let candidate: string;
  let validFixture: string;
  let trimmedCandidate: string;

  beforeAll(() => {
    mkdirSync(ROOT, { recursive: true });
    candidate = createVideo(ROOT, "candidate.mp4");
    writeFileSync(
      join(ROOT, "transcript.vtt"),
      "WEBVTT\n\n00:00:00.000 --> 00:00:01.000\nThis is the best part\n",
    );
    validFixture = fixture(join(ROOT, "valid.json"), evidenceResponse({
      quote: "This is the best part",
    }));
    trimmedCandidate = createVideo(ROOT, "trimmed.mp4", 2.5);
  }, 30_000);

  afterAll(() => {
    rmSync(ROOT, { recursive: true, force: true });
  });

  it("analyzes only the candidate and emits bounded structured evidence", async () => {
    const output = join(ROOT, "evidence.json");
    const invocationCount = join(ROOT, "invocations.txt");
    const countingModel = `printf 'invoked\\n' >> ${quote(invocationCount)}; cat ${quote(validFixture)}`;
    await main([
      "node", "cli.mjs", "vision", candidate, "--candidate",
      "--source-id", "source-1", "--candidate-id", "candidate-9",
      "--start", "0.5", "--end", "2.5",
      "--transcript-file", join(ROOT, "transcript.vtt"),
      "--model-command", countingModel,
      "--output", output,
    ]);

    const artifact = JSON.parse(readFileSync(output, "utf-8"));
    expect(artifact.type).toBe("markcut.candidate-evidence");
    expect(artifact.source).toMatchObject({ id: "source-1", start: 0.5, end: 2.5 });
    expect(artifact.candidate).toMatchObject({ id: "candidate-9", start: 0.5, end: 2.5 });
    expect(artifact.observations).toHaveProperty("summary");
    expect(artifact.observations.uncertainty.length).toBeGreaterThan(0);
    expect(readFileSync(invocationCount, "utf-8").trim().split("\n")).toHaveLength(1);

    const mediaDir = join(ROOT, ".markcut-candidate-vision");
    const generated = execSync(`find ${quote(mediaDir)} -maxdepth 1 -type f -print`, { encoding: "utf-8" }).trim().split("\n");
    expect(generated.some((file) => file.endsWith("_audio.mp3"))).toBe(false);
    expect(generated.some((file) => file.endsWith(".vtt"))).toBe(false);

    const sample = generated.find((file) => file.endsWith("_sample.mp4"));
    expect(sample).toBeTruthy();
    const streams = JSON.parse(execSync(
      `ffprobe -v quiet -print_format json -show_streams ${quote(sample!)}`,
      { encoding: "utf-8", stdio: ["pipe", "pipe", "pipe"] },
    )).streams as Array<{ codec_type: string }>;
    expect(streams.some((stream) => stream.codec_type === "audio")).toBe(false);
  }, 60_000);

  it("rejects malformed model output instead of writing valid evidence", async () => {
    const badFixture = fixture(join(ROOT, "malformed.txt"), "This looks useful but is only prose.");
    const output = join(ROOT, "invalid-evidence.json");
    await expect(main([
      "node", "cli.mjs", "vision", candidate, "--candidate",
      "--model-command", `cat ${quote(badFixture)}`,
      "--output", output,
    ])).rejects.toThrow(/invalid JSON/);
    expect(existsSync(output)).toBe(false);
  });

  it("accepts zero and preserves explicit pre-trimmed candidate intervals", async () => {
    const manifestPath = join(ROOT, "zero-candidate-interval.json");
    const output = join(ROOT, "zero-interval-evidence.json");
    const noTranscriptFixture = fixture(join(ROOT, "valid-no-transcript.json"), evidenceResponse({ uncertainty: true }));
    writeFileSync(manifestPath, JSON.stringify({
      source: {
        id: "source-22",
        path: basename(trimmedCandidate),
        start: 12,
        end: 14.5,
      },
      candidatePath: basename(trimmedCandidate),
      candidateId: "candidate-zero",
      candidateStartSec: 0,
      candidateEndSec: 2.5,
    }));

    await main([
      "node", "cli.mjs", "vision", manifestPath, "--candidate",
      "--model-command", `cat ${quote(noTranscriptFixture)}`,
      "--output", output,
    ]);

    const artifact = JSON.parse(readFileSync(output, "utf-8"));
    expect(artifact.source).toMatchObject({ id: "source-22", start: 12, end: 14.5 });
    expect(artifact.candidate).toMatchObject({
      id: "candidate-zero",
      start: 0,
      end: 2.5,
      path: trimmedCandidate,
    });
  });

  it("rejects fabricated transcript quotes", () => {
    const transcript = normalizeTranscript(join(ROOT, "transcript.vtt"));
    const parsed = evidenceResponse({ quote: "This sentence was never spoken" });
    expect(() => validateAgainstTranscript(parsed as any, transcript)).toThrow(/absent from caller-supplied transcript/);
  });

  it("invalidates cache for prompt, contract, model, and candidate-bound changes", () => {
    const identity = {
      source: { id: "source", path: candidate, start: 0, end: 1 },
      candidate: { id: "candidate", path: candidate, start: 0, end: 1 },
    };
    const transcript = { supplied: false, text: null };
    const base = cacheKey(identity as any, transcript as any, "", "prompt", "model", "v1");

    expect(cacheKey(identity as any, transcript as any, "changed", "prompt", "model", "v1")).not.toBe(base);
    expect(cacheKey(identity as any, transcript as any, "", "changed prompt", "model", "v1")).not.toBe(base);
    expect(cacheKey(identity as any, transcript as any, "", "prompt", "changed model", "v1")).not.toBe(base);
    expect(cacheKey(identity as any, transcript as any, "", "prompt", "model", "v2")).not.toBe(base);

    const changedBounds = {
      source: { ...identity.source, start: 1, end: 2 },
      candidate: { ...identity.candidate, start: 1, end: 2 },
    };
    expect(cacheKey(changedBounds as any, transcript as any, "", "prompt", "model", "v1")).not.toBe(base);
  });

  it("honors --skip-stt in normal vision mode", async () => {
    mkdirSync(SKIP_STT_ROOT, { recursive: true });
    const video = createVideo(SKIP_STT_ROOT, "long.mp4");
    await main(["node", "cli.mjs", "vision", SKIP_STT_ROOT, "--skip-stt"]);

    const metadataPath = join(SKIP_STT_ROOT, "metadata.json");
    expect(existsSync(metadataPath)).toBe(true);
    const metadata = JSON.parse(readFileSync(metadataPath, "utf-8"));
    const entry = metadata.long;
    expect(entry.perception.desc).toContain("whole video");
    expect(entry.perception.subtitle).toBeNull();

    const generated = execSync(`find ${quote(SKIP_STT_ROOT)} -type f \\( -name '*_audio.mp3' -o -name '*.vtt' \\) -print`, { encoding: "utf-8" }).trim();
    expect(generated).toBe("");
    expect(existsSync(video)).toBe(true);
  }, 120_000);
});
