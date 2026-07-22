/**
 * Integration tests for the vision CLI (`markcut vision`).
 *
 * Tests the actual workflow end-to-end:
 *   1. Metadata extraction (exiftool/ffprobe)
 *   2. Media normalization (ffmpeg resize)
 *   3. Image perception (ITT via mlx-vlm)
 *   4. Video perception (VTT + STT + segment analysis)
 */
import { describe, expect, it, beforeAll, afterAll } from "vitest";
import { existsSync, mkdirSync, writeFileSync, readFileSync, rmSync, readdirSync } from "node:fs";
import { join, resolve } from "node:path";
import { fileURLToPath } from "node:url";
import { execSync } from "node:child_process";

const __dirname = resolve(fileURLToPath(import.meta.url), "..");
const ROOT = resolve(__dirname, "..");

// ── Test Fixture Setup ────────────────────────────────────────────────────

const TEST_ROOT = resolve(ROOT, "tests", "tmp", "vision-" + Date.now());
const IMAGE_DIR = join(TEST_ROOT, "images");
const VIDEO_ROOT = TEST_ROOT + "-video";
const VIDEO_DIR = join(VIDEO_ROOT, "videos");

/** Create a small test PNG (solid red, 64x64) using ffmpeg. */
function createTestImage(outDir: string): string {
  mkdirSync(outDir, { recursive: true });
  const outPath = join(outDir, "test-photo.png");
  execSync(
    `ffmpeg -y -f lavfi -i color=c=red:s=64x64:d=1 -frames:v 1 ${outPath}`,
    { stdio: "pipe" },
  );
  return outPath;
}

/** Create a short test video (colored bars + sine tone, 3s) using ffmpeg. */
function createTestVideo(outDir: string): string {
  mkdirSync(outDir, { recursive: true });
  const outPath = join(outDir, "test-clip.mp4");
  execSync(
    `ffmpeg -y -f lavfi -i testsrc=s=320x240:d=3:r=15 ` +
    `-f lavfi -i sine=frequency=440:duration=3 ` +
    `-c:v libx264 -preset ultrafast -crf 40 -c:a aac -shortest ${outPath}`,
    { stdio: "pipe", timeout: 30_000 },
  );
  return outPath;
}

// ── Image Pipeline ───────────────────────────────────────────────────────

describe("image pipeline", () => {
  let imgPath: string;

  beforeAll(() => {
    imgPath = createTestImage(IMAGE_DIR);
    expect(existsSync(imgPath)).toBe(true);
  });

  afterAll(() => {
    rmSync(TEST_ROOT, { recursive: true, force: true });
  });

  it("1. extracts metadata from image", async () => {
    const { main } = await import("../src/vision/cli.mjs");
    await main(["node", "cli.mjs", "vision", IMAGE_DIR]);

    const metaPath = join(IMAGE_DIR, "metadata.json");
    expect(existsSync(metaPath)).toBe(true);

    const metadata = JSON.parse(readFileSync(metaPath, "utf-8"));
    expect(Object.keys(metadata).length).toBeGreaterThan(0);

    const key = Object.keys(metadata)[0]!;
    const entry = metadata[key];
    expect(entry).toHaveProperty("width");
    expect(entry).toHaveProperty("height");
    expect(entry).toHaveProperty("created");
    expect(entry.width).toBeGreaterThan(0);
    expect(entry.height).toBeGreaterThan(0);
  });

  it("2. normalizes image", () => {
    const normDir = join(IMAGE_DIR, ".normalized");
    expect(existsSync(normDir)).toBe(true);

    const normFiles = readdirSync(normDir).filter(f => f.endsWith(".jpg"));
    expect(normFiles.length).toBeGreaterThan(0);

    // Verify normalized file exists and has valid dimensions
    const normPath = join(normDir, normFiles[0]!);
    expect(existsSync(normPath)).toBe(true);
    const probe = JSON.parse(
      execSync(`ffprobe -v quiet -print_format json -show_streams ${normPath}`, { stdio: "pipe" }).toString(),
    );
    const stream = probe.streams?.[0];
    expect(stream).toBeDefined();
    expect(stream.width).toBeLessThanOrEqual(384);
    expect(stream.height).toBeLessThanOrEqual(384);
  });

  it("3. runs image perception (ITT) and saves to metadata", () => {
    const metaPath = join(IMAGE_DIR, "metadata.json");
    const metadata = JSON.parse(readFileSync(metaPath, "utf-8"));

    const key = Object.keys(metadata)[0]!;
    const entry = metadata[key];

    expect(entry).toHaveProperty("perception");
    expect(entry.perception).toHaveProperty("desc");
    expect(entry.perception.desc).toBeTruthy();
    expect(typeof entry.perception.desc).toBe("string");
    expect(entry.perception.desc.length).toBeGreaterThan(10);
  });
});

