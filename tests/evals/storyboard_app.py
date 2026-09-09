"""Traced markcut storyboard authoring app.

Runs the pi agent CLI with the markcut skill against a video brief and
returns the produced storyboard markdown. The @observe decorator makes
the run a DeepEval agent trace so traced single-turn evals can score it.
"""

import os
import subprocess
import tempfile

from deepeval.tracing import observe

MARKCUT_SKILL = os.path.abspath(
    os.path.join(
        os.path.dirname(__file__), "..", "..", "skills", "markcut", "SKILL.md"
    )
)


def _read_skill() -> str:
    with open(MARKCUT_SKILL) as f:
        return f.read()


@observe(type="agent", name="markcut-storyboard-author")
def run_traced_storyboard(brief: str) -> str:
    """Author a markcut storyboard markdown for the given brief."""
    with tempfile.TemporaryDirectory() as workdir:
        prompt = (
            "You are a video storyboard author using the markcut skill.\n"
            f"Video brief: {brief}\n\n"
            "Write the storyboard as a markcut markdown file named "
            "storyboard.md in the current directory. Follow the skill's "
            "rules strictly. When done, print ONLY the final storyboard "
            "markdown to stdout with no extra commentary."
        )
        result = subprocess.run(
            [
                "pi",
                "-p",
                "--no-session",
                "--skill", MARKCUT_SKILL,
                prompt,
            ],
            capture_output=True,
            text=True,
            timeout=600,
            cwd=workdir,
        )
        storyboard_path = os.path.join(workdir, "storyboard.md")
        if os.path.exists(storyboard_path):
            with open(storyboard_path) as f:
                return f.read()
        return result.stdout
