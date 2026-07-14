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
 * Dynamic import of a component bundle, returning the registry map.
 * Returns null if the URL is falsy or import fails.
 */
function useSubVideoRegistry(importsUrl: string | undefined):
  { registry: Record<string, React.ComponentType<any>> | null; loaded: boolean }
{
  const [registry, setRegistry] = React.useState<Record<string, React.ComponentType<any>> | null>(null);
  const [loaded, setLoaded] = React.useState(false);
  const handleRef = React.useRef<number | null>(null);

  React.useEffect(() => {
    if (!importsUrl) {
      setRegistry(null);
      setLoaded(true);
      return;
    }
    if (!handleRef.current) {
      handleRef.current = delayRender(`Loading sub-video components: ${importsUrl}`);
    }

    import(/* webpackIgnore: true */ importsUrl)
      .then((mod: any) => {
        setRegistry(mod.default ?? mod);
        setLoaded(true);
        if (handleRef.current) {
          continueRender(handleRef.current);
          handleRef.current = null;
        }
      })
      .catch((err: Error) => {
        console.warn(`Sub-video component registry failed to load: ${importsUrl}`, err);
        setLoaded(true);
        if (handleRef.current) {
          continueRender(handleRef.current);
          handleRef.current = null;
        }
      });
  }, [importsUrl]);

  return { registry, loaded };
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
 * When the loaded JSON carries its own `imports` field (component bundle URL),
 * IncludeLeaf dynamically imports the bundle and creates a nested ComposeContext
 * with the sub-video's registry merged into the parent's, so custom components
 * registered by the sub-video are available during its rendering.
 *
 * Usage:
 *   { type: "include", src: "./path/to/video.json", start: 0, end: 5 }
 */
export function IncludeLeaf({ stream }: { stream: IncludeStream }) {
  const { fps: parentFps, width: parentWidth, height: parentHeight } = useVideoConfig();
  const parentCompose = React.useContext(ComposeContext);
  const { Container } = parentCompose;
  const parentAudio = React.useContext(AudioContext);
  const start = stream.start ?? 0;
  const end = stream.end ?? (stream.durationInSeconds ?? (start + (stream.duration ?? 1)));
  const totalDur = stream.durationInSeconds ?? end;
  useFrameEvents(stream.on, Math.max(1, Math.floor(totalDur * parentFps)));

  const hasContent = !!stream.src || (stream.children?.length ?? 0) > 0;
  if (!hasContent) return null;

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

  // ── Extract sub-video imports URL from loaded data ─────────────────
  const subImportsUrl = React.useMemo<string | undefined>(() => {
    if (!externalData) return undefined;
    const root = (externalData as any).root ?? externalData;
    return root?.imports;
  }, [externalData]);

  // ── Load sub-video component registry ──────────────────────────────
  const { registry: subRegistry, loaded: subRegistryLoaded } = useSubVideoRegistry(subImportsUrl);

  // ── Merge registries: sub-video components take priority ───────────
  const mergedCompose = React.useMemo(() => {
    const parentComponents = parentCompose.components;
    if (!subRegistry) return parentCompose;
    return {
      ...parentCompose,
      components: {
        ...parentComponents,
        ...subRegistry,
      },
    };
  }, [parentCompose, subRegistry]);

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

  // ── Single-span rendering ────────────────────────────────────────
  const dur = Math.max(0.1, end - start);
  const durFrames = Math.max(1, Math.floor(parentFps * dur));

  // ── Inline children fallback (legacy) ─────────────────────────
  let innerNode: React.ReactNode;
  if (!stream.src && stream.children?.length) {
    innerNode = (
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
    );
  } else if (externalData || loadError) {
    innerNode = (
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
    );
  } else {
    innerNode = (
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
    );
  }

  const sequence = (
    <Sequence
      durationInFrames={durFrames}
      from={Math.floor(parentFps * start)}
      layout="none"
      showInTimeline={false}
    >
      {innerNode}
    </Sequence>
  );

  // ── Determine if we need a nested ComposeContext ───────────────────
  const needsNestedContext = subRegistry !== null && subRegistry !== parentCompose.components;

  const inner = (
    <AudioContext.Provider value={audioCtx as any}>
      {sequence}
    </AudioContext.Provider>
  );

  // When the sub-video has its own component registry, wrap in a nested
  // ComposeContext so its components are available to FolderLeaf.
  if (needsNestedContext && subRegistryLoaded) {
    return (
      <ComposeContext.Provider value={mergedCompose}>
        {inner}
      </ComposeContext.Provider>
    );
  }

  return inner;
}
