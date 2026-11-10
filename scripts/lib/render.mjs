import { PHASES } from './paths.mjs';

const SYMBOL = {
  approved: '[x]', in_progress: '[~]', awaiting_approval: '[!]',
  skipped: '[-]', not_started: '[ ]',
};

export function renderStatusBoard({ state, resolution, tools }) {
  const lines = [];
  const name = state.project?.name ?? state.brief?.name ?? '(unnamed project)';
  lines.push(`koud — ${name}`);

  if (resolution.outcome === 'drift') {
    lines.push('');
    lines.push('!! DRIFT — state disagrees with the filesystem:');
    for (const d of resolution.drift) {
      lines.push(`   ${d.phase}: missing ${d.missing.join(', ')}`);
    }
  }

  lines.push('');
  for (const p of PHASES) {
    const status = state.phases[p]?.status ?? 'not_started';
    const marker = p === resolution.phase ? ' <- next' : '';
    lines.push(`${SYMBOL[status] ?? '[ ]'} ${p.padEnd(13)} ${status}${marker}`);
  }

  if (state.brief?.track) {
    lines.push('');
    lines.push(`Track: ${state.brief.track}`);
  }

  if (state.brief?.deadline) {
    lines.push('');
    lines.push(`Deadline: ${state.brief.deadline}`);
  }

  const stack = state.project?.stack;
  if (stack?.repo_shape) {
    lines.push('');
    lines.push(`Stack: ${stack.repo_shape}${stack.primary_database ? ` · ${stack.primary_database}` : ''}`);
  }

  // state.json stores only the ref, not a copy of the payload — :architect writes no
  // summary object onto project the way :stack does — so presence of the ref is all the
  // board can report on without reading architecture.json off disk.
  if (state.project?.architecture_ref) {
    lines.push('');
    lines.push('Architecture: designed — see docs/architecture.md');
  }

  // Only the unverified ones. A board that lists everything verified is a board nobody reads.
  const verified = state.compliance?.required_tech_verified ?? {};
  const outstanding = Object.entries(verified).filter(([, ok]) => !ok).map(([id]) => id);
  if (outstanding.length > 0) {
    lines.push('');
    lines.push('Required tech not yet verified');
    for (const id of outstanding) lines.push(`  [ ] ${id}`);
  }

  const forbiddenFound = state.compliance?.forbidden_tech_found ?? [];
  if (forbiddenFound.length > 0) {
    lines.push('');
    lines.push('Forbidden technology found');
    for (const id of forbiddenFound) lines.push(`  ! ${id}`);
  }

  const missing = (tools ?? []).filter((t) => !t.present);
  if (missing.length > 0) {
    lines.push('');
    lines.push('Missing tools');
    for (const t of missing) {
      lines.push(`  ${t.name} — needed for ${t.needate}${t.blocking ? ' (blocking)' : ''}`);
    }
  }

  lines.push('');
  lines.push(resolution.reason);
  return lines.join('\n');
}

export function renderInitPlan(plan) {
  const lines = [];
  lines.push(`Init plan — mode: ${plan.env.mode} (scenarios: ${plan.env.scenarios.join(', ')})`);
  lines.push('');

  const free = plan.actions.filter((a) => !a.needsConsent);
  const gated = plan.actions.filter((a) => a.needsConsent);

  if (free.length > 0) {
    lines.push('Will be created (nothing pre-existing is touched):');
    for (const a of free) lines.push(`  ${a.kind.padEnd(13)} ${a.path} — ${a.reason}`);
  }
  if (gated.length > 0) {
    lines.push('');
    lines.push('Needs your approval (each is asked separately):');
    for (const a of gated) lines.push(`  ${a.kind.padEnd(13)} ${a.path} — ${a.reason}`);
  }
  if (plan.warnings.length > 0) {
    lines.push('');
    lines.push('Warnings:');
    for (const w of plan.warnings) lines.push(`  ${w}`);
  }
  return lines.join('\n');
}

/** A Markdown table. Empty rows render as nothing — a header with no data is noise. */
export function renderTable(headers, rows) {
  if (!Array.isArray(rows) || rows.length === 0) return '';
  const cell = (v) => (v === null || v === undefined ? '—' : String(v).replace(/\|/g, '\\|'));
  return [
    `| ${headers.join(' | ')} |`,
    `|${headers.map(() => '---').join('|')}|`,
    ...rows.map((r) => `| ${r.map(cell).join(' | ')} |`),
  ].join('\n');
}
