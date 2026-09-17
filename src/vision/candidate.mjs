import { createHash } from "node:crypto";
import {
  existsSync, mkdirSync, readFileSync, statSync, writeFileSync,
} from "node:fs";
import { basename, dirname, extname, join, resolve } from "node:path";
import { z } from "zod";
import { execSync } from "node:child_process";
import { VIDEO_EXTS, DEFAULT_VTT_SAMPLE_INTERVAL } from "../config.mjs";

export const CANDIDATE_CONTRACT_VERSION = 1;

const evidence = z.object({
  start: z.number().finite().min(0),
  end: z.number().finite().gt(0),
  observation: z.string().min(1),
  evidence: z.string().min(1),
}).refine((item) => item.end > item.start, { message: "evidence end must exceed start" });

const evidenceItem = z.object({
  start: z.number().finite().min(0),
  end: z.number().finite().gt(0),
  label: z.string().min(1),
  observation: z.string().min(1),
  evidence: z.string().min(1),
}).refine((item) => item.end > item.start, { message: "timestamped item end must exceed start" });

const observationsSchema = z.object({
  summary: z.string().min(1),
  speech: z.object({
    supplied: z.boolean(),
    speakers: z.array(z.string()),
    keyQuoteAlignment: z.array(z.object({
      quote: z.string().min(1),
      start: z.number().finite().min(0),
      end: z.number().finite().gt(0),
      alignment: z.string().min(1),
      evidence: z.string().min(1),
    }).refine((item) => item.end > item.start)),
  }),
  people: z.array(z.object({
    label: z.string().min(1),
    position: z.string().min(1),
    faceVisible: z.enum(["yes", "partial", "no", "unclear"]),
    clarity: z.enum(["high", "medium", "low", "unclear"]),
    emotion: z.string(),
    reaction: z.string(),
    action: z.string(),
    evidence: z.string().min(1),
  })),
  scenes: z.array(z.object({
    start: z.number().finite().min(0),
    end: z.number().finite().gt(0),
    event: z.string().min(1),
    onScreenText: z.array(z.string()),
    shotChange: z.boolean(),
    visualQuality: z.enum(["high", "acceptable", "low", "unclear"]),
    audioQuality: z.enum(["high", "acceptable", "low", "unclear"]),
    evidence: z.string().min(1),
  }).refine((item) => item.end > item.start)),
  narrative: z.object({
    setup: evidence.nullable(),
    tension: evidence.nullable(),
    turn: evidence.nullable(),
    payoff: evidence.nullable(),
    selfContained: z.boolean(),
    contextNeeded: z.string(),
  }),
  hooks: z.array(evidenceItem),
  emotionalHighlights: z.array(evidenceItem),
  weakRegions: z.array(evidenceItem),
  suggestedCuts: z.array(z.object({
    start: z.number().finite().min(0),
    end: z.number().finite().gt(0),
    rationale: z.string().min(1),
    evidence: z.string().min(1),
  }).refine((item) => item.end > item.start)),
  verticalFit: z.object({
    suitability: z.enum(["good", "acceptable", "poor", "unclear"]),
    cropFeasibility: z.enum(["good", "acceptable", "poor", "unclear"]),
    trackingFeasibility: z.enum(["good", "acceptable", "poor", "unclear"]),
    subjectSafety: z.string().min(1),
    evidence: z.string().min(1),
  }),
  editSuggestions: z.array(z.object({
    type: z.enum(["punch-in", "b-roll", "caption-emphasis"]),
    start: z.number().finite().min(0),
    end: z.number().finite().gt(0),
    suggestion: z.string().min(1),
    evidence: z.string().min(1),
  }).refine((item) => item.end > item.start)),
  observableEvidence: z.array(z.object({
    start: z.number().finite().min(0),
    end: z.number().finite().gt(0),
    observation: z.string().min(1),
    evidence: z.string().min(1),
  }).refine((item) => item.end > item.start)),
  uncertainty: z.array(z.object({
    claim: z.string().min(1),
    reason: z.string().min(1),
  })).min(1),
}).strict();

function emitInfo(message) { console.error(message); }

function shQuote(value) {
  return `'${String(value).replace(/'/g, "'\\''")}'`;
}

function run(command, options = {}) {
  return execSync(command, {
    encoding: "utf-8",
    stdio: ["pipe", "pipe", "pipe"],
    timeout: 300_000,
    ...options,
  });
}

function fingerprint(path) {
  try {
    const stats = statSync(path);
    return `${stats.mtimeMs}:${stats.size}`;
  } catch {
    return "0:0";
  }
}

function durationOf(path) {
  const output = run(`ffprobe -v error -show_entries format=duration -of default=noprint_wrappers=1:nokey=1 ${shQuote(path)}`, { timeout: 30_000 });
  return Number.parseFloat(output.trim()) || 0;
}

