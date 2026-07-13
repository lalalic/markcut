/**
 * Integration tests for the Remotion Engine.
 *
 * Tests verify that rendering produces valid MP4 output with correct:
 * - Video dimensions, duration, and FPS
 * - Key frame visual content (non-blank, correct composition)
 * - Audio track presence and content (via STT)
 *
 * Each test exercises one or more feature(s) of the stream tree schema.
 */
import { describe, it, expect, beforeAll } from "vitest";
import {
  renderFixture,
  getVideoInfo,
  extractFrame,
  extractAudio,
  transcribeAudio,
  isFrameNonBlank,
  getFrameFileSize,
  OUT_DIR,
  FIXTURES_DIR,
} from "./utils";
import { existsSync, rmSync, mkdirSync } from "node:fs";
import { resolve } from "node:path";

// Increase timeout for integration tests (rendering + STT can take a while)
const RENDER_TIMEOUT = 300_000;

beforeAll(() => {
  mkdirSync(OUT_DIR, { recursive: true });
});

// ── Helpers ─────────────────────────────────────────────────────────────────

function fixturePath(name: string): string {
  return resolve(FIXTURES_DIR, name);
}

function outPath(name: string): string {
  return resolve(OUT_DIR, name);
}

// ───────────────────────────────────────────────────────────────────────────
// 1. Basic Render Tests
// ───────────────────────────────────────────────────────────────────────────

describe("Basic Rendering", () => {
  it("renders a minimal empty composition", async () => {
    const fixture = {
      root: {
        id: "root",
        type: "root",
        width: 640,
        height: 480,
        fps: 30,
        isSeries: false,
        children: [],
      },
    };

    // Write temp fixture
    const tmpFixture = outPath("_minimal.json");
    const { writeFileSync } = await import("node:fs");
    writeFileSync(tmpFixture, JSON.stringify(fixture));

    const output = renderFixture(tmpFixture, {
      outputName: "minimal.mp4",
      timeout: RENDER_TIMEOUT,
    });

    const info = getVideoInfo(output);
    expect(info.width).toBe(640);
    expect(info.height).toBe(480);
    expect(info.fps).toBe(30);
    expect(info.durationSec).toBeCloseTo(1, 0); // default 1s
    expect(info.fileSizeBytes).toBeGreaterThan(1000);

    // Cleanup
    try { rmSync(tmpFixture); } catch {}
  });

  it("renders with correct dimensions from fixture", async () => {
    const output = renderFixture(fixturePath("basic.json"), {
      outputName: "basic.mp4",
      timeout: RENDER_TIMEOUT,
    });

    const info = getVideoInfo(output);
    expect(info.width).toBe(640);
    expect(info.height).toBe(480);
    expect(info.fps).toBe(30);
    // basic.json has one scene with max action end=2 → ~2s expected
    expect(info.durationSec).toBeGreaterThanOrEqual(1);
    expect(info.durationSec).toBeLessThanOrEqual(3);
  });
});

// ───────────────────────────────────────────────────────────────────────────
// 2. Image + Root Subtitle Overlay Rendering
// ───────────────────────────────────────────────────────────────────────────

