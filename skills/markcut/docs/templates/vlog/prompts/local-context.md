# Prompt: Search Local Context (News, Weather, Events)

> Fill every `{placeholder}`, then execute in your own context.
> Runs after Phase 1 (media understanding) before storyboard writing.
> Uses web search to find real facts about the vlog's location and date.

---

You are researching local context for a vlog about "{theme}" at {location}.

Date range: {date_range} (or approximate dates from media timestamps)
Location description: {location} (from GPS reverse-geocode or user input)
Vlog style: {style}

## Task

Search for the following and report real facts that could naturally weave into the narration:

1. **Weather** — What was the weather like on those dates? High/low temps, conditions (sunny, rainy, cloudy), notable patterns (heatwave, storm, full moon).
2. **Local events** — Any festivals, markets, sports events, holidays, or community gatherings happening at that location during the date range.
3. **Seasonal context** — Seasonal highlights: fall colours, cherry blossoms, ski season opening, migration patterns, park hours.
4. **Recent news** — Any notable local news near that location within the week before the vlog dates (park closures, trail openings, wildlife alerts, cultural events).

Use multiple search queries for coverage. Prefer official sources (weather service, park website, local news).

## Output format

```
## Local Context

Weather:
- <fact 1> (source: <url>)
- <fact 2> (source: <url>)

Events:
- <fact> (source: <url>)

Seasonal:
- <fact> (source: <url>)

News:
- <fact> (source: <url>)

## Amplification ideas (optional, for narrator)

- <How a fact amplifies the story: "The fall colours festival meant the park was busier than usual, which explains the crowded trail clip">
- <Another idea>
```

## Rules

- Only include facts confirmed by at least one web source. If a search yields nothing useful for a category, write "None found."
- Do not invent weather, events, or news.
- The amplification ideas are suggestions only — the story-writer decides whether to use them.
- Focus on facts that **connect** to what the media shows (weather matching the sky in photos, events explaining crowds, seasonal features matching the scenery).

## After this step

Pass the result to the storyboard phase (Phase 3). The story-writer agent or outline prompt should receive the local context as an additional input. Use at most **2 local-context references** in the final narration — enough to add color, not enough to overwhelm the personal story.