function normalizeWhitespace(value) {
  return String(value).replace(/\s+/g, " ").trim();
}

function strictJsonParse(raw) {
  const text = String(raw ?? "").trim();
  const fenceMatch = text.match(/^```(?:json)?\s*\n([\s\S]*?)\n?```\s*$/i);
  const candidate = fenceMatch ? fenceMatch[1] : text;
  if (!/^\{/.test(candidate) || !/\}$/.test(candidate)) {
    throw new Error("model response is not a single JSON object");
  }
  return JSON.parse(candidate);
}

function normalizeTranscript(input, candidateDuration) {
  if (!input) {
    return { supplied: false, text: null };
  }
  const text = readFileSync(input, "utf-8").trim();
  const cuePattern = /((?:\d{2}:)?\d{2}:\d{2}[.,]\d{3})\s*-->\s*((?:\d{2}:)?\d{2}:\d{2}[.,]\d{3})\s*\n([\s\S]*?)(?=\n\n|\n(?:\d{2}:)?\d{2}:\d{2}|$)/g;
  const cues = [];
  let match;
  while ((match = cuePattern.exec(text)) !== null) {
    const toSeconds = (timestamp) => {
      const parts = timestamp.replace(",", ".").split(":").map(Number);
      return parts.length === 3 ? parts[0] * 3600 + parts[1] * 60 + parts[2] : parts[0] * 60 + parts[1];
    };
    cues.push({ start: toSeconds(match[1]), end: toSeconds(match[2]), text: normalizeWhitespace(match[3]) });
  }
  if (cues.length > 0) {
    return {
      supplied: true,
      text: cues.map((cue) => `[${cue.start.toFixed(3)}-${cue.end.toFixed(3)}] ${cue.text}`).join("\n"),
      cues,
    };
  }
  return { supplied: true, text: normalizeWhitespace(text).slice(0, 20_000), cues: [] };
}

function getPrompt(prompts, name, fallback) {
  const custom = prompts?.get?.(name);
  if (custom) return custom;
  if (prompts?.size === 0) return fallback;
  return fallback;
}

function buildPrompt(candidate, transcript, context, domainPrompt) {
  return `${domainPrompt}

TRANSCRIPT CONTEXT: ${transcript.supplied ? transcript.text : "(none supplied; do not invent speech or quote alignment)"}
CONTEXT: ${context || "(none)"}
SOURCE IDENTITY: ${candidate.source.id} (${candidate.source.start}s-${candidate.source.end}s)
CANDIDATE IDENTITY: ${candidate.candidate.id}; candidate timeline 0-${candidate.candidate.duration}s

STABLE JSON CONTRACT
Return exactly one UTF-8 JSON object and no prose outside optional JSON code fences. Every timestamp is candidate-relative seconds. Every editorial observation must cite observable evidence. If perception cannot support a claim, put it in uncertainty. Do not create scores, rankings, viral ratings, or selection decisions. Do not invent speech; keyQuoteAlignment may be non-empty only when transcript text is supplied above and each quote must be an exact transcript substring.
Required top-level keys and shapes:
{"summary":string,"speech":{"supplied":boolean,"speakers":string[],"keyQuoteAlignment":[{"quote":string,"start":number,"end":number,"alignment":string,"evidence":string}]},"people":[{"label":string,"position":string,"faceVisible":"yes|partial|no|unclear","clarity":"high|medium|low|unclear","emotion":string,"reaction":string,"action":string,"evidence":string}],"scenes":[{"start":number,"end":number,"event":string,"onScreenText":string[],"shotChange":boolean,"visualQuality":"high|acceptable|low|unclear","audioQuality":"high|acceptable|low|unclear","evidence":string}],"narrative":{"setup":{"start":number,"end":number,"observation":string,"evidence":string}|null,"tension":same|null,"turn":same|null,"payoff":same|null,"selfContained":boolean,"contextNeeded":string},"hooks":[{"start":number,"end":number,"label":string,"observation":string,"evidence":string}],"emotionalHighlights":[hook],"weakRegions":[hook],"suggestedCuts":[{"start":number,"end":number,"rationale":string,"evidence":string}],"verticalFit":{"suitability":"good|acceptable|poor|unclear","cropFeasibility":"good|acceptable|poor|unclear","trackingFeasibility":"good|acceptable|poor|unclear","subjectSafety":string,"evidence":string},"editSuggestions":[{"type":"punch-in|b-roll|caption-emphasis","start":number,"end":number,"suggestion":string,"evidence":string}],"observableEvidence":[{"start":number,"end":number,"observation":string,"evidence":string}],"uncertainty":[{"claim":string,"reason":string}]}`;
}

