/**
 * Applies a validated architecture.json to the project: renders all eight artifacts and
 * writes them, backing up any of them that already exists on disk first — not just the
 * two that are conventionally hand-edited. `docs/architecture.md` and its siblings are
 * reader-facing and the architecture-diagramming skill explicitly anticipates users editing
 * them, so a hand edit there deserves the same protection as a hand-edited AGENTS.md.
 *
 * Ordering is deliberate and load-bearing. renderAgentsMd() can throw — upsertBlock()
 * refuses to touch a hand-mangled AGENTS.md with an orphaned marker rather than silently
 * eating content between markers. That render call therefore happens in the "compute
 * everything in memory" phase, before the write loop and before any backup is taken. If it
 * throws, the error propagates unchanged and the filesystem is exactly as it was: no
 * artifact written, no backup made, no state moved. Validation runs first for the same
 * reason — an invalid payload must be refused before a single byte is written. The
 * project precondition is checked there too — writeState() would eventually refuse a
 * `state.project` that :brief never populated, but only after every artifact is
 * already on disk, which is exactly the half-written state this ordering avoids.
 */
import { mkdir, writeFile, readFile } from 'node:fs/promises';
import path from 'node:path';
import {
  KOUD_DIR, ARCHITECTURE_FILE, statePath, timestamp,
} from './paths.mjs';
import {
  readState, writeState, migrateStateFile, readMigratedState, requireBriefedProject,
} from './state.mjs';
import { openBackupSet, existingPaths } from './backup.mjs';
import { validateArchitecture } from './architecture-schema.mjs';
import { layout } from './layout.mjs';
import { emitMermaid } from './emit-mermaid.mjs';
import { emitSvg } from './emit-svg.mjs';
import { emitDrawio } from './emit-drawio.mjs';
import { renderArchitecture } from './render-architecture.mjs';
import { renderDataModel } from './render-data-model.mjs';
import { renderAgentsMd, renderClaudeMd } from './render-agents.mjs';
import { redirect, WRITE_MODES } from './project-writes.mjs';

async function readIfPresent(p) {
  return readFile(p, 'utf8').catch((err) => {
    if (err.code === 'ENOENT') return '';
    throw err;
  });
}

export async function applyArchitecture(
  root, architecture, { stack, dryRun = false, stamp: stampOverride, projectWrites = 'allow' } = {},
) {
  if (!WRITE_MODES.includes(projectWrites)) {
    throw new Error(`projectWrites must be one of ${WRITE_MODES.join(', ')}`);
  }
  // Under 'koud-only' every file that would land in the project lands under .koud/out/
  // instead, at the same relative path — see project-writes.mjs.
  const at = (rel) => redirect(rel, projectWrites);
  const { valid, errors } = validateArchitecture(architecture, stack);
  if (!valid) {
    throw new Error(`refusing to apply an invalid architecture payload:\n  ${errors.join('\n  ')}`);
  }

  // A dry-run's contract is that the filesystem ends up exactly as it started — including
  // an old-schema state.json. migrateStateFile() would rewrite it before the preview even
  // if dryRun is true, so on a dry run the migration happens in memory only;
  // the non-dry-run path still migrates on disk, unchanged.
  let state;
  if (dryRun) {
    state = await readMigratedState(root);
  } else {
    await migrateStateFile(root);
    state = await readState(root);
  }
  if (state === null) {
    throw new Error(`no state at ${statePath(root)} — run /koud:init first`);
  }
  requireBriefedProject(state, root);

  // --- Compute every artifact body in memory first. Nothing below this point touches the
  // filesystem for a write; if any render call throws (renderAgentsMd on an orphaned
  // marker, in particular) we bail out having written nothing at all. ---
  const laidOut = layout(architecture);
  // The managed block is upserted into what is already there. Under 'koud-only' that is the
  // copy a previous run left in .koud/out/ when there is one, else the project's own file —
  // read, never written.
  const existingBody = async (rel) =>
    (await readIfPresent(path.join(root, at(rel)))) || readIfPresent(path.join(root, rel));
  const [agentsExisting, claudeExisting] = await Promise.all([
    existingBody('AGENTS.md'),
    existingBody('CLAUDE.md'),
  ]);

  // relPath -> body. Order is only cosmetic; the write loop handles directories.
  const files = new Map([
    [`${KOUD_DIR}/${ARCHITECTURE_FILE}`, `${JSON.stringify(architecture, null, 2)}\n`],
    [at('docs/architecture.md'), renderArchitecture(architecture)],
    [at('docs/data-model.md'), renderDataModel(architecture, stack)],
    [at('docs/assets/architecture.mmd'), emitMermaid(architecture, laidOut)],
    [at('docs/assets/architecture.svg'), emitSvg(architecture, laidOut)],
    [at('docs/assets/architecture.drawio'), emitDrawio(architecture, laidOut)],
    [at('AGENTS.md'), renderAgentsMd(agentsExisting, architecture, stack)],
    [at('CLAUDE.md'), renderClaudeMd(claudeExisting)],
  ]);

  const artifacts = [...files.keys()];
  // A preview must say what it would destroy, or the command file's "tell the user which
  // files before applying" step has no output to act on. Read-only.
  if (dryRun) {
    return { artifacts, backedUp: [], skipped: [], wouldOverwrite: await existingPaths(root, artifacts) };
  }

  // --- Everything below is the write phase. Every body above rendered successfully, so
  // it is now safe to touch disk. ---
  // One backup set, opened once, shared by every backup below -- that sharing is the whole
  // backup promise: a single apply run must produce one coherent,
  // co-timestamped backup set, not one directory per file, and no concurrent or
  // same-second run may write into it (openBackupSet suffixes a taken name). `stampOverride`
  // exists so a test can inject a known value and observe on disk that this call actually
  // used it, rather than each backup minting its own via timestamp().
  const set = openBackupSet(root, stampOverride ?? timestamp());
  const backedUp = [];
  for (const rel of artifacts) {
    const saved = await set.backup(rel);
    if (saved !== null) backedUp.push(rel);
  }

  for (const [rel, body] of files) {
    const target = path.join(root, rel);
    await mkdir(path.dirname(target), { recursive: true });
    await writeFile(target, body, 'utf8');
  }

  const next = {
    ...state,
    project: {
      ...state.project,
      architecture_ref: `${KOUD_DIR}/${ARCHITECTURE_FILE}`,
    },
    phases: {
      ...state.phases,
      architect: { ...state.phases.architect, status: 'awaiting_approval', artifacts },
    },
  };
  await writeState(root, next);

  return { artifacts, backedUp, skipped: [], backupStamp: set.stamp };
}
