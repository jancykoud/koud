import test from 'node:test';
import assert from 'node:assert/strict';
import { readFile, readdir } from 'node:fs/promises';
import { fileURLToPath } from 'node:url';
import path from 'node:path';

const root = fileURLToPath(new URL('..', import.meta.url));
const agentsDir = path.join(root, 'agents');

async function agentFiles() {
  return (await readdir(agentsDir)).filter((f) => f.endsWith('.md'));
}
const read = (f) => readFile(path.join(agentsDir, f), 'utf8');
async function readAgent(file) {
  return readFile(path.join(agentsDir, file), 'utf8');
}

test('every agent has frontmatter with a name, description and tools', async () => {
  for (const f of await agentFiles()) {
    const content = await read(f);
    assert.ok(content.startsWith('---\n'), `${f} must open with frontmatter`);
    const fm = content.slice(4, content.indexOf('\n---', 4));
    assert.match(fm, /name:\s*\S/, `${f} needs a name`);
    assert.match(fm, /description:\s*\S/, `${f} needs a description`);
    assert.match(fm, /tools:\s*\S/, `${f} needs a tools list`);
  }
});

test('every agent filename matches its declared name', async () => {
  for (const f of await agentFiles()) {
    const content = await read(f);
    const fm = content.slice(4, content.indexOf('\n---', 4));
    const name = fm.match(/name:\s*(\S+)/)[1];
    assert.equal(name, f.replace(/\.md$/, ''), `${f} declares name "${name}"`);
  }
});

// --- solution-architect.md --------------------------------------------------------------

test('solution-architect exists', async () => {
  const files = await agentFiles();
  assert.ok(files.includes('solution-architect.md'), 'missing agents/solution-architect.md');
});

test('solution-architect is told to write only the payload', async () => {
  const md = await readAgent('solution-architect.md');
  const top = md.slice(0, md.indexOf('## Read first'));
  assert.match(top, /only output is/i);
  assert.ok(/do not write markdown/i.test(md) && /do not draw diagrams/i.test(md));
});

test('solution-architect is warned against padding the invariants', async () => {
  const md = await readAgent('solution-architect.md');
  const dont = md.slice(md.indexOf('## Do not'));
  assert.match(dont, /invent invariants/i);
});

// --- compliance-checker.md ----------------------------------------------------------------

// Only compliance-checker here -- deploy-engineer.md is Stage 2 (Task 9). A single
// "the M4 agents exist" test checking both would fail throughout all of Stage 1, since
// deploy-engineer.md does not exist yet; Task 9 adds the sibling assertion for it.
test('the compliance agent exists', async () => {
  const files = await agentFiles();
  assert.ok(files.includes('compliance-checker.md'), 'missing agents/compliance-checker.md');
});

test('compliance-checker is Sonnet with read-only + Bash tools, matching the parent design\'s model table', async () => {
  const content = await readAgent('compliance-checker.md');
  const fm = content.slice(4, content.indexOf('\n---', 4));
  assert.match(fm, /model:\s*sonnet/);
  assert.match(fm, /tools:.*Read/);
  assert.match(fm, /tools:.*Grep/);
  assert.match(fm, /tools:.*Bash/);
  assert.match(fm, /tools:.*Glob/);
  assert.doesNotMatch(fm, /Write/, 'compliance-checker only reports -- it writes nothing');
});

// Completes the pair Task 5's "the compliance agent exists" test left half-open --
// both agents are on disk, so this is the point that check is meaningful.
test('the compliance and deploy agents exist', async () => {
  const files = await agentFiles();
  for (const f of ['compliance-checker.md', 'deploy-engineer.md']) {
    assert.ok(files.includes(f), `missing agents/${f}`);
  }
});

test('deploy-engineer is Opus with Read/Write/Edit/Bash, matching the parent design\'s model table', async () => {
  const content = await readAgent('deploy-engineer.md');
  const fm = content.slice(4, content.indexOf('\n---', 4));
  assert.match(fm, /model:\s*opus/);
  for (const tool of ['Read', 'Write', 'Edit', 'Bash']) {
    assert.match(fm, new RegExp(`tools:.*${tool}`));
  }
});

// --- quality-reviewer.md ----------------------------------------------------------------

// Only quality-reviewer here -- submission-writer.md is Stage 2 (Task 12). Same split
// M4 used across compliance-checker.md (Task 5) and deploy-engineer.md (Task 9).
test('the review agent exists', async () => {
  const files = await agentFiles();
  assert.ok(files.includes('quality-reviewer.md'), 'missing agents/quality-reviewer.md');
});

test('quality-reviewer is Opus with read-only + Bash tools, matching the parent design\'s model table', async () => {
  const content = await readAgent('quality-reviewer.md');
  const fm = content.slice(4, content.indexOf('\n---', 4));
  assert.match(fm, /model:\s*opus/);
  for (const tool of ['Read', 'Grep', 'Glob', 'Bash']) {
    assert.match(fm, new RegExp(`tools:.*${tool}`));
  }
  assert.doesNotMatch(fm, /Write/, 'quality-reviewer only reports -- it writes nothing');
});

test('quality-reviewer states the same three-bucket classification rule the design records', async () => {
  const content = await readAgent('quality-reviewer.md');
  assert.match(content, /\bblocking\b/);
  assert.match(content, /should-fix/);
  assert.match(content, /post-release/);
  assert.match(content, /user_visible/);
});

// Task 4's only Important finding was these two paragraphs drifting apart; the fix synced
// them but (per the final whole-branch review, finding 13) added no durable guard against
// re-drifting. Extract the classification-rule paragraph from each file by stable content
// markers (the paragraph's own opening/closing phrases, not a line number) and pin them
// word-for-word identical, so an edit to only one side fails loudly.
function extractClassificationRule(text) {
  // Markdown line-wrap position differs between the two files (different surrounding prose
  // widths, so "**blocking** is a" and "correctness bug" can land on different lines even
  // within one file). Normalize whitespace first so both the search markers and the
  // extracted span are compared as words, not as literal line-wrapped text.
  const normalized = text.replace(/\s+/g, ' ');
  const start = normalized.indexOf('**blocking** is a correctness bug');
  const end = normalized.indexOf('refactor.', start);
  if (start === -1 || end === -1) {
    throw new Error('classification-rule paragraph not found -- markers may have drifted');
  }
  return normalized.slice(start, end + 'refactor.'.length).trim();
}

test('quality-reviewer.md and commands/review.md state the exact same classification-rule paragraph', async () => {
  const agentContent = await readAgent('quality-reviewer.md');
  const commandContent = await readFile(path.join(root, 'commands', 'review.md'), 'utf8');
  const agentRule = extractClassificationRule(agentContent);
  const commandRule = extractClassificationRule(commandContent);
  assert.equal(agentRule, commandRule,
    'commands/review.md\'s classification rule must stay word-for-word identical to quality-reviewer.md\'s -- '
    + 'they drifted apart once already (Task 4)');
});
