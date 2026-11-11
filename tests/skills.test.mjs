import test from 'node:test';
import assert from 'node:assert/strict';
import { readFile, readdir, stat } from 'node:fs/promises';
import { fileURLToPath } from 'node:url';
import path from 'node:path';

const root = fileURLToPath(new URL('..', import.meta.url));
const skillsDir = path.join(root, 'skills');

async function skillNames() {
  const entries = await readdir(skillsDir);
  const names = [];
  for (const e of entries) {
    if ((await stat(path.join(skillsDir, e))).isDirectory()) names.push(e);
  }
  return names;
}
const readSkill = (name) => readFile(path.join(skillsDir, name, 'SKILL.md'), 'utf8');
const readReference = (skill, file) =>
  readFile(path.join(skillsDir, skill, 'references', file), 'utf8');

test('every skill has frontmatter with a name and a description', async () => {
  for (const n of await skillNames()) {
    const content = await readSkill(n);
    assert.ok(content.startsWith('---\n'), `${n} must open with frontmatter`);
    const fm = content.slice(4, content.indexOf('\n---', 4));
    assert.match(fm, /name:\s*\S/, `${n} needs a name`);
    assert.match(fm, /description:\s*\S/, `${n} needs a description`);
  }
});

test('every skill directory name matches its declared name', async () => {
  for (const n of await skillNames()) {
    const fm = (await readSkill(n)).slice(4);
    const declared = fm.match(/name:\s*(\S+)/)[1];
    assert.equal(declared, n);
  }
});

test('every skill description says when to use it, not just what it is', async () => {
  for (const n of await skillNames()) {
    const fm = (await readSkill(n)).slice(4, (await readSkill(n)).indexOf('\n---', 4));
    const desc = fm.match(/description:\s*(.+)/)[1];
    assert.ok(desc.length > 40, `${n}'s description is too thin to route on: "${desc}"`);
  }
});

