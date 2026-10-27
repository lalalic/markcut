# Vertical motion example: verification

## Current verification

Verified in the Relay Job 518 managed worktree against **committed repair HEAD `b1603be67f017ae661b5ccb415bebca0262ad464`** (`fix: resolve existing strict TypeScript diagnostics`), not merely the uncommitted working tree. Task 374 validated the working-tree repairs but did not commit them to the PR head. Task 375 staged 15 scoped files, inspected the staged diff (`git diff --cached --stat`; `git diff --cached --check`, exit 0), committed the repairs, then reran validation. No paid API, credentials, or private media were used.

```sh
npm run typecheck -- --pretty false
npx vitest run --config tests/vitest.config.ts tests/motion-capabilities.test.ts src/descriptive/markdown.test.ts
npx vitest run --config tests/vitest.config.ts src/descriptive/compiler.test.ts src/descriptive/resolve.test.ts
node src/render/cli.mjs render examples/motion-capabilities-9x16.md --output /tmp/markcut-motion-task375.mp4
ffprobe -v error -show_entries format=duration,size -show_entries stream=index,codec_name,codec_type,width,height,r_frame_rate,duration,nb_frames -of json /tmp/markcut-motion-task375.mp4
ffmpeg -hide_banner -i /tmp/markcut-motion-task375.mp4 -af volumedetect -f null -
```

- TypeScript check exited **0** (the previous 87 diagnostics are resolved).
- Motion-capability and Markdown tests: **64 passed** across 2 files.
- Compiler and resolver tests: **115 passed, 2 skipped** across 2 files.
- Render exited **0**, encoded all 540 frames, and produced a 2,387,811-byte MP4.
- Video stream: H.264, **1080 × 1920**, **30/1 fps**, **18.000 s**. Container duration is **18.048 s** due to its audio stream.
- AAC audio is present but silent: mean and peak **−91.0 dB**. This sample has no narration or soundtrack; audio presence is verified, audibility is not.
- Independently extracted and visually inspected frames at 1.5 s, 7.5 s, and 13.5 s: respectively, “Arrive at the idea”, the three “Plan / Build / Ship” cards, and the complete 32% / 58% / 91% chart. All are visible and within the vertical frame.

- All four validation commands exited **0** against committed repair SHA `b1603be67f017ae661b5ccb415bebca0262ad464`. This document is a follow-up evidence-only commit; repair source did not change after validation.

## TypeScript diagnostic findings

The starting check reported 87 diagnostics at both baseline `332d839` and the motion-capability PR head, as recorded by Task 373. They were pre-existing and clustered in strict typing gaps and stale declarations rather than motion capability code:

| Cause | Remediation |
|---|---|
| `noUncheckedIndexedAccess` left array/string reads and test fixture lookups possibly undefined. | Added non-null assertions only where bounds, guards, or preceding assertions already establish an element; test mock parameters were typed explicitly. |
| Descriptive nodes intentionally omit some compiled IDs, while compiled schema interfaces require them; map children and root start also differed from required schema shape. | Kept existing generated stream data behavior and asserted its established runtime shape at the compiler boundary; supplied the root's schema-default start value. |
| Descriptive transition strings support inline timing syntax, while compiled transitions are a closed enum; waypoint modes were too broadly typed. | Kept authored transition strings flexible, typed the validated compiler result, and aligned waypoint mode typing with the parser's recognized values. |
| Parser helpers accepted index-signature records even though discriminated node interfaces are ordinary objects; subtitle optionality was not narrowed after assignment. | Accepted object nodes for dynamic variant preservation and built subtitle config locally before assigning it. |
| Test expectations described deprecated root imports, scenes carried per-scene TTS settings supported by the resolver, and a player pipeline imported public types from the wrong modules. | Corrected the descriptive type declarations and type-only exports without changing the DSL or compilation behavior. |
| Tests and UI had implicit unchecked access; `resolve.test.ts` also omitted `dirname`. | Added established bounds/non-null assumptions, typed mocks, and imported the existing path helper. |
| `config.mjs`, `queue-cli.mjs`, and the installed `remotion-subtitle` package lacked TypeScript declarations. | Added small local declarations for the used exports and the existing subtitle package. |
| Event proxy writes allowed symbol keys, but state updates are string-keyed. | Continued to apply all proxy writes with `Reflect.set`; emit React state updates only for string property names. |

No motion catalog or API changes were needed to clear the diagnostics. The fixes are limited to type contracts, already-guarded accesses, and the proxy's string-keyed state update contract.
