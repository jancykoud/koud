/**
 * Applies a validated brief.json to the project: renders both reader-facing artifacts and
 * writes them, backing up any that already exist on disk first. Same shape as
 * stack-apply.mjs: validate, read state, compute everything in memory, then -- unless
 * `dryRun` -- back up and write. A `dryRun` call returns what would be written without
 * touching disk or state at all.
 *
 * :brief is the only phase that may run on a project with `project: null` -- it is the
 * phase that sets it.
 */
import { mkdir, writeFile } from 'node:fs/promises';
import path from 'node:path';
import { KOUD_DIR, BRIEF_FILE, statePath, timestamp } from './paths.mjs';
import { readState, writeState, migrateStateFile, readMigratedState } from './state.mjs';
import { openBackupSet, existingPaths } from './backup.mjs';
import { validateBrief, isCoreTech, isOutcomeCriterion } from './brief-schema.mjs';
import { renderTable } from './render.mjs';

const rel = (name) => `${KOUD_DIR}/${name}`;
const byRank = (items = []) => [...items].sort((a, b) => (a.rank ?? 0) - (b.rank ?? 0));

/**
 * Free text from the payload, quoted. Every line is prefixed, so an embedded newline (or
 * a line starting with #, - or >) cannot escape the blockquote and restructure the page.
 */
export const quoteBlock = (s) => String(s ?? '')
  .replace(/\n+$/, '')
  .split('\n')
  .map((line) => `> ${line}`)
  .join('\n');

/** Flatten a tech entry into one printable string for the hook and the status board. */
export function techLabel(t) {
  if (typeof t === 'string') return t;
  const oneOf = Array.isArray(t?.one_of) && t.one_of.length > 0 ? ` (${t.one_of.join(' | ')})` : '';
  return `${t?.name ?? ''}${oneOf}`;
}

const bullets = (items = []) => items.map((i) => `- ${String(i).replace(/\n+/g, ' ')}`).join('\n');

/** project.md -- what is being built and for whom. Rendered, never hand-maintained. */
export function renderProject(brief) {
  const out = [];
  out.push(`# ${brief.identity.name}`);
  out.push('');
  out.push(quoteBlock(brief.identity.one_liner));
  out.push('');
  out.push('## The problem');
  out.push('');
  out.push(brief.problem.trim());
  out.push('');
  out.push('## Who it is for');
  out.push('');
  out.push(renderTable(
    ['Audience', 'Who they are', 'What they need'],
    brief.audience.map((a) => [a.name, a.who ?? '—', a.need]),
  ));
  out.push('');
  out.push('## Goals');
  out.push('');
  out.push(bullets(brief.goals));
  out.push('');
  out.push('## Out of scope');
  out.push('');
  out.push(brief.non_goals.length > 0 ? bullets(brief.non_goals) : '_Nothing has been ruled out yet._');
  out.push('');
  return out.join('\n');
}

