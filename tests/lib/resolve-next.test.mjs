import test from 'node:test';
import assert from 'node:assert/strict';
import { writeFile, mkdir } from 'node:fs/promises';
import path from 'node:path';
import { withTmpDir } from '../helpers/tmp.mjs';
import { writeState } from '../../scripts/lib/state.mjs';
import { createDefaultState } from '../../scripts/lib/schema.mjs';
import { resolveNext } from '../../scripts/lib/resolve-next.mjs';

async function seed(dir, mutate) {
  const s = createDefaultState({ pluginVersion: '0.1.0' });
  mutate?.(s);
  await writeState(dir, s);
  return s;
}

test('no state at all resolves to init', async () => {
  await withTmpDir(async (dir) => {
    const r = await resolveNext(dir);
    assert.equal(r.outcome, 'init');
  });
});

test('a fresh state starts the first phase', async () => {
  await withTmpDir(async (dir) => {
    await seed(dir);
    const r = await resolveNext(dir);
    assert.equal(r.outcome, 'start');
    assert.equal(r.phase, 'brief');
  });
});

test('an approved phase advances to the next one', async () => {
  await withTmpDir(async (dir) => {
    await seed(dir, (s) => { s.phases.brief.status = 'approved'; });
    const r = await resolveNext(dir);
    assert.equal(r.outcome, 'start');
    assert.equal(r.phase, 'stack');
  });
});

test('awaiting_approval blocks advancement', async () => {
  await withTmpDir(async (dir) => {
    await seed(dir, (s) => {
      s.phases.brief.status = 'approved';
      s.phases.stack.status = 'awaiting_approval';
    });
    const r = await resolveNext(dir);
    assert.equal(r.outcome, 'awaiting_approval');
    assert.equal(r.phase, 'stack');
  });
});

test('in_progress resumes rather than starting something new', async () => {
  await withTmpDir(async (dir) => {
    await seed(dir, (s) => {
      s.phases.brief.status = 'approved';
      s.phases.stack.status = 'in_progress';
      s.phases.stack.resume_note = 'two slots chosen, database pending';
    });
    const r = await resolveNext(dir);
    assert.equal(r.outcome, 'resume');
    assert.equal(r.phase, 'stack');
    assert.match(r.reason, /database pending/);
  });
});

test('missing artifacts from an approved phase are drift and stop everything', async () => {
  await withTmpDir(async (dir) => {
    await seed(dir, (s) => {
      s.phases.brief.status = 'approved';
      s.phases.brief.artifacts = ['.koud/brief.md'];
    });
    const r = await resolveNext(dir);
    assert.equal(r.outcome, 'drift');
    assert.deepEqual(r.drift, [{ phase: 'brief', missing: ['.koud/brief.md'] }]);
  });
});

test('drift outranks awaiting_approval', async () => {
  await withTmpDir(async (dir) => {
    await seed(dir, (s) => {
      s.phases.brief.status = 'approved';
      s.phases.brief.artifacts = ['.koud/brief.md'];
      s.phases.stack.status = 'awaiting_approval';
    });
    const r = await resolveNext(dir);
    assert.equal(r.outcome, 'drift');
  });
});

test('present artifacts produce no drift', async () => {
  await withTmpDir(async (dir) => {
    await mkdir(path.join(dir, '.koud'), { recursive: true });
    await writeFile(path.join(dir, '.koud', 'brief.md'), '# brief\n');
    await seed(dir, (s) => {
      s.phases.brief.status = 'approved';
      s.phases.brief.artifacts = ['.koud/brief.md'];
    });
    const r = await resolveNext(dir);
    assert.equal(r.outcome, 'start');
    assert.equal(r.phase, 'stack');
  });
});

test('skipped phases are stepped over', async () => {
  await withTmpDir(async (dir) => {
    await seed(dir, (s) => {
      s.phases.brief.status = 'approved';
      s.phases.stack.status = 'skipped';
    });
    const r = await resolveNext(dir);
    assert.equal(r.phase, 'architect');
  });
});

test('all phases resolved means complete', async () => {
  await withTmpDir(async (dir) => {
    await seed(dir, (s) => {
      for (const p of Object.keys(s.phases)) s.phases[p].status = 'approved';
    });
    const r = await resolveNext(dir);
    assert.equal(r.outcome, 'complete');
    assert.equal(r.phase, null);
  });
});
