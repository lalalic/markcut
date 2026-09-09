"""DeepEval metrics for the markcut storyboard eval suite.

Judge model is the token-capped OpenRouter wrapper so the whole suite
runs on the workspace's free OpenRouter key.
"""

import sys
import os

sys.path.insert(0, os.path.dirname(__file__))

from deepeval.metrics import GEval, TaskCompletionMetric
from deepeval.test_case import LLMTestCaseParams

from openrouter_model import OpenRouterLLM


def _judge():
    return OpenRouterLLM(temperature=0.0)


# Trace-level: did the agent finish the storyboard task at all?
TASK_COMPLETION_METRICS = [
    TaskCompletionMetric(model=_judge(), threshold=0.7),
]

# Is the storyboard valid markcut markdown following the skill's rules?
STORYBOARD_FORMAT_METRIC = GEval(
    name="Storyboard Format",
    criteria=(
        "Evaluate whether the actual output is a valid markcut storyboard "
        "in markdown descriptive format. It must: use '## scene' headings "
        "for scenes; use '- image prompt:\"...\"' or similar bullet syntax "
        "for visuals; include narration via script \"...\"; set "
        "isBackground:true on the primary visual of any scene that has a "
        "script or audio (otherwise the scene plays black); and NOT set "
        "manual durations on scripted scenes since the resolver derives "
        "duration from the audio script."
    ),
    evaluation_params=[
        LLMTestCaseParams.INPUT,
        LLMTestCaseParams.ACTUAL_OUTPUT,
    ],
    model=_judge(),
    threshold=0.7,
)

# Does the storyboard tell a compelling viral story?
STORY_NARRATIVE_METRIC = GEval(
    name="Story Narrative",
    criteria=(
        "Evaluate whether the storyboard tells a compelling short video "
        "story. It should contain a hook (why watch), conflict or "
        "challenge, resolution, emotional beats, a call to action, and "
        "ideally an open ending where appropriate. Score low if it is a "
        "flat list of scenes with no narrative structure."
    ),
    evaluation_params=[
        LLMTestCaseParams.INPUT,
        LLMTestCaseParams.ACTUAL_OUTPUT,
    ],
    model=_judge(),
    threshold=0.6,
)

SINGLE_TURN_TRACE_METRICS = [
    TASK_COMPLETION_METRICS[0],
    STORYBOARD_FORMAT_METRIC,
    STORY_NARRATIVE_METRIC,
]
