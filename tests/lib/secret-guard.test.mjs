import test from 'node:test';
import assert from 'node:assert/strict';
import { isSecretFile, secretFilesInCommand, evaluateToolCall } from '../../scripts/lib/secret-guard.mjs';

test('env files are secrets, at any depth', () => {
  for (const p of ['.env', 'apps/api/.env', '/abs/project/.env', '.env.local', '.env.production', 'apps/web/.env.development.local', '.envrc']) {
    assert.equal(isSecretFile(p), true, p);
  }
});

test('env templates are not secrets: they carry names, not values', () => {
  for (const p of ['.env.example', 'apps/api/.env.example', '.env.sample', '.env.template', '.env.local.example', '.env.dist']) {
    assert.equal(isSecretFile(p), false, p);
  }
});

test('key material is a secret', () => {
  for (const p of ['server.pem', 'certs/private.key', 'release.keystore', 'cert.p12', '~/.ssh/id_rsa', '/home/u/.ssh/id_ed25519']) {
    assert.equal(isSecretFile(p), true, p);
  }
});

test('ordinary files are left alone, including ones that merely mention env', () => {
  for (const p of ['package.json', 'src/env.ts', 'environment.md', 'docs/.envelope', 'config/env.example.json', 'id_rsa.pub', 'keys.md', 'README.md', '', null, undefined, 42]) {
    assert.equal(isSecretFile(p), false, String(p));
  }
});

test('a shell command is searched for secrets files, quotes and separators included', () => {
  assert.deepEqual(secretFilesInCommand('cat .env'), ['.env']);
  assert.deepEqual(secretFilesInCommand('grep DATABASE_URL "apps/api/.env" | head -1'), ['apps/api/.env']);
  assert.deepEqual(secretFilesInCommand('cp .env.example .env && cat .env'), ['.env']);
  assert.deepEqual(secretFilesInCommand('source .env.local;npm start'), ['.env.local']);
  assert.deepEqual(secretFilesInCommand('npm test'), []);
  assert.deepEqual(secretFilesInCommand('cat .env.example'), []);
  assert.deepEqual(secretFilesInCommand(undefined), []);
});

test('reading a secrets file is denied, with a way forward in the reason', () => {
  const v = evaluateToolCall({ tool_name: 'Read', tool_input: { file_path: 'apps/api/.env' } });
  assert.equal(v.decision, 'deny');
  assert.match(v.reason, /\.env\.example/);
});

test('editing or writing a secrets file asks the user instead of refusing', () => {
  for (const tool of ['Edit', 'Write']) {
    const v = evaluateToolCall({ tool_name: tool, tool_input: { file_path: '.env' } });
    assert.equal(v.decision, 'ask', tool);
  }
});

test('a shell command touching a secrets file asks, naming the file', () => {
  const v = evaluateToolCall({ tool_name: 'Bash', tool_input: { command: 'cat apps/api/.env' } });
  assert.equal(v.decision, 'ask');
  assert.match(v.reason, /apps\/api\/\.env/);
});

test('everything else passes through untouched', () => {
  assert.equal(evaluateToolCall({ tool_name: 'Read', tool_input: { file_path: '.env.example' } }), null);
  assert.equal(evaluateToolCall({ tool_name: 'Read', tool_input: { file_path: 'package.json' } }), null);
  assert.equal(evaluateToolCall({ tool_name: 'Bash', tool_input: { command: 'npm test' } }), null);
  assert.equal(evaluateToolCall({ tool_name: 'Grep', tool_input: { pattern: 'x', path: '.env' } }), null);
  assert.equal(evaluateToolCall({ tool_name: 'Read', tool_input: {} }), null);
  assert.equal(evaluateToolCall({}), null);
  assert.equal(evaluateToolCall(), null);
});