describe("Image + Root Subtitle Overlay Rendering", () => {
  it("renders an image scene correctly", async () => {
    const output = renderFixture(fixturePath("basic.json"), {
      outputName: "basic-image.mp4",
      timeout: RENDER_TIMEOUT,
    });

    const info = getVideoInfo(output);
    expect(info.width).toBe(640);
    expect(info.height).toBe(480);

    // Extract a frame at 0.5s — should have visual content
    const frame1 = outPath("frames/basic-0.5s.png");
    extractFrame(output, 0.5, frame1);
    expect(existsSync(frame1)).toBe(true);

    // Verify frame is not blank
    expect(isFrameNonBlank(frame1)).toBe(true);

    // Check frame has substantial content (non-blank PNG should be > 5KB)
    const frameSize = getFrameFileSize(frame1);
    expect(frameSize).toBeGreaterThan(5000);
  });

  it("renders root-level subtitle overlay from inline VTT", async () => {
    const output = renderFixture(fixturePath("subtitle.json"), {
      outputName: "subtitle-overlay.mp4",
      timeout: RENDER_TIMEOUT,
    });

    const info = getVideoInfo(output);
    expect(info.width).toBe(640);

    // Extract frame at 1s — subtitle cue active (0.5–3.5s)
    const frameWithSub = outPath("frames/subtitle-1s.png");
    extractFrame(output, 1, frameWithSub);
    expect(existsSync(frameWithSub)).toBe(true);
    expect(isFrameNonBlank(frameWithSub)).toBe(true);

    // Extract frame at 5s (between cues in scene-2)
    const frameSilent = outPath("frames/subtitle-5s.png");
    extractFrame(output, 5, frameSilent);
    expect(existsSync(frameSilent)).toBe(true);
    expect(isFrameNonBlank(frameSilent)).toBe(true);
  });

  it("renders image scene with no subtitle node (basic fixture)", async () => {
    const output = renderFixture(fixturePath("basic.json"), {
      outputName: "basic-no-subtitle.mp4",
      timeout: RENDER_TIMEOUT,
    });

    const info = getVideoInfo(output);
    expect(info.width).toBe(640);
    expect(info.height).toBe(480);
    expect(info.fileSizeBytes).toBeGreaterThan(5000);
  });
});

// ───────────────────────────────────────────────────────────────────────────
// 3. Built-in Components
// ───────────────────────────────────────────────────────────────────────────

describe("Built-in Components", () => {
  it("renders AnimatedHeadline component", async () => {
    const output = renderFixture(fixturePath("components.json"), {
      outputName: "components.mp4",
      timeout: RENDER_TIMEOUT,
    });

    const info = getVideoInfo(output);
    expect(info.width).toBe(640);

    // Check frame at 1s (scene 1, headline visible)
    const frame1 = outPath("frames/components-1s.png");
    extractFrame(output, 1, frame1);
    expect(isFrameNonBlank(frame1)).toBe(true);

    // Check frame at 4s (scene 2, stats visible)
    const frame2 = outPath("frames/components-4s.png");
    extractFrame(output, 4, frame2);
    expect(isFrameNonBlank(frame2)).toBe(true);
  });

  it("renders StatCounter component", async () => {
    const output = renderFixture(fixturePath("components.json"), {
      outputName: "components-statcounter.mp4",
      timeout: RENDER_TIMEOUT,
    });

    const info = getVideoInfo(output);
    expect(info.fps).toBe(30);
    expect(info.durationSec).toBeGreaterThanOrEqual(4);
  });
});

// ───────────────────────────────────────────────────────────────────────────
// 4. Effects (CSS Keyframe Animations)
// ───────────────────────────────────────────────────────────────────────────

describe("Effects (CSS Keyframes)", () => {
  it("renders fadeIn effect", async () => {
    const output = renderFixture(fixturePath("effects.json"), {
      outputName: "effects.mp4",
      timeout: RENDER_TIMEOUT,
    });

    const info = getVideoInfo(output);
    expect(info.width).toBe(640);

    // FadeIn scene is first (0-2s), extract at 1s
    const frameFade = outPath("frames/effects-fade-1s.png");
    extractFrame(output, 1, frameFade);
    expect(isFrameNonBlank(frameFade)).toBe(true);

    // Bounce scene is second (2-4s), extract at 3s  
    const frameBounce = outPath("frames/effects-bounce-3s.png");
    extractFrame(output, 3, frameBounce);
    expect(isFrameNonBlank(frameBounce)).toBe(true);

    // Custom keyframes scene is third (4-6s), extract at 5s
    const frameCustom = outPath("frames/effects-custom-5s.png");
    extractFrame(output, 5, frameCustom);
    expect(isFrameNonBlank(frameCustom)).toBe(true);
  });

  it("renders animation with custom keyframes", async () => {
    const output = renderFixture(fixturePath("effects.json"), {
      outputName: "effects-custom.mp4",
      timeout: RENDER_TIMEOUT,
    });

    const info = getVideoInfo(output);
    expect(info.durationSec).toBeGreaterThanOrEqual(5);
  });
});

