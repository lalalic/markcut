import * as React from "react";
import { Sequence, useVideoConfig } from "remotion";
import { ComposeContext, useEventContext, useFrameEvents } from "../context/index";
import JsxParser from "react-jsx-parser";
import { useTweenBindings } from "../utils/tween";
import type { Component } from "../schema/index";

/** Find uppercase tag names in JSX that look like component references. */
function findUnknownComponentTags(jsx: string, registered: Record<string, unknown> | undefined): string[] {
  const tags = new Set<string>();
  // Match <TagName or <TagName attr or </TagName>
  const re = /<\s*\/?\s*([A-Z][a-zA-Z0-9]*)/g;
  let m;
  while ((m = re.exec(jsx)) !== null) {
    const tag = m[1]!;
    if (!registered?.[tag]) tags.add(tag);
  }
  return [...tags].sort();
}

/**
 * Wraps JsxParser with tween bindings for the current action.
 * Must be a separate component so useTweenBindings follows Rules of Hooks.
 */
function TweenedJsxParser({
  jsx,
  components,
  data,
  action,
}: {
  jsx: string;
  components: Record<string, React.ComponentType<any>> | undefined;
  data: Record<string, unknown> | undefined;
  action: { start?: number; end?: number };
}) {
  const tweenBindings = useTweenBindings(action);
  const unknownTags = React.useMemo(() => findUnknownComponentTags(jsx, components), [jsx, components]);
  const [jsxError, setJsxError] = React.useState<string | null>(null);

  return (
    <>
      {unknownTags.length > 0 && (
        <div style={{
          position: "absolute", top: 0, left: 0, right: 0,
          background: "rgba(255, 200, 0, 0.85)", color: "#000",
          padding: "6px 12px", fontSize: 12, fontFamily: "monospace",
          zIndex: 100, whiteSpace: "pre-wrap", wordBreak: "break-all",
        }}>
          ⚠ Missing component{unknownTags.length > 1 ? "s" : ""}: {unknownTags.join(", ")}
          {components ? ` (${Object.keys(components).length} registered)` : " (0 registered)"}
        </div>
      )}
      {jsxError && (
        <div style={{ color: "red", padding: 20, fontSize: "larger" }}>{jsxError}</div>
      )}
      <JsxParser
        style={{ width: "100%", height: "100%" }}
        components={components}
        bindings={{ ...data, ...tweenBindings }}
        jsx={jsx}
        blacklistedAttrs={[]}
        disableKeyGeneration={true}
        onError={error => {
    console.warn({jsx, error: error.message});
    setJsxError(error.message);
  }}
        renderError={({ error }) => <div style={{ color: "red", padding: 20, fontSize: "larger" }}>{error}</div>}
      />
    </>
  );
}

/**
 * Component leaf — renders a JSX usage expression at runtime.
 * Component tag names are resolved from ComposeContext.components
 * (populated by the engine from root.imports).
 *
 * If the component has an `id`, it registers itself in EventContext so other
 * nodes can mutate its state via `on` event specs.
 */
export function ComponentLeaf({ stream }: { stream: Component }) {
  const { fps } = useVideoConfig();
  const { components } = React.useContext(ComposeContext);
  const eventCtx = useEventContext();

  // Event-based state: other nodes can mutate this component's state
  // via registered proxies in the event system.
  const [eventState, setEventState] = React.useState<Record<string, any>>({});

  // Use useLayoutEffect so registration completes BEFORE any useFrameEvents
  // useEffect fires. Otherwise, at frame 0 the audio node's useFrameEvents
  // evaluates "slide1.current=1" before this component has registered.
  React.useLayoutEffect(() => {
    if (stream.id) {
      eventCtx.register(stream.id, (partial) =>
        setEventState((prev) => ({ ...prev, ...partial })),
      );
      return () => eventCtx.unregister(stream.id);
    }
  }, [stream.id, eventCtx]);

  // Merge: components registry → stream data (from code fences) → event state
  const bindings = React.useMemo(
    () => ({ ...components, ...stream.data, ...eventState }),
    [stream.data, components, eventState],
  );

  if (!stream.jsx) return null;

  return (
    <>
      {stream.actions.map((a) => {
        const start = a.start ?? 0;
        const end = a.end ?? start + 1;
        const durFrames = Math.max(1, Math.floor(fps * (end - start)));
        return (
          <Sequence
            key={a.id}
            durationInFrames={durFrames}
            from={Math.floor(fps * start)}
            layout="none"
          >
            <EventAwareComponent
              jsx={stream.jsx}
              components={components}
              data={bindings}
              action={a}
              durFrames={durFrames}
              on={stream.on}
            />
          </Sequence>
        );
      })}
    </>
  );
}

/**
 * Inner component that uses useFrameEvents (which requires useCurrentFrame).
 * Must be separate so the hook is called inside Sequence context.
 */
function EventAwareComponent({
  jsx,
  components,
  data,
  action,
  durFrames,
  on,
}: {
  jsx: string;
  components: Record<string, React.ComponentType<any>> | undefined;
  data: Record<string, unknown> | undefined;
  action: { start?: number; end?: number };
  durFrames: number;
  on?: Component["on"];
}) {
  // Fire events at the right frame for this node's timeline
  useFrameEvents(on, durFrames);

  return (
    <TweenedJsxParser
      jsx={jsx}
      components={components}
      data={data}
      action={action}
    />
  );
}
