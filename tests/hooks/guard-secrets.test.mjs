import test from 'node:test';
import assert from 'node:assert/strict';
import { spawn } from 'node:child_process';
import { fileURLToPath } from 'node:url';
import { withTmpDir } from '../helpers/tmp.mjs';
import { writeState } from '../../scripts/lib/state.mjs';
import { createDefaultState } from '../../scripts/lib/schema.mjs';

const hook = fileURLToPath(new URL('../../hooks/guard-secrets.mjs', import.meta.url));

function runHook(stdin, cwd) {
  return new Promise((resolve, reject) => {
    const child = spawn('node', [hook], { cwd });
    let stdout = '';
    child.stdout.on('data', (d) => { stdout += d; });
    child.on('error', reject);
    child.on('close', (code) => resolve({ code, stdout }));
    child.stdin.end(stdin);
  });
}

const call = (cwd, tool_name, tool_input) => JSON.stringify({ hook_event_name: 'PreToolUse', cwd, tool_name, tool_input });
const koudProject = (dir) => writeState(dir, createDefaultState({ pluginVersion: '0.2.0' }));

test('in a koud project, reading .env is denied in the documented PreToolUse shape', async () => {
  await withTmpDir(async (dir) => {
    await koudProject(dir);
    const { code, stdout } = await runHook(call(dir, 'Read', { file_path: `${dir}/apps/api/.env` }), dir);
    assert.equal(code, 0);
    const out = JSON.parse(stdout);
    assert.equal(out.hookSpecificOutput.hookEventName, 'PreToolUse');
    assert.equal(out.hookSpecificOutput.permissionDecision, 'deny');
    assert.match(out.hookSpecificOutput.permissionDecisionReason, /^koud: \.env holds secrets/);
  });
});

test('in a koud project, a shell command on .env asks rather than denies', async () => {
  await withTmpDir(async (dir) => {
    await koudProject(dir);
    const { stdout } = await runHook(call(dir, 'Bash', { command: 'cat .env' }), dir);
    assert.equal(JSON.parse(stdout).hookSpecificOutput.permissionDecision, 'ask');
  });
});

test('ordinary calls produce no output at all', async () => {
  await withTmpDir(async (dir) => {
    await koudProject(dir);
    for (const input of [
      call(dir, 'Read', { file_path: `${dir}/package.json` }),
      call(dir, 'Read', { file_path: `${dir}/.env.example` }),
      call(dir, 'Bash', { command: 'npm test' }),
    ]) {
      const { code, stdout } = await runHook(input, dir);
      assert.equal(code, 0);
      assert.equal(stdout, '');
    }
  });
});

test('outside a koud project the hook stays out of the way, even for .env', async () => {
  await withTmpDir(async (dir) => {
    const { code, stdout } = await runHook(call(dir, 'Read', { file_path: `${dir}/.env` }), dir);
    assert.equal(code, 0);
    assert.equal(stdout, '', 'a plugin must not police projects that never opted in');
  });
});

test('malformed or empty input never crashes the session', async () => {
  await withTmpDir(async (dir) => {
    await koudProject(dir);
    for (const stdin of ['', '{ not json', 'null', '[]', '{"tool_name":"Read"}']) {
      const { code, stdout } = await runHook(stdin, dir);
      assert.equal(code, 0, JSON.stringify(stdin));
      assert.equal(stdout, '');
    }
  });
});
