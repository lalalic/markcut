# Vertical motion example: independent verification

Verified on 2026-10-26 against Relay Job 518's working checkout at base `332d839e`, including Task 359's pending capability-catalog changes. This is a local, open-source-only render; no paid API, credentials, or private media were used. Re-run these commands from the Markcut repository root:

```sh
node src/render/cli.mjs render examples/motion-capabilities-9x16.md --output /tmp/markcut-motion-518-360.mp4
ffprobe -v error -show_entries format=duration,size -show_entries stream=index,codec_name,codec_type,width,height,r_frame_rate,duration -of json /tmp/markcut-motion-518-360.mp4
ffmpeg -hide_banner -y -ss 1.5 -i /tmp/markcut-motion-518-360.mp4 -frames:v 1 /tmp/markcut-518-frame1.png
ffmpeg -hide_banner -y -ss 7.5 -i /tmp/markcut-motion-518-360.mp4 -frames:v 1 /tmp/markcut-518-frame2.png
ffmpeg -hide_banner -y -ss 13.5 -i /tmp/markcut-motion-518-360.mp4 -frames:v 1 /tmp/markcut-518-frame3.png
ffmpeg -hide_banner -i /tmp/markcut-motion-518-360.mp4 -af volumedetect -f null -
npx vitest run --config tests/vitest.config.ts tests/motion-capabilities.test.ts tests/md-descriptive.test.ts
npm run typecheck
```

## Measured output

- Render exited 0 and encoded 540 of 540 frames; MP4 file size: 2,387,811 bytes.
- H.264 video: 1080 × 1920, 30/1 fps, 18.000 s. Container: 18.048 s, due to the audio stream.
- AAC audio track: present, 18.048 s, but effectively silent. `volumedetect` found mean and peak −91.0 dB. The sample deliberately has no narration or soundtrack; audio **presence** is verified, audio **audibility** is not. Add audio to a separate authored fixture to validate non-silent mixing.
- At 1.5 s, `CinematicPush` displays legible white heading “Arrive at the idea”, teal eyebrow/rule, with no clipping.
- At 7.5 s, `LayeredCardReveal` displays three colored cards “Plan”, “Build”, “Ship”; the composition stays within the vertical frame.
- At 13.5 s, `BarChartReveal` shows all three colored columns, 32%, 58%, and 91%, with weekday labels fully visible.
- Focused Vitest run passed: 2 files, 91 tests. Existing fixture warnings about unresolved illustrative imports did not fail the run.
- `npm run typecheck` exited 2 with repository-wide TypeScript errors in existing files, including `src/context/EventContext.tsx` and `src/descriptive/compiler.ts`. No diagnostics referenced the new motion catalog fixture/test. Typecheck is **not green**; these unrelated baseline errors need a separate fix and must not be represented as passing.

## Ownership and limitations

- The canonical Video Director documentation in `/Users/chengli/Workspace/neo/skills/video-director` was **not modified by this Markcut PR**. Its proposed update remains a cross-repository handoff in `docs/contributions/video-director-capability-discovery.md`.
- This verifies a local render and selected static frames, not hosted player interaction, a narrated video, or subjective motion smoothness over every frame.
- The verification MP4 and extracted frame PNGs are temporary local artifacts, not committed fixtures.
