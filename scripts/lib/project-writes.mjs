/**
 * Where a phase is allowed to write.
 *
 * `.koud/` belongs to the plugin: writing there needs no permission beyond the phase gate.
 * Everything else — AGENTS.md, CLAUDE.md, docs/, features/ — belongs to the project. On a
 * repository that already exists, or one shared with other people, a tool that drops files
 * at the root without asking is a tool nobody lets near their work twice.
 *
 * So an apply that would write outside `.koud/` has three modes:
 *
 *   ask        (default from the CLI) refuse, list the files, exit with CONSENT_EXIT_CODE
 *   allow      --allow-project-writes  the user said yes: write them where they belong
 *   koud-only  --koud-only             the user said no: write them under `.koud/out/`
 *                                      mirroring their path, so nothing in the project moves
 *
 * `allow` is the library default so that callers which already hold the user's consent
 * (tests, scaffolds) need not restate it; the CLIs never default to it.
 */
import { readdir } from 'node:fs/promises';
import path from 'node:path';
import { KOUD_DIR } from './paths.mjs';

export const ALLOW_FLAG = '--allow-project-writes';
export const KOUD_ONLY_FLAG = '--koud-only';
/** Records that the user agreed to replace a brief that is already on disk. */
export const REPLACE_FLAG = '--replace';
export const OUT_DIR = `${KOUD_DIR}/out`;
export const WRITE_MODES = ['allow', 'koud-only'];
/** Distinct from 1 (failure) and 2 (usage) so a caller can tell "ask the user" apart. */
export const CONSENT_EXIT_CODE = 3;

/** True for a repo-relative path that is not inside `.koud/`. */
export function isProjectPath(rel) {
  const norm = String(rel).replace(/\\/g, '/').replace(/^\.\//, '');
  return !(norm === KOUD_DIR || norm.startsWith(`${KOUD_DIR}/`));
}

/** Where `rel` lands under the given mode. */
export function redirect(rel, mode = 'allow') {
  return mode === 'koud-only' && isProjectPath(rel) ? `${OUT_DIR}/${rel}` : rel;
}

/** Reads the mode off a CLI's flag set: 'allow', 'koud-only', or 'ask' when neither is given. */
export function writeModeFromFlags(flags) {
  const allow = flags.has(ALLOW_FLAG);
  const koudOnly = flags.has(KOUD_ONLY_FLAG);
  if (allow && koudOnly) {
    throw new Error(`${ALLOW_FLAG} and ${KOUD_ONLY_FLAG} contradict each other — pass one`);
  }
  if (allow) return 'allow';
  if (koudOnly) return 'koud-only';
  return 'ask';
}

/** The subset of `artifacts` that lies outside `.koud/`. */
export function projectPaths(artifacts) {
  return (artifacts ?? []).filter(isProjectPath);
}

/**
 * Finds, for each path about to be written, a file already in the project whose name
 * differs only by letter case — `docs/ARCHITECTURE.md` for `docs/architecture.md`.
 *
 * On a case-insensitive disk (the macOS and Windows defaults) the two names are the same
 * file: writing one replaces the other, and Git keeps showing the old name. On a
 * case-sensitive disk they are two files a reader will confuse. Either way the user has
 * to be told by name, because "exists, would be changed" hides that the file being
 * replaced is a document of theirs under another spelling.
 *
 * Returns a Map from the path to be written to the path that is actually on disk. A path
 * that exists under exactly the spelling given is not in the map.
 */
export async function findCaseVariants(root, paths) {
  const variants = new Map();
  const listings = new Map();
  const list = async (dir) => {
    if (!listings.has(dir)) {
      listings.set(dir, await readdir(path.join(root, dir)).catch(() => null));
    }
    return listings.get(dir);
  };
  for (const rel of paths ?? []) {
    const segments = String(rel).replace(/\\/g, '/').split('/').filter((s) => s !== '' && s !== '.');
    const actual = [];
    let differs = false;
    let found = true;
    for (const segment of segments) {
      const entries = await list(actual.join('/') || '.');
      if (entries === null) { found = false; break; }
      if (entries.includes(segment)) { actual.push(segment); continue; }
      const variant = entries.find((e) => e.toLowerCase() === segment.toLowerCase());
      if (variant === undefined) { found = false; break; }
      actual.push(variant);
      differs = true;
    }
    if (found && differs) variants.set(rel, actual.join('/'));
  }
  return variants;
}

/**
 * The text a CLI prints when it refuses to write outside `.koud/` without a decision.
 * `existing` is the subset of `paths` already on disk; `variants` is what
 * findCaseVariants() returned.
 */
export function renderConsentRequest(command, paths, existing = [], variants = new Map()) {
  const taken = new Set(existing);
  const out = [];
  out.push(`${command} would write ${paths.length} file(s) outside ${KOUD_DIR}/ — nothing was written.`);
  out.push('');
  for (const p of paths) out.push(`  ${describeProjectWrite(p, taken, variants)}`);
  out.push('');
  if (paths.some((p) => variants.has(p))) {
    out.push('At least one of these would land on a file the project already has under another');
    out.push(`spelling. Recommend ${KOUD_ONLY_FLAG} unless the user wants that file replaced.`);
    out.push('');
  }
  out.push('Show this list to the user and ask. Then re-run with exactly one of:');
  out.push(`  ${ALLOW_FLAG}   they agreed: write the files where listed`);
  out.push(`  ${KOUD_ONLY_FLAG}              they declined: write them under ${OUT_DIR}/ instead`);
  return out.join('\n');
}

/** One line of a write listing: new, existing, or colliding with a differently-cased name. */
export function describeProjectWrite(rel, taken, variants = new Map()) {
  if (variants.has(rel)) {
    return `!! (would replace ${variants.get(rel)} — the same name in another case) ${rel}`;
  }
  return `${taken.has(rel) ? '! (exists, would be changed)' : '+ (new)'} ${rel}`;
}

/**
 * PreToolUse verdict for a shell command, or null to let it through.
 *
 * A consent flag is how the agent records the user's yes; this is how the user gets to see
 * it being recorded. A koud apply carrying one is turned into a permission prompt, so a yes
 * the agent merely assumed still has to be given by a person.
 */
export function evaluateApplyCommand(command) {
  if (typeof command !== 'string') return null;
  if (!/scripts[\\/][a-z-]+\.mjs["']?\s+apply\b/.test(command)) return null;
  const has = (flag) => new RegExp(`(^|\\s)${flag}(\\s|$)`).test(command);
  if (has(ALLOW_FLAG)) {
    return {
      decision: 'ask',
      reason: 'this apply writes files outside .koud/ (for example AGENTS.md, CLAUDE.md, docs/ or ' +
        'features/). Approve only if you were shown the list of files and agreed to it.',
    };
  }
  if (has(REPLACE_FLAG) && /scripts[\\/]brief\.mjs/.test(command)) {
    return {
      decision: 'ask',
      reason: 'this apply replaces the brief already on disk. Approve only if you were shown ' +
        'what changes and agreed to it. The old brief is backed up first.',
    };
  }
  return null;
}
