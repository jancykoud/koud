import test from 'node:test';
import assert from 'node:assert/strict';
import { PHASES } from '../../scripts/lib/paths.mjs';
import {
  CURRENT_SCHEMA_VERSION, PHASE_STATUSES, createDefaultState, validateState,
} from '../../scripts/lib/schema.mjs';

test('phase order matches the spec exactly', () => {
  assert.deepEqual(PHASES, [
    'brief', 'stack', 'architect', 'requirements', 'spec', 'build', 'ship', 'review',
  ]);
});

test('default state has every phase at not_started', () => {
  const s = createDefaultState({ pluginVersion: '0.1.0' });
  assert.equal(s.schema_version, CURRENT_SCHEMA_VERSION);
  assert.equal(s.plugin_version, '0.1.0');
  assert.equal(s.mode, 'solo');
  for (const p of PHASES) assert.equal(s.phases[p].status, 'not_started', p);
});

test('validateState accepts a default state', () => {
  const { valid, errors } = validateState(createDefaultState({ pluginVersion: '0.1.0' }));
  assert.equal(valid, true, errors.join('; '));
});

test('validateState rejects an unknown phase status', () => {
  const s = createDefaultState({ pluginVersion: '0.1.0' });
  s.phases.brief.status = 'done';
  const { valid, errors } = validateState(s);
  assert.equal(valid, false);
  assert.match(errors.join(' '), /brief/);
});

test('validateState rejects an unknown phase name', () => {
  const s = createDefaultState({ pluginVersion: '0.1.0' });
  s.phases.deploy = { status: 'approved' };
  const { valid } = validateState(s);
  assert.equal(valid, false);
});

test('validateState rejects a future schema version', () => {
  const s = createDefaultState({ pluginVersion: '0.1.0' });
  s.schema_version = CURRENT_SCHEMA_VERSION + 1;
  const { valid, errors } = validateState(s);
  assert.equal(valid, false);
  assert.match(errors.join(' '), /schema_version/);
});

test('PHASE_STATUSES is the exact set from the spec', () => {
  assert.deepEqual(PHASE_STATUSES,
    ['not_started', 'in_progress', 'awaiting_approval', 'approved', 'skipped']);
});

// Regression: a hand-edited state.json with `"artifacts": "docs/architecture.md"` (a
// string, not an array) used to pass validation as {valid: true}. resolve-next.mjs's
// `for (const rel of artifacts)` then iterated the string's characters instead of
// throwing or being rejected earlier — producing nonsense drift reports, or crashing
// outright for other malformed shapes. Every phase.artifacts must be an array of strings.
test('validateState rejects a phase whose artifacts is a string instead of an array', () => {
  const s = createDefaultState({ pluginVersion: '0.1.0' });
  s.phases.brief.status = 'approved';
  s.phases.brief.artifacts = 'docs/architecture.md';
  const { valid, errors } = validateState(s);
  assert.equal(valid, false);
  assert.match(errors.join(' '), /brief/);
  assert.match(errors.join(' '), /artifacts/);
});

test('validateState rejects a phase whose artifacts is null', () => {
  const s = createDefaultState({ pluginVersion: '0.1.0' });
  s.phases.brief.status = 'approved';
  s.phases.brief.artifacts = null;
  const { valid, errors } = validateState(s);
  assert.equal(valid, false);
  assert.match(errors.join(' '), /brief/);
  assert.match(errors.join(' '), /artifacts/);
});

test('validateState rejects a phase whose artifacts array contains a non-string', () => {
  const s = createDefaultState({ pluginVersion: '0.1.0' });
  s.phases.brief.status = 'approved';
  s.phases.brief.artifacts = ['fine.md', 42];
  const { valid, errors } = validateState(s);
  assert.equal(valid, false);
  assert.match(errors.join(' '), /artifacts/);
});

test('validateState accepts a phase with a proper artifacts array', () => {
  const s = createDefaultState({ pluginVersion: '0.1.0' });
  s.phases.brief.status = 'approved';
  s.phases.brief.artifacts = ['docs/architecture.md', 'docs/brief.md'];
  const { valid, errors } = validateState(s);
  assert.equal(valid, true, errors.join('; '));
});

test('a null project is still valid — :brief has not run yet', () => {
  const s = createDefaultState({ pluginVersion: '0.1.0' });
  assert.equal(validateState(s).valid, true);
});

test('project.stack must use a known repo shape', () => {
  const s = createDefaultState({ pluginVersion: '0.1.0' });
  s.project = { name: 'Kintwadi', stack: { repo_shape: 'microservices' } };
  const { valid, errors } = validateState(s);
  assert.equal(valid, false);
  assert.ok(errors.some((e) => /repo_shape/.test(e)), errors.join('; '));
});

