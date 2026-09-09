# markcut storyboard evals

DeepEval suite that scores an agent authoring markcut storyboards from a
video brief, using the markcut skill.

## Components

| File | Purpose |
| --- | --- |
| `openrouter_model.py` | Token-capped OpenRouter LLM wrapper (free-tier friendly, with model fallback rotation) |
| `gen_dataset.py` | Generates goldens from scratch via the Synthesizer |
| `dataset.json` | The golden dataset (committed, editable) |
| `storyboard_app.py` | Traced app: runs `pi` CLI with the markcut skill to author a storyboard |
| `metrics.py` | Judge metrics: TaskCompletion, Storyboard Format GEval, Story Narrative GEval |
| `test_storyboard.py` | pytest traced single-turn evals |

## Regenerate the dataset

```bash
.venv-evals/bin/python tests/evals/gen_dataset.py
```

## Run the evals

```bash
cd tests/evals && ../../.venv-evals/bin/deepeval test run test_storyboard.py \
  --identifier "iterating-on-storyboard-authoring-round-1"
```

Each test runs the pi agent on the golden's video brief and asserts
trace-level metrics. Failures typically indicate the agent violated a
skill rule (e.g. `duration:` on scripted scenes, missing
`isBackground:true`) or produced weak narrative structure.

## Notes

- Evaluation model runs on OpenRouter free models; the wrapper caps
  max_tokens at 16000 to fit the workspace key's daily budget and
  rotates through fallback models on rate limits.
- Traces are local (Confident AI not enabled); view latest results via
  `deepeval view --latest` offline report in `.deepeval/`.