test('framework-drift-guard ships the canonical banner, not a paraphrase', async () => {
  const md = await readSkill('framework-drift-guard');
  const banner = md.slice(
    md.indexOf('<!-- BEGIN:nextjs-agent-rules -->'),
    md.indexOf('<!-- END:nextjs-agent-rules -->'),
  );
  assert.ok(banner.length > 0, 'the canonical banner block must be present');
  assert.match(banner, /# This is NOT the .* you know/);
  assert.match(banner, /may all differ from your training data/);
  assert.match(banner, /node_modules\/next\/dist\/docs\//);
  assert.match(banner, /Heed deprecation notices\./);
});

test('framework-drift-guard says when NOT to emit a banner', async () => {
  const md = await readSkill('framework-drift-guard');
  const tail = md.slice(md.length / 2);
  assert.match(tail, /\bnot\b[^.]*\bbanner\b|\bbanner\b[^.]*\bnoise\b/i,
    'a skill that only says when to act will act every time');
});

test('security-invariants closes its shape section with the stop-and-flag line', async () => {
  const md = await readSkill('security-invariants');
  const shape = md.slice(md.indexOf('## The shape'), md.indexOf('## Families'));
  assert.ok(shape.includes('stop and flag it instead of shipping it'));
});

test('security-invariants tells the reader a short contract is legitimate', async () => {
  const md = await readSkill('security-invariants');
  const scaling = md.slice(md.indexOf('## Scaling'), md.indexOf('## The reader'));
  assert.match(scaling, /\bSonar\b/, 'the claim needs its evidence beside it');
  assert.match(scaling, /never pad|do not pad/i);
});

test('the invariants corpus carries all four shapes with their prizes', async () => {
  const md = await readReference('security-invariants', 'invariants-corpus.md');
  for (const [project, prize] of [
    ['Kintwadi', 'Best Design'],
    ['Sonar', 'First Place'],
    ['HYPE', 'Best Technical Implementation'],
    ['Karma', 'Second Place'],
  ]) {
    const row = md.split('\n').find((l) => l.includes(project) && l.includes(prize));
    assert.ok(row, `${project} must appear with its real prize (${prize})`);
  }
});

test('monorepo-structure carries both real shapes with their evidence project', async () => {
  const md = await readSkill('monorepo-structure');
  const mono = md.slice(md.indexOf('## single-app'), md.indexOf('## multi-service'));
  assert.match(mono, /\bKintwadi\b/);
  assert.match(mono, /\(app\)/, 'the protected route group is the load-bearing detail');
  const multi = md.slice(md.indexOf('## multi-service'));
  assert.match(multi, /\bKarma\b/);
  assert.match(multi, /\bagents\/\B|\bagents\/\b/, 'Karma has three services, not two');
});

test('monorepo-structure gives criteria, not just descriptions', async () => {
  const md = await readSkill('monorepo-structure');
  assert.ok(md.indexOf('## Choosing') > md.indexOf('## multi-service'),
    'the criteria come after both shapes are on the table');
  assert.match(md.slice(md.indexOf('## Choosing')), /network hop|deploy target/);
});

test('architecture-diagramming records that nobody automated a PNG export, exactly once', async () => {
  const md = await readSkill('architecture-diagramming');
  // Scoped to the corpus section, and counted rather than merely matched: a looser pattern
  // (e.g. one also matching "PNG ... by hand") is satisfiable by supporting prose elsewhere
  // in the same paragraph even after the claim sentence itself is deleted -- that decoy is
  // exactly what shipped here once already. "automat" is a rare, specific anchor, so a count
  // of 1 means the claim sentence itself is present, not just PNG- or hand-adjacent prose.
  const corpus = md.slice(md.indexOf('## The corpus'), md.indexOf('## The tier model'));
  const matches = corpus.match(/\bno\b[^.]*automat[^.]*PNG/gi) ?? [];
  assert.equal(matches.length, 1,
    'the claim must appear exactly once in the corpus section, or the test can be defeated ' +
    'by deleting the one copy while unrelated prose keeps it passing');
});

test('architecture-diagramming warns that hand edits are lost', async () => {
  const md = await readSkill('architecture-diagramming');
  assert.match(md, /architecture\.json/);
  assert.match(md, /hand edit|edited by hand/i);
});

test('frontend-architecture states protection is the default, not an opt-in', async () => {
  const md = await readSkill('frontend-architecture');
  // Scoped to the body, not the frontmatter: the description line alone used to be the only
  // thing satisfying these two assertions, so stripping the whole body and keeping just the
  // frontmatter passed. The body must say it itself.
  const body = md.slice(md.indexOf('\n---', 4) + 4);
  assert.match(body, /\bdefault\b/,
    'the body itself must state the default, not just the frontmatter description');
  assert.match(body, /opt-in/i,
    'the body itself must say "opt-in", not just the frontmatter description');
  assert.ok(md.indexOf('requireSession') < md.indexOf('proxy.ts'),
    'the server guard is primary; the edge allowlist is the optimistic layer and comes second');
});

test('backend-architecture keeps token scopes separated', async () => {
  const md = await readSkill('backend-architecture');
  // Scoped to the token-scope section itself. "scope" (8x) and "Karma" (8x) both appear
  // throughout the file -- in the DAL section, the closing summary -- so an unscoped match
  // survives deleting this entire section. Require the section to exist between its own
  // heading and the next, and require it to name the actual three tokens, not just the word
  // "scope".
  const start = md.indexOf('## Separated token scopes');
  const end = md.indexOf('## Dependency injection');
  assert.ok(start !== -1 && end > start,
    'the token-scope section must exist, between its own heading and the next one');
  const section = md.slice(start, end);
  assert.match(section, /\bKarma\b/, 'the practice needs the project it was measured in');
  for (const token of ['DT_API_TOKEN', 'DT_OTEL_TOKEN', 'DT_QUERY_TOKEN']) {
    assert.ok(section.includes(token), `token-scope section is missing ${token}`);
  }
});

test('data-modeling requires a policy in the same change as a new table', async () => {
  const md = await readSkill('data-modeling');
  assert.match(md, /same change/i);
});

test('ui-design-principles carries the anti-generic list verbatim', async () => {
  const md = await readSkill('ui-design-principles');
  for (const rule of ['gradient', 'neon', 'glassmorphism', 'emoji']) {
    assert.match(md, new RegExp(`\\b${rule}`, 'i'), `the anti-generic list is missing "${rule}"`);
  }
  assert.match(md, /#000|pure black/i);
});

test('ui-design-principles fixes the system before the first screen', async () => {
  const md = await readSkill('ui-design-principles');
  const closing = md.slice(md.lastIndexOf('##'));
  assert.match(closing, /before the first screen|once.*reuse/i,
    'this is the rule that produced the Best Design win; it belongs at the end, as the takeaway');
});

test('ui-design-principles names all four breakpoints', async () => {
  const md = await readSkill('ui-design-principles');
  for (const bp of ['375', '820', '1024', '1440']) assert.ok(md.includes(bp), `missing ${bp}px`);
});

test('both unevidenced skills say so, near the top', async () => {
  for (const name of ['gherkin-requirements', 'openspec-workflow']) {
    const md = await readSkill(name);
    const top = md.slice(0, Math.floor(md.length / 3));
    assert.match(top, /no (project|winner)[^.]*corpus|not evidence|craft, not evidence/i,
      `${name} must disclose that the corpus does not back it, and do it near the top`);
  }
});

test('gherkin-requirements forbids hand-editing the generated feature files', async () => {
  const md = await readSkill('gherkin-requirements');
  assert.match(md, /requirements\.json/);
  assert.match(md, /never hand-edit|do not (hand-)?edit/i);
});

test('openspec-workflow names the real package and the squatted one', async () => {
  const md = await readSkill('openspec-workflow');
  assert.ok(md.includes('@fission-ai/openspec'));
  assert.match(md, /\bsquat/i);
  // Compare the trap SECTION's heading position against the mechanics section's heading
  // position, not a bare indexOf on the package name -- the frontmatter description is
  // mandated by the brief to contain '@fission-ai/openspec' too, which pins that bare
  // string's first occurrence near the top of the file regardless of where the body's
  // trap section actually sits. Heading positions aren't polluted by the frontmatter.
  const trapAt = md.indexOf('## The package trap');
  const proposalAt = md.indexOf('## Proposal');
  assert.ok(trapAt !== -1, 'the package trap needs its own heading');
  assert.ok(proposalAt !== -1, 'the proposal mechanics need their own heading');
  assert.ok(trapAt < proposalAt,
    'the trap comes before the mechanics — reading it late is reading it too late');
});

test('openspec-workflow explains why a deferred phase is not a failed phase', async () => {
  const md = await readSkill('openspec-workflow');
  const deferred = md.slice(md.indexOf('## The deferred path'));
  assert.match(deferred, /optional|must not fail|own outputs/i);
});

test('the ship skills exist', async () => {
  const names = await skillNames();
  for (const n of ['deploy-targets', 'containerization', 'cicd-github-actions', 'iac-terraform']) {
    assert.ok(names.includes(n), `missing skills/${n}`);
  }
});

test('deploy-targets names every target and states that a cloud the brief requires wins', async () => {
  const content = await readSkill('deploy-targets');
  for (const target of ['Vercel', 'Cloud Run', 'Railway', 'Render', 'AWS', 'Docker Compose']) {
    // \b at the start and end of the whole phrase, not mid-phrase -- "Cloud Run" and
    // "Docker Compose" are two words with an ordinary space between them, which is
    // already a word boundary; anchoring only the phrase's outer edges is correct and
    // anchoring internally (e.g. between "Cloud" and "Run") would be redundant, not wrong,
    // but the point is the phrase must not be found merely as a substring of a longer word
    // -- e.g. bare /Render/ also matching inside "Rendered".
    assert.match(content, new RegExp(`\\b${target}\\b`),
      `"${target}" must appear as its own word/phrase, not merely as a substring of a longer word`);
  }
  assert.match(content, /A cloud the brief requires always wins/);
});

test('deploy-targets makes no unattributed specific claim about kintwadi or karma', async () => {
  // deploy-targets' evidence claim is deliberately kept general ("both reference
  // repositories chose differently") rather than naming either repo, precisely so this
  // skill needs no cross-check against skills/winning-ideation/references/winner-corpus.md
  // the way a skill making a named claim would. If a future edit adds a named claim about
  // either repo, it must cite the corpus file the same way the other skills do -- this test is
  // what catches an edit that adds one without adding that citation.
  const content = await readSkill('deploy-targets');
  assert.doesNotMatch(content, /kintwadi/i);
  assert.doesNotMatch(content, /karma/i);
});

test('containerization, cicd-github-actions and iac-terraform have frontmatter and non-trivial content', async () => {
  for (const n of ['containerization', 'cicd-github-actions', 'iac-terraform']) {
    const content = await readSkill(n);
    assert.ok(content.startsWith('---\n'));
    assert.ok(content.length > 500, `${n}/SKILL.md looks too thin to be useful`);
  }
});

// --- skills written for koud ----------------------------------------------------------

test('project-brief documents every top-level field the validator knows', async () => {
  const content = await readSkill('project-brief');
  for (const field of [
    'identity', 'problem', 'audience', 'goals', 'non_goals', 'criteria', 'tech',
    'constraints', 'dates', 'unresolved', 'track',
  ]) {
    assert.match(content, new RegExp(`\\b${field}\\b`), `the brief skill never mentions "${field}"`);
  }
});

test('project-brief says an existing repository is read for evidence, never assumed', async () => {
  const content = await readSkill('project-brief');
  assert.match(content, /Evidence first/);
  assert.match(content, /A dependency is not a usage/);
  assert.match(content, /already in the codebase/);
});

test('project-brief prefers an open question to a guess', async () => {
  const content = await readSkill('project-brief');
  assert.match(content, /better than guessing/);
});

test('test-driven-build states the five steps in order', async () => {
  const content = await readSkill('test-driven-build');
  const order = ['**Test.**', '**Confirm it fails.**', '**Implement.**', '**Suite.**', '**Commit.**']
    .map((step) => content.indexOf(step));
  assert.ok(order.every((i) => i !== -1), 'all five steps must be named');
  assert.deepEqual([...order].sort((a, b) => a - b), order, 'the steps must appear in order');
});

test('test-driven-build keeps progress in tasks.md and reviews before ticking a box', async () => {
  const content = await readSkill('test-driven-build');
  assert.match(content, /Progress lives in those checkboxes and nowhere else/);
  assert.ok(content.indexOf('## Review before ticking') !== -1);
});

test('test-driven-build depends on no other plugin', async () => {
  const content = await readSkill('test-driven-build');
  assert.doesNotMatch(content, /superpowers/);
});
