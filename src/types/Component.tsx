import * as React from "react";
import { Sequence, useVideoConfig } from "remotion";
import { ComposeContext, useEventContext, useFrameEvents } from "../context/index";
import JsxParser from "react-jsx-parser";
import { useTweenBindings } from "../utils/tween";
import type { Component, EventSpec } from "../schema/index";

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

  return (
    <>
      <JsxParser
        components={components as any}
        bindings={React.useMemo(() => ({ ...data, ...tweenBindings }), [data, tweenBindings])}
        jsx={jsx}
        renderInWrapper={false}
        blacklistedAttrs={[]}
        disableKeyGeneration={true}
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

  if (!stream.jsx) {
    // Event-only stub: no JSX to render, but may fire events on `on`.
    // Still needs EventAwareComponent for useFrameEvents to register
    // and fire at the right frame.
    const start = stream.start ?? 0;
    const end = stream.end ?? start + (stream.duration ?? 1);
    const durFrames = Math.max(1, Math.floor(fps * (end - start)));
    return (
      <Sequence
        durationInFrames={durFrames}
        from={Math.floor(fps * start)}
        layout="none"
      >
        <EventAwareComponent
          jsx=""
          components={components}
          data={bindings}
          action={{ start, end }}
          durFrames={durFrames}
          on={stream.on}
        />
      </Sequence>
    );
  }

  const start = stream.start ?? 0;
  const end = stream.end ?? start + (stream.duration ?? 1);
  const durFrames = Math.max(1, Math.floor(fps * (end - start)));

  return (
    <Sequence
      durationInFrames={durFrames}
      from={Math.floor(fps * start)}
      layout="none"
    >
      <EventAwareComponent
        jsx={stream.jsx}
        components={components}
        data={bindings}
        action={{ start, end }}
        durFrames={durFrames}
        on={stream.on}
      />
    </Sequence>
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
  on?: EventSpec;
}) {
  // Fire events at the right frame for this node's timeline
  useFrameEvents(on, durFrames);

  // If no JSX, this is an event-only stub — nothing to render
  if (!jsx) return null;

  return (
    <TweenedJsxParser
      jsx={jsx}
      components={components}
      data={data}
      action={action}
    />
  );
}
