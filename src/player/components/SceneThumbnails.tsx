/**
 * SceneThumbnails — horizontal scene selector for all modes.
 *
 * Fetches scene info from /api/video-info and renders clickable scene name pills.
 * Active scene is highlighted based on currentTime.
 */
import * as React from "react";

interface Scene {
  name: string;
  start: number;
  end: number;
}

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
        return (
          <span
            key={i}
            className={"scene-pill" + (isActive ? " active" : "")}
            onClick={() => onSeek?.(scene.start)}
          >
            {scene.name || "Scene " + (i + 1)}
          </span>
        );
      })}
    </div>
  );
}