/** brief.md -- the constraints every later phase is held to. */
export function renderBrief(brief) {
  const out = [];
  out.push(`# Brief — ${brief.identity.name}`);
  out.push('');
  out.push(`**Track:** \`${brief.track}\` — ${brief.track === 'existing'
    ? 'this project already has code; the stack below is what the code uses'
    : 'this project starts from an idea'}.`);
  out.push('');
  if (brief.scope) {
    out.push(`**Scope:** ${String(brief.scope).replace(/\n+/g, ' ')}`);
    out.push('');
  }

  out.push('## Success criteria');
  out.push('');
  out.push('In priority order. Every one must be claimed by at least one feature in `:requirements`.');
  out.push('');
  out.push(renderTable(
    ['Rank', 'Id', 'Criterion', 'How we know it is met', 'Checked'],
    byRank(brief.criteria.items).map((c) => [
      c.rank, `\`${c.id}\``, c.name, c.statement,
      isOutcomeCriterion(c) ? 'after release' : 'before release',
    ]),
  ));
  if (brief.criteria.items.some(isOutcomeCriterion)) {
    out.push('');
    out.push('A criterion checked after release is a result in the world, not a property of the code:');
    out.push('the build can make it possible, and only real use can confirm it.');
  }
  out.push('');

  out.push('## Technology');
  out.push('');
  const required = brief.tech.required ?? [];
  const core = required.filter(isCoreTech);
  const tooling = required.filter((t) => !isCoreTech(t));
  if (core.length > 0) {
    out.push('**Required** — `:stack` must cover each of these, and `:check` verifies them in the code.');
    out.push('');
    out.push(renderTable(
      ['Technology', 'Why it is imposed'],
      core.map((t) => [techLabel(t), t.reason]),
    ));
  } else {
    out.push('**Required:** nothing is imposed. `:stack` chooses freely.');
  }
  if (tooling.length > 0) {
    out.push('');
    out.push('**Tooling in place** — kept as it is, but replaceable without changing what the product does.');
    out.push('`:stack` does not need a slot for these.');
    out.push('');
    out.push(renderTable(
      ['Tool', 'Why it is there'],
      tooling.map((t) => [techLabel(t), t.reason]),
    ));
  }
  const forbidden = brief.tech.forbidden ?? [];
  if (forbidden.length > 0) {
    out.push('');
    out.push('**Forbidden**');
    out.push('');
    out.push(renderTable(
      ['Technology', 'Why'],
      forbidden.map((t) => [techLabel(t), t.reason ?? '—']),
    ));
  }
  const preferred = brief.tech.preferred ?? [];
  if (preferred.length > 0) {
    out.push('');
    out.push('**Preferred** — used unless there is a stated reason not to.');
    out.push('');
    out.push(renderTable(
      ['Technology', 'Why'],
      preferred.map((t) => [techLabel(t), t.reason ?? '—']),
    ));
  }
  out.push('');

  const c = brief.constraints ?? {};
  const constraintRows = [
    ['Hosting', c.hosting],
    ['Budget', c.budget],
    ['Compliance', (c.compliance ?? []).join('; ') || undefined],
  ].filter(([, v]) => v !== undefined);
  if (constraintRows.length > 0) {
    out.push('## Constraints');
    out.push('');
    out.push(renderTable(['Constraint', 'Value'], constraintRows));
    out.push('');
  }

  const dates = brief.dates ?? [];
  if (dates.length > 0) {
    out.push('## Dates');
    out.push('');
    out.push(renderTable(
      ['When', 'What', 'Kind'],
      [...dates].sort((a, b) => Date.parse(a.at) - Date.parse(b.at)).map((d) => [d.at, d.label, d.kind]),
    ));
    out.push('');
  }

  const unresolved = brief.unresolved ?? [];
  if (unresolved.length > 0) {
    out.push('## Open questions');
    out.push('');
    out.push('Not yet answered. Each one is either resolved or explicitly accepted before this brief is approved.');
    out.push('');
    out.push(bullets(unresolved));
    out.push('');
  }

  return `${out.join('\n').trimEnd()}\n`;
}

export function buildBriefDigest(brief, { now = new Date() } = {}) {
  const hard = (brief.dates ?? []).find((d) => d.kind === 'hard');
  return {
    name: brief.identity.name,
    track: brief.track,
    deadline: hard?.at ?? null,
    scope: brief.scope ?? null,
    tech: {
      // Core only: this list is what the hook calls non-negotiable at every session start.
      required: (brief.tech?.required ?? []).filter(isCoreTech).map(techLabel),
      tooling: (brief.tech?.required ?? []).filter((t) => !isCoreTech(t)).map(techLabel),
      preferred: (brief.tech?.preferred ?? []).map(techLabel),
      forbidden: (brief.tech?.forbidden ?? []).map(techLabel),
    },
    criteria_ids: byRank(brief.criteria?.items).map((i) => i.id),
    brief_ref: rel(BRIEF_FILE),
    started_at: now.toISOString(),
  };
}

export async function applyBrief(root, brief, { dryRun = false, now = new Date(), stamp: stampOverride } = {}) {
  const { valid, errors } = validateBrief(brief);
  if (!valid) {
    throw new Error(`refusing to apply an invalid brief payload:\n  ${errors.join('\n  ')}`);
  }

  // A dry run must leave the filesystem exactly as it found it, so on that path the state
  // is migrated in memory only.
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

  const files = [
    [BRIEF_FILE, `${JSON.stringify(brief, null, 2)}\n`],
    ['brief.md', renderBrief(brief)],
    ['project.md', renderProject(brief)],
  ];
  const artifacts = files.map(([name]) => rel(name));
  if (dryRun) return { artifacts, backedUp: [], wouldOverwrite: await existingPaths(root, artifacts) };

  const dir = path.join(root, KOUD_DIR);
  await mkdir(dir, { recursive: true });

  // One backup set for the whole run, so a re-run of :brief leaves one coherent,
  // co-timestamped copy of what it replaced.
  const set = openBackupSet(root, stampOverride ?? timestamp());
  const backedUp = [];
  for (const [name] of files) {
    const saved = await set.backup(rel(name));
    if (saved !== null) backedUp.push(rel(name));
  }

  for (const [name, body] of files) {
    await writeFile(path.join(dir, name), body, 'utf8');
  }

  // A re-run must not move the project's start date: progress stamps measure from it.
  const digest = buildBriefDigest(brief, { now });
  await writeState(root, {
    ...state,
    brief: { ...digest, started_at: state.brief?.started_at ?? digest.started_at },
    project: { ...state.project, name: brief.identity.name },
    phases: {
      ...state.phases,
      // The approval gate is at the phase exit: the brief exists and now waits on a human.
      brief: { ...state.phases.brief, status: 'awaiting_approval', artifacts },
    },
  });

  return { artifacts, backedUp, backupStamp: set.stamp };
}
