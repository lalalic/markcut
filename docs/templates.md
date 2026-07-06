# Video Templates

Ready-to-use markdown templates for common video scenarios. Each template:

- Contains **YAML frontmatter** with usage guidance (when, how, key decisions)
- Lists **required external packages** (npm imports)
- Uses **src:auto prompt:"..."** placeholders for AI-generated images/videos
- Includes **TTS narration** with configured voice and pacing
- Provides **scene structure** with named scenes, layouts, and durations

## Quick Start

```bash
# 1. Pick a template
cp docs/templates/courseware.md my-video.md

# 2. Fill in [bracketed] placeholders with actual content
# 3. Render
npx markcut render my-video.md --aspect 16x9
```

## Template Catalog

| Template | Scenario | Duration | Key Components |
|---|---|---|---|
| [courseware.md](templates/courseware.md) | 课件 / Lessons | 1-5 min | MarpSlide (markdown→slides), SlideText, MathDisplay |
| [product-ad.md](templates/product-ad.md) | 产品广告 / Ads | 15-45s | TextReveal, DeviceMockup, QRCode, FeatureCard |
| [movie-review.md](templates/movie-review.md) | 影视讲解 / Reviews | 1-3 min | CinematicText, StarRating, TextAnnotation, SplitScreen |
| [audiobook.md](templates/audiobook.md) | 有声图书 / Audiobooks | 3-30 min | BookCover, AmbientBackground, ProgressBar |
| [story-video.md](templates/story-video.md) | 故事视频 / Stories | 1-5 min | StoryTitle, SpeechBubble, ParticleEffect |
| [travel-log.md](templates/travel-log.md) | 旅行日志 / Travel | 1-3 min | LocationCard, WeatherIcon, TravelStats, Map node |}

## Frontmatter Fields Used by Templates

| Field | Purpose | Example |
|---|---|---|
| `tts` | TTS CLI command with `{input}` `{output}` | `edge-tts --voice "zh-CN-XiaoxiaoNeural" --text "{input}" --write-media "{output}"` |
| `stt` | STT CLI command with `{input}` `{output}` | `whisper "{input}" --model tiny --language zh --output_format vtt --output_dir "{output}"` |
| `tti` | TTI CLI command with `{input}` `{output}` | `pi --model agnes-2.0-flash --print "generate image: {input}" --output "{output}"` |
| `ttv` | TTV CLI command with `{input}` `{output}` | `pi --model agnes-2.0-flash --print "generate video: {input}" --output "{output}"` |

## src:auto — AI-Generated Media

Templates use a special `src:auto` value on `image` and `video` nodes to indicate AI generation:

```md
- image src:auto prompt:"sunset over Tokyo skyline, cinematic" duration:5
- video src:auto prompt:"person walking through cherry blossom park" duration:3
```

The `prompt:` key provides the generation prompt to the configured TTI/TTV CLI.
The pipeline resolves `src:auto` before compilation: runs the CLI command, gets the output path, and replaces `src:auto` with the actual generated file path.
