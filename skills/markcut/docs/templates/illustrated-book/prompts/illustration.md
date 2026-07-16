# Prompt: Illustration Prompt Generator

> Fill every `{placeholder}`, then execute in your own context.
> Generates a detailed TTI-compatible prompt for ONE illustration.

---

Write a single image generation prompt for this spread of a {book_type} picture book.

Art style: **{art_style}** — MUST be appended verbatim to every prompt.

Spread text:
"{spread_text}"

Illustration description from story plan:
{illustration_description}

Characters seen so far (maintain consistency):
{character_descriptions}

## Rules

- The prompt must end with: ", {art_style}" — copy the art style string exactly at the end.
- Include composition: wide shot / close-up / medium shot / view from above / etc.
- Include lighting/mood: warm morning light, moonlit, misty twilight, golden hour, etc.
- For characters: reference their appearance consistently (e.g. "the little red fox with a white-tipped tail, wearing a small blue scarf").
- Do NOT include text, typography, letters, or words in the prompt — text is added via subtitle nodes.
- Keep the prompt to 1-3 sentences. Detailed but not excessive.
- Vary composition and perspective across spreads to avoid visual monotony.

## Output format

```
prompt:"<detailed description of the illustration, composition, lighting, characters, {art_style}>"
```
