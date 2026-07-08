/**
 * Browser player entry point.
 * Bundled with esbuild and served by the player server.
 * Renders stream tree JSON using @remotion/player with MarkCut.
 */
import * as React from "react";
import { createRoot } from "react-dom/client";
import * as ReactDOM from "react-dom";
import * as Remotion from "remotion";
import { Player } from "@remotion/player";
import { MarkCut, getDurationInSeconds } from "../entry";

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
  const [refreshKey, setRefreshKey] = React.useState(0);
  const [muted, setMuted] = React.useState(false);
  const [volume, setVolume] = React.useState(1);
  const seekAttemptedRef = React.useRef(false);
  const mountedRef = React.useRef(true);

  // Parse URL params
  const urlParams = new URLSearchParams(typeof window !== "undefined" ? window.location.search : "");
  const autoPlay = urlParams.get("autoplay") === "true";
  const startAt = parseFloat(urlParams.get("start") || urlParams.get("t") || "0") || 0;

  // Derive player config from data early so effects can reference them safely.
  // These are computed on every render but only meaningful when data is set.
  const fps = data?.fps ?? 30;
  const durationInSeconds = data ? (getDurationInSeconds(data, true) || 5) : 5;
  const durationInFrames = Math.max(1, Math.ceil(durationInSeconds * fps));

  const loadData = React.useCallback(() => {
    setReady(false);
    fetch("/api/video-data")
      .then((r) => r.json())
      .then((json) => {
        const root = json.root || json;
        setData(root);
        setReady(true);
      })
      .catch((e) => setError(e.message));
  }, []);

  React.useEffect(() => {
    loadData();
    const handler = () => { setRefreshKey(k => k + 1); };
    window.addEventListener("refresh-player", handler);
    return () => { mountedRef.current = false; window.removeEventListener("refresh-player", handler); };
  }, [loadData]);

  React.useEffect(() => {
    if (refreshKey > 0) loadData();
  }, [refreshKey, loadData]);

  // Seek to startAt once player is mounted
  React.useEffect(() => {
    if (!ready || !data || seekAttemptedRef.current) return;
    if (startAt > 0 && playerRef.current) {
      // Small delay to let the player fully initialize
      const timer = setTimeout(() => {
        if (!mountedRef.current || !playerRef.current) return;
        const frame = Math.round(startAt * fps);
        playerRef.current.seekTo(frame);
        seekAttemptedRef.current = true;
      }, 100);
      return () => clearTimeout(timer);
    }
    seekAttemptedRef.current = true;
  }, [ready, data, startAt, fps]);

  // Keyboard shortcuts
  React.useEffect(() => {
    if (!ready || !playerRef.current) return;

    const FWD_SECONDS = 5;
    const BACK_SECONDS = 5;
    const VOLUME_STEP = 0.1;

    function seekRelative(deltaSec: number) {
      const p = playerRef.current;
      if (!p) return;
      const frame = p.getCurrentFrame() + Math.round(deltaSec * fps);
      p.seekTo(Math.max(0, frame));
    }

    function seekPercent(pct: number) {
      const p = playerRef.current;
      if (!p) return;
      p.seekTo(Math.round(pct * durationInFrames));
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

  // Expose seek API for external scripts
  React.useEffect(() => {
    if (!data) return;
    (window as any).__remotionSeekTo = (timeInSeconds: number) => {
      const frame = Math.round(timeInSeconds * fps);
      playerRef.current?.seekTo(frame);
    };
  });

  if (error) {
    return React.createElement("div", {
      style: { color: "red", padding: 40, fontFamily: "sans-serif" },
    }, "Error: " + error);
  }

  if (!ready) {
    return React.createElement("div", {
      style: { color: "#888", padding: 40, fontFamily: "sans-serif" },
    }, "Loading...");
  }

  const width = data.width || 1080;
  const height = data.height || 1920;

  return React.createElement("div", {
    style: { width: "100%", height: "100%", background: "#000" },
  },
    React.createElement(Player, {
      ref: playerRef,
      component: MarkCut,
      inputProps: {
        root: data,
        compose: {},
      },
      durationInFrames,
      fps,
      compositionWidth: width,
      compositionHeight: height,
      style: { width: "100%", height: "100%" },
      controls: true,
      showPlaybackRateControl: true,
      allowFullscreen: true,
      clickToPlay: false,
      doubleClickToFullscreen: true,
      autoPlay: autoPlay,
    })
  );
}

const container = document.getElementById("root");
if (container) {
  const root = createRoot(container);
  root.render(React.createElement(PlayerApp));
}
