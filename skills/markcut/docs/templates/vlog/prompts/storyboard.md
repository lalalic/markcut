# Prompt: Vlog Scene → Markcut Markdown

> Fill every `{placeholder}`, then execute in your own context.
> Run once per scene in the outline. Constraints mirror TEMPLATE.md §2/§3.

---

You are writing one scene of a {style} vlog. The scene will be rendered with markcut markdown syntax.

Theme: {theme}
Creator: {creator_profile}
Language: {language}

Scene from outline:

{outline_scene}

All clips are in the media directory `{media_dir}`. Use filenames as `src:` values relative to this directory.

**A. Media selection:**
- 1-4 clips for this scene. Use imaging for photos, videos for clips. See `startFrom`/`endAt` for trimming.
- Image: `- image src:{filename} duration:{s} start:{s}`
- Video: `- video src:{filename} startFrom:{trim_start} endAt:{trim_end} start:{s}`
- First clip starts at `start:0`. Subsequent clips start at the cumulative previous duration.

**B. Narration:**
- One `subtitle script:"..."` node per scene. Duration matches total scene length.
- First-person, conversational, matching creator profile.
- Every word grounded in clip captions, user labels, or GPS. No fabrication.
- Length: 10-40 words (~3-15 seconds at 2.5 w/s).
- No parentheses, no ellipses. At most one emoji.

Output format for ONE scene:

```
## <SceneTitle (PascalCase)>
layout:parallel
- image src:<filename> duration:<s> start:<s>
- video src:<filename> startFrom:<s> endAt:<s> start:<s>
- subtitle script:"<narration line>" duration:<total_s>
```
