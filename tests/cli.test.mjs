import test from 'node:test';
import assert from 'node:assert/strict';
import { execFile, spawn } from 'node:child_process';
import { promisify } from 'node:util';
import { fileURLToPath } from 'node:url';
import { readFile, access, copyFile, writeFile, mkdir, readdir, rm } from 'node:fs/promises';
import path from 'node:path';
import { withTmpDir } from './helpers/tmp.mjs';
import { readState, writeState } from '../scripts/lib/state.mjs';
import { mustHaveFeatures } from '../scripts/lib/build-apply.mjs';

const run = promisify(execFile);
const scripts = fileURLToPath(new URL('../scripts/', import.meta.url));
const fixture = fileURLToPath(new URL('./fixtures/h0-brief.json', import.meta.url));
const stackFixture = fileURLToPath(new URL('./fixtures/h0-stack.json', import.meta.url));
const architectureFixture = fileURLToPath(new URL('./fixtures/h0-architecture.json', import.meta.url));
const requirementsFixture = fileURLToPath(new URL('./fixtures/h0-requirements.json', import.meta.url));
const submissionFixture = fileURLToPath(new URL('./fixtures/h0-submission.json', import.meta.url));

test('init --dry-run writes nothing', async () => {
  await withTmpDir(async (dir) => {
    const { stdout } = await run('node', [path.join(scripts, 'init.mjs'), dir, '--dry-run']);
    assert.match(stdout, /\.koud/);
    await assert.rejects(() => access(path.join(dir, '.koud')), /ENOENT/);
  });
});

test('init --apply creates state, then status reports phase one', async () => {
  await withTmpDir(async (dir) => {
    await run('node', [path.join(scripts, 'init.mjs'), dir, '--apply']);
    const raw = await readFile(path.join(dir, '.koud', 'state.json'), 'utf8');
    assert.equal(JSON.parse(raw).schema_version, 1);

    const { stdout } = await run('node', [path.join(scripts, 'status.mjs'), dir]);
    assert.match(stdout, /brief/);
  });
});

test('next --json emits a machine-readable resolution', async () => {
  await withTmpDir(async (dir) => {
    await run('node', [path.join(scripts, 'init.mjs'), dir, '--apply']);
    const { stdout } = await run('node', [path.join(scripts, 'next.mjs'), dir, '--json']);
    const r = JSON.parse(stdout);
    assert.equal(r.outcome, 'start');
    assert.equal(r.phase, 'brief');
  });
});

test('next on a bare directory tells you to init', async () => {
  await withTmpDir(async (dir) => {
    const { stdout } = await run('node', [path.join(scripts, 'next.mjs'), dir, '--json']);
    assert.equal(JSON.parse(stdout).outcome, 'init');
  });
});

test('init --apply without consent leaves an existing CLAUDE.md untouched', async () => {
  await withTmpDir(async (dir) => {
    const original = '# mine\n';
    await import('node:fs/promises').then(({ writeFile }) =>
      writeFile(path.join(dir, 'CLAUDE.md'), original));
    await run('node', [path.join(scripts, 'init.mjs'), dir, '--apply']);
    assert.equal(await readFile(path.join(dir, 'CLAUDE.md'), 'utf8'), original);
  });
});

