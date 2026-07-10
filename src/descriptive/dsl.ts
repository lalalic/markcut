/**
 * Line-level DSL parsing primitives for the descriptive markdown format.
 *
 * This module is intentionally free of markdown-structure concerns (headings,
 * bullet lists, indentation, frontmatter). It deals only with turning a single
 * line of text into typed key/value attributes:
 *
 *   "video src:a.mp4 duration:2 effects:[fadeIn]"  →  { src, duration, effects }
 *
 * The markdown structure layer (`markdown.ts`) uses remark for the hard part
 * (nesting, code fences, frontmatter) and delegates each line here.
 *
 * Error handling: all thrown errors are {@link DslError} instances carrying
 * optional source position so the markdown layer can pinpoint failures.
 *
 * @module
 */

import type { DescriptiveMapWaypoint } from "./compiler";

// ---------------------------------------------------------------------------
// Validation constant sets
// ---------------------------------------------------------------------------

export const LAYOUT_VALUES = new Set([
  "series",
  "parallel",
  "transitionSeries",
  "transition",
] as const);

export const TRANSITION_VALUES = new Set([
  "fade",
  "slide",
  "wipe",
  "flip",
  "clockWipe",
] as const);

// ---------------------------------------------------------------------------
// Error handling
// ---------------------------------------------------------------------------

/** Optional source-location context threaded through the DSL parsers. */
export interface ParseContext {
  /** 1-based source line number, for error messages. */
  line?: number;
  /** Raw source text of the line being parsed, for error display. */
  lineText?: string;
}

/**
 * Error thrown by the DSL layer. Carries optional source context so callers
 * (the markdown structure layer) can report precise locations to users.
 *
 * Example rendered message:
 *   invalid layout value: sideays at line 8
 *     | layout:sideays
 */
export class DslError extends Error {
  constructor(
    message: string,
    public readonly context?: ParseContext & { token?: string },
  ) {
    const parts: string[] = [message];
    if (context?.line) parts.push(`at line ${context.line}`);
    if (context?.token) parts.push(`near "${context.token}"`);
    const head = parts.join(" ");
    const src = context?.lineText ? `\n  | ${context.lineText}` : "";
    super(src ? `${head}\n${src}` : head);
    this.name = "DslError";
  }
}

function fail(message: string, ctx?: ParseContext & { token?: string }): never {
  throw new DslError(message, ctx);
}

// ---------------------------------------------------------------------------
// String helpers
// ---------------------------------------------------------------------------

/** True when a token is wrapped in double quotes (e.g. `"hello world"`). */
export function isQuoted(token: string): boolean {
  return token.length >= 2 && token.startsWith('"') && token.endsWith('"');
}

/** Strip surrounding double quotes from a token, if present. */
export function unquote(token: string): string {
  return isQuoted(token) ? token.slice(1, -1) : token;
}

// ---------------------------------------------------------------------------
// Tokenizer
// ---------------------------------------------------------------------------

/**
 * Split a line into whitespace-delimited tokens while respecting:
 *  - double-quoted spans: `a "b c" d`  →  ["a", "\"b c\"", "d"]
 *  - bracket nesting:     `subtitle:{a:1 b:2}`  →  one token
 *  - paren nesting:       `on:(start, x.y=1)`  →  one token
 *
 * Quotes and brackets inside the respective delimiters are kept intact.
 */
export function splitTokens(line: string): string[] {
  const out: string[] = [];
  let cur = "";
  let quote = false;
  let depth = 0;

  for (let i = 0; i < line.length; i++) {
    const ch = line[i]!;
    if (ch === '"') {
      cur += ch;
      quote = !quote;
      continue;
    }
    if (!quote && (ch === "{" || ch === "[" || ch === "(")) {
      depth++;
      cur += ch;
      continue;
    }
    if (!quote && (ch === "}" || ch === "]" || ch === ")")) {
      depth = Math.max(0, depth - 1);
      cur += ch;
      continue;
    }
    if (!quote && depth === 0 && /\s/.test(ch)) {
      if (cur) {
        out.push(cur);
        cur = "";
      }
      continue;
    }
    cur += ch;
  }
  if (cur) out.push(cur);
  return out;
}

// ---------------------------------------------------------------------------
// Scalar coercion
// ---------------------------------------------------------------------------

/**
 * Coerce a raw string into a number/boolean when it looks like one, otherwise
 * return the string unchanged. Used for unquoted scalar values like
 * `duration:2`, `loop:true`, `volume:0.8`.
 */
export function parseNumberMaybe(v: string): number | string | boolean {
  if (v === "true") return true;
  if (v === "false") return false;
  const n = Number(v);
  return Number.isFinite(n) ? n : v;
}

// ---------------------------------------------------------------------------
// Structured value parsers (return empty/undefined on malformed input)
// ---------------------------------------------------------------------------