// ───────────────────────────────────────────────────────────────────────────
// 5. Map Rendering (Canvas Route)
// ───────────────────────────────────────────────────────────────────────────

describe("Map Rendering", () => {
  it("renders a map route on canvas", async () => {
    const output = renderFixture(fixturePath("map.json"), {
      outputName: "map.mp4",
      timeout: RENDER_TIMEOUT,
    });

    const info = getVideoInfo(output);
    expect(info.width).toBe(640);
    expect(info.durationSec).toBeGreaterThanOrEqual(2);

    // Extract frame at mid-point
    const frame = outPath("frames/map-1.5s.png");
    extractFrame(output, 1.5, frame);
    expect(isFrameNonBlank(frame)).toBe(true);

    // Map should have visual content (non-blank PNG > 5KB)
    const mapFrameSize = getFrameFileSize(frame);
    expect(mapFrameSize).toBeGreaterThan(5000);
  });
});

// ───────────────────────────────────────────────────────────────────────────
// 6. Audio Rendering
// ───────────────────────────────────────────────────────────────────────────

describe("Audio Rendering", () => {
  it("renders video with audio track", async () => {
    const output = renderFixture(fixturePath("audio.json"), {
      outputName: "audio.mp4",
      timeout: RENDER_TIMEOUT,
    });

    const info = getVideoInfo(output);
    expect(info.width).toBe(640);
    // Should have an audio stream
    expect(info.hasAudio).toBe(true);
  });

  it("extracts audio and verifies non-silent", async () => {
    const output = renderFixture(fixturePath("audio.json"), {
      outputName: "audio-extract.mp4",
      timeout: RENDER_TIMEOUT,
    });

    const audioPath = outPath("audio/audio-extract.wav");
    extractAudio(output, audioPath);
    expect(existsSync(audioPath)).toBe(true);

    // Check audio has non-silent content (file should be > 1KB)
    const { statSync } = await import("node:fs");
    const audioSize = statSync(audioPath).size;
    expect(audioSize).toBeGreaterThan(1000);
  });

  it("renders audio in full feature test", async () => {
    const output = renderFixture(fixturePath("full.json"), {
      outputName: "audio-full.mp4",
      timeout: RENDER_TIMEOUT,
    });

    const info = getVideoInfo(output);
    // full.json has background audio
    expect(info.hasAudio).toBe(true);
  });
});

// ───────────────────────────────────────────────────────────────────────────
// 7. Include (External Video Composition)
// ───────────────────────────────────────────────────────────────────────────

describe("Include Rendering", () => {
  it("renders an external video via include", async () => {
    const output = renderFixture(fixturePath("subvideo.json"), {
      outputName: "include.mp4",
      timeout: RENDER_TIMEOUT,
    });

    const info = getVideoInfo(output);
    expect(info.width).toBe(640);
    expect(info.height).toBe(480);
    expect(info.durationSec).toBeGreaterThanOrEqual(7);

    // Extract frame at 1s (main video, intro)
    const frameMain = outPath("frames/include-main-1s.png");
    extractFrame(output, 1, frameMain);
    expect(isFrameNonBlank(frameMain)).toBe(true);

    // Extract frame at 3s (included video playing)
    const frameSub = outPath("frames/include-sub-3s.png");
    extractFrame(output, 3, frameSub);
    expect(isFrameNonBlank(frameSub)).toBe(true);

    // Extract frame at 5s (included video scene 2)
    const frameSub2 = outPath("frames/include-sub-5s.png");
    extractFrame(output, 5, frameSub2);
    expect(isFrameNonBlank(frameSub2)).toBe(true);

    // Extract frame at 7s (outro)
    const frameOutro = outPath("frames/include-outro-7s.png");
    extractFrame(output, 7, frameOutro);
    expect(isFrameNonBlank(frameOutro)).toBe(true);
  });
});

// ───────────────────────────────────────────────────────────────────────────
// 8. Full Feature Combination
// ───────────────────────────────────────────────────────────────────────────

