import test from 'node:test';
import assert from 'node:assert/strict';
import { readFile } from 'node:fs/promises';
import path from 'node:path';
import { createDefaultState } from '../scripts/lib/schema.mjs';
import { writeState } from '../scripts/lib/state.mjs';
import { applyRequirements } from '../scripts/lib/requirements-apply.mjs';
import { resolveNext } from '../scripts/lib/resolve-next.mjs';
import { withTmpDir } from './helpers/tmp.mjs';
import { scaffoldStage2Project } from './helpers/scaffold.mjs';

const fx = async (n) => JSON.parse(await readFile(new URL(`fixtures/${n}`, import.meta.url), 'utf8'));

// `body.includes('FR-1.1')` alone is fooled by the scenario id `FR-1.1-S1`, which every
// surface also prints and which carries the FR id as a mere prefix — that would pass even
// if a surface silently stopped rendering the FR id itself. The negative lookahead refuses
// a match immediately followed by `-` or another digit, so only the FR id rendered on its
// own (as every real call site renders it — `**FR-1.1**`, `satisfies FR-1.1`) counts, and
// `FR-1.10` cannot be mistaken for a match on `FR-1.1`.
function carriesFrId(body, id) {
  const escaped = id.replace(/[.*+?^${}()|[\]\\]/g, '\\$&');
  return new RegExp(`${escaped}(?![-\\d])`).test(body);
}

test('with all four phases approved, :next resolves cleanly to :build with no drift', async () => {
  await withTmpDir(async (root) => {
    await scaffoldStage2Project(root);
    const next = await resolveNext(root);
    assert.equal(next.outcome, 'start');
    assert.equal(next.phase, 'build', 'spec ends exactly where build begins');
    assert.deepEqual(next.drift, []);
  });
});

test('one FR id travels intact into all three spec surfaces', async () => {
  await withTmpDir(async (root) => {
    await scaffoldStage2Project(root);
    const target = 'FR-1.1';
    const [frTable, gherkin, kiro] = await Promise.all([
      readFile(path.join(root, '.koud/requirements.md'), 'utf8'),
      readFile(path.join(root, 'features/shared-care-record.feature'), 'utf8'),
      readFile(path.join(root, '.koud/specs/0001-shared-care-record/requirements.md'), 'utf8'),
    ]);
    for (const [name, body] of [['FR table', frTable], ['gherkin', gherkin],
      ['kiro', kiro]]) {
      assert.ok(carriesFrId(body, target), `${target} did not reach the ${name} surface`);
    }
  });
});

test('a criterion with no feature stops the pipeline at :requirements', async () => {
  await withTmpDir(async (root) => {
    const s = createDefaultState({ pluginVersion: '0.1.0' });
    s.project = { name: 'K' };
    await writeState(root, s);
    const brief = await fx('h0-brief.json');
    const requirements = await fx('h0-requirements.json');
    const orphan = brief.criteria.items.at(-1).id;
    for (const f of requirements.features) {
      f.criterion_refs = f.criterion_refs.filter((c) => c !== orphan);
    }
    const architecture = await fx('h0-architecture.json');
    await assert.rejects(
      () => applyRequirements(root, requirements, { brief, architecture }),
      /refusing to apply/,
    );
  });
});