// ── Video Pipeline ───────────────────────────────────────────────────────

describe("video pipeline", () => {
  let vidPath: string;

  beforeAll(() => {
    vidPath = createTestVideo(VIDEO_DIR);
    expect(existsSync(vidPath)).toBe(true);
  }, 30_000);

  afterAll(() => {
    rmSync(VIDEO_ROOT, { recursive: true, force: true });
  });

  it("1. extracts metadata from video", async () => {
    const { main } = await import("../src/vision/cli.mjs");
    await main(["node", "cli.mjs", "vision", VIDEO_DIR]);

    const metaPath = join(VIDEO_DIR, "metadata.json");
    expect(existsSync(metaPath)).toBe(true);

    const metadata = JSON.parse(readFileSync(metaPath, "utf-8"));
    expect(Object.keys(metadata).length).toBeGreaterThan(0);

    const key = Object.keys(metadata)[0]!;
    const entry = metadata[key];
    expect(entry).toHaveProperty("width");
    expect(entry).toHaveProperty("height");
    expect(entry).toHaveProperty("created");
    expect(entry).toHaveProperty("duration");
    expect(entry.duration).toBeGreaterThan(0);
  }, 60_000);

  it("2. normalizes video", () => {
    const normDir = join(VIDEO_DIR, ".normalized");
    expect(existsSync(normDir)).toBe(true);

    const normFiles = readdirSync(normDir).filter(f => f.endsWith(".mp4"));
    expect(normFiles.length).toBeGreaterThan(0);

    const normPath = join(normDir, normFiles[0]!);
    expect(existsSync(normPath)).toBe(true);
    const probe = JSON.parse(
      execSync(`ffprobe -v quiet -print_format json -show_streams ${normPath}`, { stdio: "pipe" }).toString(),
    );
    const stream = probe.streams?.find((s: any) => s.codec_type === "video");
    expect(stream).toBeDefined();
    expect(stream.width).toBeLessThanOrEqual(360);
    expect(stream.height).toBeLessThanOrEqual(360);
  });

  it("3. runs video perception (VTT) and saves description", () => {
    const metaPath = join(VIDEO_DIR, "metadata.json");
    const metadata = JSON.parse(readFileSync(metaPath, "utf-8"));

    const key = Object.keys(metadata)[0]!;
    const entry = metadata[key];

    expect(entry).toHaveProperty("perception");
    expect(entry.perception).toHaveProperty("desc");
    expect(entry.perception.desc).toBeTruthy();
    expect(typeof entry.perception.desc).toBe("string");
    expect(entry.perception.desc.length).toBeGreaterThan(10);
  });

  it("4. runs STT and produces subtitle file", () => {
    const metaPath = join(VIDEO_DIR, "metadata.json");
    const metadata = JSON.parse(readFileSync(metaPath, "utf-8"));

    const key = Object.keys(metadata)[0]!;
    const entry = metadata[key];

    // STT may be null if no speech detected (test video has sine tone, no speech)
    // But the subtitle field should exist in the perception object
    expect(entry.perception).toHaveProperty("subtitle");
  });

  it("5. produces segment analysis", () => {
    const metaPath = join(VIDEO_DIR, "metadata.json");
    const metadata = JSON.parse(readFileSync(metaPath, "utf-8"));

    const key = Object.keys(metadata)[0]!;
    const entry = metadata[key];

    // Video segments - may be single segment if no boundaries detected
    expect(entry.perception).toHaveProperty("segments");
    expect(typeof entry.perception.segments).toBe("object");
    // Should have at least one segment (even if it's the full video)
    expect(Object.keys(entry.perception.segments).length).toBeGreaterThan(0);
  });
});