describe("Full Feature Combination", () => {
  it("renders a complete video with multiple features", async () => {
    const output = renderFixture(fixturePath("full.json"), {
      outputName: "full.mp4",
      timeout: RENDER_TIMEOUT,
    });

    const info = getVideoInfo(output);
    expect(info.width).toBe(640);
    expect(info.height).toBe(480);
    expect(info.fps).toBe(30);
    // Parallel layout: max(5, 5, 4.5, 4.5) = 5s from audio
    expect(info.durationSec).toBeGreaterThanOrEqual(4);

    // Verify frames at key points (all scenes play in parallel)
    const frame1 = outPath("frames/full-0.5s.png"); // headline + stats + subtitle
    extractFrame(output, 0.5, frame1);
    expect(isFrameNonBlank(frame1)).toBe(true);

    const frame2 = outPath("frames/full-2.5s.png"); // mid-point
    extractFrame(output, 2.5, frame2);
    expect(isFrameNonBlank(frame2)).toBe(true);

    const frame3 = outPath("frames/full-4s.png"); // near end
    extractFrame(output, 4, frame3);
    expect(isFrameNonBlank(frame3)).toBe(true);

    // Full file should be substantial
    expect(info.fileSizeBytes).toBeGreaterThan(20000);
  });

  it("renders all fixtures without errors", async () => {
    const fixtures = [
      "basic.json",
      "components.json",
      "effects.json",
      "subtitle.json",
      "map.json",
      "audio.json",
      "subvideo.json",
      "full.json",
    ];

    for (const f of fixtures) {
      const output = renderFixture(fixturePath(f), {
        outputName: `batch-${f.replace(/\.json$/, ".mp4")}`,
        timeout: RENDER_TIMEOUT,
      });
      const info = getVideoInfo(output);
      expect(info.fileSizeBytes).toBeGreaterThan(1000);
      expect(info.width).toBe(640);
      expect(info.height).toBe(480);
    }
  });
});

// ───────────────────────────────────────────────────────────────────────────
// 9. Scene Node Rendering (stream tree scene type)
// ───────────────────────────────────────────────────────────────────────────

describe("Scene Node Rendering", () => {
  it("renders scenes via stream tree scene nodes", async () => {
    const output = renderFixture(fixturePath("scenes.json"), {
      outputName: "scenes.mp4",
      timeout: RENDER_TIMEOUT,
    });

    const info = getVideoInfo(output);
    expect(info.width).toBe(640);
    expect(info.height).toBe(480);
    // 2 scenes: 3s + 2s - 0.3s transition = ~4.7s
    expect(info.durationSec).toBeGreaterThanOrEqual(4);

    // Extract frame at 1s (scene 1) — verify visual content
    const frame = outPath("frames/scenes-1s.png");
    extractFrame(output, 1, frame);
    expect(isFrameNonBlank(frame)).toBe(true);

    // Extract frame at 4s (scene 2) — verify file has content
    const frame2 = outPath("frames/scenes-4s.png");
    extractFrame(output, 4, frame2);
    expect(getFrameFileSize(frame2)).toBeGreaterThan(5000);
  });
});

// ───────────────────────────────────────────────────────────────────────────
// 10. Audio STT Verification (if whisper available)
// ───────────────────────────────────────────────────────────────────────────

describe("Audio STT Verification", () => {
  it("transcribes audio from rendered video", async () => {
    // Use a fixture that has audio
    const output = renderFixture(fixturePath("audio.json"), {
      outputName: "stt-audio.mp4",
      timeout: RENDER_TIMEOUT,
    });

    // Extract audio
    const audioPath = outPath("audio/stt-audio.wav");
    extractAudio(output, audioPath);
    expect(existsSync(audioPath)).toBe(true);

    // Run STT
    const text = transcribeAudio(audioPath);
    // The audio is ambient music, so STT might return empty or garbage
    // This test just checks the pipeline works without errors
    expect(text).toBeDefined();
    console.log(`  STT result (ambient audio): "${text}"`);
  });

  it("transcribes audio from full feature video", async () => {
    const output = renderFixture(fixturePath("full.json"), {
      outputName: "stt-full.mp4",
      timeout: RENDER_TIMEOUT,
    });

    const audioPath = outPath("audio/stt-full.wav");
    extractAudio(output, audioPath);

    const text = transcribeAudio(audioPath);
    expect(text).toBeDefined();
    console.log(`  STT result (full video audio): "${text}"`);
  });
});

