# Markcut video review contract

Use when judging an authored Markcut video against the user's request, or when interpreting human feedback on `markcut.preview`. This is a **video-quality** contract, not an evaluation of whether an agent Skill was selected correctly; Skill behavior is tested separately under `evals/`.

## Evidence and stages

1. Record the user's intended audience, story/message, required content, platform, target duration and style. Do not invent requirements absent from the request or its selected template.
2. Inspect the source `video.md`: scenes, media references, narration, music, transitions, captions, variants and timing. Use the compiled tree to examine resolved structure when needed.
3. **Watch/listen to the actual playable video** (native preview, hosted MCP player, or rendered MP4) before scoring sound, visuals, subtitles, timing and narrative impact. A `compiled.json` is not a substitute for seeing/hearing output. If playback is inaccessible, mark those dimensions `not_verified`, do not fabricate a score, and do not approve the video.
4. Compare the observed result to the original request and the chosen template. Flag only meaningful, observable defects. Distinguish authored-document defects from engine, environment, and asset-generation failures.
5. For `changes_requested`, provide scene/time context and concrete corrections to the source Markdown or its referenced assets, then re-preview the changed file. Human `approved` applies only to the original revision/content hash; only the reviewer may approve the new revision.

## Critical checks

| Area | Failure to look for | Evidence / action |
|---|---|---|
| Visual coverage | Blank scene or narration outlasting a visual | Inspect scene start/end frames; make a single scene-filling visual `isBackground:true` when appropriate. Intentional blank scenes are allowed. |
| Media availability | Missing, white, broken or unrelated visual | Confirm the referenced asset was loaded and represents the requested concept; distinguish bad path from failed renderer. |
| Speech | Cut-off final words, missing voice, wrong narration | Listen through scene endings; compare with `script` and actual TTS output. |
| Music and sound | BGM missing, overpowering speech, abrupt cutoff | Listen in real playback and ensure the project's Markdown template music rules were preserved. Browser speech mode may differ from final audio. |
| Captions | Missing, stale or poorly timed text | Compare displayed captions to actual heard narration, not just stored VTT. |
| Scene/story | Missing message, incoherent transitions, inappropriate pacing | Judge against the user's goal, not a universal 'viral' formula. |
| Maps/GPS | Empty map, badly framed route, mislabeled GPS provenance | Inspect real rendered frames, stops, movements, and source provenance. |
| Delivery | Rendering succeeded but output unplayable/incomplete | Inspect MP4 existence, duration, visuals and sound; compilation alone is insufficient. |

Affecting the viewer's core goal is more important than minor aesthetics. Avoid duplicating a root defect across several categories. Do not penalize intentional metaphors, silent scenes or stylized pacing when aligned with the request.

## Finding classification

- **Source:** `AUTHORING` (Markdown choice/path/timing), `CONTENT` (incorrect facts/story), `DESIGN` (visual language), `ENGINE` (reasonable input rendered incorrectly), `ENVIRONMENT` (unavailable resource/runtime), or `UNKNOWN` (insufficient evidence).
- **Severity:** `critical` unusable; `high` strongly harms goal; `medium` meaningful defect; `low` cosmetic.
- **Category:** `STORY`, `VISUAL`, `TIMING`, `AUDIO`, `SUBTITLE`, `STRUCTURE`, `AUTHORING`, `ENGINE`.

Each finding needs: category/code, severity, source, affected scene, approximate timestamp if observed, evidence, impact, and an actionable recommendation. Never fabricate frame-level timestamps or imply a suggested fix has been verified without replay.

## Output contract

Return this information, omitting scores for dimensions not observed:

```yaml
score: 1-5 # only if video playback was verified; average observed applicable scores
summary: "..."
verified_artifacts: [video_md, compiled_tree, video_playback] # list only those actually verified
scores:
  storytelling: 1-5
  visual_quality: 1-5
  narration_visual_alignment: 1-5
  timing_pacing: 1-5
  audio: 1-5
  subtitles: 1-5
  platform_suitability: 1-5
issues:
  - id: "AUDIO-001"
    severity: high
    source: ENGINE
    scene: "Opening"
    timestamp: "approximately 00:03"
    evidence: "..."
    impact: "..."
    recommendation: "..."
    confidence: high
strengths: []
priority_improvements: []
status: changes_requested # or approved, not_verified; never infer human approval
```

`status: approved` is only for a verified human-approved revision; a reviewer agent's favorable score does **not** create human approval. If video playback is not available, report `not_verified`, with the specific blocked gate. In a live MCP review, follow the returned `decision` and revision identity rather than interpreting prose alone.
