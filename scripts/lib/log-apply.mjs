/**
 * :log has no payload of its own -- same shape as :pivot
 * appending to decisions.md. This just appends to the file init-plan.mjs already creates.
 */
import { appendFile, mkdir, access } from 'node:fs/promises';
import path from 'node:path';
import { KOUD_DIR } from './paths.mjs';
import { CHALLENGES_HEADER } from './init-plan.mjs';

const CHALLENGES_REL = `${KOUD_DIR}/challenges.md`;

export async function appendChallenge(root, text, { now = new Date() } = {}) {
  const trimmed = (text ?? '').trim();
  if (trimmed === '') throw new Error('refusing to log an empty entry');

  const target = path.join(root, CHALLENGES_REL);
  await mkdir(path.dirname(target), { recursive: true });
  let exists = true;
  try {
    await access(target);
  } catch {
    exists = false;
  }

  const entry = `\n## ${now.toISOString()} — ${trimmed}\n`;
  await appendFile(target, exists ? entry : `${CHALLENGES_HEADER}${entry}`, 'utf8');
  return CHALLENGES_REL;
}