function validateAgainstTranscript(parsed, transcript) {
  if (!transcript.supplied && parsed.speech.keyQuoteAlignment.length > 0) {
    throw new Error("structured evidence contains quote alignment without transcript");
  }
  const transcriptText = normalizeWhitespace(transcript.text || "").toLowerCase();
  for (const alignment of parsed.speech.keyQuoteAlignment) {
    const quote = normalizeWhitespace(alignment.quote).toLowerCase();
    if (!transcriptText.includes(quote)) {
      throw new Error("key quote alignment cites text absent from caller-supplied transcript");
    }
  }
  return parsed;
}

function rejectSelectionSignals(value, path = "$") {
  if (Array.isArray(value)) {
    value.forEach((item, index) => rejectSelectionSignals(item, `${path}[${index}]`));
    return;
  }
  if (!value || typeof value !== "object") return;
  for (const [key, child] of Object.entries(value)) {
    if (/^(viral[_-]?)?(score|rating|rank|ranking|selection)$/i.test(key) || /viral/i.test(key)) {
      throw new Error(`structured evidence contains forbidden editorial decision field: ${path}.${key}`);
    }
    rejectSelectionSignals(child, `${path}.${key}`);
  }
}

function cacheKey(candidate, transcript, context, prompt, modelCommand, contract) {
  const parts = {
    version: 2,
    contract,
    source: { id: candidate.source.id, fingerprint: fingerprint(candidate.source.path), bounds: [candidate.source.start, candidate.source.end] },
    candidate: { id: candidate.candidate.id, fingerprint: fingerprint(candidate.candidate.path), bounds: [candidate.candidate.start, candidate.candidate.end] },
    transcript: transcript.supplied ? { fingerprint: fingerprint(transcript.input), supplied: true } : { supplied: false },
    context,
    prompt,
    modelCommand,
  };
  return createHash("sha256").update(JSON.stringify(parts)).digest("hex");
}

function prepareCandidate(candidate, workingDir) {
  const normalizedDir = join(workingDir, ".markcut-candidate-vision");
  mkdirSync(normalizedDir, { recursive: true });
  let mediaPath = candidate.candidate.path;
  if (candidate.candidate.needsSlice || !existsSync(mediaPath)) {
    mediaPath = join(normalizedDir, `${candidate.candidate.id}.mp4`);
    const duration = candidate.source.end - candidate.source.start;
    run(`ffmpeg -y -ss ${candidate.source.start} -i ${shQuote(candidate.source.path)} -t ${duration} -c:v libx264 -preset fast -crf 26 -c:a aac -b:a 96k ${shQuote(mediaPath)}`, { timeout: 300_000 });
  }
  const actualDuration = durationOf(mediaPath);
  if (actualDuration <= 0) throw new Error(`candidate media has no measurable duration: ${mediaPath}`);
  const normalizedPath = join(normalizedDir, `${candidate.candidate.id}_sample.mp4`);
  if (!existsSync(normalizedPath)) {
    run(`ffmpeg -y -i ${shQuote(mediaPath)} -vf "fps=1,scale='min(360,iw)':'min(360,ih)':force_original_aspect_ratio=decrease,pad='ceil(iw/2)*2':'ceil(ih/2)*2':-1:-1" -an -c:v libx264 -preset fast -crf 28 ${shQuote(normalizedPath)}`, { timeout: 300_000 });
  }
  return {
    ...candidate,
    candidate: {
      ...candidate.candidate,
      path: mediaPath,
      duration: actualDuration,
      normalizedMediaPath: normalizedPath,
      isTrimmedCandidate: !candidate.candidate.needsSlice,
    },
  };
}

function artifact(candidate, parsed, transcript, modelCommandHash) {
  return {
    schemaVersion: 1,
    type: "markcut.candidate-evidence",
    contractVersion: CANDIDATE_CONTRACT_VERSION,
    source: candidate.source,
    candidate: candidate.candidate,
    transcript: {
      supplied: transcript.supplied,
      text: transcript.text,
      speakers: parsed.speech.speakers,
      keyQuoteAlignment: parsed.speech.keyQuoteAlignment,
    },
    observations: parsed,
    model: { commandHash: modelCommandHash },
  };
}

