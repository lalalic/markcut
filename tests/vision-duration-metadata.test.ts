import { describe, expect, it } from "vitest";
import { mkdtempSync, rmSync } from "node:fs";
import { tmpdir } from "node:os";
import { join } from "node:path";
import { execFileSync } from "node:child_process";
import { extractMetadata, extractOriginalSegment } from "../src/vision/cli.mjs";

describe("Vision metadata long-video duration", () => {
  it("uses ffprobe time instead of misreading formatted ExifTool Duration", () => {
    const dir=mkdtempSync(join(tmpdir(),"markcut-duration-"));
    try {
      const video=join(dir,"long.mov");
      execFileSync("ffmpeg",["-loglevel","error","-y","-f","lavfi","-i","color=c=blue:s=160x90:r=2:d=76.16",
        "-c:v","libx264","-preset","ultrafast","-pix_fmt","yuv420p",video],{timeout:30000});
      const metadata=extractMetadata(video);
      expect(metadata.width).toBe(160);
      expect(metadata.height).toBe(90);
      expect(metadata.duration).toBeGreaterThan(76);
      expect(metadata.duration).toBeLessThan(77);
      const segment=join(dir,"segment.mp4");
      extractOriginalSegment(video,segment,63,13);
      const seconds=Number(execFileSync("ffprobe",["-v","error","-show_entries","format=duration",
        "-of","default=noprint_wrappers=1:nokey=1",segment],{encoding:"utf8"}).trim());
      expect(seconds).toBeGreaterThan(12);
      expect(seconds).toBeLessThanOrEqual(13.5);
      expect(() => extractOriginalSegment(video,join(dir,"missing.mp4"),80,5)).toThrow(/Cannot decode source segment/);
    } finally {rmSync(dir,{recursive:true,force:true});}
  });
});
