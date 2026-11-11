import test from 'node:test';
import assert from 'node:assert/strict';
import { readFile, access, readdir } from 'node:fs/promises';

const hooksDir = new URL('../../hooks/', import.meta.url);
const config = async () => JSON.parse(await readFile(new URL('hooks.json', hooksDir), 'utf8'));

function* commands(cfg) {
  for (const [event, groups] of Object.entries(cfg.hooks)) {
    for (const group of groups) {
      for (const hook of group.hooks) yield { event, matcher: group.matcher, command: hook.command };
    }
  }
}

// Regression: 0.1.0 deleted hooks/deadline-pressure.mjs with the hackathon phases but left
// its UserPromptSubmit entry in hooks.json, so the hook failed on every prompt. Nothing
// checked that a registered hook has a script behind it.
test('every hook registered in hooks.json has a script on disk', async () => {
  const cfg = await config();
  const names = [...commands(cfg)].map(({ command }) => command.match(/run-hook\.sh"? ([a-z-]+)$/)?.[1]);
  assert.ok(names.length > 0);
  for (const name of names) {
    assert.ok(name, 'every hook command goes through run-hook.sh with a script name');
    await access(new URL(`${name}.mjs`, hooksDir));
  }
});

test('every hook script on disk is registered, so none is dead code', async () => {
  const cfg = await config();
  const registered = new Set([...commands(cfg)].map(({ command }) => command.match(/ ([a-z-]+)$/)?.[1]));
  const onDisk = (await readdir(hooksDir)).filter((f) => f.endsWith('.mjs')).map((f) => f.replace(/\.mjs$/, ''));
  assert.deepEqual(onDisk.sort(), [...registered].sort());
});

test('the events are exactly the ones the plugin documents', async () => {
  const cfg = await config();
  assert.deepEqual(Object.keys(cfg.hooks).sort(), ['PreToolUse', 'SessionStart', 'Stop']);
});

test('the secrets guard runs before the file tools and Bash', async () => {
  const cfg = await config();
  const [group] = cfg.hooks.PreToolUse;
  for (const tool of ['Read', 'Edit', 'Write', 'Bash']) {
    assert.ok(group.matcher.split('|').includes(tool), `${tool} must be guarded`);
  }
  assert.match(group.hooks[0].command, /guard-secrets$/);
});

test('the consent guard runs before Bash', async () => {
  const cfg = await config();
  const group = cfg.hooks.PreToolUse.find((g) => /guard-consent$/.test(g.hooks[0].command));
  assert.ok(group, 'guard-consent must be registered under PreToolUse');
  assert.ok(group.matcher.split('|').includes('Bash'));
});

test('every hook command is resolved from the plugin root, never from the project', async () => {
  for (const { command } of commands(await config())) {
    assert.match(command, /\$\{CLAUDE_PLUGIN_ROOT\}/);
  }
});
