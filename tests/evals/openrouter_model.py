"""OpenRouter-backed DeepEval LLM with a capped max_tokens budget.

The workspace OPENROUTER_API_KEY has a daily credit cap that rejects
requests asking for 65536 max_tokens, so we wrap the OpenAI-compatible
client ourselves and ask for far fewer output tokens.
"""

import os
from typing import Optional, List

from deepeval.models import DeepEvalBaseLLM
from deepeval.synthesizer.schema import (
    Response as _ResponseSchema,
    SyntheticData,
    SyntheticDataList,
)
from deepeval.metrics.utils import trimAndLoadJson

MAX_OUTPUT_TOKENS = 16000

# Free-tier models are flaky; rotate through candidates on rate limits.
FALLBACK_MODELS = [
    "google/gemma-4-31b-it:free",
    "nvidia/nemotron-3-super-120b-a12b:free",
    "inclusionai/ling-3.0-flash-sante:free",
    "minimax/minimax-m2.7:free",
]


class OpenRouterLLM(DeepEvalBaseLLM):
    def __init__(
        self,
        model: str = "google/gemma-4-31b-it:free",
        temperature: float = 0.0,
        **kwargs,
    ):
        self.model_id = model
        self.temperature = temperature
        super().__init__(model, **kwargs)

    def load_model(self):
        from openai import OpenAI

        return OpenAI(
            api_key=os.environ["OPENROUTER_API_KEY"],
            base_url="https://openrouter.ai/api/v1",
        )

    def generate(
        self,
        prompt: str,
        schema=None,
        max_output_tokens: int = MAX_OUTPUT_TOKENS,
    ) -> str:
        client = self.load_model()
        if schema is not None:
            # Sending the raw JSON schema makes weak models echo it back;
            # describe the shape in prose instead.
            if schema is SyntheticDataList:
                shape_desc = (
                    'a JSON object {"data": [{"input": "<brief text>"}]} '
                    "with as many items as requested"
                )
            elif schema is _ResponseSchema:
                shape_desc = 'a JSON object {"response": "<your answer>"}'
            else:
                shape_desc = (
                    "a single JSON object with exactly these keys: "
                    f"{list(schema.model_fields.keys())}"
                )
            prompt = (
                "You are a JSON generator. Respond with ONLY one valid JSON "
                "value - no prose, no markdown fences, no commentary, and "
                "never repeat the schema itself. The JSON must be exactly "
                f"{shape_desc}.\n\nTask:\n{prompt}"
            )

        import time

        text = None
        last_err = None
        for model_id in [self.model_id] + [
            m for m in FALLBACK_MODELS if m != self.model_id
        ]:
            for attempt in range(3):
                try:
                    response = client.chat.completions.create(
                        model=model_id,
                        messages=[{"role": "user", "content": prompt}],
                        temperature=self.temperature,
                        max_tokens=min(max_output_tokens, MAX_OUTPUT_TOKENS),
                    )
                    text = response.choices[0].message.content or ""
                    break
                except Exception as err:  # rate limits, upstream 429s
                    last_err = err
                    time.sleep(5 * (attempt + 1))
            if text:
                break
        if not text:
            raise last_err
        if schema is None:
            return text
        # Parse the JSON the prompt asked for into the requested schema
        try:
            data = trimAndLoadJson(text, self)
        except ValueError:
            with open("/tmp/deepeval_last_output.txt", "w") as f:
                f.write(text)
            raise
        if schema is SyntheticDataList:
            return SyntheticDataList(
                data=[SyntheticData(**item) for item in data["data"]]
            )
        if schema is _ResponseSchema and isinstance(data, str):
            return _ResponseSchema(response=data)
        return schema(**data)

    async def a_generate(
        self,
        prompt: str,
        schema=None,
        max_output_tokens: int = MAX_OUTPUT_TOKENS,
    ) -> str:
        return self.generate(prompt, schema, max_output_tokens)

    def get_model_name(self) -> str:
        return self.model_id

    def supports_json_mode(self) -> bool:
        return False

    def supports_structured_outputs(self) -> bool:
        return False

    def supports_log_probs(self) -> Optional[bool]:
        return False

    def supports_multimodal(self) -> bool:
        return False

    def batch_generate(self, prompts: List[str]) -> List[str]:
        return [self.generate(p) for p in prompts]
