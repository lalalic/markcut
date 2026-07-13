// A test remote component for dynamic loading
// Uses window.__React and window.__Remotion injected by DynamicLoader
const _React = (typeof window !== "undefined" && window.__React) || (typeof React !== "undefined" ? React : require("react"));
const _Remotion = (typeof window !== "undefined" && window.__Remotion) || (typeof remotion !== "undefined" ? remotion : require("remotion"));
const { useCurrentFrame, useVideoConfig, interpolate } = _Remotion;

function RemoteCounter() {
  const frame = useCurrentFrame();
  const { fps } = useVideoConfig();
  const seconds = Math.floor(frame / fps);
  
  const opacity = interpolate(frame, [0, fps * 0.5], [0, 1], {
    extrapolateRight: "clamp",
  });
  
  const scale = interpolate(frame, [0, fps * 0.3], [0.8, 1], {
    extrapolateRight: "clamp",
  });
  
  const count = interpolate(frame, [0, fps * 3], [0, 100], {
    extrapolateRight: "clamp",
  });

  return _React.createElement(
    "div",
    {
      style: {
        display: "flex",
        flexDirection: "column",
        alignItems: "center",
        justifyContent: "center",
        width: "100%",
        height: "100%",
        background: "linear-gradient(135deg, #667eea 0%, #764ba2 100%)",
        opacity,
        transform: `scale(${scale})`,
        fontFamily: "system-ui, sans-serif",
        color: "white",
      },
    },
    _React.createElement(
      "div",
      {
        style: {
          fontSize: 200,
          fontWeight: 900,
          lineHeight: 1,
          textShadow: "0 4px 20px rgba(0,0,0,0.3)",
        },
      },
      Math.round(count)
    ),
    _React.createElement(
      "div",
      {
        style: {
          fontSize: 48,
          fontWeight: 300,
          marginTop: 20,
          letterSpacing: 4,
          textTransform: "uppercase",
        },
      },
      "Remote Component"
    ),
    _React.createElement(
      "div",
      {
        style: {
          fontSize: 28,
          marginTop: 40,
          opacity: 0.7,
        },
      },
      `Frame ${frame} | ${seconds}s`
    )
  );
}

// CJS export
if (typeof module !== "undefined" && module.exports) {
  module.exports = RemoteCounter;
  module.exports.default = RemoteCounter;
}
// ESM-like default
RemoteCounter.default = RemoteCounter;
