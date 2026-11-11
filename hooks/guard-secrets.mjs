#!/usr/bin/env node
// PreToolUse guard: keeps the values in secrets files out of the conversation.
//
// It only acts inside a project koud manages (one with .koud/state.json). A plugin's hooks
// fire in every session where the plugin is installed, and policing projects that never
// opted in would be overreach.
//
// Same contract as every other hook here: it must never crash a session. Any failure --
// unreadable stdin, malformed JSON, a missing field -- ends in a silent exit 0, which lets
// the tool call through exactly as if this hook did not exist.
import { access } from 'node:fs/promises';
import path from 'node:path';
import { evaluateToolCall } from '../scripts/lib/secret-guard.mjs';

function readStdin() {
  return new Promise((resolve) => {
    let data = '';
    process.stdin.on('data', (chunk) => { data += chunk; });
    process.stdin.on('end', () => resolve(data));
    process.stdin.on('error', () => resolve(''));
  });
}

try {
  const input = JSON.parse(await readStdin());
  const root = typeof input.cwd === 'string' && input.cwd !== '' ? input.cwd : process.cwd();
  await access(path.join(root, '.koud', 'state.json')); // throws when koud is not in use here

  const verdict = evaluateToolCall(input);
  if (verdict !== null) {
    console.log(JSON.stringify({
      hookSpecificOutput: {
        hookEventName: 'PreToolUse',
        permissionDecision: verdict.decision,
        permissionDecisionReason: `koud: ${verdict.reason}`,
      },
    }));
  }
} catch {
  // Silent -- see the contract above.
}
process.exit(0);
