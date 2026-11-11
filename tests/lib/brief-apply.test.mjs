import test from 'node:test';
import assert from 'node:assert/strict';
import { readFile, readdir, writeFile } from 'node:fs/promises';
import path from 'node:path';
import { withTmpDir } from '../helpers/tmp.mjs';
import { createDefaultState } from '../../scripts/lib/schema.mjs';
import { readState, writeState } from '../../scripts/lib/state.mjs';
import { resolveNext } from '../../scripts/lib/resolve-next.mjs';
import {
  applyBrief, buildBriefDigest, renderBrief, renderProject, quoteBlock, techLabel, diffBrief,
} from '../../scripts/lib/brief-apply.mjs';

const golden = async () => JSON.parse(
  await readFile(new URL('../fixtures/h0-brief.json', import.meta.url), 'utf8'),
);
const init = (root) => writeState(root, createDefaultState({ pluginVersion: '0.1.0' }));

test('applyBrief writes three artifacts and gates the phase', async () => {
  await withTmpDir(async (root) => {
    await init(root);
    const { artifacts, backedUp } = await applyBrief(root, await golden());
    assert.deepEqual(artifacts, ['.koud/brief.json', '.koud/brief.md', '.koud/project.md']);
    assert.deepEqual(backedUp, []);
    for (const a of artifacts) await readFile(path.join(root, a), 'utf8');

    const state = await readState(root);
    assert.equal(state.phases.brief.status, 'awaiting_approval');
    assert.deepEqual(state.phases.brief.artifacts, artifacts);
    assert.equal(state.project.name, 'Care Circle');
  });
});

test('applyBrief is the one phase that runs on a project with no name yet', async () => {
  await withTmpDir(async (root) => {
    await init(root);
    assert.equal((await readState(root)).project, null);
    await applyBrief(root, await golden());
    assert.equal((await readState(root)).project.name, 'Care Circle');
  });
});

test('the state digest carries what later phases and the hook need', async () => {
  await withTmpDir(async (root) => {
    await init(root);
    await applyBrief(root, await golden(), { now: new Date('2026-11-11T09:00:00Z') });
    const { brief } = await readState(root);
    assert.equal(brief.name, 'Care Circle');
    assert.equal(brief.track, 'new');
    assert.equal(brief.deadline, '2027-01-15T17:00:00+01:00');
    assert.deepEqual(brief.criteria_ids, ['technical-implementation', 'design', 'impact', 'originality']);
    assert.deepEqual(brief.tech.required, [
      'AWS Database (Aurora PostgreSQL | Aurora DSQL | DynamoDB)', 'Vercel or v0.app deployment',
    ]);
    assert.deepEqual(brief.tech.preferred, ['v0']);
    assert.equal(brief.brief_ref, '.koud/brief.json');
    assert.equal(brief.started_at, '2026-11-11T09:00:00.000Z');
  });
});

test('a brief with no hard date leaves the deadline null', async () => {
  const brief = await golden();
  brief.dates = [{ label: 'Design review', at: '2026-12-01T10:00:00+01:00', kind: 'milestone' }];
  assert.equal(buildBriefDigest(brief).deadline, null);
  delete brief.dates;
  assert.equal(buildBriefDigest(brief).deadline, null);
});

test('criteria ids in the digest follow rank, not listing order', async () => {
  const brief = await golden();
  brief.criteria.items.reverse();
  assert.deepEqual(buildBriefDigest(brief).criteria_ids,
    ['technical-implementation', 'design', 'impact', 'originality']);
});

test('an invalid payload is refused before anything is written', async () => {
  await withTmpDir(async (root) => {
    await init(root);
    const brief = await golden();
    brief.criteria.items[0].statement = '';
    await assert.rejects(() => applyBrief(root, brief), /refusing to apply an invalid brief payload/);
    assert.deepEqual(await readdir(path.join(root, '.koud')), ['state.json']);
    assert.equal((await readState(root)).phases.brief.status, 'not_started');
  });
});

test('applyBrief refuses to run when there is no state', async () => {
  await withTmpDir(async (root) => {
    await assert.rejects(async () => applyBrief(root, await golden()), /run \/koud:init first/);
  });
});

test('a dry run names what it would write and overwrite, and touches nothing', async () => {
  await withTmpDir(async (root) => {
    await init(root);
    const before = await readFile(path.join(root, '.koud/state.json'), 'utf8');
    const first = await applyBrief(root, await golden(), { dryRun: true });
    assert.deepEqual(first.wouldOverwrite, []);
    assert.deepEqual(await readdir(path.join(root, '.koud')), ['state.json']);
    assert.equal(await readFile(path.join(root, '.koud/state.json'), 'utf8'), before);

    await applyBrief(root, await golden());
    const second = await applyBrief(root, await golden(), { dryRun: true });
    assert.deepEqual(second.wouldOverwrite, ['.koud/brief.json', '.koud/brief.md', '.koud/project.md']);
  });
});

