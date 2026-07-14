/**
 * SceneThumbnails — horizontal scene selector for all modes.
 *
 * Fetches scene info from /api/video-info and renders clickable thumbnails
 * with scene names. Active scene is highlighted based on currentTime.
 *
 * Layout: supported in edit and preview modes (label mode has its own).
 */
import * as React from "react";

interface Scene {
  name: string;
  start: number;
  end: number;
  duration: number;
  src: string;
  mediaType: string;
}

const VIDEO_EXT: Record<string, number> = {
  ".mov": 1, ".mp4": 1, ".avi": 1, ".mkv": 1, ".webm": 1, ".m4v": 1, ".wmv": 1,
};

interface SceneThumbnailsProps {
  /** Current player time in seconds — used to highlight active scene */
  currentTime: number;
  /** Called when a thumbnail is clicked; receives scene start time in seconds */
  onSeek?: (timeSeconds: number) => void;
}

export function SceneThumbnails({ currentTime, onSeek }: SceneThumbnailsProps) {
  const [scenes, setScenes] = React.useState<Scene[]>([]);

  React.useEffect(() => {
    fetch("/api/video-info")
      .then((r) => r.json())
      .then((info) => {
        if (info.scenes) setScenes(info.scenes);
      })
      .catch(() => {});
  }, []);

  if (scenes.length === 0) return null;

  // Determine active scene index from currentTime
  let activeIdx = -1;
  for (let i = 0; i < scenes.length; i++) {
    if (currentTime >= scenes[i].start && currentTime < scenes[i].end) {
      activeIdx = i;
      break;
    }
  }

  return (
    <div id="scene-thumbnails">
      {scenes.map((scene, i) => {
        const isActive = i === activeIdx;
        const ext = scene.src.substring(scene.src.lastIndexOf(".")).toLowerCase();
        const isVideo = !!VIDEO_EXT[ext];
        const hasMedia = !!scene.src;

        return (
          <div
            key={i}
            className={"sthumb-item" + (isActive ? " active" : "")}
            onClick={() => onSeek?.(scene.start)}
          >
            <div className="sthumb-media">
              {hasMedia && !isVideo && (
                <img src={scene.src} alt="" loading="lazy" />
              )}
              {hasMedia && isVideo && (
                <video src={scene.src} muted preload="metadata" />
              )}
              {!hasMedia && (
                <span className="sthumb-fallback">
                  {(scene.name || "S" + (i + 1)).slice(0, 2).toUpperCase()}
                </span>
              )}
            </div>
            <span className="sthumb-name">{scene.name || "Scene " + (i + 1)}</span>
          </div>
        );
      })}
    </div>
  );
}
