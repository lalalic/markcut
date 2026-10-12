# Markcut neutral immutable multi-preview: implementation and evidence

Recorded 2026-10-12 UTC. Source: this Markcut-only checkout. This report does **not** claim complete acceptance: real application-host review delivery and independent external review remain **BLOCKED**.

## Scope, architecture and fixes

- Previously `ensureVideoPreview` killed the existing player on each different path and returned the shared `http://127.0.0.1:4571/` URL. Now a single loopback 4571 gateway maintains distinct `/p/<UUID>/` URLs, assigns each immutable revision an SHA-256 content hash, starts up to six existing CLI player subprocesses on 4580–4598 and proxies player HTML, JS, APIs, and assets without changing the original CLI implementation.
- Each content-hash revision gets a frozen sibling Markdown snapshot. Real E2E exposed mutable generated scene IDs in `/api/video-data`, even for unchanged Markdown; the manager now pins the compiled JSON response at preview creation. It does not use the original Markdown path for playback after snapshotting. Relative external assets are resolved by existing player behavior and may change outside the Markdown snapshot; *complete external-media immutability* is not guaranteed.
- Duplicate same-file/concurrent requests reuse a single content-hash in-flight Promise and active revision. At most six active revisions may exist; capacity errors are explicit. Each revision uses one subprocess, so the bound is six subprocesses, **not** one render subprocess.
- Input must be an absolute existing readable `.md` file (realpath, regular-file check, <=1MiB). Snapshots use exclusive file creation; existing snapshots must be regular, non-symlink files with the same bytes. Gateway accepts only loopback connections, rejects foreign-Origin browser requests and proxies known revisions only; it must not be exposed to an untrusted network. As with existing CLI semantics, any local user authorized to call the MCP tool can preview readable absolute files.
- Gateway fails rather than adopting or killing unrelated services already occupying 4571. On MCP normal exit, SIGINT/SIGTERM, or stdin close, owned process group's termination stops the gateway and descendants. Snapshots and revision compiler dirs are removed on graceful gateway shutdown; an abrupt SIGKILL/crash can leave snapshot/cache artifacts. Restart is **ephemeral**: old preview URLs return HTTP 404 and a new invocation creates a new UUID. **Historical URL persistence across server restart is explicitly NOT advertised.**
- Review UI uses **one authoritative outbound host event request**, `ui/message`, carrying neutral `decision`, `feedback` (required for changes), `previewId`, `revisionId`, and `contentHash`. Duplicate clicks are blocked in the UI. The legacy standalone `markcut.preview.submit` tool remains as side-effect-free validation and does not deliver host review events. No Relay job/task identifiers, database APIs, or Relay state changes are present in Markcut.

## Commands and actual test evidence

```sh
npm ci --no-audit --no-fund
node --check src/mcp/managed-player.mjs
node --check src/mcp/preview.mjs
node --check src/mcp/bridge.mjs
node --check src/mcp/server.mjs
npm test -- --run tests/mcp-preview.test.ts
node scripts/verify-mcp-preview.mjs
npm run typecheck
npm test
```

- `npm ci`: PASS, 462 packages installed.
- Focused MCP tests: **PASS 8/8**, including the single `ui/message` path, revision identity, duplicate-click prevention and failure handling. VM harness is *not* real host proof.
- Real MCP + HTTP: **PASS 14/14** (last run exit 0). Full original machine outputs, IDs, URLs, content hashes, process listings and assertions in `docs/evidence-markcut-real-e2e.json`. The script launches a real MCP stdio server and two real Markdown player instances; it does not mock network or tool calls. Actual A-v1 UUID `5cdb7daa-332f-4e44-b319-88b1635175b1`, B-v1 UUID `d251d006-0956-464b-b1d3-b2b677a67334`, A-v2 UUID `4d64c6ae-1af9-4122-8fa1-ac943a611cae`. A-v1: `http://127.0.0.1:4571/p/5cdb7daa-332f-4e44-b319-88b1635175b1/`; B-v1: `http://127.0.0.1:4571/p/d251d006-0956-464b-b1d3-b2b677a67334/`; A-v2: `http://127.0.0.1:4571/p/4d64c6ae-1af9-4122-8fa1-ac943a611cae/`. A-v1 SHA256 `1f612ea3c2796d617df80e31a3890b27d6b093399395eff5759e0b8d79dfd07b`; B-v1 SHA256 `d48c6a5da387d62cf15acecf0f34c6b3c4b3666b756cba418192445f7158c64b`; A-v2 SHA256 `9a0fe26791bed4f8aa7d0d75b9badeee025acc2784a0628e23bcd99d5aa5b6c5`.
- Real player calls returned HTTP 200, `{"ready":true}`, `/api/video-data` with distinct `Alpha v1` vs `Beta v1` source identity; HTML and `player.js` both HTTP 200. A-v1 compiled response remained *byte-identical* after A-v2; B-v1 retained its content. Twelve parallel repeated requests yielded one instance. Six-slot test observed one manager plus six player subprocesses (seven active), after shutdown zero remaining. Conflict test preserved foreign port owner. After restart, old A-v1 URL returned HTTP 404. Cross-origin unauthorized request returned 403.
- `npm run typecheck`: **FAIL** due to existing unrelated type errors including `src/descriptive/resolve.test.ts` implicit anys, missing `dirname`, and `src/player/components/LabelControls.tsx` possibly-undefined errors. No TypeScript project source files were modified in this task. This has not been independently confirmed against a pristine baseline.
- `npm test`: **PENDING at report creation**, running long Remotion integration tests (see final run status below). Do not interpret the focused test pass as a full-suite pass.

