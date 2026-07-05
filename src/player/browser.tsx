/**
 * Browser player entry point.
 * Bundled with esbuild and served by the player server.
 * Renders stream tree JSON using @remotion/player with RemotionEngine.
 */
import React, { useRef, useEffect, useCallback } from "react";
import { createRoot } from "react-dom/client";
import { Player } from "@remotion/player";
import { RemotionEngine, getDurationInSeconds } from "../entry";

function PlayerApp() {
  const playerRef = useRef<any>(null);
  const [ready, setReady] = React.useState(false);
  const [error, setError] = React.useState<string | null>(null);
  const [data, setData] = React.useState<any>(null);
  const [refreshKey, setRefreshKey] = React.useState(0);

  // Parse URL params for agent automation
  const urlParams = new URLSearchParams(typeof window !== "undefined" ? window.location.search : "");
  const autoPlay = urlParams.get("autoplay") === "true";
  const startAt = parseFloat(urlParams.get("start") || "0") || 0;

  const loadData = useCallback(() => {
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

  useEffect(() => {
    loadData();
    const handler = () => { setRefreshKey(k => k + 1); };
    window.addEventListener("refresh-player", handler);
    return () => window.removeEventListener("refresh-player", handler);
  }, [loadData]);

  useEffect(() => {
    if (refreshKey > 0) loadData();
  }, [refreshKey, loadData]);

  // Expose seek API for external scripts (runs after each render, ref gets populated)
  useEffect(() => {
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

  const fps = data.fps || 30;
  const width = data.width || 1080;
  const height = data.height || 1920;
  const durationInSeconds = getDurationInSeconds(data, true) || 5;
  const durationInFrames = Math.max(1, Math.ceil(durationInSeconds * fps));

  return React.createElement("div", {
    style: { width: "100%", height: "100%", background: "#000" },
  },
    React.createElement(Player, {
      ref: playerRef,
      component: RemotionEngine,
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