test('a re-run backs up what it replaces, in one co-timestamped set', async () => {
  await withTmpDir(async (root) => {
    await init(root);
    await applyBrief(root, await golden());
    await writeFile(path.join(root, '.koud/brief.md'), 'hand-edited\n', 'utf8');

    const stamp = '2026-11-11T10-00-00Z';
    const { backedUp, backupStamp } = await applyBrief(root, await golden(), { stamp });
    assert.equal(backupStamp, stamp);
    assert.deepEqual(backedUp, ['.koud/brief.json', '.koud/brief.md', '.koud/project.md']);
    const saved = await readFile(path.join(root, '.koud/backups', stamp, '.koud/brief.md'), 'utf8');
    assert.equal(saved, 'hand-edited\n');
  });
});

test('a re-run keeps the project start date and does not un-approve later phases', async () => {
  await withTmpDir(async (root) => {
    await init(root);
    await applyBrief(root, await golden(), { now: new Date('2026-11-11T09:00:00Z') });
    const state = await readState(root);
    state.phases.brief.status = 'approved';
    state.phases.stack.status = 'approved';
    await writeState(root, state);

    await applyBrief(root, await golden(), { now: new Date('2026-12-01T09:00:00Z') });
    const after = await readState(root);
    assert.equal(after.brief.started_at, '2026-11-11T09:00:00.000Z');
    assert.equal(after.phases.brief.status, 'awaiting_approval', 'a changed brief is re-approved');
    assert.equal(after.phases.stack.status, 'approved');
  });
});

test('after :brief, :next waits on approval and then moves to :stack', async () => {
  await withTmpDir(async (root) => {
    await init(root);
    await applyBrief(root, await golden());
    assert.deepEqual(
      (({ outcome, phase }) => ({ outcome, phase }))(await resolveNext(root)),
      { outcome: 'awaiting_approval', phase: 'brief' },
    );
    const state = await readState(root);
    state.phases.brief.status = 'approved';
    await writeState(root, state);
    assert.deepEqual(
      (({ outcome, phase }) => ({ outcome, phase }))(await resolveNext(root)),
      { outcome: 'start', phase: 'stack' },
    );
  });
});

