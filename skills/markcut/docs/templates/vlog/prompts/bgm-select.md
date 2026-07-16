# Prompt: Select Background Music (BGM)

> Fill every `{placeholder}`, then execute in your own context.
> BGM is **mandatory** for every vlog. Runs before assembly step.

---

You are selecting background music for a {style} vlog: "{theme}".

Mood: {dominant_mood} (from clip understanding)
Location: {location}
Style: {style}

## Guidelines

- BGM must match the dominant mood: upbeat for happy/travel vlogs, ambient for reflective/lyrical vlogs, playful for humorous vlogs.
- Genres that work well for vlogs: lo-fi, ambient electronic, acoustic guitar, soft piano, chillhop, cinematic pads.
- Duration: find a track that loops well or is at least as long as the target duration ({duration}s). Short tracks with seamless loop points are fine.
- License: royalty-free only. Recommended sources: Pixabay Music, Free Music Archive, Uppbeat (free tier).
- If this project has an `audio-sourcing` skill available, use it to search and download.

## Output

If you find a suitable track, provide:

```
BGM: <track title>
Source: <url>
Artist: <name>
License: <license type>
Duration: <seconds>
Loop: yes | no (if loop, describe loop point)

How to use in course.md:
- audio isBackground:true foreground:true src:bgm.mp3 volume:0.15
```

If no suitable BGM is found (all options are wrong mood, too short, paid-only), report "None found" and suggest a fallback search query.