test('compliance.required_tech_verified must be a boolean map', () => {
  const state = createDefaultState({ pluginVersion: '0.1.0' });
  state.compliance = { required_tech_verified: { 'aws-bedrock': 'yes' } };
  const { valid, errors } = validateState(state);
  assert.equal(valid, false);
  assert.ok(errors.some((e) => /required_tech_verified.*must be a boolean/.test(e)));
});

test('compliance.forbidden_tech_found must be an array of strings', () => {
  const state = createDefaultState({ pluginVersion: '0.1.0' });
  state.compliance = { forbidden_tech_found: 'DynamoDB' };
  const { valid, errors } = validateState(state);
  assert.equal(valid, false);
  assert.ok(errors.some((e) => /forbidden_tech_found must be an array/.test(e)));
});

test('budget.last_commit needs sha and an offset-qualified at', () => {
  const state = createDefaultState({ pluginVersion: '0.1.0' });
  state.budget = { ...state.budget, last_commit: { sha: '', at: 'not-a-date' } };
  const { valid, errors } = validateState(state);
  assert.equal(valid, false);
  assert.ok(errors.some((e) => /last_commit.sha must be a non-empty string/.test(e)));
  assert.ok(errors.some((e) => /last_commit.at must be ISO 8601/.test(e)));
});

test('project.deploy.primary_url and .ref must be non-empty strings when present', () => {
  const state = createDefaultState({ pluginVersion: '0.1.0' });
  state.project = { name: 'x', deploy: { primary_url: '', ref: null } };
  const { valid, errors } = validateState(state);
  assert.equal(valid, false);
  assert.ok(errors.some((e) => /project.deploy.primary_url must be a non-empty string or null/.test(e)));
});

test('project.review.clean must be a boolean or null; .ref a non-empty string or null', () => {
  const state = createDefaultState({ pluginVersion: '0.1.0' });
  state.project = { name: 'x', review: { clean: 'yes', ref: null } };
  const { valid, errors } = validateState(state);
  assert.equal(valid, false);
  assert.ok(errors.some((e) => /project\.review\.clean must be a boolean or null/.test(e)));
});

test('project.review.ref rejects an empty string', () => {
  const state = createDefaultState({ pluginVersion: '0.1.0' });
  state.project = { name: 'x', review: { clean: true, ref: '' } };
  const { valid, errors } = validateState(state);
  assert.equal(valid, false);
  assert.ok(errors.some((e) => /project\.review\.ref must be a non-empty string or null/.test(e)));
});

test('the first koud state shape is schema version 1', () => {
  assert.equal(CURRENT_SCHEMA_VERSION, 1);
});

test('a default state has no brief and no project yet', () => {
  const s = createDefaultState({ pluginVersion: '0.1.0' });
  assert.equal(s.brief, null);
  assert.equal(s.project, null);
});

test('validateState accepts a fully populated brief digest', () => {
  const s = createDefaultState({ pluginVersion: '0.1.0' });
  s.brief = {
    name: 'Care Circle', track: 'new', deadline: '2027-01-15T17:00:00+01:00',
    tech: { required: ['AWS Database'], preferred: [], forbidden: [] },
    criteria_ids: ['technical-implementation', 'design'],
    brief_ref: '.koud/brief.json', started_at: '2026-11-11T09:00:00.000Z',
  };
  const { valid, errors } = validateState(s);
  assert.equal(valid, true, errors.join('; '));
});

test('validateState rejects a brief digest with no name', () => {
  const s = createDefaultState({ pluginVersion: '0.1.0' });
  s.brief = { name: '  ' };
  assert.ok(validateState(s).errors.some((e) => /brief\.name/.test(e)));
});

test('validateState rejects an unknown track', () => {
  const s = createDefaultState({ pluginVersion: '0.1.0' });
  s.brief = { name: 'X', track: 'greenfield' };
  assert.ok(validateState(s).errors.some((e) => /brief\.track/.test(e)));
});

test('a brief deadline is null or carries an explicit UTC offset', () => {
  const s = createDefaultState({ pluginVersion: '0.1.0' });
  s.brief = { name: 'X', deadline: null };
  assert.equal(validateState(s).valid, true);
  s.brief = { name: 'X', deadline: '2027-01-15T17:00:00' };
  assert.ok(validateState(s).errors.some((e) => /brief\.deadline/.test(e)));
});

test('a non-null project must carry a name', () => {
  const s = createDefaultState({ pluginVersion: '0.1.0' });
  s.project = { stack: null };
  assert.ok(validateState(s).errors.some((e) => /project\.name/.test(e)));
});
