/**
 * VariantBar — variant switcher bar for the markcut player.
 *
 * Reads available variants from /api/video-info and renders clickable links.
 * Highlights the current variant based on window.VARIANT.
 */
import * as React from "react";

export function VariantBar() {
  const [variants, setVariants] = React.useState<string[]>([]);
  const currentVariant = (typeof window !== "undefined" ? (window as any).VARIANT : null) || "default";

  React.useEffect(() => {
    fetch("/api/video-info")
      .then((r) => r.json())
      .then((info) => {
        if (info.variants && info.variants.length > 1) {
          setVariants(info.variants);
        }
      })
      .catch(() => {});
  }, []);

  if (variants.length <= 1) return null;

  return (
    <div id="variant-bar">
      {variants.map((v) => (
        <a
          key={v}
          href={`/${v === "default" ? "" : v}`}
          className={"variant-link" + (v === currentVariant ? " active" : "")}
        >
          {v}
        </a>
      ))}
    </div>
  );
}