### Acceptance decision matrix

| Scenario | Result | Evidence / limitation |
|---|---|---|
| Two independent concurrently live Markdown video previews | PASS | Real MCP+HTTP A/B; different URLs/scene content |
| Immutable historical revision within process lifetime | PASS | Real A-v2, A-v1 compiled JSON byte-identical |
| Revisit A and B; repeated same path | PASS | Real HTTP + reused UUID |
| Concurrent repeated calls; bounded children | PASS | 12 parallel requests → one revision; six slots max |
| Invalid paths and safe snapshot access | PASS | Real MCP invalid cases; safe regular-file snapshots |
| Port collision | PASS | Foreign service not terminated or adopted |
| Graceful cleanup and process leak check | PASS | Six child processes + manager → zero after close |
| Restart and historical URL semantics | PASS | Old URL 404 (persistence NOT advertised) |
| Standalone MCP; original CLI interface preserved | PASS for stdio MCP; CLI code unchanged | Real client and unmodified CLI source; no separate legacy CLI playback smoke test |
| Generic event-only UI contract (single path) | PASS unit test | No duplicate `tools/call`; neutral identity and feedback |
| Generic event delivery **from real application host** | **BLOCKED** | Actual host event not observed; see manual verification |
| Independent specialist review | **BLOCKED** | Must be scheduled by Relay owner; no independent reviewer run here |
| Full test suite and typecheck | **See test status** | Typecheck errors recorded above |

### Reproducible real application-host review verification (required before accepting this objective)

1. Install/configure the MCP Apps-capable *real application host* to launch `node src/mcp/server.mjs` from this checkout (not a mock harness); enable transport/host debug logs.
2. Call the real `markcut.preview` tool with `{"path":"/absolute/path/to/A.md"}` and open its embedded player UI. Verify the preview identity, readiness, and distinct revision URL.
3. Click **Approve** **once** and inspect host-inbound RPC: exactly one `ui/message` request containing one serialized user text message with `decision:"approved"`, `previewId`, `revisionId`, and `contentHash`. Verify host turns it into exactly one user-visible review event; inspect events/turn logs, **not** just client success UI.
4. Open a new revision, enter feedback, click **Request changes** and verify exactly one host event with `decision:"changes_requested"` and the exact feedback. Double-click should not duplicate; reject empty feedback. Neither path should emit `tools/call markcut.preview.submit`; neither event should have `jobId`/`taskId`.
5. If `ui/message` is unsupported or not delivered by the host, capture RPC rejection or absent event and keep **BLOCKED**. Never infer host delivery from a VM/unit test or HTTP success.

### Residual limitations

- The resource lifecycle intentionally limits simultaneous preview revisions to six and requires stopping/restarting the MCP-managed server to free all slots; no per-preview close/reclaim control.
- URLs and gateway state do not persist across service restart. Live snapshot content and pinned compiled JSON are stable, but media files read outside the snapshot may change.
- Abrupt crashes and SIGKILL may leave generated cache/snapshots in input folders; normal termination cleans managed revision files.
- Child preview backend ports 4580–4598 use the existing player server and are loopback-accessible directly; this is a local trusted-host tool, not a network multi-tenant security boundary.
- Independent review and real host event are required acceptance gates and remain BLOCKED, regardless of successful localhost E2E.

## Final full-suite result (supersedes earlier pending status)

- `npm test` — **FAIL**, exit code 1. **454 passed, 11 failed, 2 skipped** (16 files: 3 failed, 13 passed); runtime 386.27s. The focused MCP test suite remains 8/8 PASS and real MCP+HTTP test suite 14/14 PASS.
- Nine failures originate in `tests/render.test.ts`: audio track rendering, audio extraction, full-feature audio, combined feature renders, STT, parallel audio/image/subtitle, and video trimming. One failure is `src/descriptive/compiler.test.ts` expecting unique generated IDs, and one is `src/descriptive/markdown.test.ts` expecting an empty standalone script to throw. No source in these test areas was modified during the Markcut preview work; baseline equivalence is unverified.
- Raw stderr and stdout: local Neo shell job `1791827301578-0896f7bff8-markcut-relevant-full-test`, `~/Library/Application Support/NeoY/core/jobs/1791827301578-0896f7bff8-markcut-relevant-full-test.{stderr,stdout}.log`.
- Final acceptance of full regression and independent review remains **BLOCKED/FAIL**; the passing focused/real preview checks do not override it.
