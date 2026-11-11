import test from 'node:test';
import assert from 'node:assert/strict';
import { computeSpentHours } from '../../scripts/lib/progress-stamp.mjs';
import { createDefaultState } from '../../scripts/lib/schema.mjs';

test('computes elapsed hours since brief.started_at', () => {
  const state = { ...createDefaultState({ pluginVersion: '0.1.0' }), brief: { name: 'x', started_at: '2026-08-30T00:00:00Z' } };
  const result = computeSpentHours(state, { now: new Date('2026-08-30T05:30:00Z'), sha: 'abc1234' });
  assert.equal(result.spent_hours, 5.5);
  assert.deepEqual(result.last_commit, { at: '2026-08-30T05:30:00.000Z', sha: 'abc1234' });
});

test('leaves spent_hours unchanged when started_at is not set', () => {
  const state = createDefaultState({ pluginVersion: '0.1.0' });
  state.budget.spent_hours = 3;
  const result = computeSpentHours(state, { now: new Date(), sha: 'abc1234' });
  assert.equal(result.spent_hours, 3);
});

test('spent_hours is rounded to two decimals', () => {
  const state = { ...createDefaultState({ pluginVersion: '0.3.0' }), brief: { name: 'x', started_at: '2026-11-11T00:18:52.807Z' } };
  const { spent_hours } = computeSpentHours(state, { now: new Date('2026-11-11T01:26:39.112Z'), sha: 'b6918c9' });
  assert.equal(spent_hours, 1.13);
});