export async function runCandidateVision(inputPath, options) {
  const resolved = resolve(inputPath);
  if (!existsSync(resolved)) throw new Error(`input not found: ${resolved}`);
  const extension = extname(resolved).toLowerCase();
  let manifest;
  if (VIDEO_EXTS.has(extension)) {
    const duration = durationOf(resolved);
    const start = Number.isFinite(options.start) ? options.start : 0;
    const end = Number.isFinite(options.end) ? options.end : duration;
    if (end <= start) throw new Error("candidate end must exceed start");
    manifest = {
      source: { id: options.sourceId || basename(resolved, extension), path: resolved, start, end },
      candidate: { id: options.candidateId || `${basename(resolved, extension)}-${start}-${end}`, path: resolved, start, end },
    };
  } else {
    const input = JSON.parse(readFileSync(resolved, "utf-8"));
    const sourcePath = resolve(dirname(resolved), input.source?.path || input.sourcePath || input.source);
    const candidatePath = input.candidate?.path || input.candidatePath || input.candidate;
    const start = input.source?.start ?? input.start;
    const end = input.source?.end ?? input.end;
    if (!sourcePath || !Number.isFinite(start) || !Number.isFinite(end) || end <= start) {
      throw new Error("candidate manifest requires source path and numeric start/end bounds");
    }
    manifest = {
      source: { id: input.source?.id || input.sourceId || basename(sourcePath), path: sourcePath, start, end },
      candidate: {
        id: input.candidate?.id || input.candidateId || `${input.sourceId || basename(sourcePath)}-${start}-${end}`,
        path: candidatePath ? resolve(dirname(resolved), candidatePath) : sourcePath,
        start,
        end,
      },
    };
  }

  if (!Number.isFinite(manifest.candidate.start)) manifest.candidate.start = manifest.source.start;
  if (!Number.isFinite(manifest.candidate.end)) manifest.candidate.end = manifest.source.end;
  if (extension !== ".json") {
    manifest.candidate.isTrimmedCandidate = true;
  } else {
    manifest.candidate.needsSlice = !input.candidate?.path && !input.candidatePath && !input.candidate;
  }

  const prepared = prepareCandidate(
    { ...manifest, candidate: { ...manifest.candidate, path: manifest.candidate.path || manifest.source.path } },
    dirname(resolved),
  );
  const transcript = normalizeTranscript(options.transcriptFile ? resolve(options.transcriptFile) : null);
  const domainPrompt = getPrompt(options.prompts, "candidate-evidence", `Produce reusable, timestamped visual/editorial evidence for an already-selected short-form candidate clip.`);
  const prompt = buildPrompt(prepared, transcript, options.context || "", domainPrompt);
  const contract = `candidate-evidence-v${CANDIDATE_CONTRACT_VERSION}`;
  const modelCommand = options.modelCommand || process.env.MARKCUT_VISION_CANDIDATE_CLI || process.env.MARKCUT_VTT_CLI || "";
  if (!modelCommand) throw new Error("candidate vision requires --model-command or MARKCUT_VISION_CANDIDATE_CLI");
  const key = cacheKey(prepared, transcript, options.context || "", prompt, modelCommand, contract);
  const commandHash = createHash("sha256").update(modelCommand).digest("hex").slice(0, 16);
  const cachePath = join(dirname(resolved), ".markcut-candidate-vision", `${key}.json`);
  const outputPath = resolve(options.output || join(dirname(resolved), `${prepared.candidate.id}.candidate-vision.json`));

  let artifactValue;
  if (existsSync(cachePath)) {
    emitInfo(`Candidate evidence cached: ${key.slice(0, 12)}`);
    artifactValue = JSON.parse(readFileSync(cachePath, "utf-8"));
  } else {
    const substituted = modelCommand
      .replace(/\{input\}/g, shQuote(prepared.candidate.normalizedMediaPath))
      .replace(/\{prompt\}/g, shQuote(prompt));
    emitInfo(`Analyzing candidate ${prepared.candidate.id}...`);
    let raw;
    try {
      raw = run(substituted, { timeout: 600_000 }).trim();
    } catch (error) {
      throw new Error(`candidate vision model failed: ${error.message}`);
    }
    let parsed;
    try {
      parsed = strictJsonParse(raw);
    } catch (error) {
      throw new Error(`candidate vision returned invalid JSON: ${error.message}`);
    }
    const shapeResult = observationsSchema.safeParse(parsed);
    if (!shapeResult.success) {
      throw new Error(`candidate vision returned invalid structured evidence: ${shapeResult.error.issues.map((issue) => `${issue.path.join(".")}: ${issue.message}`).join("; ")}`);
    }
    parsed = shapeResult.data;
    if (parsed.speech.supplied !== transcript.supplied) {
      throw new Error("structured evidence transcript-supplied flag contradicts caller input");
    }
    rejectSelectionSignals(parsed);
    validateAgainstTranscript(parsed, transcript);
    artifactValue = artifact(prepared, parsed, transcript, commandHash);
    writeFileSync(cachePath, JSON.stringify(artifactValue, null, 2));
  }

  mkdirSync(dirname(outputPath), { recursive: true });
  writeFileSync(outputPath, JSON.stringify(artifactValue, null, 2));
  emitInfo(`Candidate evidence written: ${outputPath}`);
  return outputPath;
}

export {
  buildPrompt,
  cacheKey,
  normalizeTranscript,
  observationsSchema,
  rejectSelectionSignals,
  strictJsonParse,
  validateAgainstTranscript,
};
