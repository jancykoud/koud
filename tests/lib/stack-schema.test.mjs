import test from 'node:test';
import assert from 'node:assert/strict';
import { readFile } from 'node:fs/promises';
import { validateStack, STACK_SCHEMA_VERSION, SOURCES, THESIS_SUPPORT, requirementKey }
  from '../../scripts/lib/stack-schema.mjs';

async function fixture(name) {
  return JSON.parse(await readFile(new URL(`../fixtures/${name}`, import.meta.url), 'utf8'));
}
const golden = () => fixture('h0-stack.json');
const brief = () => fixture('h0-brief.json');

test('the golden fixture validates against the real brief', async () => {
  const { valid, errors } = validateStack(await golden(), await brief());
  assert.deepEqual(errors, []);
  assert.equal(valid, true);
});

test('the vocabularies are exactly as specified', () => {
  assert.equal(STACK_SCHEMA_VERSION, 1);
  assert.deepEqual(SOURCES, ['required', 'default', 'preferred', 'replacement']);
  assert.deepEqual(THESIS_SUPPORT, ['carries', 'supports', 'neutral']);
});

test('never throws on malformed input', () => {
  for (const bad of [null, undefined, 'nope', 42, []]) {
    assert.doesNotThrow(() => validateStack(bad));
    assert.equal(validateStack(bad).valid, false);
  }
});

test('an uncovered required technology is an ERROR, not a warning', async () => {
  const s = await golden();
  s.slots = s.slots.filter((x) => x.id !== 'database');
  const { valid, errors, warnings } = validateStack(s, await brief());
  assert.equal(valid, false);
  assert.ok(errors.some((e) => /required tech/i.test(e) && /aws-database/.test(e)),
    `expected an error naming the uncovered mandate, got: ${errors.join('; ')}`);
  assert.equal(warnings.filter((w) => /aws-database/.test(w)).length, 0,
    'an uncovered mandate must not be downgraded to a warning — the brief requires it');
});

test('tooling recorded in the brief needs no stack slot; core technology still does', async () => {
  const r = await brief();
  r.tech.required.push({ name: 'Jest', role: 'tooling', reason: 'already in the codebase: jest.config.ts' });
  const covered = validateStack(await golden(), r);
  assert.equal(covered.valid, true, covered.errors.join('; '));

  r.tech.required.push({ name: 'Redis', role: 'core', reason: 'the job queue runs on it' });
  const uncovered = validateStack(await golden(), r);
  assert.equal(uncovered.valid, false);
  assert.ok(uncovered.errors.some((e) => /required tech "redis"/.test(e)), uncovered.errors.join('; '));
  assert.ok(!uncovered.errors.some((e) => /jest/i.test(e)), 'tooling must never be reported as uncovered');
});

test('choosing forbidden tech is an error', async () => {
  const r = await brief();
  r.tech.forbidden = ['DynamoDB'];
  const s = await golden();
  s.slots[0].choice = 'DynamoDB';
  const { valid, errors } = validateStack(s, r);
  assert.equal(valid, false);
  assert.ok(errors.some((e) => /forbidden/i.test(e)), errors.join('; '));
});

test('a required slot whose choice does not satisfy one_of is an error', async () => {
  const s = await golden();
  s.slots[0].choice = 'PostgreSQL on Render';
  const { valid, errors } = validateStack(s, await brief());
  assert.equal(valid, false);
  assert.ok(
    errors.some((e) => /does not satisfy required tech/i.test(e) && /Aurora PostgreSQL/.test(e)),
    errors.join('; '),
  );
});

test('the golden fixture\'s database choice satisfies required tech one_of', async () => {
  const { errors } = validateStack(await golden(), await brief());
  assert.ok(
    !errors.some((e) => /does not satisfy required tech/i.test(e)),
    `golden fixture's "Amazon Aurora PostgreSQL..." choice should satisfy one_of, got: ${errors.join('; ')}`,
  );
});

test('requirementKey is exported and derives the same key crossCheckBrief uses', async () => {
  const r = await brief();
  const dbRequirement = r.tech.required.find((req) => req.name === 'AWS Database');
  assert.equal(requirementKey(dbRequirement), 'aws-database');
});

test('a stack where nothing carries the thesis is an error', async () => {
  const s = await golden();
  for (const slot of s.slots) slot.thesis_support = 'supports';
  const { valid, errors } = validateStack(s, await brief());
  assert.equal(valid, false);
  assert.ok(errors.some((e) => /thesis/i.test(e)), errors.join('; '));
});

test('a required slot with no requirement_ref is an error', async () => {
  const s = await golden();
  delete s.slots[0].requirement_ref;
  const { valid, errors } = validateStack(s, await brief());
  assert.equal(valid, false);
  assert.ok(errors.some((e) => /requirement_ref/.test(e)), errors.join('; '));
});

test('an unknown repo shape is an error', async () => {
  const s = await golden();
  s.repo_shape = 'microservices';
  assert.equal(validateStack(s, await brief()).valid, false);
});

test('a slot with no rationale is an error', async () => {
  const s = await golden();
  s.slots[2].rationale = '   ';
  const { valid, errors } = validateStack(s, await brief());
  assert.equal(valid, false);
  assert.ok(errors.some((e) => /slots\[2\]\.rationale/.test(e)), errors.join('; '));
});

test('a bleeding-edge pin with no docs_path warns but does not fail', async () => {
  const s = await golden();
  delete s.bleeding_edge[0].docs_path;
  const { valid, warnings } = validateStack(s, await brief());
  assert.equal(valid, true);
  assert.ok(warnings.some((w) => /docs_path/.test(w)), warnings.join('; '));
});

test('with no brief, mandate checks are skipped and the reason is stated', async () => {
  const { valid, warnings } = validateStack(await golden());
  assert.equal(valid, true, 'absent brief must not fail an otherwise valid stack');
  assert.ok(warnings.some((w) => /no brief/i.test(w)), warnings.join('; '));
});

test('a malformed brief says so, rather than silently skipping', async () => {
  const { warnings } = validateStack(await golden(), { tech: 'not an object' });
  assert.ok(warnings.some((w) => /brief supplied but/i.test(w)), warnings.join('; '));
});

test('duplicate slot ids are an error', async () => {
  const s = await golden();
  s.slots.push({ ...s.slots[0] });
  assert.equal(validateStack(s, await brief()).valid, false);
});
