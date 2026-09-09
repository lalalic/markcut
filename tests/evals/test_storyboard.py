"""Traced single-turn evals for the markcut storyboard authoring agent.

Each golden's input is a video brief; the app runs the pi agent CLI with
the markcut skill to author a storyboard markdown, traced with @observe.

Run:
  cd tests/evals && ../../.venv-evals/bin/deepeval test run test_storyboard.py
"""

import sys
import os

sys.path.insert(0, os.path.dirname(__file__))

import pytest
from deepeval import assert_test
from deepeval.dataset import EvaluationDataset, Golden

from metrics import SINGLE_TURN_TRACE_METRICS
from storyboard_app import run_traced_storyboard


dataset = EvaluationDataset()
dataset.add_goldens_from_json_file(
    file_path=os.path.join(os.path.dirname(__file__), "dataset.json")
)


@pytest.mark.parametrize("golden", dataset.goldens)
def test_storyboard_authoring(golden: Golden):
    run_traced_storyboard(golden.input)
    assert_test(golden=golden, metrics=SINGLE_TURN_TRACE_METRICS)
