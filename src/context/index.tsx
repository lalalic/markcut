import * as React from "react";

export interface ComposeContextValue {
  /**
   * Wrapper rendered around every leaf stream.
   * Host can use it to add focus rings, click handlers, debug overlays.
   */
  Container: React.ComponentType<React.PropsWithChildren<{
    id: string;
    type: string;
    style?: React.CSSProperties;
    className?: string;
  }>>;
  /** Optional callback for non-fatal render errors. */
  onError?: (err: unknown, ctx: { id: string; type: string }) => void;
  /** Component registry for react-jsx-parser. Populated from root.imports. */
  components?: Record<string, React.ComponentType<any>>;
}

const DefaultContainer: ComposeContextValue["Container"] = ({ children, style }) => (
  <div style={{ position: "absolute", inset: 0, ...style }}>{children}</div>
);

export const ComposeContext = React.createContext<ComposeContextValue>({
  Container: DefaultContainer,
});

interface AudioContextValue {
  id: string;
  /** When true, sibling video/audio mute themselves. */
  foreground?: boolean;
  parent?: AudioContextValue | null;
}

export const AudioContext = React.createContext<AudioContextValue | null>(null);