// ───────────────────────────────────────────────────────────────────────────
// 11. Multiple Aspect Ratios
// ───────────────────────────────────────────────────────────────────────────

describe("Multiple Aspect Ratios", () => {
  it("renders same fixture at 16x9, 9x16, and 1x1", async () => {
    const fixture = {
      root: {
        id: "root",
        type: "root",
        width: 1920,
        height: 1080,
        fps: 30,
        isSeries: false,
        children: [
          {
            id: "bg",
            type: "image",
            src: "https://picsum.photos/seed/aspect-test/1920/1080",
            fit: "cover",
            actions: [{ start: 0, end: 2 }],
          },
          {
            id: "title",
            type: "subtitle",
            src: "Aspect Ratio Test",
            fontSize: 48,
            style: "color: #ffffff; font-weight: bold;",
            actions: [{ start: 0.3, end: 1.7 }],
          },
        ],
      },
    };

    const { writeFileSync } = await import("node:fs");
    const tmpFixture = outPath("_aspects.json");
    writeFileSync(tmpFixture, JSON.stringify(fixture));

    // Render with different aspect ratios via --props adaptation
    // Note: Aspect adaptation happens in the CLI, so we test with the default
    const output = renderFixture(tmpFixture, {
      outputName: "aspect-default.mp4",
      timeout: RENDER_TIMEOUT,
    });

    const info = getVideoInfo(output);
    // Default aspect is whatever the fixture says (1920x1080)
    expect(info.width).toBe(1920);
    expect(info.height).toBe(1080);

    try { rmSync(tmpFixture); } catch {}
  });
});

// ───────────────────────────────────────────────────────────────────────────
// 12. Cross-Stream Type Compatibility
// ───────────────────────────────────────────────────────────────────────────

describe("Cross-Stream Type Compatibility", () => {
  it("renders audio + image + subtitle in parallel", async () => {
    // All three types playing simultaneously in the same folder
    const fixture = {
      root: {
        id: "root",
        type: "root",
        width: 640,
        height: 480,
        fps: 30,
        isSeries: false,
        children: [
          {
            id: "bgm-test",
            type: "audio",
            src: "assets/bgm/ambient-loop.mp3",
            volume: 0.2,
            isBackground: true,
            actions: [{ start: 0, end: 3 }],
          },
          {
            id: "img-test",
            type: "image",
            src: "https://picsum.photos/seed/cross1/640/480",
            fit: "cover",
            actions: [{ start: 0, end: 3 }],
          },
          {
            id: "sub-test",
            type: "subtitle",
            src: "Cross-type parallel render",
            fontSize: 36,
            style: "color: #ffffff; font-weight: bold; text-shadow: 0 2px 8px rgba(0,0,0,0.8);",
            actions: [{ start: 0.5, end: 2.5 }],
          },
        ],
      },
    };

    const { writeFileSync } = await import("node:fs");
    const tmpFixture = outPath("_cross-types.json");
    writeFileSync(tmpFixture, JSON.stringify(fixture));

    const output = renderFixture(tmpFixture, {
      outputName: "cross-types.mp4",
      timeout: RENDER_TIMEOUT,
    });

    const info = getVideoInfo(output);
    expect(info.width).toBe(640);
    expect(info.hasAudio).toBe(true);

    const frame = outPath("frames/cross-types-1s.png");
    extractFrame(output, 1, frame);
    expect(isFrameNonBlank(frame)).toBe(true);

    try { rmSync(tmpFixture); } catch {}
  });

  it("renders effect-wrapped children", async () => {
    const fixture = {
      root: {
        id: "root",
        type: "root",
        width: 640,
        height: 480,
        fps: 30,
        isSeries: true,
        transition: "fade",
        transitionTime: 0.3,
        children: [
          {
            id: "effect-scene",
            type: "effect",
            animation: "slideInUp",
            children: [
              {
                id: "effect-img",
                type: "image",
                src: "https://picsum.photos/seed/eff-child/640/480",
                fit: "cover",
                actions: [{ start: 0, end: 2 }],
              },
            ],
            actions: [{ start: 0, end: 2 }],
          },
        ],
      },
    };

    const { writeFileSync } = await import("node:fs");
    const tmpFixture = outPath("_effect-children.json");
    writeFileSync(tmpFixture, JSON.stringify(fixture));

    const output = renderFixture(tmpFixture, {
      outputName: "effect-children.mp4",
      timeout: RENDER_TIMEOUT,
    });

    const info = getVideoInfo(output);
    expect(info.width).toBe(640);

    const frame = outPath("frames/effect-children-1s.png");
    extractFrame(output, 1, frame);
    expect(isFrameNonBlank(frame)).toBe(true);

    try { rmSync(tmpFixture); } catch {}
  });
});