test('brief.md lists the criteria in rank order with their statements', async () => {
  const brief = await golden();
  brief.criteria.items.reverse();
  const md = renderBrief(brief);
  const order = ['technical-implementation', 'design', 'impact', 'originality'].map((id) => md.indexOf(`\`${id}\``));
  assert.ok(order.every((i) => i !== -1));
  assert.deepEqual([...order].sort((a, b) => a - b), order);
  assert.match(md, /cannot read another circle's record/);
});

test('brief.md says so plainly when no technology is imposed', async () => {
  const brief = await golden();
  brief.tech.required = [];
  assert.match(renderBrief(brief), /\*\*Required:\*\* nothing is imposed/);
});

test('brief.md names the track and what it means', async () => {
  const brief = await golden();
  assert.match(renderBrief(brief), /\*\*Track:\*\* `new` — this project starts from an idea/);
  brief.track = 'existing';
  assert.match(renderBrief(brief), /\*\*Track:\*\* `existing` — this project already has code/);
});

test('brief.md shows open questions only when there are some', async () => {
  const brief = await golden();
  assert.doesNotMatch(renderBrief(brief), /## Open questions/);
  brief.unresolved = ['Who hosts the database in production?'];
  assert.match(renderBrief(brief), /## Open questions\n[\s\S]*- Who hosts the database in production\?/);
});

test('project.md carries the one-liner, the audience and what is out of scope', async () => {
  const md = renderProject(await golden());
  assert.match(md, /^# Care Circle\n\n> One shared record/);
  assert.match(md, /\| Coordinating relative \|/);
  assert.match(md, /## Out of scope\n\n- Clinical decision support/);
});

test('free text from the payload cannot break out of its block', async () => {
  const brief = await golden();
  brief.identity.one_liner = 'A shared record.\n# Injected heading\n- injected item';
  const md = renderProject(brief);
  assert.match(md, /> A shared record\.\n> # Injected heading\n> - injected item/);
  assert.equal(quoteBlock('a\nb\n\n'), '> a\n> b');
});

test('a pipe in payload text does not add a table column', async () => {
  const brief = await golden();
  brief.audience[0].need = 'Either a | b';
  assert.match(renderProject(brief), /Either a \\\| b/);
});

test('techLabel prints the allowed options beside the name', () => {
  assert.equal(techLabel({ name: 'Managed PostgreSQL', one_of: ['Supabase', 'Neon'] }), 'Managed PostgreSQL (Supabase | Neon)');
  assert.equal(techLabel({ name: 'Vercel' }), 'Vercel');
  assert.equal(techLabel('Redis'), 'Redis');
});

test('tooling is rendered apart from core technology and kept out of the non-negotiable digest', async () => {
  const brief = await golden();
  brief.tech.required.push(
    { name: 'Jest', role: 'tooling', reason: 'already in the codebase: jest.config.ts' },
    { name: 'Tailwind', role: 'tooling', reason: 'already in the codebase: tailwind.config.ts' },
  );
  const md = renderBrief(brief);
  const required = md.slice(md.indexOf('**Required**'), md.indexOf('**Tooling in place**'));
  assert.match(required, /AWS Database/);
  assert.doesNotMatch(required, /Jest/);
  assert.match(md.slice(md.indexOf('**Tooling in place**')), /\| Jest \| already in the codebase: jest\.config\.ts \|/);

  const digest = buildBriefDigest(brief);
  assert.deepEqual(digest.tech.tooling, ['Jest', 'Tailwind']);
  assert.ok(!digest.tech.required.includes('Jest'));
});

test('a brief whose every required entry is tooling says nothing is imposed', async () => {
  const brief = await golden();
  brief.tech.required = [{ name: 'ESLint', role: 'tooling', reason: 'already in the codebase' }];
  const md = renderBrief(brief);
  assert.match(md, /\*\*Required:\*\* nothing is imposed/);
  assert.match(md, /\*\*Tooling in place\*\*/);
});

test('an outcome criterion is marked as checked after release, with the explanation', async () => {
  const brief = await golden();
  assert.doesNotMatch(renderBrief(brief), /after release/);
  brief.criteria.items[2].kind = 'outcome';
  const md = renderBrief(brief);
  assert.match(md, /\| 3 \| `impact` \|.*\| after release \|/);
  assert.match(md, /\| 1 \| `technical-implementation` \|.*\| before release \|/);
  assert.match(md, /only real use can confirm it/);
});

test('scope is rendered under the track and carried into the digest', async () => {
  const brief = await golden();
  assert.doesNotMatch(renderBrief(brief), /\*\*Scope:\*\*/);
  assert.equal(buildBriefDigest(brief).scope, null);
  brief.scope = 'The whole product at its current stage.';
  assert.match(renderBrief(brief), /\*\*Scope:\*\* The whole product at its current stage\./);
  assert.equal(buildBriefDigest(brief).scope, 'The whole product at its current stage.');
});

// --- diffBrief ---------------------------------------------------------------------------

test('diffBrief is empty for the same brief and names each changed section one level down', async () => {
  const a = await golden();
  assert.deepEqual(diffBrief(a, await golden()), []);

  const b = await golden();
  b.identity.one_liner = 'Something else.';
  b.criteria.items = b.criteria.items.slice(0, 1);
  b.extra = { note: 'x' };
  delete b.audience;
  const lines = diffBrief(a, b);
  assert.ok(lines.includes('~ identity.one_liner changed'), lines.join('\n'));
  assert.ok(lines.some((l) => /^~ criteria\.items changed \(\d+ -> 1 entry\)$/.test(l)), lines.join('\n'));
  assert.ok(lines.includes('+ extra added'));
  assert.ok(lines.includes('- audience removed'));
});

test('diffBrief tolerates a missing or malformed previous brief', async () => {
  const b = await golden();
  for (const before of [null, undefined, 'x', []]) {
    assert.ok(diffBrief(before, b).every((l) => l.startsWith('+ ')));
  }
});

test('the first backup adds backups/ to .koud/.gitignore once, keeping what is already there', async () => {
  await withTmpDir(async (root) => {
    await init(root);
    await writeFile(path.join(root, '.koud', '.gitignore'), 'scratch/', 'utf8');
    await applyBrief(root, await golden());
    const changed = await golden();
    changed.identity.one_liner = 'Another line.';
    await applyBrief(root, changed);
    await applyBrief(root, await golden());
    const ignore = await readFile(path.join(root, '.koud', '.gitignore'), 'utf8');
    assert.equal(ignore, 'scratch/\nbackups/\n');
    const sets = await readdir(path.join(root, '.koud', 'backups'));
    assert.ok(sets.length >= 1 && !sets.includes('.gitignore'), 'the backups directory holds backup sets only');
  });
});