test('init --apply --consent applies the named file only', async () => {
  await withTmpDir(async (dir) => {
    await import('node:fs/promises').then(({ writeFile }) =>
      writeFile(path.join(dir, 'CLAUDE.md'), '# mine\n'));
    await run('node', [path.join(scripts, 'init.mjs'), dir, '--apply', '--consent', 'CLAUDE.md']);
    const after = await readFile(path.join(dir, 'CLAUDE.md'), 'utf8');
    assert.match(after, /BEGIN:koud/);
    assert.match(after, /# mine/);
  });
});

// Regression: git-init's consent token is the bare path "." (Action.path for the
// git-init action). `--consent "CLAUDE.md, ."` — a space after the comma, the most
// natural way to type a list — used to split into ['CLAUDE.md', ' .'] with no
// trimming, so ' .' never exact-matched the '.' the applier checks for and git-init
// was silently skipped despite looking approved.
test('init --apply --consent trims whitespace so a space-separated list still matches', async () => {
  await withTmpDir(async (dir) => {
    await import('node:fs/promises').then(({ writeFile }) =>
      writeFile(path.join(dir, 'CLAUDE.md'), '# mine\n'));
    const { stdout } = await run(
      'node', [path.join(scripts, 'init.mjs'), dir, '--apply', '--consent', 'CLAUDE.md, .'],
    );

    const after = await readFile(path.join(dir, 'CLAUDE.md'), 'utf8');
    assert.match(after, /BEGIN:koud/,
      'CLAUDE.md consent must still match despite no leading space in this entry');
    assert.equal(await access(path.join(dir, '.git')).then(() => true, () => false), true,
      'git-init consent (the "." entry, with a leading space from the list) must still match');
    assert.equal(stdout.includes('Skipped'), false,
      'nothing should be reported skipped once every listed action is consented');
  });
});

// Regression: the skipped-actions report used to print only the bare path (e.g. "- .",
// which does not say what "." refers to). It must name the action's kind too.
test('init --apply reports skipped actions with both kind and path', async () => {
  await withTmpDir(async (dir) => {
    await import('node:fs/promises').then(({ writeFile }) =>
      writeFile(path.join(dir, 'CLAUDE.md'), '# mine\n'));
    const { stdout } = await run('node', [path.join(scripts, 'init.mjs'), dir, '--apply']);

    assert.match(stdout, /-\s+update-block\s+CLAUDE\.md/,
      'a skipped file action must report its kind, not just its bare path');
    assert.match(stdout, /-\s+git-init\s+\./,
      'a skipped git-init must read as "git-init .", not the uninformative bare "."');
  });
});

test('brief.mjs validate exits 0 on the golden fixture', async () => {
  const { stdout } = await run('node', [path.join(scripts, 'brief.mjs'), 'validate', fixture]);
  assert.match(stdout, /valid/i);
});

test('brief.mjs validate exits non-zero and names every problem on a bad payload', async () => {
  await withTmpDir(async (dir) => {
    const bad = JSON.parse(await readFile(fixture, 'utf8'));
    bad.dates[0].at = 'January 15';
    bad.criteria.items[0].statement = '';
    delete bad.tech.required[0].reason;
    const p = path.join(dir, 'bad.json');
    await writeFile(p, JSON.stringify(bad), 'utf8');

    await assert.rejects(
      () => run('node', [path.join(scripts, 'brief.mjs'), 'validate', p]),
      (err) => {
        assert.equal(err.code, 1);
        assert.match(err.stderr, /offset/);
        assert.match(err.stderr, /statement/);
        assert.match(err.stderr, /reason/);
        assert.match(err.stderr, /3 problem\(s\)/, 'every problem is reported in one run');
        return true;
      },
    );
  });
});

test('brief.mjs validate --json emits a machine-readable result', async () => {
  const { stdout } = await run('node', [path.join(scripts, 'brief.mjs'), 'validate', fixture, '--json']);
  const parsed = JSON.parse(stdout);
  assert.equal(parsed.valid, true);
  assert.deepEqual(parsed.errors, []);
});

test('brief.mjs apply writes the artifacts end to end', async () => {
  await withTmpDir(async (dir) => {
    await mkdir(path.join(dir, '.koud'), { recursive: true });
    await copyFile(fixture, path.join(dir, '.koud/brief.json'));
    await run('node', [path.join(scripts, 'init.mjs'), dir, '--apply']);
    const { stdout } = await run('node', [path.join(scripts, 'brief.mjs'), 'apply', dir]);
    assert.match(stdout, /brief\.md/);
    assert.match(stdout, /project\.md/);
    assert.match(stdout, /awaiting_approval/);
    const state = JSON.parse(await readFile(path.join(dir, '.koud/state.json'), 'utf8'));
    assert.equal(state.phases.brief.status, 'awaiting_approval');
    assert.equal(state.project.name, 'Care Circle');
    assert.equal(state.brief.track, 'new');
    assert.ok(state.brief.deadline.endsWith('+01:00'));
    const project = await readFile(path.join(dir, '.koud/project.md'), 'utf8');
    assert.match(project, /^# Care Circle/);
  });
});

test('brief.mjs apply refuses to run when there is no state', async () => {
  await withTmpDir(async (dir) => {
    await mkdir(path.join(dir, '.koud'), { recursive: true });
    await copyFile(fixture, path.join(dir, '.koud/brief.json'));
    await assert.rejects(
      () => run('node', [path.join(scripts, 'brief.mjs'), 'apply', dir]),
      (err) => {
        assert.equal(err.code, 1);
        assert.match(err.stderr, /init/i);
        return true;
      },
    );
  });
});

test('brief.mjs apply --dry-run writes nothing and leaves the phase untouched', async () => {
  await withTmpDir(async (dir) => {
    await run('node', [path.join(scripts, 'init.mjs'), dir, '--apply']);
    const before = await readFile(path.join(dir, '.koud/state.json'), 'utf8');
    const { stdout } = await run('node', [path.join(scripts, 'brief.mjs'), 'apply', dir, '--brief', fixture, '--dry-run']);
    assert.match(stdout, /Dry run/);
    assert.equal(await readFile(path.join(dir, '.koud/state.json'), 'utf8'), before);
    await assert.rejects(() => readFile(path.join(dir, '.koud/brief.md'), 'utf8'), /ENOENT/);
  });
});

test('after :brief, next refuses to advance until the brief is approved', async () => {
  await withTmpDir(async (dir) => {
    await run('node', [path.join(scripts, 'init.mjs'), dir, '--apply']);
    await run('node', [path.join(scripts, 'brief.mjs'), 'apply', dir, '--brief', fixture]);
    const { stdout } = await run('node', [path.join(scripts, 'next.mjs'), dir, '--json']);
    const r = JSON.parse(stdout);
    assert.equal(r.outcome, 'awaiting_approval');
    assert.equal(r.phase, 'brief');
  });
});

// --- corrupt state at the entry points ----------------------------------------------

test('status.mjs prints an actionable message, not a stack trace, on a corrupt state', async () => {
  await withTmpDir(async (dir) => {
    await mkdir(path.join(dir, '.koud'), { recursive: true });
    await writeFile(path.join(dir, '.koud/state.json'), '{ not json', 'utf8');
    await assert.rejects(
      () => run('node', [path.join(scripts, 'status.mjs'), dir]),
      (err) => {
        assert.equal(err.code, 1);
        assert.match(err.stderr, /could not be parsed as JSON/);
        assert.match(err.stderr, /koud:init/);
        assert.doesNotMatch(err.stderr, /^\s+at /m, 'no raw stack frames may reach the user');
        return true;
      },
    );
  });
});

test('next.mjs prints an actionable message, not a stack trace, on a corrupt state', async () => {
  await withTmpDir(async (dir) => {
    await mkdir(path.join(dir, '.koud'), { recursive: true });
    await writeFile(path.join(dir, '.koud/state.json'), '{ not json', 'utf8');
    await assert.rejects(
      () => run('node', [path.join(scripts, 'next.mjs'), dir]),
      (err) => {
        assert.equal(err.code, 1);
        assert.match(err.stderr, /could not be parsed as JSON/);
        assert.match(err.stderr, /koud:init/);
        assert.doesNotMatch(err.stderr, /^\s+at /m, 'no raw stack frames may reach the user');
        return true;
      },
    );
  });
});

// --- stack.mjs -----------------------------------------------------------------------

test('stack.mjs validate exits 0 on the golden fixture', async () => {
  const { stdout } = await run('node', [path.join(scripts, 'stack.mjs'), 'validate', stackFixture]);
  assert.match(stdout, /valid/);
});

test('stack.mjs validate lists every problem at once on stderr', async () => {
  await withTmpDir(async (dir) => {
    const bad = path.join(dir, 'bad.json');
    await writeFile(bad, JSON.stringify({ schema_version: 1, repo_shape: 'nope', slots: [] }), 'utf8');
    await assert.rejects(
      () => run('node', [path.join(scripts, 'stack.mjs'), 'validate', bad]),
      (err) => {
        assert.equal(err.code, 1);
        // The agent retrying needs all the problems in one pass, not the first one.
        assert.ok(err.stderr.split('\n').filter((l) => l.trim().startsWith('- ')).length >= 2, err.stderr);
        return true;
      },
    );
  });
});

test('stack.mjs validate --json emits the full result object', async () => {
  const { stdout } = await run('node', [path.join(scripts, 'stack.mjs'), 'validate', stackFixture, '--json']);
  const parsed = JSON.parse(stdout);
  assert.equal(parsed.valid, true);
  assert.ok(Array.isArray(parsed.warnings));
});

test('stack.mjs with no subcommand exits 2 with usage', async () => {
  await assert.rejects(
    () => run('node', [path.join(scripts, 'stack.mjs')]),
    (err) => {
      assert.equal(err.code, 2);
      assert.match(err.stderr, /usage/);
      return true;
    },
  );
});

async function seedForStack(dir) {
  await run('node', [path.join(scripts, 'init.mjs'), dir, '--apply']);
  const state = await readState(dir);
  state.project = { name: 'Kintwadi' };
  await writeState(dir, state);
  await mkdir(path.join(dir, '.koud'), { recursive: true });
  await copyFile(fixture, path.join(dir, '.koud', 'brief.json'));
  await copyFile(stackFixture, path.join(dir, '.koud', 'stack.json'));
}

// C1: on a clean project, `apply . --dry-run` must not write either artifact or advance
// the phase — it used to write both, silently, because applyStack had no dryRun at all.
test('stack.mjs apply --dry-run reports without writing', async () => {
  await withTmpDir(async (dir) => {
    await seedForStack(dir);
    const { stdout } = await run('node', [path.join(scripts, 'stack.mjs'), 'apply', dir, '--dry-run']);
    assert.match(stdout, /Dry run/);
    await assert.rejects(() => access(path.join(dir, '.koud', 'stack.md')), /ENOENT/);
    const state = JSON.parse(await readFile(path.join(dir, '.koud', 'state.json'), 'utf8'));
    assert.equal(state.phases.stack.status, 'not_started');
  });
});

test('stack.mjs apply writes both artifacts end to end and gates the phase', async () => {
  await withTmpDir(async (dir) => {
    await seedForStack(dir);
    const { stdout } = await run('node', [path.join(scripts, 'stack.mjs'), 'apply', dir]);
    assert.match(stdout, /Wrote 2 artifact\(s\)/);
    assert.match(stdout, /awaiting_approval/);
    const state = JSON.parse(await readFile(path.join(dir, '.koud', 'state.json'), 'utf8'));
    assert.equal(state.phases.stack.status, 'awaiting_approval');
  });
});

test('stack.mjs apply reports a backup when stack.md already exists', async () => {
  await withTmpDir(async (dir) => {
    await seedForStack(dir);
    await run('node', [path.join(scripts, 'stack.mjs'), 'apply', dir]);
    await writeFile(path.join(dir, '.koud', 'stack.md'), '# Mine\n\nHand-written.\n', 'utf8');
    const { stdout } = await run('node', [path.join(scripts, 'stack.mjs'), 'apply', dir]);
    assert.match(stdout, /Backed up before overwriting/);
    assert.match(stdout, /stack\.md/);
  });
});

test('stack.mjs apply refuses when project is not set, with exit 1', async () => {
  await withTmpDir(async (dir) => {
    await run('node', [path.join(scripts, 'init.mjs'), dir, '--apply']);
    await mkdir(path.join(dir, '.koud'), { recursive: true });
    await copyFile(fixture, path.join(dir, '.koud', 'brief.json'));
    await copyFile(stackFixture, path.join(dir, '.koud', 'stack.json'));
    await assert.rejects(
      () => run('node', [path.join(scripts, 'stack.mjs'), 'apply', dir]),
      (err) => {
        assert.equal(err.code, 1);
        assert.match(err.stderr, /koud:brief/);
        return true;
      },
    );
  });
});

// --- architect.mjs --------------------------------------------------------------------

test('architect.mjs validate exits 0 on the golden fixture', async () => {
  const { stdout } = await run('node', [path.join(scripts, 'architect.mjs'), 'validate', architectureFixture]);
  assert.match(stdout, /valid/i);
});

test('architect.mjs validate lists every problem at once on stderr', async () => {
  await withTmpDir(async (dir) => {
    const bad = JSON.parse(await readFile(architectureFixture, 'utf8'));
    bad.edges.push({ from: 'web', to: 'ghost' });
    delete bad.access_control;
    const p = path.join(dir, 'bad.json');
    await writeFile(p, JSON.stringify(bad), 'utf8');
    await assert.rejects(
      () => run('node', [path.join(scripts, 'architect.mjs'), 'validate', p]),
      (err) => {
        assert.equal(err.code, 1);
        assert.match(err.stderr, /ghost/);
        assert.match(err.stderr, /access_control/);
        return true;
      },
    );
  });
});

async function seedForArchitect(dir) {
  await run('node', [path.join(scripts, 'init.mjs'), dir, '--apply']);
  const state = await readState(dir);
  state.project = { name: 'Kintwadi' };
  await writeState(dir, state);
  await mkdir(path.join(dir, '.koud'), { recursive: true });
  await copyFile(architectureFixture, path.join(dir, '.koud', 'architecture.json'));
  await copyFile(stackFixture, path.join(dir, '.koud', 'stack.json'));
}

test('architect.mjs apply --dry-run reports without writing', async () => {
  await withTmpDir(async (dir) => {
    await seedForArchitect(dir);
    const { stdout } = await run('node', [path.join(scripts, 'architect.mjs'), 'apply', dir, '--dry-run']);
    assert.match(stdout, /Dry run/);
    assert.match(stdout, /AGENTS\.md/);
    // docs/architecture.md exists only once :architect actually writes; a dry run must
    // not create it.
    await assert.rejects(() => access(path.join(dir, 'docs', 'architecture.md')), /ENOENT/);
    const state = JSON.parse(await readFile(path.join(dir, '.koud', 'state.json'), 'utf8'));
    assert.equal(state.phases.architect.status, 'not_started');
  });
});

test('architect.mjs apply writes the eight artifacts end to end and gates the phase', async () => {
  await withTmpDir(async (dir) => {
    await seedForArchitect(dir);
    const { stdout } = await run('node', [path.join(scripts, 'architect.mjs'), 'apply', dir]);
    assert.match(stdout, /Wrote 8 artifact\(s\)/);
    assert.match(stdout, /awaiting_approval/);
    const state = JSON.parse(await readFile(path.join(dir, '.koud', 'state.json'), 'utf8'));
    assert.equal(state.phases.architect.status, 'awaiting_approval');
    assert.equal(state.project.architecture_ref, '.koud/architecture.json');
  });
});

test('architect.mjs apply reports a backup when AGENTS.md already exists', async () => {
  await withTmpDir(async (dir) => {
    await seedForArchitect(dir);
    await writeFile(path.join(dir, 'AGENTS.md'), '# Mine\n\nHand-written rule.\n', 'utf8');
    const { stdout } = await run('node', [path.join(scripts, 'architect.mjs'), 'apply', dir]);
    assert.match(stdout, /Backed up before overwriting/);
    assert.match(stdout, /AGENTS\.md/);
    const after = await readFile(path.join(dir, 'AGENTS.md'), 'utf8');
    assert.match(after, /Hand-written rule\./);
  });
});

test('architect.mjs apply refuses an invalid payload with exit 1', async () => {
  await withTmpDir(async (dir) => {
    await seedForArchitect(dir);
    const bad = JSON.parse(await readFile(architectureFixture, 'utf8'));
    bad.edges.push({ from: 'web', to: 'ghost' });
    await writeFile(path.join(dir, '.koud', 'architecture.json'), JSON.stringify(bad), 'utf8');
    await assert.rejects(
      () => run('node', [path.join(scripts, 'architect.mjs'), 'apply', dir]),
      (err) => {
        assert.equal(err.code, 1);
        assert.match(err.stderr, /refusing to apply/);
        return true;
      },
    );
  });
});

// --- requirements.mjs ------------------------------------------------------------------

test('requirements.mjs validate exits 0 on the golden fixture', async () => {
  const { stdout } = await run('node', [path.join(scripts, 'requirements.mjs'), 'validate', requirementsFixture]);
  assert.match(stdout, /valid/i);
});

test('requirements.mjs validate lists every problem at once on stderr', async () => {
  await withTmpDir(async (dir) => {
    const bad = JSON.parse(await readFile(requirementsFixture, 'utf8'));
    bad.features[0].priority = 'critical';
    delete bad.features[0].user_story;
    const p = path.join(dir, 'bad.json');
    await writeFile(p, JSON.stringify(bad), 'utf8');
    await assert.rejects(
      () => run('node', [path.join(scripts, 'requirements.mjs'), 'validate', p]),
      (err) => {
        assert.equal(err.code, 1);
        assert.match(err.stderr, /priority/);
        assert.match(err.stderr, /user_story/);
        return true;
      },
    );
  });
});

async function seedForRequirements(dir) {
  await run('node', [path.join(scripts, 'init.mjs'), dir, '--apply']);
  const state = await readState(dir);
  state.project = { name: 'Kintwadi' };
  await writeState(dir, state);
  await mkdir(path.join(dir, '.koud'), { recursive: true });
  await copyFile(fixture, path.join(dir, '.koud', 'brief.json'));
  await copyFile(architectureFixture, path.join(dir, '.koud', 'architecture.json'));
  await copyFile(requirementsFixture, path.join(dir, '.koud', 'requirements.json'));
}

test('requirements.mjs apply --dry-run reports without writing', async () => {
  await withTmpDir(async (dir) => {
    await seedForRequirements(dir);
    const { stdout } = await run('node', [path.join(scripts, 'requirements.mjs'), 'apply', dir, '--dry-run']);
    assert.match(stdout, /Dry run/);
    assert.match(stdout, /requirements\.md/);
    // features/*.feature exist only once :requirements actually writes; a dry run must
    // not create them.
    await assert.rejects(() => access(path.join(dir, 'features', 'shared-care-record.feature')), /ENOENT/);
    const state = JSON.parse(await readFile(path.join(dir, '.koud', 'state.json'), 'utf8'));
    assert.equal(state.phases.requirements.status, 'not_started');
  });
});

test('requirements.mjs apply writes the artifacts end to end and gates the phase', async () => {
  await withTmpDir(async (dir) => {
    await seedForRequirements(dir);
    const { stdout } = await run('node', [path.join(scripts, 'requirements.mjs'), 'apply', dir]);
    assert.match(stdout, /Wrote 4 artifact\(s\)/);
    assert.match(stdout, /awaiting_approval/);
    const state = JSON.parse(await readFile(path.join(dir, '.koud', 'state.json'), 'utf8'));
    assert.equal(state.phases.requirements.status, 'awaiting_approval');
    assert.equal(state.project.requirements_ref, '.koud/requirements.json');
    const feature = await readFile(path.join(dir, 'features', 'shared-care-record.feature'), 'utf8');
    assert.match(feature, /^Feature: /);
  });
});

test('requirements.mjs apply reports a stale feature file as left in place', async () => {
  await withTmpDir(async (dir) => {
    await seedForRequirements(dir);
    await mkdir(path.join(dir, 'features'), { recursive: true });
    await writeFile(path.join(dir, 'features', 'removed-feature.feature'), 'Feature: old\n', 'utf8');
    const { stdout } = await run('node', [path.join(scripts, 'requirements.mjs'), 'apply', dir]);
    assert.match(stdout, /Left in place/);
    assert.match(stdout, /removed-feature/);
    const still = await readFile(path.join(dir, 'features', 'removed-feature.feature'), 'utf8');
    assert.match(still, /old/);
  });
});

test('requirements.mjs apply reports a backup when requirements.md already exists', async () => {
  await withTmpDir(async (dir) => {
    await seedForRequirements(dir);
    await run('node', [path.join(scripts, 'requirements.mjs'), 'apply', dir]);
    await writeFile(path.join(dir, '.koud', 'requirements.md'), '# Mine\n\nHand-written.\n', 'utf8');
    const { stdout } = await run('node', [path.join(scripts, 'requirements.mjs'), 'apply', dir]);
    assert.match(stdout, /Backed up before overwriting/);
    assert.match(stdout, /requirements\.md/);
    // seedForRequirements() drops a requirements.json in place, so the FIRST apply above
    // already backs one file up and creates a backup set of its own -- the total count is
    // not 1, and depends on whether the two applies land in the same wall-clock second.
    // Assert on the newest set instead, the same way tests/lib/stack-apply.test.mjs does.
    const backups = (await readdir(path.join(dir, '.koud', 'backups'))).sort();
    const latest = backups.at(-1);
    const saved = await readFile(
      path.join(dir, '.koud', 'backups', latest, '.koud', 'requirements.md'), 'utf8',
    );
    assert.match(saved, /Hand-written\./);
  });
});

test('requirements.mjs apply refuses an invalid payload with exit 1', async () => {
  await withTmpDir(async (dir) => {
    await seedForRequirements(dir);
    const bad = JSON.parse(await readFile(requirementsFixture, 'utf8'));
    bad.features[0].priority = 'critical';
    await writeFile(path.join(dir, '.koud', 'requirements.json'), JSON.stringify(bad), 'utf8');
    await assert.rejects(
      () => run('node', [path.join(scripts, 'requirements.mjs'), 'apply', dir]),
      (err) => {
        assert.equal(err.code, 1);
        assert.match(err.stderr, /refusing to apply/);
        return true;
      },
    );
  });
});

// --- spec.mjs ----------------------------------------------------------------------------
//
// These tests use --dry-run exclusively (except the invalid-payload case, which throws
// before either code path reaches OpenSpec). applySpec's non-dry-run apply calls
// runOpenspec()'s real default exec, which shells out to `npx @fission-ai/openspec` — a real
// network-dependent process spawn with no injection point through the CLI. That end-to-end
// write path (with both a live and a stubbed-dead exec) is already covered without any real
// process spawn by tests/lib/spec-apply.test.mjs, which calls applySpec() directly and
// injects okExec/deadExec. --dry-run never reaches exec at all (runOpenspec returns before
// checking for the CLI when dryRun is true), so it is the only apply path safe to drive
// through the actual CLI binary here.

async function seedForSpec(dir) {
  await run('node', [path.join(scripts, 'init.mjs'), dir, '--apply']);
  const state = await readState(dir);
  state.project = { name: 'Kintwadi' };
  await writeState(dir, state);
  await mkdir(path.join(dir, '.koud'), { recursive: true });
  await copyFile(architectureFixture, path.join(dir, '.koud', 'architecture.json'));
  await copyFile(requirementsFixture, path.join(dir, '.koud', 'requirements.json'));
}

test('spec.mjs apply --dry-run labels the Kiro triad and the OpenSpec proposals as two separate groups', async () => {
  await withTmpDir(async (dir) => {
    await seedForSpec(dir);
    const { stdout } = await run('node', [path.join(scripts, 'spec.mjs'), 'apply', dir, '--dry-run']);
    assert.match(stdout, /Dry run/);
    const kiroAt = stdout.indexOf('Kiro spec triad');
    const proposalsAt = stdout.indexOf('OpenSpec change proposals');
    assert.ok(kiroAt !== -1, 'the Kiro triad group must be labelled');
    assert.ok(proposalsAt !== -1, 'the OpenSpec proposals group must be labelled');
    assert.ok(kiroAt < proposalsAt, 'the certain group is listed before the contingent one');
    assert.match(stdout.slice(kiroAt, proposalsAt), /0001-shared-care-record.*tasks\.md/s);
    assert.match(stdout.slice(proposalsAt), /openspec\/changes/);
    await assert.rejects(() => access(path.join(dir, '.koud', 'specs')), /ENOENT/);
    const state = JSON.parse(await readFile(path.join(dir, '.koud', 'state.json'), 'utf8'));
    assert.equal(state.phases.spec.status, 'not_started');
  });
});

test('spec.mjs apply --dry-run surfaces the OpenSpec reason even though status is not deferred', async () => {
  await withTmpDir(async (dir) => {
    await seedForSpec(dir);
    const { stdout } = await run('node', [path.join(scripts, 'spec.mjs'), 'apply', dir, '--dry-run']);
    // Task 22's interface only permits status 'written' | 'deferred', and a dry run is not a
    // failure, so status reads 'written' here — but the reason still carries the "nothing has
    // been written yet" caveat. Gating the print to the deferred branch alone (as the original
    // brief sample did) would silently drop that caveat from every dry run.
    assert.match(stdout, /OpenSpec: DRY RUN/);
    assert.match(stdout, /nothing has been written yet/);
    assert.doesNotMatch(stdout, /OpenSpec: DEFERRED/);
  });
});

test('spec.mjs apply --dry-run reports a stale spec folder as left in place', async () => {
  await withTmpDir(async (dir) => {
    await seedForSpec(dir);
    await mkdir(path.join(dir, '.koud', 'specs', '0009-dropped-feature'), { recursive: true });
    await writeFile(
      path.join(dir, '.koud', 'specs', '0009-dropped-feature', 'tasks.md'), '# old\n', 'utf8',
    );
    const { stdout } = await run('node', [path.join(scripts, 'spec.mjs'), 'apply', dir, '--dry-run']);
    assert.match(stdout, /Left in place/);
    assert.match(stdout, /0009-dropped-feature/);
  });
});

test('spec.mjs apply refuses an invalid payload with exit 1', async () => {
  await withTmpDir(async (dir) => {
    await seedForSpec(dir);
    const bad = JSON.parse(await readFile(requirementsFixture, 'utf8'));
    bad.features[0].scenarios = [];
    await writeFile(path.join(dir, '.koud', 'requirements.json'), JSON.stringify(bad), 'utf8');
    await assert.rejects(
      () => run('node', [path.join(scripts, 'spec.mjs'), 'apply', dir, '--dry-run']),
      (err) => {
        assert.equal(err.code, 1);
        assert.match(err.stderr, /refusing to apply/);
        return true;
      },
    );
  });
});

// --- Round-1 review findings -----------------------------------------------------------

test('spec.mjs apply prints validateRequirements warnings — :spec has no validate subcommand of its own', async () => {
  await withTmpDir(async (dir) => {
    await seedForSpec(dir);
    // applySpec() never forwards `brief` to validateRequirements(), so this warning is
    // reliably present on every run — the point being proved is that apply's stdout is where
    // it now surfaces, since :spec has no separate `validate` subcommand to print it from.
    const { stdout } = await run('node', [path.join(scripts, 'spec.mjs'), 'apply', dir, '--dry-run']);
    assert.match(stdout, /warning:.*brief/i);
  });
});

// --- Stage 2 review: the dry-run overwrite warning the command files promise ---------------
//
// Every apply module's dry-run branch returned `backedUp: []` unconditionally, so no CLI had
// ever printed anything about overwriting during a preview — yet all four command files tell
// the agent "if it reports it would overwrite something, tell the user first". The consent
// gate was notional. Each of these drives both branches: the heading appears when a real
// artifact is on disk, and does not when none is.

test('stack.mjs apply --dry-run names what it would overwrite, and stays silent when nothing would be', async () => {
  await withTmpDir(async (dir) => {
    await seedForStack(dir);
    const present = await run('node', [path.join(scripts, 'stack.mjs'), 'apply', dir, '--dry-run']);
    assert.match(present.stdout, /Would overwrite:/);
    assert.match(present.stdout, /! \.koud\/stack\.json/);

    // The payload can come from anywhere; what matters is that no artifact is on disk.
    await rm(path.join(dir, '.koud', 'stack.json'));
    const absent = await run('node',
      [path.join(scripts, 'stack.mjs'), 'apply', dir, '--stack', stackFixture, '--dry-run']);
    assert.doesNotMatch(absent.stdout, /Would overwrite:/);
  });
});

test('architect.mjs apply --dry-run names what it would overwrite, and stays silent when nothing would be', async () => {
  await withTmpDir(async (dir) => {
    await seedForArchitect(dir);
    const present = await run('node', [path.join(scripts, 'architect.mjs'), 'apply', dir, '--dry-run']);
    assert.match(present.stdout, /Would overwrite:/);
    assert.match(present.stdout, /! \.koud\/architecture\.json/);

    // :init itself lays down AGENTS.md and CLAUDE.md, and both are :architect artifacts, so
    // they have to go too before the "nothing would be overwritten" case is reachable.
    await rm(path.join(dir, '.koud', 'architecture.json'));
    await rm(path.join(dir, 'AGENTS.md'), { force: true });
    await rm(path.join(dir, 'CLAUDE.md'), { force: true });
    const absent = await run('node',
      [path.join(scripts, 'architect.mjs'), 'apply', dir, '--architecture', architectureFixture, '--dry-run']);
    assert.doesNotMatch(absent.stdout, /Would overwrite:/);
  });
});

test('requirements.mjs apply --dry-run names what it would overwrite, and stays silent when nothing would be', async () => {
  await withTmpDir(async (dir) => {
    await seedForRequirements(dir);
    const present = await run('node', [path.join(scripts, 'requirements.mjs'), 'apply', dir, '--dry-run']);
    assert.match(present.stdout, /Would overwrite:/);
    assert.match(present.stdout, /! \.koud\/requirements\.json/);

    await rm(path.join(dir, '.koud', 'requirements.json'));
    const absent = await run('node',
      [path.join(scripts, 'requirements.mjs'), 'apply', dir, '--requirements', requirementsFixture, '--dry-run']);
    assert.doesNotMatch(absent.stdout, /Would overwrite:/);
  });
});

// --- build.mjs -----------------------------------------------------------------------

test('build.mjs status reports "nothing to build" against a project with no requirements.json', async () => {
  await withTmpDir(async (dir) => {
    await run('node', [path.join(scripts, 'init.mjs'), dir, '--apply']);
    await assert.rejects(
      run('node', [path.join(scripts, 'build.mjs'), 'status', dir]),
      (err) => {
        assert.equal(err.code, 1);
        assert.match(err.stderr, /requirements\.json/);
        return true;
      },
    );
  });
});

// Regression: nextFeature(..., { featureId }) returns null both when every must-have
// feature is genuinely done AND when featureId doesn't resolve to any kept must-have
// feature. status used to print the same "everything done" message either way, which
// would send an agent past a typo'd or stale --feature flag straight to the gate.
test('build.mjs status --feature with an unresolved FR-id reports a distinct error, not "everything done"', async () => {
  await withTmpDir(async (dir) => {
    await run('node', [path.join(scripts, 'init.mjs'), dir, '--apply']);
    await mkdir(path.join(dir, '.koud'), { recursive: true });
    await copyFile(requirementsFixture, path.join(dir, '.koud', 'requirements.json'));
    await assert.rejects(
      run('node', [path.join(scripts, 'build.mjs'), 'status', dir, '--feature', 'FR-9.9']),
      (err) => {
        assert.equal(err.code, 1);
        assert.match(err.stderr, /FR-9\.9/);
        assert.match(err.stderr, /does not resolve/);
        assert.doesNotMatch(err.stdout ?? '', /Every must-have, non-cut feature is done/);
        return true;
      },
    );
  });
});

// Regression: the plan requires build's gate to reach awaiting_approval only when every
// must-have feature is done AND the last :check passed clean, but gate used to check only
// feature completion and never read state.compliance at all.
test('build.mjs gate refuses to close the phase when compliance still has an unverified slot, even with every feature done', async () => {
  await withTmpDir(async (dir) => {
    await run('node', [path.join(scripts, 'init.mjs'), dir, '--apply']);
    await mkdir(path.join(dir, '.koud'), { recursive: true });
    await copyFile(requirementsFixture, path.join(dir, '.koud', 'requirements.json'));
    const requirements = JSON.parse(await readFile(requirementsFixture, 'utf8'));
    for (const feature of mustHaveFeatures(requirements)) {
      const featDir = path.join(dir, '.koud', 'specs', feature.dir);
      await mkdir(featDir, { recursive: true });
      await writeFile(path.join(featDir, 'tasks.md'), '- [x] step one\n', 'utf8');
    }
    const state = await readState(dir);
    state.compliance.required_tech_verified = { 'aws-bedrock': true, 'aurora-pgvector': false };
    await writeState(dir, state);

    await assert.rejects(
      run('node', [path.join(scripts, 'build.mjs'), 'gate', dir]),
      (err) => {
        assert.equal(err.code, 1);
        assert.match(err.stdout, /Required technology not yet verified/);
        assert.match(err.stdout, /aurora-pgvector/);
        return true;
      },
    );

    const after = await readState(dir);
    assert.notEqual(after.phases.build.status, 'awaiting_approval',
      'gate must not close the phase while compliance is outstanding');
  });
});

test('spec.mjs apply --dry-run names the triad files it would regenerate, and stays silent when there are none', async () => {
  await withTmpDir(async (dir) => {
    await seedForSpec(dir);
    const absent = await run('node', [path.join(scripts, 'spec.mjs'), 'apply', dir, '--dry-run']);
    assert.doesNotMatch(absent.stdout, /Would overwrite:/,
      'no spec folder exists yet — a first run overwrites nothing');

    // A tasks.md a build agent has been ticking off is the file that matters most here.
    const folder = path.join(dir, '.koud', 'specs', '0001-shared-care-record');
    await mkdir(folder, { recursive: true });
    await writeFile(path.join(folder, 'tasks.md'), '# Tasks\n\n- [x] done\n', 'utf8');
    const present = await run('node', [path.join(scripts, 'spec.mjs'), 'apply', dir, '--dry-run']);
    assert.match(present.stdout, /Would overwrite:/);
    assert.match(present.stdout, /! \.koud\/specs\/0001-shared-care-record\/tasks\.md/);
  });
});

// --- ship.mjs ------------------------------------------------------------------------

test('ship.mjs suggest prints one slotId -> target line per deployable stack slot', async () => {
  await withTmpDir(async (dir) => {
    await run('node', [path.join(scripts, 'init.mjs'), dir, '--apply']);
    await copyFile(stackFixture, path.join(dir, '.koud', 'stack.json'));
    const { stdout } = await run('node', [path.join(scripts, 'ship.mjs'), 'suggest', dir]);

    // h0-stack.json has three slots: "database" (excluded -- deployableSlots() drops
    // database/queue/storage/cache-shaped slots), "deploy" (source: required, choice:
    // "Vercel" -> brief-required vercel), and "frontend" (default, id matches
    // /(front|web|ui)/ -> frontend kind -> vercel). One line per deployable slot, naming
    // the actual slot ids, not just the presence of an arrow anywhere in stdout.
    const lines = stdout.trim().split('\n');
    assert.deepEqual(lines.sort(), ['deploy -> vercel', 'frontend -> vercel'].sort());
    assert.doesNotMatch(stdout, /^database ->/m, 'the database slot must not be suggested a deploy target');
  });
});

// --- review.mjs -----------------------------------------------------------------------

async function seedForReview(dir) {
  await run('node', [path.join(scripts, 'init.mjs'), dir, '--apply']);
  const state = await readState(dir);
  await writeState(dir, { ...state, project: { name: 'x' } });
}

test('review.mjs merge writes a valid review.json from two findings-array temp files', async () => {
  await withTmpDir(async (dir) => {
    await seedForReview(dir);
    const codeReviewPath = path.join(dir, 'code-review.json');
    const qualityPath = path.join(dir, 'quality.json');
    await writeFile(codeReviewPath, JSON.stringify([
      { severity: 'should-fix', title: 'A', summary: 'desc', file: null, line: null, user_visible: false },
    ]), 'utf8');
    await writeFile(qualityPath, JSON.stringify([
      { severity: 'post-release', title: 'B', summary: 'desc', file: null, line: null, user_visible: false },
    ]), 'utf8');

    const { stdout } = await run('node', [path.join(scripts, 'review.mjs'), 'merge', dir, codeReviewPath, qualityPath]);
    assert.match(stdout, /Wrote \.koud\/review\.json -- 2 finding\(s\)\./);

    const review = JSON.parse(await readFile(path.join(dir, '.koud', 'review.json'), 'utf8'));
    assert.equal(review.schema_version, 1);
    assert.deepEqual(review.findings.map((f) => f.id), ['REV-1', 'REV-2']);
    assert.deepEqual(review.findings.map((f) => f.source), ['code-review', 'quality-reviewer']);
  });
});

// Finding 2 of the Stage 1 checkpoint review: merge used to write review.json directly,
// so by the time apply's own openBackupSet ran, the prior run's findings were already
// gone. merge must now back up whatever review.json it is about to overwrite.
test('review.mjs merge backs up the previous review.json before a second run overwrites it', async () => {
  await withTmpDir(async (dir) => {
    await seedForReview(dir);
    const findingsA = path.join(dir, 'a.json');
    const findingsB = path.join(dir, 'b.json');
    const empty = path.join(dir, 'empty.json');
    await writeFile(findingsA, JSON.stringify([
      { severity: 'should-fix', title: 'First run finding', summary: 'desc', file: null, line: null, user_visible: false },
    ]), 'utf8');
    await writeFile(findingsB, JSON.stringify([
      { severity: 'post-release', title: 'Second run finding', summary: 'desc', file: null, line: null, user_visible: false },
    ]), 'utf8');
    await writeFile(empty, '[]', 'utf8');

    await run('node', [path.join(scripts, 'review.mjs'), 'merge', dir, findingsA, empty]);
    const firstRun = await readFile(path.join(dir, '.koud', 'review.json'), 'utf8');

    const { stdout } = await run('node', [path.join(scripts, 'review.mjs'), 'merge', dir, findingsB, empty]);
    assert.match(stdout, /Backed up the previous \.koud\/review\.json/);

    const backupsDir = path.join(dir, '.koud', 'backups');
    const stamps = await readdir(backupsDir);
    assert.equal(stamps.length, 1);
    const backedUpContent = await readFile(path.join(backupsDir, stamps[0], '.koud', 'review.json'), 'utf8');
    assert.equal(backedUpContent, firstRun);
    assert.match(backedUpContent, /First run finding/);

    const secondRun = await readFile(path.join(dir, '.koud', 'review.json'), 'utf8');
    assert.match(secondRun, /Second run finding/);
    assert.doesNotMatch(secondRun, /First run finding/);
  });
});

test('review.mjs apply with a blocking finding exits 1 and leaves phases.review.status in_progress', async () => {
  await withTmpDir(async (dir) => {
    await seedForReview(dir);
    const blocking = path.join(dir, 'blocking.json');
    const empty = path.join(dir, 'empty.json');
    await writeFile(blocking, JSON.stringify([
      { severity: 'blocking', title: 'Bad thing', summary: 'desc', file: null, line: null, user_visible: true },
    ]), 'utf8');
    await writeFile(empty, '[]', 'utf8');
    await run('node', [path.join(scripts, 'review.mjs'), 'merge', dir, blocking, empty]);

    await assert.rejects(
      () => run('node', [path.join(scripts, 'review.mjs'), 'apply', dir]),
      (err) => {
        assert.equal(err.code, 1);
        assert.match(err.stdout, /Blocking findings remain/);
        return true;
      },
    );
    const state = await readState(dir);
    assert.equal(state.phases.review.status, 'in_progress');
  });
});

test('review.mjs apply exits 0 and reaches awaiting_approval once a re-run is clean', async () => {
  await withTmpDir(async (dir) => {
    await seedForReview(dir);
    const blocking = path.join(dir, 'blocking.json');
    const empty = path.join(dir, 'empty.json');
    await writeFile(blocking, JSON.stringify([
      { severity: 'blocking', title: 'Bad thing', summary: 'desc', file: null, line: null, user_visible: true },
    ]), 'utf8');
    await writeFile(empty, '[]', 'utf8');
    await run('node', [path.join(scripts, 'review.mjs'), 'merge', dir, blocking, empty]);
    await assert.rejects(() => run('node', [path.join(scripts, 'review.mjs'), 'apply', dir]));

    // Fix the blocking finding, re-merge clean, re-apply.
    await run('node', [path.join(scripts, 'review.mjs'), 'merge', dir, empty, empty]);
    const { stdout } = await run('node', [path.join(scripts, 'review.mjs'), 'apply', dir]);
    assert.match(stdout, /awaiting_approval/);
    const state = await readState(dir);
    assert.equal(state.phases.review.status, 'awaiting_approval');
  });
});

// --- log.mjs -------------------------------------------------------------------------

test('log.mjs with positional args still works (manual/direct invocation)', async () => {
  await withTmpDir(async (dir) => {
    const { stdout } = await run('node', [path.join(scripts, 'log.mjs'), dir, 'Bedrock', 'timed', 'out']);
    assert.match(stdout, /challenges\.md/);
    const content = await readFile(path.join(dir, '.koud', 'challenges.md'), 'utf8');
    assert.match(content, /Bedrock timed out/);
  });
});

// Final whole-branch review, finding 1: commands/log.md's old `"$ARGUMENTS"` (double-quoted,
// shell-interpolated) form stops word-splitting but NOT command substitution -- backticks or
// $(...) in a challenge entry would execute before log.mjs ever saw the text. The fix passes
// the text via a quoted heredoc on stdin instead, exactly as commands/log.md now does. This
// drives the real CLI through a real shell (bash -c), textually substituting $ARGUMENTS the
// same way the harness does, to prove the fix at the shell layer, not just in appendChallenge.
test('the heredoc form commands/log.md uses leaves backticks and $() in the entry text completely unexpanded and unexecuted', async () => {
  await withTmpDir(async (dir) => {
    const injected1 = path.join(dir, 'INJECTED-backtick.txt');
    const injected2 = path.join(dir, 'INJECTED-dollarparen.txt');
    const entryText = `Hit a snag with \`touch ${injected1}\` and $(touch ${injected2}) during setup`;

    // Mirrors commands/log.md's Step 1 exactly, with $ARGUMENTS substituted the way the
    // harness substitutes it -- textually, before any shell parsing happens.
    const script = [
      `node ${JSON.stringify(path.join(scripts, 'log.mjs'))} ${JSON.stringify(dir)} <<'ENTRY'`,
      entryText,
      'ENTRY',
    ].join('\n');
    await run('bash', ['-c', script]);

    // If the heredoc's quoted delimiter failed to suppress expansion, these files would
    // exist on disk -- direct proof the embedded commands never ran.
    await assert.rejects(() => access(injected1), /ENOENT/, 'backtick command must not have executed');
    await assert.rejects(() => access(injected2), /ENOENT/, '$() command must not have executed');

    const content = await readFile(path.join(dir, '.koud', 'challenges.md'), 'utf8');
    assert.ok(content.includes(`\`touch ${injected1}\``), 'backticks must survive completely literally');
    assert.ok(content.includes(`$(touch ${injected2})`), '$(...) must survive completely literally');
  });
});

// Regression test for the final whole-branch review's stdin-timeout fix: log.mjs <root>
// with no positional <text...> args used to block forever on `for await (const chunk of
// process.stdin)` when stdin is a non-TTY pipe that nothing ever writes to or closes --
// exactly the shape of a bare programmatic invocation (CI, another script, an agent's
// Bash-tool call without a heredoc). It must instead race the stdin read against a short
// timeout and fail fast with USAGE + exit 2, not hang. This spawns a real subprocess and
// deliberately never writes to or closes its stdin, then asserts on exit code, stderr, and
// elapsed time within a bound of our own that's comfortably larger than the ~200ms race but
// far below node:test's own (unlimited-by-default) per-test timeout, so a hang would show up
// as a genuine test failure rather than an eventual framework-level kill.
test('log.mjs <root> with no positional args and an open, never-written stdin fails fast with USAGE instead of hanging', async () => {
  await withTmpDir(async (dir) => {
    const start = Date.now();
    const child = spawn('node', [path.join(scripts, 'log.mjs'), dir], { stdio: ['pipe', 'pipe', 'pipe'] });
    child.stdin.on('error', () => {}); // swallow EPIPE from the child exiting with stdin still open
    child.on('error', () => {});

    let stderr = '';
    child.stderr.on('data', (chunk) => { stderr += chunk; });

    const BOUND_MS = 5000; // >> the ~200ms stdin race, << node:test's own default (no timeout / far larger)
    const exitCode = await new Promise((resolve, reject) => {
      const bound = setTimeout(() => {
        child.kill('SIGKILL');
        reject(new Error(`log.mjs did not exit within ${BOUND_MS}ms -- looks like a hang, not a fast failure`));
      }, BOUND_MS);
      bound.unref();
      child.on('exit', (code) => {
        clearTimeout(bound);
        resolve(code);
      });
    });
    const elapsed = Date.now() - start;

    assert.equal(exitCode, 2);
    assert.match(stderr, /usage: log\.mjs <project-root> <text\.\.\.>/);
    assert.ok(elapsed < BOUND_MS, `expected a fast failure well under ${BOUND_MS}ms, took ${elapsed}ms`);
  });
});

// --- submit.mjs ------------------------------------------------------------------------

const SUBMIT_DELIVERABLES = [
  { id: 'text-description', status: 'not_started' },
  { id: 'demo-video', status: 'not_started' },
  { id: 'architecture-diagram', status: 'not_started' },
  { id: 'vercel-project-link', status: 'not_started' },
  { id: 'vercel-team-id', status: 'not_started' },
  { id: 'db-proof-screenshot', status: 'not_started' },
];

async function seedForSubmit(dir) {
  await run('node', [path.join(scripts, 'init.mjs'), dir, '--apply']);
  const state = await readState(dir);
  await writeState(dir, {
    ...state,
    project: { name: 'Kintwadi', review: { clean: true, ref: '.koud/review.json' } },
    deliverables: {
      submission_requirements: SUBMIT_DELIVERABLES,
      bonus_content: [{ id: 'bonus-1', status: 'not_started', kind: 'blog', platform: null, angle: null, url: null }],
    },
  });
}

