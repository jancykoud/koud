import test from 'node:test';
import assert from 'node:assert/strict';
import { execFile } from 'node:child_process';
import { readFile } from 'node:fs/promises';
import { promisify } from 'node:util';
import { fileURLToPath } from 'node:url';
import { checkTools } from '../scripts/lib/preflight.mjs';
import { selectTargets, applyShip } from '../scripts/lib/ship-apply.mjs';
import { validateDeploy } from '../scripts/lib/deploy-schema.mjs';
import { readState, writeState } from '../scripts/lib/state.mjs';
import { withTmpDir } from './helpers/tmp.mjs';
import { scaffoldStage2Project } from './helpers/scaffold.mjs'; // from Task 6

const run = promisify(execFile);

// Resolved from this file's own location, not `cwd: root` -- `root` is the bare
// scratch dir withTmpDir hands us, which never contains the repo's tests/ tree.
const composeFile = fileURLToPath(new URL('./fixtures/h0-compose.yml', import.meta.url));

// The docker CLI being installed is not enough: without a reachable daemon `compose up`
// fails for a reason that has nothing to do with this plugin. `docker info` asks the daemon.
async function dockerDaemonReachable() {
  try {
    await run('docker', ['info'], { timeout: 10_000 });
    return true;
  } catch {
    return false;
  }
}

test('Docker Compose end-to-end -- selectTargets, applyShip, and a real curl-verified local URL', async (t) => {
  const tools = await checkTools();
  if (!tools.find((x) => x.name === 'docker')?.present || !(await dockerDaemonReachable())) {
    t.skip('no reachable Docker daemon on this machine -- run this check where Docker is running');
    return;
  }

  await withTmpDir(async (root) => {
    await scaffoldStage2Project(root);
    const state = await readState(root);
    await writeState(root, { ...state, phases: { ...state.phases, stack: { ...state.phases.stack, status: 'approved' } } });

    // A minimal one-service Compose fixture -- a static file server on a fixed port is
    // enough to prove the mechanics without needing a real application build.
    await run('docker', ['compose', '-f', composeFile, 'up', '-d'], { cwd: root });
    t.after(() => run('docker', ['compose', '-f', composeFile, 'down'], { cwd: root }).catch(() => {}));

    const url = 'http://localhost:8089/';
    let verified = false;
    for (let i = 0; i < 10 && !verified; i += 1) {
      try {
        await run('curl', ['-sf', url]);
        verified = true;
      } catch {
        await new Promise((r) => setTimeout(r, 500));
      }
    }
    assert.equal(verified, true, 'the compose service never became reachable');

    // h0-stack.json (scaffolded above) has two deployable slots -- "frontend" and "deploy"
    // (its "database" slot is the only one deployableSlots() excludes, per
    // deploy-schema.test.mjs's "only the database slot is excluded" case). Its
    // shape_rationale is single-app: server actions cover every write, so one running
    // instance legitimately covers both slots -- both service entries point at the single
    // compose container's curl-verified URL, not two separate deploys.
    const service = (name, kind) => ({
      name, kind, target: 'docker-compose', dockerfile: null,
      url, verified: true, verified_at: new Date().toISOString(),
      verification_method: `curl -sf ${url} (exit 0)`,
    });
    const deploy = {
      target_strategy: 'docker-compose',
      services: [service('frontend', 'frontend'), service('deploy', 'backend')],
      infra: { terraform_modules: [], state_backend: 'local' },
      cicd: { workflows: [], auth: 'static-secret' },
    };
    const stack = JSON.parse(await readFile(new URL('./fixtures/h0-stack.json', import.meta.url), 'utf8'));
    const { valid, errors } = validateDeploy(deploy, stack);
    assert.equal(valid, true, errors.join('\n'));
    const { artifacts } = await applyShip(root, deploy, {});
    assert.deepEqual(artifacts, ['.koud/deploy.json']);
    const next = await readState(root);
    assert.equal(next.project.deploy.primary_url, url);
    assert.equal(next.phases.ship.status, 'awaiting_approval');
  });
});
