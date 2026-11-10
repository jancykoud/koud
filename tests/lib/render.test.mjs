import test from 'node:test';
import assert from 'node:assert/strict';
import { createDefaultState } from '../../scripts/lib/schema.mjs';
import { renderStatusBoard, renderInitPlan, renderTable } from '../../scripts/lib/render.mjs';

test('board shows every phase with its status', () => {
  const state = createDefaultState({ pluginVersion: '0.1.0' });
  state.phases.brief.status = 'approved';
  const out = renderStatusBoard({
    state,
    resolution: { outcome: 'start', phase: 'stack', reason: 'next up', drift: [] },
    tools: [],
  });
  assert.match(out, /brief/);
  assert.match(out, /approved/);
  assert.match(out, /stack/);
});

test('board surfaces drift prominently', () => {
  const state = createDefaultState({ pluginVersion: '0.1.0' });
  const out = renderStatusBoard({
    state,
    resolution: {
      outcome: 'drift', phase: 'brief', reason: 'mismatch',
      drift: [{ phase: 'brief', missing: ['.koud/brief.md'] }],
    },
    tools: [],
  });
  assert.match(out, /DRIFT/i);
  assert.match(out, /brief\.md/);
});

test('board lists missing tools but not present ones', () => {
  const state = createDefaultState({ pluginVersion: '0.1.0' });
  const out = renderStatusBoard({
    state,
    resolution: { outcome: 'start', phase: 'brief', reason: '', drift: [] },
    tools: [
      { name: 'git', present: true, version: '2.4', needate: 'everything', blocking: true },
      { name: 'docker', present: false, version: null, needate: 'containers', blocking: false },
    ],
  });
  assert.match(out, /docker/);
  assert.ok(!/\bgit\b/.test(out.split('Missing tools')[1] ?? ''), 'present tools are not listed as missing');
});

test('init plan render marks which actions need consent', () => {
  const out = renderInitPlan({
    env: { mode: 'adopt', scenarios: ['B', 'E'], foreignAgentFiles: ['CLAUDE.md'] },
    actions: [
      { kind: 'create', path: '.koud/state.json', reason: 'phase state', needsConsent: false },
      { kind: 'update-block', path: 'CLAUDE.md', reason: 'pointer', needsConsent: true },
    ],
    warnings: ['worktree is dirty'],
  });
  assert.match(out, /adopt/);
  assert.match(out, /CLAUDE\.md/);
  assert.match(out, /needs your approval/i);
  assert.match(out, /worktree is dirty/);
});

test('init plan render says so when nothing needs consent', () => {
  const out = renderInitPlan({
    env: { mode: 'greenfield', scenarios: ['A', 'E'], foreignAgentFiles: [] },
    actions: [{ kind: 'mkdir', path: '.koud', reason: 'workshop', needsConsent: false }],
    warnings: [],
  });
  assert.match(out, /nothing pre-existing/i);
});

function baseState() {
  return createDefaultState({ pluginVersion: '0.1.0' });
}

function stateWithBrief() {
  const s = createDefaultState({ pluginVersion: '0.1.0' });
  s.brief = {
    name: 'Care Circle', track: 'existing',
    deadline: '2027-01-15T17:00:00+01:00',
    tech: { required: ['AWS Database'], preferred: [], forbidden: [] },
    criteria_ids: ['technical-implementation', 'design'],
    brief_ref: '.koud/brief.json',
  };
  return s;
}

const resolution = { outcome: 'start', phase: 'stack', drift: [], reason: 'Phase "stack" is next.' };

test('the board shows the track and the deadline once :brief has run', () => {
  const out = renderStatusBoard({ state: stateWithBrief(), resolution, tools: [] });
  assert.match(out, /Track: existing/);
  assert.match(out, /Deadline: 2027-01-15T17:00:00\+01:00/);
});

test('the board shows neither a track nor a deadline before :brief has run', () => {
  const out = renderStatusBoard({ state: baseState(), resolution, tools: [] });
  assert.doesNotMatch(out, /Track:/);
  assert.doesNotMatch(out, /Deadline:/);
});

test('the board falls back to the brief name when no project is set', () => {
  const state = stateWithBrief();
  const out = renderStatusBoard({ state, resolution, tools: [] });
  assert.match(out, /koud — Care Circle/);
});

test('renderTable emits a header, a separator and one row per entry', () => {
  const md = renderTable(['A', 'B'], [['1', '2'], ['3', '4']]);
  assert.deepEqual(md.split('\n'), ['| A | B |', '|---|---|', '| 1 | 2 |', '| 3 | 4 |']);
});

test('renderTable escapes pipes in cell content', () => {
  const md = renderTable(['A'], [['x | y']]);
  assert.ok(md.includes('x \\| y'), 'a raw pipe in a cell silently splits the column');
});

test('renderTable renders null and undefined cells as an em dash, not "undefined"', () => {
  assert.ok(renderTable(['A'], [[null]]).includes('| — |'));
  assert.ok(renderTable(['A'], [[undefined]]).includes('| — |'));
});

test('renderTable with no rows returns an empty string, not a headerless table', () => {
  assert.equal(renderTable(['A', 'B'], []), '');
});

test('the board summarises the stack once :stack has run', () => {
  const state = baseState();
  state.project = { name: 'Kintwadi',
    stack: { repo_shape: 'next-monolith', primary_database: 'Aurora PostgreSQL' } };
  const out = renderStatusBoard({ state, resolution: { outcome: 'start', phase: 'architect', drift: [] } });
  assert.match(out, /next-monolith/);
  assert.match(out, /Aurora PostgreSQL/);
});

// F24: spec §9 says :status renders stack and architecture summaries; only the stack one existed.
test('the board summarises the architecture once :architect has run', () => {
  const state = baseState();
  state.project = { name: 'Kintwadi', architecture_ref: '.koud/architecture.json' };
  const out = renderStatusBoard({ state, resolution: { outcome: 'start', phase: 'requirements', drift: [] } });
  assert.match(out, /Architecture/);
  assert.match(out, /docs\/architecture\.md/);
});

test('the board omits the architecture summary before :architect has run', () => {
  const state = baseState();
  state.project = { name: 'Kintwadi' };
  const out = renderStatusBoard({ state, resolution: { outcome: 'start', phase: 'architect', drift: [] } });
  assert.doesNotMatch(out, /Architecture:/);
});

test('unverified required tech is shown as outstanding, not hidden', () => {
  const state = baseState();
  state.compliance = { last_checked: null, required_tech_verified: { 'aws-database': false, 'vercel-deploy': true } };
  const out = renderStatusBoard({ state, resolution: { outcome: 'start', phase: 'architect', drift: [] } });
  assert.match(out, /aws-database/);
  assert.ok(!/vercel-deploy/.test(out.split('Required tech')[1] ?? ''),
    'verified items are not worth board space; unverified ones are');
});

test('renderStatusBoard lists forbidden tech found, when any', () => {
  const state = createDefaultState({ pluginVersion: '0.1.0' });
  state.compliance.forbidden_tech_found = ['DynamoDB'];
  const board = renderStatusBoard({ state, resolution: { outcome: 'complete', phase: null }, tools: [] });
  assert.match(board, /Forbidden technology found/);
  assert.match(board, /DynamoDB/);
});