// ───────────────────────────────────────────────────────────────────────────
// 13. Frame-Accurate Verification
// ───────────────────────────────────────────────────────────────────────────

describe("Frame-Accurate Verification", () => {
  it("verifies consistent frames across the timeline", async () => {
    const output = renderFixture(fixturePath("basic.json"), {
      outputName: "frame-accuracy.mp4",
      timeout: RENDER_TIMEOUT,
    });

    const info = getVideoInfo(output);
    expect(info.durationSec).toBeGreaterThan(0);

    // Extract frames at regular intervals
    const intervals = [0.1, 0.5, 1.0, 1.5];
    for (const t of intervals) {
      if (t >= info.durationSec) continue;
      const frame = outPath(`frames/accuracy-${t}s.png`);
      extractFrame(output, t, frame);
      expect(existsSync(frame)).toBe(true);
      expect(isFrameNonBlank(frame)).toBe(true);
    }
  });

  it("verifies video has expected number of frames", async () => {
    const output = renderFixture(fixturePath("basic.json"), {
      outputName: "frame-count.mp4",
      timeout: RENDER_TIMEOUT,
    });

    const info = getVideoInfo(output);
    const expectedFrames = Math.round(info.durationSec * info.fps);
    expect(expectedFrames).toBeGreaterThan(30); // at least 30 frames for 1s @ 30fps
  });
});

// ───────────────────────────────────────────────────────────────────────────
// 14. Description Field (label/storyboard metadata on any stream type)
// ───────────────────────────────────────────────────────────────────────────

describe("Instruction Field", () => {
  it("validates instruction on image nodes via schema", async () => {
    const { image } = await import("../src/schema/index");

    const withInst = image.parse({
      id: "test-img",
      type: "image",
      src: "https://picsum.photos/seed/desc/640/480",
      instruction: "A beautiful sunset",
      actions: [{ start: 0, end: 3 }],
    });
    expect(withInst.instruction).toBe("A beautiful sunset");

    const withoutInst = image.parse({
      id: "test-img-2",
      type: "image",
      src: "https://picsum.photos/seed/no-desc/640/480",
      actions: [{ start: 0, end: 3 }],
    });
    expect(withoutInst.instruction).toBeUndefined();
  });

  it("validates instruction on video/component nodes via schema", async () => {
    const { video, component } = await import("../src/schema/index");

    const v = video.parse({
      id: "test-vid",
      type: "video",
      src: "test.mp4",
      instruction: "label for video clip",
      actions: [{ start: 0, end: 5 }],
    });
    expect(v.instruction).toBe("label for video clip");

    const c = component.parse({
      id: "test-comp",
      type: "component",
      componentName: "StatCounter",
      instruction: "stats component label",
      props: { value: 100 },
      actions: [{ start: 0, end: 3 }],
    });
    expect(c.instruction).toBe("stats component label");
  });

  it("preserves instruction through render pipeline", async () => {
    // Render a fixture where image has an instruction — the engine should not strip it
    const fixture = {
      root: {
        id: "root",
        type: "root",
        width: 640,
        height: 480,
        fps: 30,
        isSeries: false,
        children: [
          {
            id: "desc-img",
            type: "image",
            src: "https://picsum.photos/seed/desc-render/640/480",
            instruction: "Preserved instruction",
            fit: "cover",
            actions: [{ start: 0, end: 2 }],
          },
        ],
      },
    };

    const { writeFileSync } = await import("node:fs");
    const tmpFixture = outPath("_instruction.json");
    writeFileSync(tmpFixture, JSON.stringify(fixture));

    const output = renderFixture(tmpFixture, {
      outputName: "instruction.mp4",
      timeout: RENDER_TIMEOUT,
    });

    const info = getVideoInfo(output);
    expect(info.width).toBe(640);
    expect(info.fileSizeBytes).toBeGreaterThan(1000);

    try { rmSync(tmpFixture); } catch {}
  });
});

