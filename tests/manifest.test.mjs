import test from 'node:test';
import assert from 'node:assert/strict';
import { readFile } from 'node:fs/promises';

test('plugin manifest is valid', async () => {
  const raw = await readFile(new URL('../.claude-plugin/plugin.json', import.meta.url), 'utf8');
  const m = JSON.parse(raw);
  assert.equal(m.name, 'koud');
  assert.match(m.version, /^\d+\.\d+\.\d+$/);
  assert.ok(m.description.length > 20, 'description should be meaningful');
});

test('package.json declares no runtime dependencies', async () => {
  const raw = await readFile(new URL('../package.json', import.meta.url), 'utf8');
  const p = JSON.parse(raw);
  assert.deepEqual(p.dependencies ?? {}, {}, 'plugin scripts must run without npm install');
  assert.equal(p.type, 'module');
});

test('marketplace manifest makes this repo installable', async () => {
  const raw = await readFile(new URL('../.claude-plugin/marketplace.json', import.meta.url), 'utf8');
  const m = JSON.parse(raw);
  assert.equal(m.name, 'koud');
  assert.ok(Array.isArray(m.plugins) && m.plugins.length === 1);
  assert.equal(m.plugins[0].name, 'koud');
  assert.equal(m.plugins[0].source, './', 'the plugin root is the repo root');
});

test('manifest and marketplace agree on the plugin name', async () => {
  const [pluginRaw, marketRaw] = await Promise.all([
    readFile(new URL('../.claude-plugin/plugin.json', import.meta.url), 'utf8'),
    readFile(new URL('../.claude-plugin/marketplace.json', import.meta.url), 'utf8'),
  ]);
  assert.equal(JSON.parse(pluginRaw).name, JSON.parse(marketRaw).plugins[0].name);
});

// The plugin's whole surface, stated once. Adding or removing a command, agent or skill is
// an edit to these lists -- the comparison is exact, so a file nobody listed fails too.
const EXPECTED_COMMANDS = [
  'architect.md', 'brief.md', 'build.md', 'check.md', 'init.md', 'log.md', 'next.md',
  'requirements.md', 'review.md', 'ship.md', 'spec.md', 'stack.md', 'status.md',
];
const EXPECTED_AGENTS = [
  'compliance-checker.md', 'deploy-engineer.md', 'quality-reviewer.md', 'solution-architect.md',
];
const EXPECTED_SKILLS = [
  'architecture-diagramming', 'backend-architecture', 'cicd-github-actions', 'containerization',
  'data-modeling', 'deploy-targets', 'framework-drift-guard', 'frontend-architecture',
  'gherkin-requirements', 'iac-terraform', 'monorepo-structure', 'openspec-workflow',
  'project-brief', 'security-invariants', 'test-driven-build', 'ui-design-principles',
];

test('the commands, agents and skills on disk are exactly the documented surface', async () => {
  const { readdir } = await import('node:fs/promises');
  const list = async (dir) => (await readdir(new URL(`../${dir}`, import.meta.url))).sort();
  assert.deepEqual(await list('commands'), EXPECTED_COMMANDS);
  assert.deepEqual(await list('agents'), EXPECTED_AGENTS);
  assert.deepEqual(await list('skills'), EXPECTED_SKILLS);
});

test('every phase has a command and a script of the same name', async () => {
  const { access } = await import('node:fs/promises');
  const { PHASES } = await import('../scripts/lib/paths.mjs');
  for (const phase of PHASES) {
    await access(new URL(`../commands/${phase}.md`, import.meta.url));
    await access(new URL(`../scripts/${phase}.mjs`, import.meta.url));
  }
});

test('every skill directory has a SKILL.md with frontmatter', async () => {
  const { readdir, readFile } = await import('node:fs/promises');
  const dirs = await readdir(new URL('../skills', import.meta.url), { withFileTypes: true });
  for (const d of dirs.filter((x) => x.isDirectory())) {
    const md = await readFile(new URL(`../skills/${d.name}/SKILL.md`, import.meta.url), 'utf8');
    assert.match(md, /^---\nname: /, `skills/${d.name}/SKILL.md has no frontmatter`);
    assert.match(md, /\ndescription: .{20,}/, `skills/${d.name} needs a real description`);
  }
});

test('every command file that runs a script points at a script that exists', async () => {
  const { readdir, readFile, access } = await import('node:fs/promises');
  const dir = new URL('../commands', import.meta.url);
  for (const name of await readdir(dir)) {
    const md = await readFile(new URL(name, `${dir}/`), 'utf8');
    for (const m of md.matchAll(/scripts\/([a-z-]+\.mjs)/g)) {
      await access(new URL(`../scripts/${m[1]}`, import.meta.url));
    }
  }
});
