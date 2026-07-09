import * as React from "react";
import { AbsoluteFill, Sequence, useVideoConfig, delayRender, continueRender, staticFile, Audio } from "remotion";
import { ComposeContext, AudioContext, useFrameEvents } from "../context/index";
import { cssJS, toClassName, getDurationInSeconds, type DurationStream } from "../utils/index";
import type { Include as IncludeStream, Root } from "../schema/index";
import { FolderLeaf } from "./Folder";

// Aspect dimensions for scene-based video content
const ASPECT_DIMS: Record<string, { width: number; height: number }> = {
  "16x9": { width: 1920, height: 1080 },
  "9x16": { width: 1080, height: 1920 },
  "1x1": { width: 1080, height: 1080 },
};

interface SceneBasedVideo {
  meta: { title: string; fps: number; aspects?: string[] };
  voiceover?: { tts: string; voice: string };
  bgm?: { src: string; baseVolume: number };
  scenes: Array<{
    id: string;
    start?: number;
    duration?: number;
    component?: string;
    props?: { headline?: string; subhead?: string; [k: string]: unknown };
    voiceover?: { audio?: string };
  }>;
}

/**
 * Determines whether a parsed JSON value is a scene-based video.json
 * (has `meta` and `scenes`) vs a stream tree (has `type: "root"` or a `root` property).
 */
function isSceneBased(data: unknown): data is SceneBasedVideo {
  if (!data || typeof data !== "object") return false;
  const d = data as Record<string, unknown>;
  return typeof d.meta === "object" && d.meta !== null && Array.isArray(d.scenes);
}

/**
 * Resolve a relative src path via staticFile() if it's not an absolute URL or path.
 */
function resolveIncludeSrc(src: string): string {
  if (src.startsWith("http://") || src.startsWith("https://") || src.startsWith("data:") || src.startsWith("/")) {
    return src;
  }
  return staticFile(src);
}

/**
 * IncludeLeaf renders a video composition referenced by `src`.
 *
 * The `src` points to a JSON file that can be either:
 *   - A stream tree (has `type: "root"`) — rendered via FolderLeaf
 *   - A scene-based video.json (has `meta` and `scenes`) — rendered via inline scene renderer
 *
 * Falls back to inline `children` (legacy behavior) when `src` is not set.
 *
 * Usage:
 *   { type: "include", src: "./path/to/video.json", actions: [{ start: 0, end: 5 }] }
 */
