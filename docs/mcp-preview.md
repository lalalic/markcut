# MCP video preview lifecycle

The MCP `markcut.preview` tool owns one localhost listener on port 4571. A
Markdown path is canonicalized with `realpath`, then registered through an
in-process authenticated endpoint. The returned route is an opaque SHA-256
prefix (`/d/<id>/`), so repeated requests for the same file reuse the worker
and different files cannot replace one another.

The shared listener proxies each registered route to the existing Markcut
player/compiler. This is a deliberate lazy isolation boundary: the public
listener is shared, while compilation state, watch state, edit mode, and
relative asset roots remain isolated in the existing player implementation.
Only the MCP process knows the registration bearer token. The proxy rejects
unknown IDs and the player no longer accepts an arbitrary absolute URL as a
filesystem asset path. Markdown cache state remains owned by each player;
editing a document invalidates that worker's compiled cache and SSE reload,
without affecting other documents.

The review app embeds the normal player with autoplay/fullscreen/picture-in-
picture permissions, uses responsive portrait/landscape framing, and targets
the preview shell for fullscreen. Browser hosts may still disallow fullscreen
for sandboxed cross-origin iframes; this is a host policy limitation rather
than a player limitation.
