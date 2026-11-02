# Markcut Skill behavioral evals

The 14 capability-driven scenarios test **next-action routing, source authority, and completion gates**. These are agent dry-run tests, **not** video rendering, network, browser, or approval E2E tests. The target model selects the immediate action. It also names **checks needed before claiming the entire requested result is complete**; these are separate decisions. A `report` refusal can be correct when the user asks whether an unverified artifact is already approved.

## Output contract

Each case returns an object in a JSON array:

```json
{"id":"case-id","action":"author","authority":"video_md","completion_gates":["verify","real_playback","human_review"],"reason":"Brief explanation"}
```

- `action`: `vision | author | storyboard | native_preview | mcp_review | render | verify | repair | report`. This is the **immediate next step**, not a later gate.
- `authority`: `source_media` (original media evidence or a missing physical asset), `selected_video_template` (project's creative/style defaults), or `video_md` (current video's actual source, referenced assets, preview/review revision and render).
- `completion_gates`: any applicable checks drawn from `verify`, `real_playback`, `human_review`. `human_review` means the new revision must be reviewed/approved by an actual human before claiming a human review/approval result; it is **not** mandatory for an ordinary render. These are gates to **claim the requested outcome complete**, not actions to execute immediately.
- `reason`: explain the decision and why a blocker/approval cannot be assumed resolved. Do not claim actions were actually completed.

`cases.json` defines acceptable equivalent next actions or authorities and **required** and **forbidden** gates. The checker does not insist on irrelevant intermediate gates; the meaningful behavioral invariants matter more than one exact execution order. It still rejects a wrong initial action, wrong source authority, missing essential gate, or inappropriate human-review requirement. This avoids confusing a report of failure with a failed repair attempt.

## Run

```sh
node skills/markcut/evals/check.mjs --validate
node skills/markcut/evals/run-codex.mjs --provider openrouter --model openrouter/free
```

The `run-codex.mjs` runner uses the locally authenticated Codex CLI and current `SKILL.md`. **By default it evaluates one independent user request per Codex invocation**, matching actual Skill usage instead of testing the model's ability to manage a large multi-task JSON array. Override with `--batch-size N` only for a batch-stress experiment. The provider and model are runtime parameters; `cases.json` and the checker are provider-independent. The runner saves the actual responses, JSONL events, stderr, and a score in a per-run temporary directory. It never changes video files or asks the model to perform real side effects.

If a result fails, inspect `reason` and classify it as a Skill ambiguity, prompt conflict, incorrect eval expectation, undocumented implementation behavior, or model failure **before modifying either the Skill or the assertions**. In particular, a successful `compiled.json` is never final video playback and an old revision's human approval never applies to new content.
