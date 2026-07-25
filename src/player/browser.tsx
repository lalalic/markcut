/**
 * Browser player entry point.
 * Bundled with esbuild and served by the player server.
 * Renders stream tree JSON using @remotion/player with MarkCut.
 *
 * Supports three modes passed via window.MODE:
 *   "label"  — label annotation overlay
 *   "edit"   — edit input with AI auto-reload
 *   (default) — plain preview with optional variant bar
 */
import * as React from "react";
import { createRoot } from "react-dom/client";
import * as ReactDOM from "react-dom";
import * as Remotion from "remotion";
import { Player } from "@remotion/player";
import { MarkCut, getDurationInSeconds } from "../entry";
import { HeaderBar, EditControls, EditMessagePanel, LabelControls, SceneThumbnails, VariantBar } from "./components/index";
import type { EditEntry } from "./components/EditMessagePanel";
import * as MarkcutComponents from "../components/index";

/**
 * Register all player-bundled packages on a global registry so the import map
 * shim (below) can re-export them to dynamically-loaded component bundles.
 *
 * Any package added here must also be listed as --external in bundler.mjs's
 * `getSharedExternals()` so esbuild leaves its import specifier as a bare
 * import in the component bundle output. The import map then resolves that
 * bare import back to this same module instance, avoiding duplicate React,
 * Remotion, or other runtime singleton issues.
 */
if (typeof window !== "undefined") {
  (globalThis as any).__remotionShared = {
    "react": React,
    "react-dom": ReactDOM,
    "remotion": Remotion,
    "@remotion/player": { Player },
    "@lalalic/markcut": MarkcutComponents,
  };

  // Stub for node:module — some component deps (e.g. @remotion/tailwind-v4)
  // import from node:module at module level for build-time helpers that are
  // never actually called during rendering. Provide a harmless stub so the
  // import doesn't fail in the browser.
  if (!(globalThis as any).__nodeModuleStub) {
    const nodeModuleStubCode = `export function createRequire() { return () => ({ resolve: () => { throw new Error("node:module.createRequire is not available in the browser"); } }); }`;
    const nodeModuleBlob = new Blob([nodeModuleStubCode], { type: "application/javascript" });
    (globalThis as any).__nodeModuleStub = URL.createObjectURL(nodeModuleBlob);
  }

  // Generate import map shim dynamically from the shared registry.
  // Each entry creates a blob URL that re-exports everything from the global,
  // so component bundles can import("react"), import("remotion"), etc. and
  // receive the same instances already loaded in the main player bundle.
  if (!document.querySelector('#rmtr-import-map')) {
    try {
      const imports: Record<string, string> = {};
      // Add node:* stubs
      imports["node:module"] = (globalThis as any).__nodeModuleStub;
      imports["node:fs"] = (globalThis as any).__nodeModuleStub;
      imports["node:path"] = (globalThis as any).__nodeModuleStub;
      imports["node:os"] = (globalThis as any).__nodeModuleStub;
      const shared = (globalThis as any).__remotionShared;

      for (const [specifier, mod] of Object.entries(shared) as [string, any][]) {
        const exportNames = Object.keys(mod);
        const hasDefault = 'default' in mod;
        const lines: string[] = [
          `const _mod = globalThis.__remotionShared[${JSON.stringify(specifier)}];`,
        ];
        for (const name of exportNames) {
          if (name === 'default') continue;
          lines.push(
            `const __${name} = _mod[${JSON.stringify(name)}];`,
            `export { __${name} as ${name} };`
          );
        }
        if (hasDefault) {
          lines.push('export default _mod.default;');
        }
        const blob = new Blob([lines.join('\n')], { type: "application/javascript" });
        imports[specifier] = URL.createObjectURL(blob);
      }

      // react/jsx-runtime — built manually because it's not a package import
      // but rather a sub-path of react that React.createElement handles directly.
      const blobJsx = new Blob([`
        const R = globalThis.__remotionShared["react"];
        const { createElement, Fragment } = R;
        export { Fragment };
        export function jsx(type, props, key) {
          return createElement(type, key != null ? { ...props, key } : props);
        }
        export function jsxs(type, props, key) {
          return createElement(type, key != null ? { ...props, key } : props);
        }
        export function jsxDEV(type, props, key, isStaticChildren, source, self) {
          return createElement(type, key != null ? { ...props, key } : props);
        }
      `], { type: "application/javascript" });
      imports["react/jsx-runtime"] = URL.createObjectURL(blobJsx);

      const script = document.createElement("script");
      script.type = "importmap";
      script.id = "rmtr-import-map";
      script.textContent = JSON.stringify({ imports });
      document.head.appendChild(script);
    } catch (e) {
      console.warn("Failed to create shared module import map:", e);
    }
  }
}