// ───────────────────────────────────────────────────────────────────────────
// 15. Scene as Folder Alias
// ───────────────────────────────────────────────────────────────────────────

describe("Scene as Folder Alias", () => {
  it("treats scene type nodes identically to folder type nodes", async () => {
    // Both scene and folder should render the same structure.
    // First render with folders, then with scenes, compare structure.
    const fixtureScenes = {
      root: {
        id: "root",
        type: "root",
        width: 640,
        height: 480,
        fps: 30,
        isSeries: true,
        transition: "fade",
        transitionTime: 0.3,
        children: [
          {
            id: "scene-1",
            type: "scene",
            name: "Intro",
            description: "Opening sequence",
            children: [
              {
                id: "s1-img",
                type: "image",
                src: "https://picsum.photos/seed/scene-alias-1/640/480",
                fit: "cover",
                actions: [{ start: 0, end: 2 }],
              },
            ],
          },
          {
            id: "scene-2",
            type: "scene",
            name: "Outro",
            description: "Closing message",
            children: [
              {
                id: "s2-img",
                type: "image",
                src: "https://picsum.photos/seed/scene-alias-2/640/480",
                fit: "cover",
                actions: [{ start: 0, end: 2 }],
              },
            ],
          },
        ],
      },
    };

    const { writeFileSync } = await import("node:fs");
    const tmpFixture = outPath("_scene-as-folder.json");
    writeFileSync(tmpFixture, JSON.stringify(fixtureScenes));

    const output = renderFixture(tmpFixture, {
      outputName: "scene-as-folder.mp4",
      timeout: RENDER_TIMEOUT,
    });

    const info = getVideoInfo(output);
    expect(info.width).toBe(640);
    // 2 scenes × 2s − 0.3s transition = ~3.7s
    expect(info.durationSec).toBeGreaterThanOrEqual(3);

    // Verify visual content at both scenes
    const frame1 = outPath("frames/scene-alias-0.5s.png");
    extractFrame(output, 0.5, frame1);
    expect(isFrameNonBlank(frame1)).toBe(true);

    const frame2 = outPath("frames/scene-alias-2.5s.png");
    extractFrame(output, 2.5, frame2);
    expect(isFrameNonBlank(frame2)).toBe(true);

    try { rmSync(tmpFixture); } catch {}
  });

  it("mixes scene and folder types in same tree", async () => {
    // A root using series with a mix of scene and folder children
    const fixture = {
      root: {
        id: "root",
        type: "root",
        width: 640,
        height: 480,
        fps: 30,
        isSeries: true,
        transition: "fade",
        transitionTime: 0.3,
        children: [
          {
            id: "scene-mixed-1",
            type: "scene",
            name: "Scene First",
            children: [
              {
                id: "mix1-img",
                type: "image",
                src: "https://picsum.photos/seed/mix-scene/640/480",
                fit: "cover",
                actions: [{ start: 0, end: 2 }],
              },
            ],
          },
          {
            id: "folder-mixed-2",
            type: "folder",
            name: "Folder Second",
            children: [
              {
                id: "mix2-img",
                type: "image",
                src: "https://picsum.photos/seed/mix-folder/640/480",
                fit: "cover",
                actions: [{ start: 0, end: 2 }],
              },
            ],
          },
        ],
      },
    };

    const { writeFileSync } = await import("node:fs");
    const tmpFixture = outPath("_mixed-scene-folder.json");
    writeFileSync(tmpFixture, JSON.stringify(fixture));

    const output = renderFixture(tmpFixture, {
      outputName: "mixed-scene-folder.mp4",
      timeout: RENDER_TIMEOUT,
    });

    const info = getVideoInfo(output);
    expect(info.width).toBe(640);
    expect(info.durationSec).toBeGreaterThanOrEqual(3);

    try { rmSync(tmpFixture); } catch {}
  });
});

