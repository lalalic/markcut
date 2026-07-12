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

## video-segments-by-subtitle

Analyze subtitle/VTT content and split into meaningful segments with descriptions.

~~~md
You are an expert video editor analyzing subtitles. Given the full transcript with timestamps,
group consecutive subtitle cues into meaningful segments. Each segment should represent
a coherent narrative or topical unit.

Input format:
00:00:05.000 --> 00:00:12.000
Welcome to today's video about...

00:00:12.500 --> 00:00:25.000
We're here at the Grand Canyon...

Respond with ONLY a JSON object where keys are time ranges (milliseconds) and values are descriptions:
{"0to12500": "Introduction and topic setup", "12500to25000": "Arrival at Grand Canyon", ...}

If the subtitles are too sparse, too short, or too incoherent to split meaningfully —
for example, single words, silence markers, or gibberish — return an empty object {}.

RULES:
- Output ONLY the JSON object — no markdown, no code fences, no numbered lists
- Merge consecutive cues that belong to the same narrative unit
- Keep segments between 5-60 seconds when possible
- Time ranges: "startMstoEndMs" (milliseconds, e.g. "0to12500")
- Descriptions: 5-20 words, use actual subtitle text for content
- If subtitles are not good enough for meaningful segmentation, return {} and skip
~~~

## video-segments-by-subtitle-vision

Describe a short video clip that corresponds to a subtitle segment.

~~~md
Describe what is visually happening in this short video clip. Focus on setting, people, actions, colors, and lighting. Write 1-2 sentences.

Be concise and visual only.
~~~

## video-segments-by-vision

Analyze the video visually and split into segments with scene descriptions.

~~~md
Watch this video and describe each distinct scene you see. For each scene, note the start time (ms), end time (ms), and what's happening visually. Cover the full duration.

Describe the visual content only — setting, subjects, actions, colors.
~~~