/**
 * Parse a map `waypoints:[...]` value into an array of waypoints.
 *
 * Format: `[lat,lng,"Label"; lat,lng,"Label"]` — semicolon-separated entries,
 * comma-separated fields. Returns `[]` on any structural mismatch.
 */
export function parseWaypoints(raw: string): DescriptiveMapWaypoint[] {
  const s = raw.trim();
  if (!s.startsWith("[") || !s.endsWith("]")) return [];
  const body = s.slice(1, -1).trim();
  if (!body) return [];
  return body.split(";").map((part) => {
    const bits = splitTokens(part.replace(/,/g, " "));
    const lat = Number(bits[0] ?? 0);
    const lng = Number(bits[1] ?? 0);
    const labelRaw = bits[2];
    const label = labelRaw ? unquote(labelRaw) : undefined;
    return { lat, lng, label };
  });
}

/**
 * Parse a JSON-like props/imports string into an object or array.
 *
 * Accepts standard JSON, then falls back to a lenient two-pass normalization
 * that quotes bare keys (`{foo:` → `{"foo":`) and bare string values, and
 * finally to `eval` for JSX-like expressions. Returns `{}` on total failure.
 */
export function parseProps(raw: string): unknown {
  const s = raw.trim();
  if (!s.startsWith("{") && !s.startsWith("[")) return {};
  if (!s.endsWith("}") && !s.endsWith("]")) return {};
  try {
    return JSON.parse(s);
  } catch {
    // Lenient parse: add quotes around unquoted keys and string values.
    // First pass: quote bare keys: {foo: → {"foo":
    let normalized = s.replace(
      /([{,]\s*)([a-zA-Z_$][a-zA-Z0-9_$]*)\s*:(?=\s*["{[]?)/g,
      '$1"$2":',
    );
    // Second pass: quote bare string values that aren't numbers, booleans, or null
    // Matches :value followed by , } ] or end
    normalized = normalized.replace(
      /:\s*([a-zA-Z_$][a-zA-Z0-9_$.+-]*)\s*(?=[,}\]\s]|$)/g,
      (_match, value: string) => {
        if (value === "true" || value === "false" || value === "null") return `: ${value}`;
        if (/^[+-]?\d+(\.\d+)?$/.test(value)) return `: ${value}`;
        return `: "${value}"`;
      },
    );
    try {
      return JSON.parse(normalized);
    } catch {
      // Last resort: eval (safe since this is a CLI tool)
      try {
        const result = (0, eval)("(" + s + ")");
        return typeof result === "object" && result !== null ? result : {};
      } catch {
        return {};
      }
    }
  }
}

/**
 * Parse an `on:(when, code)` event spec.
 *
 * Positional arguments: first is the when-trigger, second is the state code.
 * Example: `on:(start, slide1.current=1)` → `{ when: "start", state: "slide1.current=1" }`.
 * Returns `undefined` on structural mismatch.
 */
export function parseOnSpec(
  raw: string,
): { when: string; state: string } | undefined {
  const s = raw.trim();
  if (!s.startsWith("(") || !s.endsWith(")")) return undefined;
  const body = s.slice(1, -1).trim();
  if (!body) return undefined;

  const parts: string[] = [];
  let current = "";
  let depth = 0;
  let inQuote = false;

  for (let i = 0; i < body.length; i++) {
    const ch = body[i]!;
    if (ch === '"') {
      inQuote = !inQuote;
      current += ch;
      continue;
    }
    if (!inQuote) {
      if (ch === "(") {
        depth++;
        current += ch;
        continue;
      }
      if (ch === ")") {
        depth--;
        current += ch;
        continue;
      }
      if (ch === "," && depth === 0) {
        parts.push(current.trim());
        current = "";
        continue;
      }
    }
    current += ch;
  }
  if (current.trim()) parts.push(current.trim());

  if (parts.length >= 2) {
    return { when: parts[0]!, state: parts.slice(1).join(",") };
  }
  return undefined;
}

/**
 * Parse an `effects:[...]` value into an array of effect spec strings.
 *
 * Supports:
 *   effects:[fadeIn]
 *   effects:[fadeIn, bounceIn]
 *   effects:[fadeIn(timingFunction:ease-out iterationCount:2)]
 *
 * Each element is kept as a raw string — the compiler's `normalizeEffectSpec`
 * handles parsing the paren-based params. Returns `[]` on structural mismatch.
 */
export function parseEffects(raw: string): string[] {
  const s = raw.trim();
  if (!s.startsWith("[") || !s.endsWith("]")) return [];
  const body = s.slice(1, -1).trim();
  if (!body) return [];

  const results: string[] = [];
  let current = "";
  let depth = 0; // brackets/braces
  let parenDepth = 0; // parens for params
  let inQuote = false;

  for (let i = 0; i < body.length; i++) {
    const ch = body[i]!;
    if (ch === '"') {
      inQuote = !inQuote;
      current += ch;
      continue;
    }
    if (!inQuote) {
      if (ch === "[" || ch === "{") {
        depth++;
        current += ch;
        continue;
      }
      if (ch === "]" || ch === "}") {
        depth = Math.max(0, depth - 1);
        current += ch;
        continue;
      }
      if (ch === "(") {
        parenDepth++;
        current += ch;
        continue;
      }
      if (ch === ")") {
        parenDepth = Math.max(0, parenDepth - 1);
        current += ch;
        continue;
      }
      if (ch === "," && depth === 0 && parenDepth === 0) {
        const trimmed = current.trim();
        if (trimmed) results.push(trimmed);
        current = "";
        continue;
      }
    }
    current += ch;
  }
  const trimmed = current.trim();
  if (trimmed) results.push(trimmed);

  return results;
}

// ---------------------------------------------------------------------------
// Key/value dispatcher
// ---------------------------------------------------------------------------

/**
 * Keys whose raw values should be preserved verbatim (no scalar coercion or
 * object parsing). These are free-form text fields.
 */
const RAW_STRING_KEYS = new Set(["instruction", "tts", "stt", "jsx", "prompt"]);

/**
 * Keys whose values are lenient JSON objects/arrays.
 */
const OBJECT_KEYS = new Set([
  "props",
  "imports",
  "components",
  "spots",
  "customKeyframes",
]);

/**
 * Parse an array of tokens (from {@link splitTokens}) into a key/value bag.
 *
 * All attributes use the `key:value` form:
 *   `src:a.mp4`, `duration:2`, `on:(start, x.y=1)`, `effects:[fadeIn]`
 *
 * Value normalization is key-specific:
 *  - `layout` / `transition`: validated against the enum sets (throws on
 *    invalid), with `transition` accepting the merged `fade(0.5)` form
 *  - `waypoints` / `on` / `effects` / object keys: dispatched to their
 *    dedicated parsers
 *  - inline `{...}` / `[...]` values: parsed as lenient JSON
 *  - everything else: scalar coercion via {@link parseNumberMaybe}
 *
 * Throws {@link DslError} (with optional context) on unrecognized tokens or
 * invalid enum values.
 *
 * @param tokens  Token array, typically from `splitTokens(line)`.
 * @param ctx     Optional source context for error messages.
 */
export function parseKeyValueTokens(
  tokens: string[],
  ctx?: ParseContext,
): Record<string, unknown> {
  const out: Record<string, unknown> = {};
  let i = 0;

  while (i < tokens.length) {
    const token = tokens[i]!;
    const idx = token.indexOf(":");
    if (idx > 0) {
      const key = token.slice(0, idx);
      let rawVal = token.slice(idx + 1);
      // If value after colon is empty, peek at next quoted token
      if (!rawVal && i + 1 < tokens.length) {
        const next = tokens[i + 1]!;
        if (isQuoted(next)) {
          rawVal = next;
          i++; // consume the next token
        }
      }
      let val: unknown = unquote(rawVal);

      if (key === "layout") {
        const s = String(val);
        if (!LAYOUT_VALUES.has(s as (typeof LAYOUT_VALUES extends Set<infer T> ? T : never)))
          fail(`invalid layout value: ${s}`, { ...ctx, token });
        val = s;
      }
      if (key === "transition") {
        const s = String(val);
        // Support "name(time)" format e.g. "fade(0.5)" to merge transition + transitionTime
        const parenMatch = s.match(/^(\w+)\((\d+(?:\.\d+)?)\)$/);
        if (parenMatch) {
          const [, name, timeStr] = parenMatch;
          if (!TRANSITION_VALUES.has(name as (typeof TRANSITION_VALUES extends Set<infer T> ? T : never)))
            fail(`invalid transition value: ${name}`, { ...ctx, token });
          out["transition"] = name;
          out["transitionTime"] = Number(timeStr);
          i++;
          continue;
        }
        if (!TRANSITION_VALUES.has(s as (typeof TRANSITION_VALUES extends Set<infer T> ? T : never)))
          fail(`invalid transition value: ${s}`, { ...ctx, token });
      }

      if (key === "waypoints") val = parseWaypoints(String(val));
      else if (OBJECT_KEYS.has(key)) val = parseProps(String(val));
      else if (key === "on") val = parseOnSpec(String(val));
      else if (key === "effects") val = parseEffects(String(val));
      else if (!RAW_STRING_KEYS.has(key)) {
        const strVal = String(val);
        // If the value looks like an inline JSON object/array, parse it as props
        if (strVal.startsWith("{") || strVal.startsWith("[")) {
          val = parseProps(strVal);
        } else {
          val = parseNumberMaybe(strVal);
        }
      }
      out[key] = val;
      i++;
      continue;
    }

    fail(`unrecognized token: ${token}`, { ...ctx, token });
  }

  return out;
}
