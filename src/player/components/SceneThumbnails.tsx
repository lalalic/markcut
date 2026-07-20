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
    const variant = (window as any).VARIANT || "default";
    const url = variant !== "default" ? `/api/video-info?variant=${variant}` : "/api/video-info";
    fetch(url)
      .then((r) => r.json())
      .then((info) => {
        if (info.scenes) setScenes(info.scenes);
      })
      .catch(() => {});
  }, []);

  if (scenes.length === 0) return null;

  // With transition overlaps, scenes can overlap in time (scene[i].end > scene[i+1].start).
  // Iterate backward so the latest scene whose start <= currentTime wins — i.e., as
  // soon as the next scene starts (during a transition), it becomes the active one.
  let activeIdx = -1;
  for (let i = scenes.length - 1; i >= 0; i--) {
    if (currentTime >= scenes[i].start) {
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
