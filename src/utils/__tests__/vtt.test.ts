import { describe, expect, it } from "vitest";
import { parseVTT, vttSecond, VTT_REG } from "../index";

describe("vttSecond", () => {
  it("parses MM:SS.mmm format", () => {
    expect(vttSecond("01:30.500")).toBeCloseTo(90.5);
  });

  it("parses HH:MM:SS.mmm format", () => {
    expect(vttSecond("01:30:15.250")).toBeCloseTo(5415.25);
  });

  it("parses MM:SS without milliseconds", () => {
    expect(vttSecond("02:15")).toBe(135);
  });

  it("parses HH:MM:SS without milliseconds", () => {
    expect(vttSecond("01:00:00")).toBe(3600);
  });

  it("returns 0 for invalid input", () => {
    expect(vttSecond("not-a-time")).toBe(0);
    expect(vttSecond("")).toBe(0);
  });
});

describe("VTT_REG regex", () => {
  it("matches MM:SS.mmm", () => {
    const m = VTT_REG.exec("01:30.500");
    expect(m).not.toBeNull();
    expect(m![1]).toBeUndefined(); // no hours
    expect(m![2]).toBe("01");
    expect(m![3]).toBe("30");
    expect(m![4]).toBe("500");
  });

  it("matches HH:MM:SS.mmm", () => {
    const m = VTT_REG.exec("01:30:15.250");
    expect(m![1]).toBe("01");
    expect(m![2]).toBe("30");
    expect(m![3]).toBe("15");
    expect(m![4]).toBe("250");
  });
});

describe("parseVTT", () => {
  it("parses a single cue", () => {
    const vtt = `WEBVTT\n\n00:00:01.000 --> 00:00:03.500\nHello world`;
    const cues = parseVTT(vtt);
    expect(cues).toHaveLength(1);
    expect(cues[0]!.startFrom).toBeCloseTo(1);
    expect(cues[0]!.endAt).toBeCloseTo(3.5);
    expect(cues[0]!.text).toBe("Hello world");
  });

  it("parses multiple cues", () => {
    const vtt = `WEBVTT\n\n1\n00:00:01.000 --> 00:00:02.000\nFirst\n\n2\n00:00:03.000 --> 00:00:04.500\nSecond cue`;
    const cues = parseVTT(vtt);
    expect(cues).toHaveLength(2);
    expect(cues[0]!.text).toBe("First");
    expect(cues[1]!.text).toBe("Second cue");
    expect(cues[1]!.startFrom).toBeCloseTo(3);
    expect(cues[1]!.endAt).toBeCloseTo(4.5);
  });

  it("parses multi-line text", () => {
    const vtt = `WEBVTT\n\n00:00:00.500 --> 00:00:02.000\nLine one\nLine two`;
    const cues = parseVTT(vtt);
    expect(cues).toHaveLength(1);
    expect(cues[0]!.text).toBe("Line one\nLine two");
  });

  it("handles Windows-style line endings", () => {
    const vtt = "WEBVTT\r\n\r\n00:00:01.000 --> 00:00:02.000\r\nHello";
    const cues = parseVTT(vtt);
    expect(cues).toHaveLength(1);
    expect(cues[0]!.text).toBe("Hello");
  });

  it("returns empty array for VTT with no cues", () => {
    const cues = parseVTT("WEBVTT\n\n");
    expect(cues).toHaveLength(0);
  });

  it("parses cues without HH: prefix", () => {
    const vtt = `WEBVTT\n\n01:30.500 --> 02:00.000\nNo hours`;
    const cues = parseVTT(vtt);
    expect(cues).toHaveLength(1);
    expect(cues[0]!.startFrom).toBeCloseTo(90.5);
    expect(cues[0]!.endAt).toBeCloseTo(120);
  });
});

describe("VTT merge simulation", () => {
  it("shifts cue timestamps by an offset", () => {
    // Simulates what resolveSubtitles does: take per-clip VTTs
    // and merge them with absolute offsets
    const clipVtt = `WEBVTT\n\n00:00:00.000 --> 00:00:02.000\nHello`;
    const cues = parseVTT(clipVtt);
    const offset = 10;

    const shifted = cues.map((c) => ({
      start: c.startFrom + offset,
      end: c.endAt + offset,
      text: c.text,
    }));

    expect(shifted).toHaveLength(1);
    expect(shifted[0]!.start).toBe(10);
    expect(shifted[0]!.end).toBe(12);
    expect(shifted[0]!.text).toBe("Hello");
  });

  it("merges cues from multiple clips", () => {
    const clip1 = `WEBVTT\n\n00:00:00.000 --> 00:00:01.000\nClip one`;
    const clip2 = `WEBVTT\n\n00:00:00.000 --> 00:00:01.500\nClip two`;

    const allCues = [
      ...parseVTT(clip1).map((c) => ({ ...c, start: c.startFrom + 0, end: c.endAt + 0 })),
      ...parseVTT(clip2).map((c) => ({ ...c, start: c.startFrom + 5, end: c.endAt + 5 })),
    ];

    expect(allCues).toHaveLength(2);
    expect(allCues[0]!.start).toBe(0);
    expect(allCues[0]!.end).toBe(1);
    expect(allCues[1]!.start).toBe(5);
    expect(allCues[1]!.end).toBe(6.5);
  });
});
