import {readFileSync, existsSync, realpathSync} from 'node:fs';
import {resolve, dirname, join} from 'node:path';
import {fileURLToPath} from 'node:url';
import {createHash} from 'node:crypto';

// The same module is also bundled into src/player/pipeline.mjs.
const sourceDir = dirname(fileURLToPath(import.meta.url));
const rootCandidates = [resolve(sourceDir, '..'), resolve(sourceDir, '../..')];
export const MARKCUT_ROOT = rootCandidates.find(root=>existsSync(join(root,'profiles','default.json'))) ?? rootCandidates[0];
export const DEFAULT_PROFILE_PATH = join(MARKCUT_ROOT,'profiles','default.json');
export const BUILTIN_PROFILES = Object.freeze({default:DEFAULT_PROFILE_PATH,prototype:join(MARKCUT_ROOT,'profiles','prototype.json')});

// Reserved bare names select shipped profiles; other references are file paths.
export function resolveProfileReference(reference, base = process.cwd()) {
  if (typeof reference !== 'string' || !reference.trim() || reference.trim() !== reference)
    throw new Error('Invalid Markcut profile reference: expected a built-in name or JSON file path');
  return Object.hasOwn(BUILTIN_PROFILES,reference) ? BUILTIN_PROFILES[reference] : resolve(base,reference);
}
export function expandProfileTemplate(template) {
  const quotedRoot = "'"+MARKCUT_ROOT.replaceAll("'", "'\\''")+"'";
  return template.replaceAll('{markcut_root}',()=>quotedRoot);
}

export const CLI_PROFILE_KEYS = Object.freeze(['tts','stt','itt','vtt','tti','ttv','agent','editCli']);
const OPTIONAL_EMPTY = new Set(['stt','vtt','ttv']);
const TEMPLATE_FLAGS = Object.fromEntries(CLI_PROFILE_KEYS.map(key=>[key==='editCli'?'--edit-cli':`--${key}`,key]));
function validateTemplate(key,value) {
  if (typeof value !== 'string' || (!value.trim() && !(value === '' && OPTIONAL_EMPTY.has(key))))
    throw new Error(`Invalid Markcut CLI template: ${key}`);
}

// Profiles are trusted local executable configuration, never media inputs.
// Parent file paths are relative to their declaring file; canonical paths
// detect cycles even through symlinks. Return only effective template fields.
export function readCliProfile(reference) {
  if (!reference) return {};
  const seen = new Set();
  const root = realpathSync(DEFAULT_PROFILE_PATH);
  const load = (path) => {
    let canonical, profile;
    try { canonical=realpathSync(path); }
    catch (error) { throw new Error(`Invalid Markcut profile ${path}: ${error.message}`); }
    if (seen.has(canonical)) throw new Error(`Circular Markcut profile inheritance: ${[...seen,canonical].join(' -> ')}`);
    if (seen.size >= 32) throw new Error('Markcut profile inheritance exceeds 32 files');
    seen.add(canonical);
    try { profile=JSON.parse(readFileSync(canonical,'utf8')); }
    catch (error) { throw new Error(`Invalid Markcut profile ${path}: ${error.message}`); }
    if (!profile || typeof profile !== 'object' || Array.isArray(profile))
      throw new Error(`Markcut profile must be a JSON object: ${path}`);
    const {extends: parent, ...fields}=profile;
    for (const [key,value] of Object.entries(fields)) {
      if (!CLI_PROFILE_KEYS.includes(key) || typeof value !== 'string' || (!value.trim() && !(value === '' && OPTIONAL_EMPTY.has(key))))
        throw new Error(`Invalid Markcut profile field: ${key} (${path})`);
    }
    const inherited=Object.hasOwn(profile,'extends')
      ? load(resolveProfileReference(parent,dirname(canonical)))
      : canonical === root ? {} : load(root);
    const effective={...inherited,...fields};
    if (canonical === root && CLI_PROFILE_KEYS.some(key=>!Object.hasOwn(effective,key)))
      throw new Error(`Incomplete Markcut default profile: ${path}`);
    return effective;
  };
  return load(resolveProfileReference(reference));
}

// Resolve relative to the original caller, before subprocesses change cwd.
export function extractProfileArgument(argv, env = process.env) {
  const rest = [], cliOverrides = {};
  let selected;
  for (let i=0; i<argv.length; i++) {
    const arg = argv[i];
    if (arg === '--profile' || arg.startsWith('--profile=')) {
      if (selected !== undefined) throw new Error('Duplicate --profile');
      selected = arg === '--profile' ? argv[++i] : arg.slice('--profile='.length);
      if (!selected || selected.startsWith('--')) throw new Error('--profile requires a built-in name or JSON file path');
    } else {
      const equals = arg.indexOf('=');
      const flag = equals < 0 ? arg : arg.slice(0,equals);
      if (Object.hasOwn(TEMPLATE_FLAGS,flag)) {
        const key = TEMPLATE_FLAGS[flag];
        const value = equals < 0 ? argv[++i] : arg.slice(equals+1);
        if (value === undefined || (equals < 0 && value.startsWith('--'))) throw new Error(`${flag} requires a CLI template`);
        validateTemplate(key,value);
        cliOverrides[key] = value;
      } else rest.push(arg);
    }
  }
  const path = selected ?? env.MARKCUT_PROFILE;
  return {argv:rest, profilePath:path ? resolveProfileReference(path) : '', cliOverrides};
}

// Serialize without shell parsing, preserving empty overrides and whitespace.
export function templateArguments(overrides = {}) {
  return Object.entries(TEMPLATE_FLAGS).filter(([,key])=>Object.hasOwn(overrides,key)).map(([flag,key])=>`${flag}=${overrides[key]}`);
}

export function profileCacheKey(templates, overrides = {}) {
  return createHash('sha256').update(JSON.stringify(CLI_PROFILE_KEYS.map(key=>[key,templates[key],Object.hasOwn(overrides,key)]))).digest('hex').slice(0,16);
}
