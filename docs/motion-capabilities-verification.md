# Vertical motion example: independent verification

Verified on 2026-10-26 against Relay Job 518's PR head `5ad3686` (base `332d839e`), including the capability-catalog changes. This is a local, open-source-only render; no paid API, credentials, or private media were used. Re-run these commands from the Markcut repository root:

```sh
node src/render/cli.mjs render examples/motion-capabilities-9x16.md --output /tmp/markcut-motion-task373.mp4
ffprobe -v error -show_entries format=duration,size -show_entries stream=index,codec_name,codec_type,width,height,r_frame_rate,duration -of json /tmp/markcut-motion-task373.mp4
ffmpeg -hide_banner -y -ss 1.5 -i /tmp/markcut-motion-task373.mp4 -frames:v 1 /tmp/markcut-motion-task373-frame1.png
ffmpeg -hide_banner -y -ss 7.5 -i /tmp/markcut-motion-task373.mp4 -frames:v 1 /tmp/markcut-motion-task373-frame2.png
ffmpeg -hide_banner -y -ss 13.5 -i /tmp/markcut-motion-task373.mp4 -frames:v 1 /tmp/markcut-motion-task373-frame3.png
ffmpeg -hide_banner -i /tmp/markcut-motion-task373.mp4 -af volumedetect -f null -
npx vitest run --config tests/vitest.config.ts tests/motion-capabilities.test.ts src/descriptive/markdown.test.ts
npm run typecheck
```

## Measured output

- Render command exited 0 and encoded 540 of 540 frames; MP4 file size: 2,387,811 bytes.
- H.264 video: 1080 × 1920, 30/1 fps, 18.000 s. Container: 18.048 s, due to the audio stream.
- AAC audio track: present, 18.048 s, but effectively silent. `volumedetect` found mean and peak −91.0 dB. The sample deliberately has no narration or soundtrack; audio **presence** is verified, audio **audibility** is not. Add audio to a separate authored fixture to validate non-silent mixing.
- At 1.5 s, `CinematicPush` displays legible white heading “Arrive at the idea”, teal eyebrow/rule, with no clipping.
- At 7.5 s, `LayeredCardReveal` displays three colored cards “Plan”, “Build”, “Ship”; the composition stays within the vertical frame.
- At 13.5 s, `BarChartReveal` shows all three colored columns, 32%, 58%, and 91%, with weekday labels fully visible.
- Focused Vitest run exited 0: 2 files, 64 tests passed. Existing fixture warnings about unresolved illustrative imports did not fail the run.
- `npm run typecheck` exited 2 with 87 TypeScript diagnostics. To establish baseline status, the same command (`npm run typecheck -- --pretty false`) was run at PR head `5ad3686` and at baseline `332d839` in a detached worktree using the same `node_modules`. After normalizing only the checkout paths, the logs were byte-identical: 87 baseline diagnostics and 87 PR-head diagnostics, with no introduced or removed diagnostics. The PR changes no TypeScript source; the new TypeScript capability test also produced no diagnostic.
- The required typecheck gate remains **failing**. The concrete blocker is the same 87 pre-existing diagnostics at baseline `332d839`, across `src/context`, `src/descriptive`, `src/mcp`, `src/player`, `src/render`, and `src/types`. Fixing these broad pre-existing errors would be unrelated scope expansion. The complete remaining diagnostic lines are listed below; the baseline log matched them after checkout-path normalization.

The baseline comparison used these commands. The second invocation ran at PR head `5ad3686`; the `sed` replacements only normalize checkout-specific absolute paths before comparing the logs.

```sh
git worktree add --detach /tmp/markcut-baseline-332d839 332d839
ln -s /Users/chengli/Workspace/.worktrees/agents-relay/lalalic-markcut-job-518-8952115444ba/job/node_modules /tmp/markcut-baseline-332d839/node_modules
(cd /tmp/markcut-baseline-332d839 && npm run typecheck -- --pretty false) > /tmp/markcut-base-typecheck.log 2>&1
npm run typecheck -- --pretty false > /tmp/markcut-pr-typecheck.log 2>&1
sed -e 's#/private/tmp/markcut-baseline-332d839#<repo>#g' -e 's#/Users/chengli/Workspace/.worktrees/agents-relay/lalalic-markcut-job-518-8952115444ba/job#<repo>#g' /tmp/markcut-base-typecheck.log > /tmp/markcut-base-typecheck.normalized
sed -e 's#/Users/chengli/Workspace/.worktrees/agents-relay/lalalic-markcut-job-518-8952115444ba/job#<repo>#g' /tmp/markcut-pr-typecheck.log > /tmp/markcut-pr-typecheck.normalized
diff -u /tmp/markcut-base-typecheck.normalized /tmp/markcut-pr-typecheck.normalized
```

