import test from 'node:test';
import assert from 'node:assert/strict';
import { readFile } from 'node:fs/promises';
import {
  validateBrief, BRIEF_SCHEMA_VERSION, DATE_KINDS, TRACKS, ONE_LINER_MAX,
  TECH_ROLES, CRITERION_KINDS, isCoreTech, isOutcomeCriterion,
} from '../../scripts/lib/brief-schema.mjs';

const golden = async () => JSON.parse(
  await readFile(new URL('../fixtures/h0-brief.json', import.meta.url), 'utf8'),
);
const errorsOf = (brief) => validateBrief(brief).errors;
const has = (errors, re) => errors.some((e) => re.test(e));

test('the golden fixture validates with no errors and no warnings', async () => {
  const { valid, errors, warnings } = validateBrief(await golden());
  assert.equal(valid, true, errors.join('; '));
  assert.deepEqual(warnings, []);
});

test('the vocabularies are exactly as specified', () => {
  assert.equal(BRIEF_SCHEMA_VERSION, 1);
  assert.deepEqual(TRACKS, ['new', 'existing']);
  assert.deepEqual(DATE_KINDS, ['hard', 'milestone']);
  assert.deepEqual(TECH_ROLES, ['core', 'tooling']);
  assert.deepEqual(CRITERION_KINDS, ['system', 'outcome']);
});

test('a non-object payload is rejected without throwing', () => {
  for (const bad of [null, undefined, 'brief', 42, []]) {
    const { valid, errors } = validateBrief(bad);
    assert.equal(valid, false);
    assert.deepEqual(errors, ['brief must be an object']);
  }
});

test('every problem is reported at once, not one per run', async () => {
  const brief = await golden();
  brief.track = 'greenfield';
  brief.identity.name = '';
  brief.problem = ' ';
  brief.goals = [];
  const errors = errorsOf(brief);
  assert.ok(has(errors, /^track must be one of/));
  assert.ok(has(errors, /identity\.name/));
  assert.ok(has(errors, /^problem must be/));
  assert.ok(has(errors, /^goals must contain at least one entry/));
  assert.equal(errors.length, 4);
});

test('an unsupported schema version is an error', async () => {
  const brief = await golden();
  brief.schema_version = 2;
  assert.ok(has(errorsOf(brief), /schema_version 2 != supported 1/));
});

test('an unknown top-level key is kept and warned about, not rejected', async () => {
  const brief = await golden();
  brief.mood = 'optimistic';
  const { valid, warnings } = validateBrief(brief);
  assert.equal(valid, true);
  assert.ok(warnings.some((w) => /unknown top-level key "mood"/.test(w)));
});

test('the one-liner is required, and warned about when it stops being one line', async () => {
  const brief = await golden();
  brief.identity.one_liner = 'x'.repeat(ONE_LINER_MAX + 1);
  const long = validateBrief(brief);
  assert.equal(long.valid, true);
  assert.ok(long.warnings.some((w) => /one_liner is \d+ characters/.test(w)));
  delete brief.identity.one_liner;
  assert.ok(has(errorsOf(brief), /identity\.one_liner/));
});

test('an audience entry needs a name and a need', async () => {
  const brief = await golden();
  brief.audience = [{ name: 'Admin' }];
  assert.ok(has(errorsOf(brief), /audience\[0\] \(Admin\)\.need/));
  brief.audience = [];
  assert.ok(has(errorsOf(brief), /audience must be a non-empty array/));
});

test('non_goals may be empty but not missing, and an empty list is warned about', async () => {
  const brief = await golden();
  brief.non_goals = [];
  const empty = validateBrief(brief);
  assert.equal(empty.valid, true);
  assert.ok(empty.warnings.some((w) => /non_goals is empty/.test(w)));
  delete brief.non_goals;
  assert.ok(has(errorsOf(brief), /non_goals must be an array \(empty is allowed; missing is not\)/));
});

test('a success criterion needs a slug id, a name and a checkable statement', async () => {
  const brief = await golden();
  brief.criteria.items[0].id = 'Technical Implementation';
  brief.criteria.items[1].statement = '';
  delete brief.criteria.items[2].name;
  const errors = errorsOf(brief);
  assert.ok(has(errors, /criteria\.items\[0\].*lowercase slug/));
  assert.ok(has(errors, /criteria\.items\[1\] \(design\)\.statement/));
  assert.ok(has(errors, /criteria\.items\[2\] \(impact\)\.name/));
});

test('criterion ids are unique and ranks are contiguous from 1', async () => {
  const brief = await golden();
  brief.criteria.items[1].id = brief.criteria.items[0].id;
  brief.criteria.items[3].rank = 7;
  const errors = errorsOf(brief);
  assert.ok(has(errors, /duplicate id "technical-implementation"/));
  assert.ok(has(errors, /ranks must be contiguous 1\.\.4, got 1, 2, 3, 7/));
});