export function IncludeLeaf({ stream }: { stream: IncludeStream }) {
  const { fps: parentFps, width: parentWidth, height: parentHeight } = useVideoConfig();
  const { Container } = React.useContext(ComposeContext);
  const parentAudio = React.useContext(AudioContext);
  const totalDur = stream.durationInSeconds ?? stream.actions[0]?.end ?? 1;
  useFrameEvents(stream.on, Math.max(1, Math.floor(totalDur * parentFps)));

  if (!stream.actions?.length) return null;

  // ── External JSON loading ─────────────────────────────────────────────
  const [externalData, setExternalData] = React.useState<unknown | null>(null);
  const [loadError, setLoadError] = React.useState<string | null>(null);
  const [handle] = React.useState(() =>
    stream.src ? delayRender(`Loading include: ${stream.src}`) : null,
  );

  React.useEffect(() => {
    if (!stream.src || !handle) return;
    let active = true;

    const url = resolveIncludeSrc(stream.src);

    fetch(url)
      .then((res) => {
        if (!res.ok) throw new Error(`HTTP ${res.status}: ${stream.src}`);
        return res.json();
      })
      .then((data) => {
        if (!active) return;
        // Stamp durationInSeconds on loaded data so transitions work correctly
        const streamTree = (data as any).root ?? data;
        getDurationInSeconds(streamTree as unknown as DurationStream, true);
        setExternalData(data);
        continueRender(handle);
      })
      .catch((err: unknown) => {
        if (!active) return;
        const msg = err instanceof Error ? err.message : String(err);
        setLoadError(msg);
        console.warn(`Include "${stream.src}" failed to load: ${msg}`);
        continueRender(handle);
      });

    return () => { active = false; };
  }, [stream.src, handle]);

  // Stamp durationInSeconds (for inline children legacy fallback)
  React.useMemo(() => {
    if (!stream.src) {
      getDurationInSeconds(stream as unknown as DurationStream, true);
    }
  }, [stream, stream.src]);

  // ── Include foreground audio context ─────────────────────────────
  const audioCtx = React.useMemo(
    () => ({ id: stream.id, foreground: true, parent: parentAudio }),
    [stream.id, parentAudio],
  );

  // ── External video content renderer ───────────────────────────────
  const renderExternalContent = React.useCallback(() => {
    if (!externalData) return null;
    if (loadError) {
      return (
        <div style={{ color: "#ff4444", fontSize: 24, padding: 40 }}>
          ⚠ Include load error: {loadError}
        </div>
      );
    }

    if (isSceneBased(externalData)) {
      // ── Scene-based video.json ──────────────────────────────────
      const vj = externalData;
      const vjFps = vj.meta.fps ?? parentFps;
      // Use first aspect's dimensions (default to 16x9)
      const aspectKey = (vj.meta.aspects?.[0] ?? "16x9") as keyof typeof ASPECT_DIMS;
      const dims = ASPECT_DIMS[aspectKey] ?? { width: parentWidth, height: parentHeight };

      return (
        <AbsoluteFill style={{ backgroundColor: "#0a0a0a", width: dims.width, height: dims.height }}>
          {/* Background music from video.json */}
          {vj.bgm && (
            <Audio src={vj.bgm.src} volume={vj.bgm.baseVolume} />
          )}

          {/* Per-scene rendering */}
          {vj.scenes.map((scene: any) => {
            const startFrame = Math.round((scene.start ?? 0) * vjFps);
            const durFrames = Math.round((scene.duration ?? 1) * vjFps);
            return (
              <Sequence
                key={scene.id}
                from={startFrame}
                durationInFrames={durFrames}
                name={`${scene.id}:${scene.component}`}
              >
                {/* Scene headline + subhead */}
                <AbsoluteFill
                  style={{
                    backgroundColor: "#0c0c0e",
                    display: "flex",
                    alignItems: "center",
                    justifyContent: "center",
                    padding: 60,
                  }}
                >
                  <div
                    style={{
                      color: "#fafafa",
                      fontSize: 48,
                      fontWeight: 800,
                      fontFamily: "Inter, system-ui, sans-serif",
                      textAlign: "center",
                      marginBottom: 16,
                    }}
                  >
                    {scene.props?.headline ?? scene.id}
                  </div>
                  {scene.props?.subhead && (
                    <div
                      style={{
                        color: "#a1a1aa",
                        fontSize: 28,
                        fontFamily: "Inter, system-ui, sans-serif",
                        textAlign: "center",
                      }}
                    >
                      {scene.props.subhead}
                    </div>
                  )}
                </AbsoluteFill>

                {/* Voiceover audio */}
                {scene.voiceover?.audio && (
                  <Audio src={scene.voiceover.audio} volume={1} />
                )}
              </Sequence>
            );
          })}
        </AbsoluteFill>
      );
    }

    // ── Stream tree format ─────────────────────────────────────────
    const streamTree: Root = (externalData as any).root ?? externalData;
    // Override width/height to parent-relative sizing
    const merged = {
      ...streamTree,
      width: streamTree.width ?? parentWidth,
      height: streamTree.height ?? parentHeight,
      fps: streamTree.fps ?? parentFps,
    };
    return (
      <div
        style={{
          width: merged.width,
          height: merged.height,
          overflow: "hidden",
          position: "relative",
        }}
      >
        <FolderLeaf stream={merged as any} />
      </div>
    );
  }, [externalData, loadError, parentFps, parentWidth, parentHeight]);

  // ── Action-based rendering ───────────────────────────────────────
  const renderAction = (a: IncludeStream["actions"][number]) => {
    const start = a.start ?? 0;
    const end = a.end ?? (stream.durationInSeconds ?? start + 1);
    const dur = Math.max(0.1, end - start);
    const durFrames = Math.max(1, Math.floor(parentFps * dur));

    // ── Inline children fallback (legacy) ─────────────────────────
    if (!stream.src && stream.children?.length) {
      return (
        <Sequence
          key={a.id}
          durationInFrames={durFrames}
          from={Math.floor(parentFps * start)}
          layout="none"
          showInTimeline={false}
        >
          <Container
            id={stream.id}
            type="include"
            style={{
              ...cssJS(stream.style) as React.CSSProperties,
              width: parentWidth,
              height: parentHeight,
              overflow: "hidden",
              position: "relative",
            }}
            className={`include ${toClassName(stream.id ?? "")}`}
          >
            <FolderLeaf stream={stream as any} />
          </Container>
        </Sequence>
      );
    }

    // ── External src rendering ─────────────────────────────────────
    return (
      <Sequence
        key={a.id}
        durationInFrames={durFrames}
        from={Math.floor(parentFps * start)}
        layout="none"
        showInTimeline={false}
      >
        {externalData || loadError ? (
          <div
            style={{
              width: parentWidth,
              height: parentHeight,
              overflow: "hidden",
              position: "relative",
            }}
          >
            {renderExternalContent()}
          </div>
        ) : (
          <div
            style={{
              width: parentWidth,
              height: parentHeight,
              display: "flex",
              alignItems: "center",
              justifyContent: "center",
              color: "#666",
              fontSize: 20,
              fontFamily: "monospace",
            }}
          >
            Loading… {stream.src}
          </div>
        )}
      </Sequence>
    );
  };

  return (
    <AudioContext.Provider value={audioCtx as any}>
      {stream.actions.map(renderAction)}
    </AudioContext.Provider>
  );
}