### Remaining TypeScript diagnostics

Command: `npm run typecheck -- --pretty false` (exit 2; 87 diagnostics at both baseline and PR head).

```text
src/context/EventContext.tsx(36,11): error TS2538: Type 'symbol' cannot be used as an index type.
src/descriptive/compiler.test.ts(26,12): error TS2532: Object is possibly 'undefined'.
src/descriptive/compiler.test.ts(27,12): error TS2532: Object is possibly 'undefined'.
src/descriptive/compiler.test.ts(33,12): error TS2532: Object is possibly 'undefined'.
src/descriptive/compiler.test.ts(45,12): error TS2532: Object is possibly 'undefined'.
src/descriptive/compiler.test.ts(98,12): error TS2532: Object is possibly 'undefined'.
src/descriptive/compiler.test.ts(1033,12): error TS2532: Object is possibly 'undefined'.
src/descriptive/compiler.test.ts(1034,12): error TS2532: Object is possibly 'undefined'.
src/descriptive/compiler.test.ts(1045,12): error TS2532: Object is possibly 'undefined'.
src/descriptive/compiler.test.ts(1046,12): error TS2532: Object is possibly 'undefined'.
src/descriptive/compiler.test.ts(1110,7): error TS2322: Type '{ name: string; from: string; }[]' is not assignable to type 'undefined'.
src/descriptive/compiler.ts(540,17): error TS2559: Type '{ effects?: EffectSpec[] | undefined; }' has no properties in common with type '{ on?: { when: string; state: string; } | undefined; }'.
src/descriptive/compiler.ts(554,75): error TS2339: Property 'endAt' does not exist on type 'DescriptiveVideo | DescriptiveAudio | DescriptiveImage | DescriptiveComponent | DescriptiveRhythm | DescriptiveMap'.
src/descriptive/compiler.ts(580,13): error TS2322: Type '{ type: "video"; src: string | undefined; volume: number; playbackRate: number | undefined; width: number; height: number; on?: EventSpec; style: string | undefined; visible: boolean; isBackground: boolean | undefined; ... 6 more ...; id?: string | undefined; }' is not assignable to type '{ id: string; visible: boolean; start: number; type: "video"; volume: number; width: number; height: number; instruction?: string | undefined; style?: string | undefined; isBackground?: boolean | undefined; ... 8 more ...; playbackRate?: number | undefined; }'.
src/descriptive/compiler.ts(592,13): error TS2322: Type '{ type: "audio"; src: string | undefined; volume: number; foreground: boolean | undefined; speaker: string | undefined; on?: EventSpec; style: string | undefined; visible: boolean; isBackground: boolean | undefined; ... 6 more ...; id?: string | undefined; }' is not assignable to type '{ id: string; visible: boolean; start: number; type: "audio"; volume: number; instruction?: string | undefined; style?: string | undefined; isBackground?: boolean | undefined; end?: number | undefined; ... 8 more ...; speaker?: string | undefined; }'.
src/descriptive/compiler.ts(603,13): error TS2322: Type '{ type: "image"; src: string | undefined; fit: "fill" | "contain" | "cover"; on?: EventSpec; style: string | undefined; visible: boolean; isBackground: boolean | undefined; at: any; start: number | undefined; ... 4 more ...; id?: string | undefined; }' is not assignable to type '{ id: string; visible: boolean; start: number; type: "image"; fit: "fill" | "contain" | "cover"; instruction?: string | undefined; style?: string | undefined; isBackground?: boolean | undefined; ... 7 more ...; src?: string | undefined; }'.
src/descriptive/compiler.ts(624,13): error TS2322: Type '{ type: "component"; jsx: string; data: Record<string, unknown> | undefined; on?: EventSpec; style: string | undefined; visible: boolean; isBackground: boolean | undefined; at: any; start: number | undefined; ... 4 more ...; id?: string | undefined; }' is not assignable to type '{ id: string; visible: boolean; start: number; type: "component"; jsx: string; instruction?: string | undefined; src?: string | undefined; style?: string | undefined; isBackground?: boolean | undefined; ... 7 more ...; data?: Record<...> | undefined; }'.
src/descriptive/compiler.ts(634,13): error TS2322: Type '{ type: "rhythm"; src: string; volume: number; spots: number[] | undefined; children: never[]; on?: EventSpec; style: string | undefined; visible: boolean; isBackground: boolean | undefined; ... 6 more ...; id?: string | undefined; }' is not assignable to type '{ id: string; visible: boolean; start: number; type: "rhythm"; volume: number; children: unknown[]; instruction?: string | undefined; style?: string | undefined; isBackground?: boolean | undefined; end?: number | undefined; ... 7 more ...; spots?: number[] | undefined; }'.
src/descriptive/compiler.ts(649,9): error TS2322: Type 'DescriptiveMapWaypoint[]' is not assignable to type '{ lat: number; lng: number; label?: string | undefined; media?: string | undefined; mode?: "DRIVING" | "WALKING" | "BICYCLING" | "TRANSIT" | "FLIGHT" | "BOAT" | undefined; }[]'.
src/descriptive/compiler.ts(934,5): error TS2322: Type 'DescriptiveMapWaypoint[]' is not assignable to type '{ lat: number; lng: number; label?: string | undefined; media?: string | undefined; mode?: "DRIVING" | "WALKING" | "BICYCLING" | "TRANSIT" | "FLIGHT" | "BOAT" | undefined; }[]'.
src/descriptive/compiler.ts(992,5): error TS2322: Type 'string | undefined' is not assignable to type '"flip" | "fade" | "slide" | "wipe" | "clockWipe" | undefined'.
src/descriptive/compiler.ts(1144,16): error TS2345: Argument of type 'string | undefined' is not assignable to parameter of type 'string'.
src/descriptive/compiler.ts(1151,18): error TS2345: Argument of type 'string | undefined' is not assignable to parameter of type 'string'.
src/descriptive/compiler.ts(1295,45): error TS2352: Conversion of type 'DescriptiveRoot' to type 'Record<string, unknown>' may be a mistake because neither type sufficiently overlaps with the other. If this was intentional, convert the expression to 'unknown' first.
src/descriptive/compiler.ts(1344,18): error TS2352: Conversion of type 'DescriptiveRoot' to type 'Record<string, unknown>' may be a mistake because neither type sufficiently overlaps with the other. If this was intentional, convert the expression to 'unknown' first.
src/descriptive/compiler.ts(1405,5): error TS2322: Type 'string | undefined' is not assignable to type '"flip" | "fade" | "slide" | "wipe" | "clockWipe" | undefined'.
src/descriptive/markdown.test.ts(318,37): error TS2339: Property 'children' does not exist on type 'DescriptiveNode'.
src/descriptive/markdown.test.ts(332,37): error TS2339: Property 'children' does not exist on type 'DescriptiveNode'.
src/descriptive/markdown.ts(182,28): error TS2345: Argument of type 'DescriptiveImage' is not assignable to parameter of type 'Record<string, unknown>'.
src/descriptive/markdown.ts(209,28): error TS2345: Argument of type 'DescriptiveVideo' is not assignable to parameter of type 'Record<string, unknown>'.
src/descriptive/markdown.ts(234,28): error TS2345: Argument of type 'DescriptiveAudio' is not assignable to parameter of type 'Record<string, unknown>'.
src/descriptive/markdown.ts(243,9): error TS2322: Type 'string | undefined' is not assignable to type 'string'.
src/descriptive/markdown.ts(253,28): error TS2345: Argument of type 'DescriptiveComponent' is not assignable to parameter of type 'Record<string, unknown>'.
src/descriptive/markdown.ts(270,28): error TS2345: Argument of type 'DescriptiveComponent' is not assignable to parameter of type 'Record<string, unknown>'.
src/descriptive/markdown.ts(291,28): error TS2345: Argument of type 'DescriptiveRhythm' is not assignable to parameter of type 'Record<string, unknown>'.
src/descriptive/markdown.ts(362,28): error TS2345: Argument of type 'DescriptiveMap' is not assignable to parameter of type 'Record<string, unknown>'.
src/descriptive/markdown.ts(589,9): error TS2367: This comparison appears to be unintentional because the types '"image" | "video" | "map" | "audio" | "rhythm" | "include" | "component" | "scene"' and '"effect"' have no overlap.
src/descriptive/markdown.ts(702,44): error TS18048: 'root.subtitle' is possibly 'undefined'.
src/descriptive/markdown.ts(703,45): error TS18048: 'root.subtitle' is possibly 'undefined'.
src/descriptive/markdown.ts(704,46): error TS18048: 'root.subtitle' is possibly 'undefined'.
src/descriptive/markdown.ts(705,37): error TS18048: 'root.subtitle' is possibly 'undefined'.
src/descriptive/markdown.ts(705,37): error TS2322: Type '{}' is not assignable to type 'string | number | undefined'.
src/descriptive/markdown.ts(706,51): error TS18048: 'root.subtitle' is possibly 'undefined'.
src/descriptive/markdown.ts(707,50): error TS18048: 'root.subtitle' is possibly 'undefined'.
src/descriptive/resolve.test.ts(132,23): error TS2345: Argument of type 'string | undefined' is not assignable to parameter of type 'PathLike'.
src/descriptive/resolve.test.ts(135,56): error TS2769: No overload matches this call.
  Overload 1 of 3, '(path: PathOrFileDescriptor, options?: { encoding?: null | undefined; flag?: string | undefined; } | null | undefined): NonSharedBuffer', gave the following error.
    Argument of type 'string | undefined' is not assignable to parameter of type 'PathOrFileDescriptor'.
      Type 'undefined' is not assignable to type 'PathOrFileDescriptor'.
  Overload 2 of 3, '(path: PathOrFileDescriptor, options: BufferEncoding | { encoding: BufferEncoding; flag?: string | undefined; }): string', gave the following error.
    Argument of type 'string | undefined' is not assignable to parameter of type 'PathOrFileDescriptor'.
      Type 'undefined' is not assignable to type 'PathOrFileDescriptor'.
  Overload 3 of 3, '(path: PathOrFileDescriptor, options?: BufferEncoding | (ObjectEncodingOptions & { flag?: string | undefined; }) | null | undefined): string | NonSharedBuffer', gave the following error.
    Argument of type 'string | undefined' is not assignable to parameter of type 'PathOrFileDescriptor'.
      Type 'undefined' is not assignable to type 'PathOrFileDescriptor'.
src/descriptive/resolve.test.ts(150,46): error TS7006: Parameter '_p' implicitly has an 'any' type.
src/descriptive/resolve.test.ts(150,50): error TS7006: Parameter 'out' implicitly has an 'any' type.
src/descriptive/resolve.test.ts(172,46): error TS7006: Parameter '_p' implicitly has an 'any' type.
src/descriptive/resolve.test.ts(172,50): error TS7006: Parameter 'out' implicitly has an 'any' type.
src/descriptive/resolve.test.ts(225,46): error TS7006: Parameter '_p' implicitly has an 'any' type.
src/descriptive/resolve.test.ts(225,50): error TS7006: Parameter 'out' implicitly has an 'any' type.
src/descriptive/resolve.test.ts(245,46): error TS7006: Parameter '_p' implicitly has an 'any' type.
src/descriptive/resolve.test.ts(245,50): error TS7006: Parameter 'out' implicitly has an 'any' type.
src/descriptive/resolve.test.ts(301,17): error TS2552: Cannot find name 'dirname'. Did you mean '__dirname'?
src/descriptive/resolve.test.ts(325,46): error TS7006: Parameter '_p' implicitly has an 'any' type.
src/descriptive/resolve.test.ts(325,50): error TS7006: Parameter 'out' implicitly has an 'any' type.
src/descriptive/resolve.test.ts(355,35): error TS2353: Object literal may only specify known properties, and 'tts' does not exist in type 'DescriptiveScene'.
src/descriptive/resolve.test.ts(386,35): error TS2353: Object literal may only specify known properties, and 'tts' does not exist in type 'DescriptiveScene'.
src/descriptive/resolve.test.ts(398,46): error TS7006: Parameter '_script' implicitly has an 'any' type.
src/descriptive/resolve.test.ts(398,55): error TS7006: Parameter 'audioPath' implicitly has an 'any' type.
src/descriptive/resolve.test.ts(580,56): error TS2769: No overload matches this call.
  Overload 1 of 3, '(path: PathOrFileDescriptor, options?: { encoding?: null | undefined; flag?: string | undefined; } | null | undefined): NonSharedBuffer', gave the following error.
    Argument of type 'string | undefined' is not assignable to parameter of type 'PathOrFileDescriptor'.
      Type 'undefined' is not assignable to type 'PathOrFileDescriptor'.
  Overload 2 of 3, '(path: PathOrFileDescriptor, options: BufferEncoding | { encoding: BufferEncoding; flag?: string | undefined; }): string', gave the following error.
    Argument of type 'string | undefined' is not assignable to parameter of type 'PathOrFileDescriptor'.
      Type 'undefined' is not assignable to type 'PathOrFileDescriptor'.
  Overload 3 of 3, '(path: PathOrFileDescriptor, options?: BufferEncoding | (ObjectEncodingOptions & { flag?: string | undefined; }) | null | undefined): NonSharedBuffer | string', gave the following error.
    Argument of type 'string | undefined' is not assignable to parameter of type 'PathOrFileDescriptor'.
      Type 'undefined' is not assignable to type 'PathOrFileDescriptor'.
src/descriptive/resolve.test.ts(633,46): error TS7006: Parameter '_p' implicitly has an 'any' type.
src/descriptive/resolve.test.ts(633,50): error TS7006: Parameter 'out' implicitly has an 'any' type.
src/descriptive/resolve.test.ts(654,46): error TS7006: Parameter '_p' implicitly has an 'any' type.
src/descriptive/resolve.test.ts(654,50): error TS7006: Parameter 'out' implicitly has an 'any' type.
src/descriptive/resolve.test.ts(678,17): error TS2552: Cannot find name 'dirname'. Did you mean '__dirname'?
src/descriptive/resolve.test.ts(726,46): error TS7006: Parameter '_p' implicitly has an 'any' type.
src/descriptive/resolve.test.ts(726,50): error TS7006: Parameter 'out' implicitly has an 'any' type.
src/mcp/browser-speech-preview.ts(9,7): error TS2532: Object is possibly 'undefined'.
src/mcp/browser-speech-preview.ts(10,15): error TS2532: Object is possibly 'undefined'.
src/mcp/browser-speech-preview.ts(13,23): error TS2345: Argument of type 'string | undefined' is not assignable to parameter of type 'string'.
src/mcp/browser-speech-preview.ts(13,41): error TS2345: Argument of type 'string | undefined' is not assignable to parameter of type 'string'.
src/mcp/browser-speech-preview.ts(14,69): error TS2532: Object is possibly 'undefined'.
src/mcp/browser-speech-preview.ts(44,50): error TS2532: Object is possibly 'undefined'.
src/mcp/browser-speech-preview.ts(52,108): error TS2345: Argument of type 'string' is not assignable to parameter of type 'keyof PlayerStateEventMap'.
src/mcp/browser-speech-preview.ts(56,165): error TS2345: Argument of type 'string' is not assignable to parameter of type 'keyof PlayerStateEventMap'.
src/player/components/LabelControls.tsx(111,26): error TS2532: Object is possibly 'undefined'.
src/player/components/LabelControls.tsx(111,59): error TS2532: Object is possibly 'undefined'.
src/player/components/LabelControls.tsx(308,84): error TS2345: Argument of type 'string | undefined' is not assignable to parameter of type 'string'.
src/player/components/SceneThumbnails.tsx(46,24): error TS2532: Object is possibly 'undefined'.
src/player/pipeline.ts(132,15): error TS2459: Module '"../descriptive/markdown"' declares 'DescriptiveRoot' locally, but it is not exported.
src/player/pipeline.ts(132,32): error TS2305: Module '"../descriptive/markdown"' has no exported member 'Root'.
src/render/cli-tools.ts(14,30): error TS7016: Could not find a declaration file for module '../queue-cli.mjs'. '<repo>/src/queue-cli.mjs' implicitly has an 'any' type.
src/render/cli-tools.ts(22,8): error TS7016: Could not find a declaration file for module '../config.mjs'. '<repo>/src/config.mjs' implicitly has an 'any' type.
src/types/Folder.tsx(81,44): error TS2538: Type 'undefined' cannot be used as an index type.
src/types/Subtitle.tsx(3,28): error TS7016: Could not find a declaration file for module 'remotion-subtitle'. '<repo>/node_modules/remotion-subtitle/dist/index.cjs.js' implicitly has an 'any' type.
```

## Ownership and limitations

- The canonical Video Director documentation in `/Users/chengli/Workspace/neo/skills/video-director` was **not modified by this Markcut PR**. Its proposed update remains a cross-repository handoff in `docs/contributions/video-director-capability-discovery.md`.
- This verifies a local render and selected static frames, not hosted player interaction, a narrated video, or subjective motion smoothness over every frame.
- The verification MP4 and extracted frame PNGs are temporary local artifacts, not committed fixtures.
