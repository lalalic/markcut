/**
 * Event System — cross-node state event context.
 *
 * Lets any node in the stream tree mutate a named component's state at runtime
 * via `on` event specs. Events fire at specific frames (start, end, 50%, 2.5s)
 * and evaluate JS expressions with registered component proxies in scope.
 *
 * Usage in markdown:
 *   - component id:slide1 jsx:"<Slide current={current}>{source}</Slide>"
 *   - script "Narration 1" on:[{when:start, state:"slide1.current=0"}]
 *   - script "Narration 2" on:[{when:start, state:"slide1.current++"}]
 */

import * as React from "react";
import { useCurrentFrame, useVideoConfig } from "remotion";
import type { EventSpec } from "../schema/index";

interface EventContextValue {
  register: (id: string, setState: (partial: Record<string, any>) => void) => void;
  unregister: (id: string) => void;
  evaluate: (code: string) => void;
}

const EventContext = React.createContext<EventContextValue | null>(null);

/**
 * Creates a Proxy wrapper around a target object.
 * The `set` trap calls `setState` so React re-renders when the proxy is mutated.
 */
function createComponentProxy(
  target: Record<string, any>,
  setState: (partial: Record<string, any>) => void,
): Record<string, any> {
  return new Proxy(target, {
    set(obj, prop, value) {
      obj[prop] = value;
      setState({ [prop]: value });
      return true;
    },
    get(obj, prop) {
      if (typeof prop === "string" && prop in obj) return obj[prop];
      return undefined;
    },
  });
}

/**
 * Wraps the render tree, maintaining a registry of named component proxies.
 * Each registered component gets a Proxy whose setter triggers React re-render.
 */
export function EventProvider({ children }: { children: React.ReactNode }) {
  const registryRef = React.useRef<
    Map<string, { proxy: Record<string, any>; setState: (partial: Record<string, any>) => void }>
  >(new Map());

  const register = React.useCallback(
    (id: string, setState: (partial: Record<string, any>) => void) => {
      const target: Record<string, any> = {};
      const proxy = createComponentProxy(target, setState);
      registryRef.current.set(id, { proxy, setState });
    },
    [],
  );

  const unregister = React.useCallback((id: string) => {
    registryRef.current.delete(id);
  }, []);

  const evaluate = React.useCallback((code: string) => {
    const scope: Record<string, any> = {};
    for (const [id, reg] of registryRef.current) {
      scope[id] = reg.proxy;
    }
    const keys = Object.keys(scope);
    const vals = Object.values(scope);
    try {
      const fn = new Function(...keys, code);
      fn(...vals);
      console.info(`Event evaluation succeeded: "${code}"`);
    } catch (err) {
      console.warn(`Event evaluation failed: "${code}"`, err);
    }
  }, []);

  const value = React.useMemo(
    () => ({ register, unregister, evaluate }),
    [register, unregister, evaluate],
  );

  return (
    <EventContext.Provider value={value}>
      {children}
    </EventContext.Provider>
  );
}

/**
 * Hook to access the event context.
 */
export function useEventContext(): EventContextValue {
  const ctx = React.useContext(EventContext);
  if (!ctx) {
    throw new Error("useEventContext must be used within an EventProvider");
  }
  return ctx;
}

/**
 * Convert a `when` string to an absolute frame number.
 *
 * Supported formats:
 *   'start'   → 0
 *   'end'     → durationInFrames
 *   '50%'     → 50% of durationInFrames
 *   '2.5s'    → 2.5 * fps
 */
export function resolveWhenToFrame(
  when: string,
  durationInFrames: number,
  fps: number,
): number {
  if (when === "start") return 0;
  if (when === "end") return durationInFrames;

  // Percentage: "50%", "100%"
  const pct = /^(\d+(?:\.\d+)?)%$/.exec(when);
  if (pct) {
    return Math.floor((Number(pct[1]) / 100) * durationInFrames);
  }

  // Seconds: "2.5s", "0s"
  const sec = /^(\d+(?:\.\d+)?)s$/.exec(when);
  if (sec) {
    return Math.floor(Number(sec[1]) * fps);
  }

  console.warn(`Unknown when format: "${when}", defaulting to start`);
  return 0;
}

/**
 * Hook that fires events at the correct frame.
 *
 * @param on - Array of event specs from the stream node
 * @param durationInFrames - Duration of the node in frames (used to compute target frames)
 */
export function useFrameEvents(
  on: EventSpec[] | undefined,
  durationInFrames: number,
): void {
  const frame = useCurrentFrame();
  const { fps } = useVideoConfig();
  const { evaluate } = useEventContext();
  const handledFramesRef = React.useRef<Set<number>>(new Set());

  React.useEffect(() => {
    if (!on || on.length === 0 || durationInFrames <= 0) return;

    for (const ev of on) {
      const targetFrame = resolveWhenToFrame(ev.when, durationInFrames, fps);
      if (frame === targetFrame && !handledFramesRef.current.has(frame)) {
        handledFramesRef.current.add(frame);
        evaluate(ev.state);
      }
    }

    // Clean up handled frames that are in the past so they can fire again
    // if the component re-mounts. Keep only frames >= current.
    for (const f of handledFramesRef.current) {
      if (f < frame) handledFramesRef.current.delete(f);
    }
  }, [frame, on, durationInFrames, fps, evaluate]);
}
