import test from 'node:test';
import assert from 'node:assert/strict';
import path from 'node:path';
import { mkdir, writeFile } from 'node:fs/promises';
import { withTmpDir } from '../helpers/tmp.mjs';
import {
  isProjectPath, redirect, writeModeFromFlags, projectPaths, renderConsentRequest,
  evaluateApplyCommand, findCaseVariants, describeProjectWrite, ALLOW_FLAG, KOUD_ONLY_FLAG, REPLACE_FLAG, OUT_DIR,
} from '../../scripts/lib/project-writes.mjs';

test('.koud and everything under it is ours; everything else is the project', () => {
  for (const p of ['.koud', '.koud/state.json', './.koud/specs/0001-x/tasks.md', '.koud\\brief.json']) {
    assert.equal(isProjectPath(p), false, p);
  }
  // `.koudx` and `.koud-old` only share a prefix with the directory, they are not inside it.
  for (const p of ['AGENTS.md', 'docs/architecture.md', 'features/a.feature', '.koudx/a', '.koud-old/state.json', '.claude/x']) {
    assert.equal(isProjectPath(p), true, p);
  }
});

test('koud-only redirects project paths under .koud/out at the same relative path', () => {
  assert.equal(redirect('docs/assets/architecture.svg', 'koud-only'), `${OUT_DIR}/docs/assets/architecture.svg`);
  assert.equal(redirect('.koud/architecture.json', 'koud-only'), '.koud/architecture.json');
  assert.equal(redirect('AGENTS.md', 'allow'), 'AGENTS.md');
  assert.equal(redirect('AGENTS.md'), 'AGENTS.md');
});

test('the write mode is read off the flags, and no flag means ask', () => {
  assert.equal(writeModeFromFlags(new Set()), 'ask');
  assert.equal(writeModeFromFlags(new Set(['--dry-run'])), 'ask');
  assert.equal(writeModeFromFlags(new Set([ALLOW_FLAG])), 'allow');
  assert.equal(writeModeFromFlags(new Set([KOUD_ONLY_FLAG])), 'koud-only');
  assert.throws(() => writeModeFromFlags(new Set([ALLOW_FLAG, KOUD_ONLY_FLAG])), /contradict/);
});

test('projectPaths keeps only what lies outside .koud', () => {
  assert.deepEqual(projectPaths(['.koud/a.json', 'AGENTS.md', 'docs/x.md']), ['AGENTS.md', 'docs/x.md']);
  assert.deepEqual(projectPaths(undefined), []);
});

test('the consent request tells new files from changed ones and names both ways forward', () => {
  const text = renderConsentRequest('architect.mjs apply', ['AGENTS.md', 'docs/x.md'], ['AGENTS.md']);
  assert.match(text, /2 file\(s\) outside \.koud\//);
  assert.match(text, /! \(exists, would be changed\) AGENTS\.md/);
  assert.match(text, /\+ \(new\) docs\/x\.md/);
  assert.match(text, /nothing was written/);
  assert.ok(text.includes(ALLOW_FLAG) && text.includes(KOUD_ONLY_FLAG));
});

const applyCmd = (script, ...flags) => `node "/home/me/.claude/plugins/cache/koud/koud/0.3.0/scripts/${script}.mjs" apply . ${flags.join(' ')}`.trim();

test('an apply carrying the allow flag becomes a permission prompt', () => {
  const v = evaluateApplyCommand(applyCmd('architect', ALLOW_FLAG));
  assert.equal(v.decision, 'ask');
  assert.match(v.reason, /outside \.koud\//);
  assert.equal(evaluateApplyCommand(applyCmd('requirements', '--requirements x.json', ALLOW_FLAG)).decision, 'ask');
});

test('replacing the brief becomes a permission prompt, and only for brief.mjs', () => {
  const v = evaluateApplyCommand(applyCmd('brief', '--brief .koud/brief.draft.json', REPLACE_FLAG));
  assert.equal(v.decision, 'ask');
  assert.match(v.reason, /replaces the brief/);
  assert.equal(evaluateApplyCommand(applyCmd('stack', REPLACE_FLAG)), null);
});

test('everything else passes through untouched', () => {
  for (const cmd of [
    applyCmd('architect', '--dry-run'),
    applyCmd('architect', KOUD_ONLY_FLAG),
    applyCmd('brief', '--brief .koud/brief.draft.json'),
    `node scripts/architect.mjs validate .koud/architecture.json ${ALLOW_FLAG}`,
    `echo ${ALLOW_FLAG}`,
    `git commit -m "document ${ALLOW_FLAG}"`,
    'npm test',
    '',
  ]) assert.equal(evaluateApplyCommand(cmd), null, cmd);
  for (const notAString of [undefined, null, 42, {}]) assert.equal(evaluateApplyCommand(notAString), null);
});

test('a flag that merely starts like a consent flag is not one', () => {
  assert.equal(evaluateApplyCommand(applyCmd('architect', `${ALLOW_FLAG}-later`)), null);
});

// --- names that differ only by case --------------------------------------------------------

test('a path that differs only by case from a file on disk is reported with the real name', async () => {
  await withTmpDir(async (root) => {
    await mkdir(path.join(root, 'docs'), { recursive: true });
    await mkdir(path.join(root, 'Features'), { recursive: true });
    await writeFile(path.join(root, 'docs', 'ARCHITECTURE.md'), 'x', 'utf8');
    await writeFile(path.join(root, 'docs', 'data-model.md'), 'x', 'utf8');
    await writeFile(path.join(root, 'Agents.md'), 'x', 'utf8');
    await writeFile(path.join(root, 'Features', 'a.feature'), 'x', 'utf8');

    const variants = await findCaseVariants(root, [
      'docs/architecture.md',      // differs in the file name
      'docs/data-model.md',        // exact match: not a variant
      'docs/assets/a.svg',         // does not exist at all
      'AGENTS.md',                 // differs at the root
      'features/a.feature',        // differs in a directory name
      'features/b.feature',        // directory differs, file is new
    ]);
    assert.deepEqual([...variants], [
      ['docs/architecture.md', 'docs/ARCHITECTURE.md'],
      ['AGENTS.md', 'Agents.md'],
      ['features/a.feature', 'Features/a.feature'],
    ]);
  });
});

test('findCaseVariants is empty for an empty project and for no paths', async () => {
  await withTmpDir(async (root) => {
    assert.equal((await findCaseVariants(root, ['docs/architecture.md', 'AGENTS.md'])).size, 0);
    assert.equal((await findCaseVariants(root, undefined)).size, 0);
  });
});

test('a case collision outranks "exists" in a listing, and the request recommends keeping files in .koud', () => {
  const variants = new Map([['docs/architecture.md', 'docs/ARCHITECTURE.md']]);
  const taken = new Set(['docs/architecture.md', 'AGENTS.md']);
  assert.equal(describeProjectWrite('docs/architecture.md', taken, variants),
    '!! (would replace docs/ARCHITECTURE.md — the same name in another case) docs/architecture.md');
  assert.equal(describeProjectWrite('AGENTS.md', taken, variants), '! (exists, would be changed) AGENTS.md');
  assert.equal(describeProjectWrite('docs/x.md', taken, variants), '+ (new) docs/x.md');

  const text = renderConsentRequest('architect.mjs apply', ['docs/architecture.md'], [], variants);
  assert.match(text, /Recommend --koud-only unless the user wants that file replaced/);
  assert.doesNotMatch(renderConsentRequest('architect.mjs apply', ['docs/x.md']), /Recommend --koud-only/);
});
