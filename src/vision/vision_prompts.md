# Vision Understanding Prompts

These prompts are used by the `markcut vision` CLI to analyze images and videos.
Each section is a named prompt template wrapped in `~~~md` fences.
Override any prompt with `--<prompt-name> "your prompt text"`.
Provide scene/character context with `--context "the girl is Maggie, the man in red is me"`.

## image-perception

Analyze the image and produce a detailed description.

~~~md
Describe this image in detail. What do you see? Include the setting, colors, objects, people, weather, and mood. Write at least 3-4 sentences.

Be specific and thorough.
~~~

## video-perception

Analyze the video and produce a detailed description.

~~~md
You are given several still frames sampled from a video. Based on these frames, describe the video scene in detail. What setting, subjects, actions, visual style, and mood do you observe? Write at least 3-4 sentences.

Be specific and thorough. Note changes between frames — they represent different moments in time.
~~~

## detect-scenes

Analyze the merged subtitle/transcript with candidate segment boundaries and split into meaningful segments with descriptions.

~~~md
You are an expert video editor. You are given candidate segment boundaries for a video, gathered from up to three sources (ordered by reliability):

1. **User hints** (most reliable) — explicit timestamps with descriptions provided by the user
2. **Speech subtitles (VTT)** — subtitle cues with timestamps and transcript text
3. **Visual scene changes** (least reliable) — raw ffprobe shot-detection timestamps

Your task: merge these candidate boundaries into meaningful, coherent segments.

Rules:
- Each final segment should be a coherent narrative or visual unit (5-60 seconds)
- Respect user hint boundaries — they are the most reliable. If the user marked a boundary at 5s, keep it
- Use subtitle cues to refine: if a subtitle sentence crosses a user hint boundary, prefer the cue boundary
- Use ffprobe changes as tiebreakers only — they mark raw visual cuts, not narrative breaks
- Output ONLY a JSON object where keys are time ranges (milliseconds) and values are objects with a "description" field
- Descriptions: 5-20 words, summarize what happens in that segment (use user hint text or subtitle text)

Input format:
```
Candidates:
- 5000ms [userHint]: "开始游泳"
- 15250ms [userHint]: "beach scene"
- 3200ms [subtitle]: "Welcome to the beach everyone"
- 8500ms [subtitle]: "Let's go swimming in the ocean"
- 16000ms [subtitle]: "Now let's build a sandcastle"
- 4800ms [scene]: ffprobe shot change
- 15300ms [scene]: ffprobe shot change

Duration: 30000ms
```

Output format:
{"0to5000": {"description": "Introduction and welcome"}, "5000to15250": {"description": "Starting to swim"}, "15250to30000": {"description": "Building sandcastle"}}

If inputs are too sparse for segmentation, return an empty object {}.
~~~