function PlayerApp() {
  const playerRef = React.useRef<any>(null);
  const [ready, setReady] = React.useState(false);
  const [error, setError] = React.useState<string | null>(null);
  const [data, setData] = React.useState<any>(null);
  const [muted, setMuted] = React.useState(false);
  const [volume, setVolume] = React.useState(1);
  const mountedRef = React.useRef(true);

  // ── Track current player frame without re-renders ───────────────────
  const currentFrameRef = React.useRef(0);
  const [currentTime, setCurrentTime] = React.useState(0);
  const [activeScene, setActiveScene] = React.useState("");

  // Fetch scenes for active scene tracking
  React.useEffect(() => {
    const variant = (window as any).VARIANT || "default";
    const url = variant !== "default" ? `/api/video-info?variant=${variant}` : "/api/video-info";
    fetch(url)
      .then((r) => r.json())
      .then((info) => {
        if (info.scenes) {
          // Store scenes globally for time-based lookup
          (window as any).__scenes = info.scenes;
        }
      })
      .catch(() => {});
  }, []);

  // Update active scene from currentTime.
  // Iterate backward so the latest scene whose start <= currentTime wins —
  // during transition overlaps, the newer scene takes precedence.
  React.useEffect(() => {
    const scenes = (window as any).__scenes;
    if (!scenes) return;
    let found = "";
    for (let i = scenes.length - 1; i >= 0; i--) {
      if (currentTime >= scenes[i].start) {
        found = scenes[i].name || "";
        break;
      }
    }
    setActiveScene(found);
  }, [currentTime]);

  // ── Save/restore position across reloads ────────────────────────────
  const pendingSeekRef = React.useRef<number | null>(null);

  // Parse URL params
  const urlParams = new URLSearchParams(typeof window !== "undefined" ? window.location.search : "");
  const autoPlay = urlParams.get("autoplay") === "true";
  const startAt = parseFloat(urlParams.get("start") || urlParams.get("t") || "0") || 0;

  // Derive player config from data early so effects can reference them safely.
  const fps = data?.fps ?? 30;
  const durationInSeconds = data ? (getDurationInSeconds(data, true) || 5) : 5;
  const durationInFrames = Math.max(1, Math.ceil(durationInSeconds * fps));

  // Memoize inputProps to avoid Remotion Player composition restart on every render.
  // Without memoization, inputProps creates a new object reference on each render,
  // causing ~10 composition restarts/sec (audio nodes remount → audio jumps back).
  const inputProps = React.useMemo(() => ({ root: data, compose: {} }), [data]);

  // ── Load data (does NOT set ready=false to avoid player unmount) ─────
  const loadData = React.useCallback((initial = false) => {
    if (initial) setReady(false);
    const variant = (window as any).VARIANT || "default";
    const url = variant !== "default" ? `/api/video-data?variant=${variant}` : "/api/video-data";
    fetch(url)
      .then((r) => r.json())
      .then((json) => {
        const root = json.root || json;
        setData(root);
        if (initial) setReady(true);
      })
      .catch((e) => setError(e.message));
  }, []);

  // ── Initial load ────────────────────────────────────────────────────
  React.useEffect(() => {
    loadData(true);
    return () => { mountedRef.current = false; };
  }, [loadData]);

  // ── SSE reload: save position, load new data, restore position ──────
  React.useEffect(() => {
    const handler = () => {
      // Save current position before reload
      if (playerRef.current) {
        pendingSeekRef.current = playerRef.current.getCurrentFrame();
      }
      loadData(false);
    };
    window.addEventListener("refresh-player", handler);
    return () => window.removeEventListener("refresh-player", handler);
  }, [loadData]);

  // ── After data loads, seek to saved position or startAt ─────────────
  React.useEffect(() => {
    if (!ready || !data || !playerRef.current) return;
    const targetFrame = pendingSeekRef.current ?? Math.round(startAt * fps);
    if (targetFrame > 0) {
      const timer = setTimeout(() => {
        if (!mountedRef.current || !playerRef.current) return;
        playerRef.current.seekTo(targetFrame);
        pendingSeekRef.current = null;
      }, 100);
      return () => clearTimeout(timer);
    }
    pendingSeekRef.current = null;
  }, [ready, data, startAt, fps]);

  // ── onFrameUpdate: track current time ───────────────────────────────
  // Remotion Player 4.x dispatches `frameupdate` events via the player ref's
  // EventTarget API — there is no `onFrameUpdate` prop. Subscribe in an effect.
  const handleFrameUpdate = React.useCallback((frame: number) => {
    currentFrameRef.current = frame;
    // Throttle state updates lightly for scene tracking
    setCurrentTime(prev => {
      const newTime = frame / fps;
      return Math.abs(newTime - prev) > 0.1 ? newTime : prev;
    });
  }, [fps]);

  // Subscribe to frameupdate events on the player ref (after it mounts)
  React.useEffect(() => {
    const p = playerRef.current;
    if (!p || typeof (p as any).addEventListener !== "function") return;
    const listener = (e: any) => {
      const frame = e?.detail?.frame;
      if (typeof frame === "number") handleFrameUpdate(frame);
    };
    (p as any).addEventListener("frameupdate", listener);
    return () => (p as any).removeEventListener("frameupdate", listener);
  }, [ready, data, handleFrameUpdate]);

  // Keyboard shortcuts
  React.useEffect(() => {
    if (!ready || !playerRef.current) return;

    const FWD_SECONDS = 5;
    const BACK_SECONDS = 5;
    const VOLUME_STEP = 0.1;

    function seekRelative(deltaSec: number) {
      const p = playerRef.current;
      if (!p) return;
      const frame = Math.max(0, p.getCurrentFrame() + Math.round(deltaSec * fps));
      p.seekTo(frame);
      setCurrentTime(frame / fps);
    }

    function seekPercent(pct: number) {
      const p = playerRef.current;
      if (!p) return;
      const frame = Math.round(pct * durationInFrames);
      p.seekTo(frame);
      setCurrentTime(frame / fps);
    }

    function showHelp() {
      // eslint-disable-next-line no-console
      console.log(`%c🎬 MarkCut Player Shortcuts
━━━━━━━━━━━━━━━━━━━━━
  Space / K    Play / Pause
  ← / →        Seek -${BACK_SECONDS}s / +${FWD_SECONDS}s
  Shift+←/→    Seek -1 / +1 frame
  J            Rewind 2×
  L            Forward 2×
  ↑ / ↓        Volume +${Math.round(VOLUME_STEP * 100)}% / -${Math.round(VOLUME_STEP * 100)}%
  M            Mute toggle
  F            Fullscreen toggle
  0-9          Seek to 0%-90%
  ?            Show this help`, "font-size:14px;");
    }

    function onKey(e: KeyboardEvent) {
      // Ignore if focus is inside a form element
      const tag = (e.target as HTMLElement).tagName;
      if (tag === "INPUT" || tag === "TEXTAREA" || tag === "SELECT") return;

      const p = playerRef.current;
      if (!p) return;

      switch (e.key) {
        case " ":
        case "k":
        case "K":
          e.preventDefault();
          p.toggle();
          break;

        case "ArrowLeft":
          e.preventDefault();
          seekRelative(e.shiftKey ? -1 / fps : -BACK_SECONDS);
          break;

        case "ArrowRight":
          e.preventDefault();
          seekRelative(e.shiftKey ? 1 / fps : FWD_SECONDS);
          break;

        case "ArrowUp":
          e.preventDefault();
          setVolume(v => {
            const nv = Math.min(1, v + VOLUME_STEP);
            if (typeof p.setVolume === "function") p.setVolume(nv);
            return nv;
          });
          break;

        case "ArrowDown":
          e.preventDefault();
          setVolume(v => {
            const nv = Math.max(0, v - VOLUME_STEP);
            if (typeof p.setVolume === "function") p.setVolume(nv);
            return nv;
          });
          break;

        case "m":
        case "M":
          e.preventDefault();
          setMuted(m => {
            const nm = !m;
            if (typeof p.setVolume === "function") p.setVolume(nm ? 0 : volume);
            return nm;
          });
          break;

        case "f":
        case "F":
          e.preventDefault();
          if (typeof p.requestFullscreen === "function") {
            p.requestFullscreen();
          } else {
            document.fullscreenElement
              ? document.exitFullscreen()
              : document.documentElement.requestFullscreen();
          }
          break;

        case "j":
        case "J":
          e.preventDefault();
          // Toggle between normal and 2× reverse
          p.playbackRate = p.playbackRate === -2 ? 1 : -2;
          break;

        case "l":
        case "L":
          e.preventDefault();
          // Toggle between normal and 2× forward
          p.playbackRate = p.playbackRate === 2 ? 1 : 2;
          break;

        case "/":
        case "?":
          e.preventDefault();
          showHelp();
          break;

        default:
          if (e.key >= "0" && e.key <= "9") {
            e.preventDefault();
            seekPercent(parseInt(e.key) / 10);
          }
          break;
      }
    }

    window.addEventListener("keydown", onKey);
    return () => window.removeEventListener("keydown", onKey);
  }, [ready, data, fps, durationInFrames, volume]);

  // Determine mode from global (set via HTML by the server)
  const mode: string =
    (typeof window !== "undefined" ? (window as any).MODE : null) || "preview";

  // Shared state for header info
  const [sseConnected, setSseConnected] = React.useState(false);
  const [labelSceneInfo, setLabelSceneInfo] = React.useState("");

  // ── Edit message panel state ─────────────────────────────────────────
  const [editEntries, setEditEntries] = React.useState<EditEntry[]>([]);
  const [editPanelMinimized, setEditPanelMinimized] = React.useState(true);
  let nextEditIdRef = React.useRef(1);

  // SSE connection — shared across all modes as a server-liveness monitor
  // Edit mode also listens for "reload" messages (auto-refresh on file change)
  const suppressReloadRef = React.useRef(false);
  React.useEffect(() => {
    let evtSource: EventSource | null = null;
    try {
      evtSource = new EventSource("/api/events");
      evtSource.onopen = () => setSseConnected(true);
      evtSource.onmessage = (e: MessageEvent) => {
        try {
          const msg = JSON.parse(e.data);

          // Reload event (file changed on disk or agent finished editing)
          if (msg.type === "reload" && !suppressReloadRef.current) {
            window.dispatchEvent(new Event("refresh-player"));
            return;
          }

          // Edit progress events (live from agent RPC)
          if (msg.type === "edit:start") {
            const id = nextEditIdRef.current++;
            setEditEntries((prev) => [
              ...prev,
              { id, request: msg.request || "", progress: "", status: "thinking" },
            ]);
            setEditPanelMinimized(false);
            return;
          }
          if (msg.type === "edit:progress") {
            setEditEntries((prev) => {
              const last = prev[prev.length - 1];
              if (!last || last.status !== "thinking") return prev;
              return prev.map((e) =>
                e.id === last.id ? { ...e, progress: msg.text || "" } : e
              );
            });
            return;
          }
          if (msg.type === "edit:done") {
            setEditEntries((prev) => {
              const last = prev[prev.length - 1];
              if (!last) return prev;
              return prev.map((e) =>
                e.id === last.id
                  ? { ...e, status: "done", progress: e.progress || msg.summary || "" }
                  : e
              );
            });
            return;
          }
          if (msg.type === "edit:error") {
            setEditEntries((prev) => {
              const last = prev[prev.length - 1];
              if (!last) return prev;
              return prev.map((e) =>
                e.id === last.id ? { ...e, status: "error", error: msg.error } : e
              );
            });
            return;
          }
        } catch {}
      };
      evtSource.onerror = () => setSseConnected(false);
    } catch {
      setSseConnected(false);
    }
    return () => {
      evtSource?.close();
      setSseConnected(false);
    };
  }, []);

  if (error) {
    return <div style={{ color: "red", padding: 40, fontFamily: "sans-serif" }}>Error: {error}</div>;
  }

  if (!ready) {
    return <div style={{ color: "#888", padding: 40, fontFamily: "sans-serif" }}>Loading...</div>;
  }

  const width = data.width || 1080;
  const height = data.height || 1920;

  return (
    <div
      style={{
        width: "100%", height: "100%", background: "#0a0a0a",
        display: "flex", flexDirection: "column", alignItems: "center",
      }}
    >
      {/* ── Header (close button + mode info) ── */}
      <HeaderBar
        mode={mode}
        sseConnected={sseConnected}
        sceneInfo={mode === "label" ? labelSceneInfo : undefined}
      />

      {/* ── Edit message panel ── */}
      {mode === "edit" && (
        <EditMessagePanel
          entries={editEntries}
          minimized={editPanelMinimized}
          onToggleMinimize={() => setEditPanelMinimized((v) => !v)}
        />
      )}

      {/* ── Variant switcher ── */}
      <VariantBar />

      {/* ── Player frame ── */}
      <div id="player-frame" style={{ flex: 1, width: "100%", maxWidth: 480, minHeight: 0 }}>
        <Player
          ref={playerRef}
          component={MarkCut}
          inputProps={inputProps}
          durationInFrames={durationInFrames}
          fps={fps}
          compositionWidth={width}
          compositionHeight={height}
          style={{ width: "100%", height: "100%" }}
          controls={true}
          showPlaybackRateControl={true}
          allowFullscreen={true}
          clickToPlay={false}
          doubleClickToFullscreen={true}
          autoPlay={autoPlay}
        />
      </div>

      {/* ── Scene thumbnails (shared across all modes) ── */}
      <SceneThumbnails
        currentTime={currentTime}
        onSeek={(t) => {
          if (playerRef.current) {
            const frame = Math.round(t * fps);
            playerRef.current.seekTo(frame);
            setCurrentTime(t);
          }
        }}
      />

      {/* ── Mode-specific controls ── */}
      {mode === "edit" && (
        <EditControls
          suppressReloadRef={suppressReloadRef}
          currentTime={currentTime}
          activeScene={activeScene}
        />
      )}
      {mode === "label" && (
        <LabelControls
          playerRef={playerRef}
          currentTime={currentTime}
          onSceneChange={setLabelSceneInfo}
        />
      )}
      {/* Preview mode: no extra controls */}
    </div>
  );
}

const container = document.getElementById("root");
if (container) {
  const root = createRoot(container);
  root.render(React.createElement(PlayerApp));
}
