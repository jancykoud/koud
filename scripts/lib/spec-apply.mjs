/**
 * Applies a validated requirements.json (plus the architecture it was validated against) to
 * the project: writes the spec triad — requirements.md / design.md / tasks.md per must-have
 * feature — under `.koud/specs/`. Nothing here leaves `.koud/`, runs an external tool or
 * touches the network.
 *
 * Same shape as stack-apply.mjs, architect-apply.mjs and requirements-apply.mjs: validate,
 * load state, compute everything in memory, then back up and write.
 *
 * A dry-run's contract is that the filesystem ends up exactly as it started — including an
 * old-schema state.json — so on a dry run the state migration happens in memory only.
 *
 * `.koud/specs/` is created unconditionally on every non-dry-run apply, even when there is
 * no must-have feature: the phase always declares that directory as its artifact, so the
 * declaration must always be true or an approved phase drifts permanently.
 *
 * Every triad file is backed up before being overwritten. tasks.md in particular is a
 * checklist the build agent ticks off as it works, so clobbering it silently on a rerun
 * would be worse here than for any other generated file in the plugin.
 */
import { mkdir, writeFile, readdir } from 'node:fs/promises';
import path from 'node:path';
import { KOUD_DIR, SPECS_DIR, FEATURES_DIR, statePath, timestamp } from './paths.mjs';
import { OUT_DIR } from './project-writes.mjs';
import { readState, writeState, migrateStateFile, readMigratedState } from './state.mjs';
import { openBackupSet, existingPaths } from './backup.mjs';
import { validateRequirements } from './requirements-schema.mjs';
import { emitKiro } from './emit-kiro.mjs';

const SPECS_REL = `${KOUD_DIR}/${SPECS_DIR}`;

/** `0002-medication-safety` -> `medication-safety`; a name that isn't a spec folder -> null. */
function folderSlug(name) {
  const m = /^\d+-(.+)$/.exec(name);
  return m === null ? null : m[1];
}

export async function applySpec(
  root, { requirements, architecture, dryRun = false, stamp: stampOverride } = {},
) {
  const { valid, errors, warnings } = validateRequirements(requirements, { architecture });
  if (!valid) {
    throw new Error(`refusing to apply an invalid requirements payload:\n  ${errors.join('\n  ')}`);
  }

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

  // tasks.md names the Gherkin file each feature must satisfy. A project that kept koud's
  // files inside .koud/ has them under .koud/out/features/, and a task list pointing at a
  // features/ folder that does not exist sends the build looking for nothing.
  const inProject = await readdir(path.join(root, FEATURES_DIR)).catch(() => null);
  const inKoud = await readdir(path.join(root, OUT_DIR, FEATURES_DIR)).catch(() => null);
  const featuresDir = inProject === null && inKoud !== null ? `${OUT_DIR}/${FEATURES_DIR}` : FEATURES_DIR;

  const triad = emitKiro(requirements, architecture, { featuresDir });

  // emitKiro() numbers folders by position in the must-have list, so reprioritising features
  // between two applies renumbers every folder after the change. A feature's identity is its
  // slug, though — validated unique, and what emit-gherkin.mjs keys on — so
  // an existing folder is matched by its `-<slug>` suffix, not by its full name, and reused
  // under the name it already has. Without this, demoting one must-have orphans every later
  // feature's folder: a build agent's ticked-off tasks.md is stranded under a name nothing
  // reads again, and the feature is falsely reported as no longer a must-have.
  const existing = await readdir(path.join(root, SPECS_REL)).catch((err) => {
    if (err.code === 'ENOENT') return [];
    throw err;
  });
  const existingBySlug = new Map();
  for (const name of existing) {
    const slug = folderSlug(name);
    if (slug !== null) existingBySlug.set(slug, name);
  }

  // dirName -> files, with each feature's existing folder reused when it has one. The
  // NNNN-<slug> format is unchanged; only which of those names a feature lands in.
  const planned = new Map();
  const currentSlugs = new Set();
  for (const [dir, files] of triad) {
    const slug = folderSlug(dir);
    currentSlugs.add(slug);
    planned.set(existingBySlug.get(slug) ?? dir, files);
  }

  // A folder is stale only when its slug is genuinely absent from the must-have set — never
  // merely because it was renumbered, which is what the reuse above already handled.
  const skipped = [];
  for (const name of existing) {
    const slug = folderSlug(name);
    if (slug === null) {
      skipped.push(`${SPECS_REL}/${name} — not a generated spec folder; left in place`);
    } else if (!currentSlugs.has(slug)) {
      skipped.push(`${SPECS_REL}/${name} — no longer a must-have feature; left in place`);
    }
  }

  const artifacts = [];
  for (const [dir, files] of planned) {
    for (const name of Object.keys(files)) artifacts.push(`${SPECS_REL}/${dir}/${name}`);
  }

  // A preview must say what it would destroy — tasks.md above all, which a build agent ticks
  // off — or the command file's overwrite-consent step has no output to act on. Read-only.
  if (dryRun) {
    return {
      artifacts, skipped, backedUp: [], warnings,
      wouldOverwrite: await existingPaths(root, artifacts),
    };
  }

  // Back up every triad file that already exists before it is overwritten. One backup set,
  // opened once, shared by every backup below, so a single apply run produces one coherent,
  // co-timestamped backup set rather than one directory per file — and a second apply in the
  // same wall-clock second gets its own directory instead of overwriting this one.
  // `stampOverride` exists so a test can inject a known value and observe on disk that this
  // call actually used it.
  const set = openBackupSet(root, stampOverride ?? timestamp());
  const backedUp = [];
  for (const [dir, files] of planned) {
    for (const name of Object.keys(files)) {
      const rel = `${SPECS_REL}/${dir}/${name}`;
      const saved = await set.backup(rel);
      if (saved !== null) backedUp.push(rel);
    }
  }

  // Created unconditionally, regardless of how many must-have features exist. When triad is
  // empty the write loop below never runs, and this is the only thing that makes the
  // unconditional `artifacts: [SPECS_REL]` declaration below actually true.
  await mkdir(path.join(root, SPECS_REL), { recursive: true });

  for (const [dir, files] of planned) {
    const target = path.join(root, SPECS_REL, dir);
    await mkdir(target, { recursive: true });
    for (const [name, body] of Object.entries(files)) {
      await writeFile(path.join(target, name), body, 'utf8');
    }
  }

  const next = {
    ...state,
    phases: {
      ...state.phases,
      spec: { ...state.phases.spec, status: 'awaiting_approval', artifacts: [SPECS_REL] },
    },
  };
  await writeState(root, next);

  return { artifacts, skipped, backedUp, warnings, backupStamp: set.stamp };
}
