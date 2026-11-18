/**
 * Native preview video selector. All compiled outputs live under one control:
 * original film, named Markdown variants and the optional Editor Decisions.
 */
import * as React from "react";

export function VariantBar() {
  const [variants, setVariants] = React.useState<string[]>([]);
  const currentVariant = (typeof window !== "undefined" ? (window as any).VARIANT : null) || "default";

  React.useEffect(() => {
    fetch("/api/video-info")
      .then((response) => response.json())
      .then((info) => {
        if (Array.isArray(info.variants) && info.variants.length > 1) setVariants(info.variants);
      })
      .catch(() => {});
  }, []);

  if (variants.length <= 1) return null;

  return <select
    id="video-selector"
    aria-label="Video selector"
    title="Select video"
    value={currentVariant}
    onChange={event => {
      const variant=event.currentTarget.value;
      window.location.assign(variant==="default"?"/":"/"+encodeURIComponent(variant));
    }}
    style={{maxWidth:190,minWidth:110,padding:"6px 28px 6px 10px",background:"#20252e",color:"#eee",
      border:"1px solid #414955",borderRadius:8,fontSize:12,cursor:"pointer",textOverflow:"ellipsis"}}
  >
    {variants.map(variant =>
      <option value={variant} key={variant}>{variant==="default"?"Original":variant==="editor-decisions"?"Editor Decisions":variant}</option>
    )}
  </select>;
}
