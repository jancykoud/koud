/**
 * Decides whether a tool call would expose a secrets file. Pure: no I/O, so the rules can
 * be tested exhaustively and the hook around them stays a thin wrapper.
 *
 * What counts as a secrets file is deliberately narrow. A guard that fires on ordinary
 * files gets disabled, and then it protects nothing.
 */
import path from 'node:path';

/** Templates carry variable names, never values: they are how a brief learns what exists. */
const TEMPLATE_SUFFIXES = ['example', 'sample', 'template', 'dist', 'defaults'];

export function isSecretFile(filePath) {
  if (typeof filePath !== 'string' || filePath.trim() === '') return false;
  const base = path.basename(filePath.trim()).toLowerCase();

  if (base === '.env' || base === '.envrc') return true;
  if (base.startsWith('.env.')) {
    const suffixes = base.slice('.env.'.length).split('.');
    return !suffixes.some((s) => TEMPLATE_SUFFIXES.includes(s));
  }
  if (/\.(pem|key|p12|pfx|keystore|jks)$/.test(base)) return true;
  if (/^id_(rsa|dsa|ecdsa|ed25519)$/.test(base)) return true;
  return false;
}

/**
 * Words in a shell command that name a secrets file. A command is split on whitespace and
 * the usual separators; quotes are stripped. This is a tripwire for the obvious cases
 * (`cat .env`, `grep KEY apps/api/.env`), not a shell parser -- a command built to evade
 * it will, which is why the decision for Bash is "ask" and not a silent allow.
 */
export function secretFilesInCommand(command) {
  if (typeof command !== 'string') return [];
  const words = command.split(/[\s;|&<>()=]+/).map((w) => w.replace(/^['"`]+|['"`]+$/g, ''));
  return [...new Set(words.filter(isSecretFile))];
}

const FILE_TOOLS = new Set(['Read', 'Edit', 'Write', 'NotebookEdit']);

/**
 * @returns {null | { decision: 'deny' | 'ask', reason: string }} null lets the call through.
 */
export function evaluateToolCall({ tool_name: tool, tool_input: input } = {}) {
  if (tool === 'Read' && isSecretFile(input?.file_path)) {
    return {
      decision: 'deny',
      reason: `${path.basename(input.file_path)} holds secrets, and nothing koud does needs their values. `
        + 'Read the matching example file (.env.example) for the variable names, or ask the user which variables exist.',
    };
  }
  if (FILE_TOOLS.has(tool) && tool !== 'Read' && isSecretFile(input?.file_path)) {
    return {
      decision: 'ask',
      reason: `${path.basename(input.file_path)} holds secrets. Confirm that this change is what you asked for.`,
    };
  }
  if (tool === 'Bash') {
    const hits = secretFilesInCommand(input?.command);
    if (hits.length > 0) {
      return {
        decision: 'ask',
        reason: `This command touches a secrets file (${hits.join(', ')}). Confirm before it runs.`,
      };
    }
  }
  return null;
}
