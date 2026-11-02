# Markcut Skill capability evals

These tests evaluate **agent decision quality**, not whether the Markcut renderer, browser, or media APIs are working. Load the Markcut `SKILL.md` plus the case `request`, then ask the target agent to select the *next appropriate Markcut action* without side effects. Use the same cases across ChatGPT/Codex/other harnesses.

Return one JSON object per test:

```json
{"action":"vision|author|storyboard|native_preview|mcp_review|render|verify|repair|report","authority":"source_media|selected_video_template|video_md","playback":false,"approval":"none|human_only","reason":"one sentence"}
```

`action` is the next appropriate step, not a promise of task completion. `playback` means real video playback is required to establish the requested goal, even if it is not yet available. `approval: human_only` means the agent must preserve the review boundary. For `repair` cases, `reason` must state the failure gate and the necessary recovery. For `render` cases, the final MP4 must be inspected separately; these unit evals do **not** run rendering.

Run deterministic scoring using `node skills/markcut/evals/check.mjs responses.json`, where `responses.json` is an array of `{id,action,authority,playback,approval,reason}` from the target harness. `node skills/markcut/evals/check.mjs --validate` tests case definitions and Markdown links without using a model. Do not count this validation as an agent behavioral pass.

Important negative cases: missing asset, superseded approval, compiled-but-unplayed video, empty MCP iframe. Do not patch the Skill for a failing eval without first distinguishing ambiguous contract, incorrect expected action, harness behavior and actual implementation mismatch.
