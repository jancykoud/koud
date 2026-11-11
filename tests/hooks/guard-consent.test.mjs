import test from 'node:test';
import assert from 'node:assert/strict';
import { spawn } from 'node:child_process';
import { fileURLToPath } from 'node:url';
import { withTmpDir } from '../helpers/tmp.mjs';
import { writeState } from '../../scripts/lib/state.mjs';
import { createDefaultState } from '../../scripts/lib/schema.mjs';

const hook = fileURLToPath(new URL('../../hooks/guard-consent.mjs', import.meta.url));

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

const bash = (cwd, command) => JSON.stringify({ hook_event_name: 'PreToolUse', cwd, tool_name: 'Bash', tool_input: { command } });
const koudProject = (dir) => writeState(dir, createDefaultState({ pluginVersion: '0.3.0' }));
const APPLY = 'node "/plugins/koud/scripts/architect.mjs" apply . --allow-project-writes';

test('in a koud project, an apply that writes outside .koud asks the user', async () => {
  await withTmpDir(async (dir) => {
    await koudProject(dir);
    const { code, stdout } = await runHook(bash(dir, APPLY), dir);
    assert.equal(code, 0);
    const out = JSON.parse(stdout);
    assert.equal(out.hookSpecificOutput.hookEventName, 'PreToolUse');
    assert.equal(out.hookSpecificOutput.permissionDecision, 'ask');
    assert.match(out.hookSpecificOutput.permissionDecisionReason, /^koud: this apply writes files outside \.koud\//);
  });
});

test('replacing the brief asks too', async () => {
  await withTmpDir(async (dir) => {
    await koudProject(dir);
    const { stdout } = await runHook(bash(dir, 'node /p/scripts/brief.mjs apply . --brief .koud/brief.draft.json --replace'), dir);
    assert.equal(JSON.parse(stdout).hookSpecificOutput.permissionDecision, 'ask');
  });
});

test('a preview, a koud-only apply and unrelated commands pass in silence', async () => {
  await withTmpDir(async (dir) => {
    await koudProject(dir);
    for (const cmd of [
      'node /p/scripts/architect.mjs apply . --dry-run',
      'node /p/scripts/architect.mjs apply . --koud-only',
      'npm test',
    ]) {
      const { code, stdout } = await runHook(bash(dir, cmd), dir);
      assert.equal(code, 0);
      assert.equal(stdout, '', cmd);
    }
  });
});

test('outside a koud project the hook says nothing', async () => {
  await withTmpDir(async (dir) => {
    const { code, stdout } = await runHook(bash(dir, APPLY), dir);
    assert.equal(code, 0);
    assert.equal(stdout, '');
  });
});

test('it only looks at Bash, and never crashes on input it cannot read', async () => {
  await withTmpDir(async (dir) => {
    await koudProject(dir);
    const write = JSON.stringify({ cwd: dir, tool_name: 'Write', tool_input: { file_path: 'AGENTS.md', content: APPLY } });
    for (const stdin of [write, '', 'not json', '{"cwd":42}', JSON.stringify({ cwd: dir, tool_name: 'Bash' })]) {
      const { code, stdout } = await runHook(stdin, dir);
      assert.equal(code, 0);
      assert.equal(stdout, '');
    }
  });
});

test('a deploy command asks, and names where it deploys', async () => {
  await withTmpDir(async (dir) => {
    await koudProject(dir);
    const { stdout } = await runHook(bash(dir, 'cd apps/web && vercel deploy --prod'), dir);
    const out = JSON.parse(stdout).hookSpecificOutput;
    assert.equal(out.permissionDecision, 'ask');
    assert.match(out.permissionDecisionReason, /^koud: this command deploys to Vercel/);
  });
});

test('a deploy command outside a koud project passes in silence', async () => {
  await withTmpDir(async (dir) => {
    const { stdout } = await runHook(bash(dir, 'railway up'), dir);
    assert.equal(stdout, '');
  });
});