test('a brief with no success criteria is rejected', async () => {
  const brief = await golden();
  brief.criteria.items = [];
  assert.ok(has(errorsOf(brief), /at least one success criterion/));
  delete brief.criteria;
  assert.ok(has(errorsOf(brief), /^criteria missing$/));
});

test('tech.required may be empty but not missing', async () => {
  const brief = await golden();
  brief.tech.required = [];
  assert.equal(validateBrief(brief).valid, true);
  delete brief.tech.required;
  assert.ok(has(errorsOf(brief), /tech\.required must be an array \(empty is allowed; missing is not\)/));
});

test('every required technology carries a reason', async () => {
  const brief = await golden();
  delete brief.tech.required[1].reason;
  assert.ok(has(errorsOf(brief), /tech\.required\[1\]\.reason/));
});

test('a tech entry is an object with a name, and one_of is a non-empty string list', async () => {
  const brief = await golden();
  brief.tech.forbidden = ['Firebase'];
  brief.tech.preferred = [{ name: '' }];
  brief.tech.required[0].one_of = [];
  const errors = errorsOf(brief);
  assert.ok(has(errors, /tech\.forbidden\[0\] must be an object with a name/));
  assert.ok(has(errors, /tech\.preferred\[0\]\.name/));
  assert.ok(has(errors, /tech\.required\[0\]\.one_of/));
});

test('dates are optional, but each one needs a label, an offset and a known kind', async () => {
  const brief = await golden();
  delete brief.dates;
  assert.equal(validateBrief(brief).valid, true);
  brief.dates = [{ label: '', at: '2027-01-15T17:00:00', kind: 'soon' }];
  const errors = errorsOf(brief);
  assert.ok(has(errors, /dates\[0\]\.label/));
  assert.ok(has(errors, /explicit UTC offset, got "2027-01-15T17:00:00"/));
  assert.ok(has(errors, /kind must be one of hard, milestone/));
});

test('at most one date is the hard deadline', async () => {
  const brief = await golden();
  brief.dates.push({ label: 'Second deadline', at: '2027-02-01T17:00:00+01:00', kind: 'hard' });
  assert.ok(has(errorsOf(brief), /at most one "hard" date.*found 2/));
  brief.dates[1].kind = 'milestone';
  assert.equal(validateBrief(brief).valid, true);
});

test('open questions are allowed, counted and warned about', async () => {
  const brief = await golden();
  brief.unresolved = ['Who hosts the database in production?', 'Is offline use required?'];
  const { valid, warnings } = validateBrief(brief);
  assert.equal(valid, true);
  assert.ok(warnings.some((w) => /^2 open question\(s\) in unresolved/.test(w)));
});

test('constraints are optional and type-checked when present', async () => {
  const brief = await golden();
  brief.constraints = { hosting: '', compliance: 'GDPR' };
  const errors = errorsOf(brief);
  assert.ok(has(errors, /constraints\.hosting/));
  assert.ok(has(errors, /constraints\.compliance must be an array/));
  delete brief.constraints;
  assert.equal(validateBrief(brief).valid, true);
});

test('scope is optional, and a non-empty string when present', async () => {
  const brief = await golden();
  brief.scope = 'The whole product at its current stage.';
  assert.equal(validateBrief(brief).valid, true);
  brief.scope = '   ';
  assert.ok(has(errorsOf(brief), /^scope must be a non-empty string when present$/));
});

test('a technology role is core or tooling, and defaults to core', async () => {
  const brief = await golden();
  brief.tech.required[0].role = 'tooling';
  assert.equal(validateBrief(brief).valid, true);
  brief.tech.required[0].role = 'nice-to-have';
  assert.ok(has(errorsOf(brief), /tech\.required\[0\]\.role must be one of core, tooling/));
  assert.equal(isCoreTech({ name: 'PostgreSQL' }), true, 'no role means core: the stricter reading');
  assert.equal(isCoreTech({ name: 'PostgreSQL', role: 'core' }), true);
  assert.equal(isCoreTech({ name: 'Jest', role: 'tooling' }), false);
});

test('a criterion kind is system or outcome, and defaults to system', async () => {
  const brief = await golden();
  brief.criteria.items[0].kind = 'outcome';
  assert.equal(validateBrief(brief).valid, true);
  brief.criteria.items[0].kind = 'business';
  assert.ok(has(errorsOf(brief), /criteria\.items\[0\].*kind must be one of system, outcome/));
  assert.equal(isOutcomeCriterion({ id: 'x' }), false);
  assert.equal(isOutcomeCriterion({ id: 'x', kind: 'outcome' }), true);
});