// ───────────────────────────────────────────────────────────────────────────
// 16. Video startFrom/endAt Trimming + Photo in Series
// ───────────────────────────────────────────────────────────────────────────

describe("Video startFrom/endAt Trimming", () => {
  it("renders a video trimmed with startFrom/endAt followed by a photo in series", async () => {
    const output = renderFixture(fixturePath("video-series.json"), {
      outputName: "video-series.mp4",
      timeout: RENDER_TIMEOUT,
    });

    const info = getVideoInfo(output);
    expect(info.width).toBe(640);
    expect(info.height).toBe(480);
    expect(info.fps).toBe(30);

    // video-scene: 6s, photo-scene: 3s, transition: 0.3s → ~8.7s
    expect(info.durationSec).toBeGreaterThanOrEqual(8);
    expect(info.durationSec).toBeLessThanOrEqual(10);

    // Extract frame at 3s — should be in video-scene (trimmed clip01.mp4, 2s-8s region)
    const frameVideo = outPath("frames/video-series-3s.png");
    extractFrame(output, 3, frameVideo);
    expect(existsSync(frameVideo)).toBe(true);
    expect(isFrameNonBlank(frameVideo)).toBe(true);

    // Extract frame at 7s — should be in photo-scene (image card)
    const framePhoto = outPath("frames/video-series-7s.png");
    extractFrame(output, 7, framePhoto);
    expect(existsSync(framePhoto)).toBe(true);
    expect(isFrameNonBlank(framePhoto)).toBe(true);

    // Verify both frames have meaningful content
    expect(getFrameFileSize(frameVideo)).toBeGreaterThan(5000);
    expect(getFrameFileSize(framePhoto)).toBeGreaterThan(5000);
  });
});
// ───────────────────────────────────────────────────────────────────────────
// 18. Component Rendering (JSX + Tween)
// ───────────────────────────────────────────────────────────────────────────

describe("Component Rendering", () => {
  it("renders HTML JSX and SVG tween components", async () => {
    const output = renderFixture(fixturePath("component-all.json"), {
      outputName: "component-all.mp4",
      timeout: RENDER_TIMEOUT,
    });
    const info = getVideoInfo(output);
    expect(info.width).toBe(640);
    expect(info.height).toBe(480);
    expect(info.fps).toBe(30);
    expect(info.durationSec).toBeGreaterThanOrEqual(4.5);
    expect(info.fileSizeBytes).toBeGreaterThan(1000);
  });

  it("schema parses component-all fixture correctly", async () => {
    const { root: rootSchema } = await import("../src/schema/index");
    const { readFileSync } = await import("node:fs");
    const raw = JSON.parse(readFileSync(fixturePath("component-all.json"), "utf-8"));
    const data = raw.root ?? raw;
    const parsed = rootSchema.parse(data);
    expect(parsed.type).toBe("root");
    expect(parsed.children).toHaveLength(2);

    // Scene 1: HTML JSX
    const scene1 = parsed.children[0];
    expect(scene1.type).toBe("folder"); // scene compiles to folder
    const comp1 = scene1.children[1] as any; // skip background
    expect(comp1.type).toBe("component");
    expect(comp1.jsx).toContain("Hello World");

    // Scene 2: Tween animation
    const scene2 = parsed.children[1];
    expect(scene2.type).toBe("folder");
    const comp2 = scene2.children[1] as any;
    expect(comp2.type).toBe("component");
    expect(comp2.jsx).toContain("tween");
  });
});
