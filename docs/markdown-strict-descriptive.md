
## HTML comments: ignored metadata

Standard Markdown HTML comments are intentionally ignored by Markcut's descriptive parser and never enter the descriptive tree or rendered output:

```md
<!-- arbitrary metadata -->
```

This makes comments suitable for **out-of-band metadata owned by another tool**, for example:

```md
<!-- execution {"id":"profiles-demo","type":"demo","scene_id":"profiles","output":"assets/profiles-demo.mp4"} -->
```

Markcut does **not** parse, validate, or interpret the comment contents. It only guarantees that HTML comment nodes are ignored. A separate tool may read its own comment convention directly from the Markdown source.
