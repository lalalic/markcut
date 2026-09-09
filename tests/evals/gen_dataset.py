"""Generate the markcut storyboard goldens with a token-capped OpenRouter model.

Run:
  OPENROUTER_API_KEY=... .venv-evals/bin/python tests/evals/gen_dataset.py
"""

import os

from deepeval.synthesizer import Synthesizer
from deepeval.synthesizer.config import StylingConfig

from openrouter_model import OpenRouterLLM

SCENARIO = (
    "Video creators and AI agents using the markcut markdown-to-video skill "
    "to author video storyboards from a brief. markcut uses a markdown "
    "descriptive format: '## scene' headings, '- image prompt:...' bullets, "
    "script \"...\" narration, isBackground:true for visuals under scripted "
    "scenes, map stream type with view/tween camera moves for route vlogs, "
    "built-in components, TTS/TTI/STT media pipeline, and golden rules such "
    "as never set duration on scripted scenes, keep manual assets in the "
    "assets/ folder, and review md then compiled json then rendered video."
)
TASK = (
    "Act as a storyboard author: given a video brief, produce a markcut "
    "storyboard in markdown descriptive format that follows the skill's "
    "scene/isBackground/duration rules and narrative structure (hook, "
    "conflict, resolution, emotion, call to action)."
)
INPUT_FORMAT = (
    "A short video brief, e.g. 'a 30s travel vlog of a coastal route with "
    "narration', 'a product launch teaser with stats', 'a two-speaker "
    "dialogue explainer', 'a recipe short with background music'."
)
EXPECTED_OUTPUT_FORMAT = (
    "A complete markcut storyboard markdown using ## scene headings, "
    "- image/script bullets, correct isBackground usage, and no manual "
    "durations on scripted scenes."
)


def main():
    model = OpenRouterLLM()
    synthesizer = Synthesizer(
        model=model,
        styling_config=StylingConfig(
            scenario=SCENARIO,
            task=TASK,
            input_format=INPUT_FORMAT,
            expected_output_format=EXPECTED_OUTPUT_FORMAT,
        ),
    )
    goldens = synthesizer.generate_goldens_from_scratch(num_goldens=12)
    synthesizer.save_as(
        file_type="json",
        directory="tests/evals",
        file_name="dataset",
    )
    print(f"Saved {len(goldens)} goldens to tests/evals/dataset.json")


if __name__ == "__main__":
    main()
