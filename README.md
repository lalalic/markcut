# markcut — Markdown-to-Video Engine

Render-only Remotion engine. Stream-typed timeline kernel.

Two distribution targets:

| Bundle | Entry | Stream types | Target |
| --- | --- | --- | --- |
| **lite** | `src/lite.entry.tsx` | `root`, `folder`, `video`, `audio`, `image`, `subtitle`, `component` (host-registered only) | iOS WKWebView |
| **full** | `src/full.entry.tsx` | lite + `effect`, `rhythm`, `map`, built-in components, themes, templates | Desktop rendering |

The engine is **render-only**:

- No `prompts.*` fields on streams. Host pushes pure media URLs / cues / props.
- No `compose/` providers. Host provides a `Container` component + a `components` registry via React context.
- No `eval/`, `chatflow/`. Stream tree is a pure data structure validated by Zod.
- Mutations are immer JSON Patches pushed from the host.

## Layout

```
src/
  schema/        Zod schemas for streams
  types/         React renderers (one per stream type)
  context/       Compose + Audio React contexts
  utils/         Pure helpers (duration math, css<->js, vtt parser, hash, walkDown/Up)
  lite.entry.tsx Lite Remotion <Composition>
  full.entry.tsx Full Remotion <Composition>
  sample.json    Sample stream tree for headless render smoke test
  remotion.config.ts Remotion Root component
```

## Smoke test

```bash
cd markcut
pnpm install
pnpm render          # renders sample.json -> out/preview.mp4
```

# descriptive
```
# opening
this is a opening description
- a.jpg 5 
- a.mov 5-7
- "hello"

# feature
## overlay
- a.mov 5-7
  - a.jpg 

- "hello"


```

## DescriptiveComposition

`DescriptiveComposition` is a high-level sugar layer that compiles a descriptive tree into the current legacy stream tree (`root`/`folder` + `actions`).

Key behavior:

- Supports three container modes: `series`, `parallel`, `transitionSeries`
- Auto-constructs legacy `actions` from concise keys like `duration`, `startFrom`, `endAt`
- Keeps `subtitle`, `component` (dynamic), and `rhythm` support in the compiled output
- Enforces `start` only in `parallel` containers (strict mode)

API exports:

- `DescriptiveComposition` from `markcut` (lite entry)
- `compileDescriptiveRoot` from `markcut/descriptive`
- `parseMarkdownDescriptive` from `markcut/descriptive-markdown`

Markdown DSL spec for agent-friendly descriptive authoring:

- [docs/markdown-descriptive.md](docs/markdown-descriptive.md)