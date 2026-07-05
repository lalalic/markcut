---
width: 1920
height: 1080
fps: 30
stylesheet: |
  .test-title h1 { font-size: 64px; color: #667eea; text-align: center; margin-bottom: 0.2em; }
  .test-body h2  { font-size: 44px; color: #222; border-bottom: 3px solid #667eea; padding-bottom: 0.2em; }
  .test-body li  { font-size: 30px; margin: 0.4em 0; color: #333; }
  .test-body blockquote { border-left: 4px solid #667eea; padding-left: 1em; margin: 0.5em 0; color: #555; font-style: italic; }
  .test-body code { background: #f0f0f0; padding: 0.1em 0.3em; border-radius: 4px; font-size: 0.9em; }
  .test-body table { width: 100%; border-collapse: collapse; }
  .test-body td { border: 1px solid #ddd; padding: 0.4em 0.6em; }
---
# video
width:1920 height:1080 fps:30 layout:series

## TitleSlide
layout:parallel
- component duration:4
  ~~~jsx
  <Markdown className="test-title" style={{background: "linear-gradient(135deg, #1a1a2e 0%, #16213e 100%)", padding: "80px 100px"}}>
  # Markdown + Stylesheet Test

  Verifying block-level rendering

  **Bold text** and *italic text* and `inline code`
  </Markdown>
  ~~~

## BodySlide
layout:parallel
- component duration:6
  ~~~jsx
  <Markdown className="test-body" style={{background: "#fff", padding: "60px 80px", color: "#333"}}>
  ## Section Heading

  - **Bullet 1** — with description
  - **Bullet 2** — more details
  - **Bullet 3** — additional info

  > This is a blockquote with styled left border

  | Name | Value |
  |------|-------|
  | Item 1 | 100 |
  | Item 2 | 200 |
  </Markdown>
  ~~~
