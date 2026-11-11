#!/usr/bin/env node
// PreToolUse guard: the steps that need a person's yes get a permission prompt.
//
// - A koud apply that writes outside .koud/, or replaces the brief. The apply scripts
//   already refuse without a consent flag, but the flag is typed by the agent, so on its
//   own it only proves the agent decided.
// - A command that deploys. It is the one step `git checkout` cannot take back.
//
// It only acts inside a project koud manages (one with .koud/state.json), and like every
// other hook here it must never crash a session: any failure ends in a silent exit 0.
import { access } from 'node:fs/promises';
import path from 'node:path';
import { evaluateApplyCommand } from '../scripts/lib/project-writes.mjs';
import { evaluateDeployCommand } from '../scripts/lib/deploy-guard.mjs';

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

  const command = input.tool_name === 'Bash' ? input.tool_input?.command : undefined;
  const verdict = evaluateApplyCommand(command) ?? evaluateDeployCommand(command);
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
