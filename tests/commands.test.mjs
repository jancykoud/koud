import test from 'node:test';
import assert from 'node:assert/strict';
import { readFile, readdir, access } from 'node:fs/promises';
import { fileURLToPath } from 'node:url';
import path from 'node:path';

const root = fileURLToPath(new URL('..', import.meta.url));
const commandsDir = path.join(root, 'commands');
const agentsDir = path.join(root, 'agents');

async function commandFiles() {
  return (await readdir(commandsDir)).filter((f) => f.endsWith('.md'));
}

async function agentFiles() {
  return (await readdir(agentsDir)).filter((f) => f.endsWith('.md'));
}

async function readCommand(file) {
  return readFile(path.join(commandsDir, file), 'utf8');
}

// Installed as a plugin, a bare repo-relative path (e.g. `skills/foo/bar.md`) resolves
// against the USER's project cwd, not the plugin's own directory, and ENOENTs. Every
// reference into the plugin's own tree — scripts, skills, agents, references, hooks — must
// be rooted with ${CLAUDE_PLUGIN_ROOT}. This catches an unrooted path anywhere in a command
// or agent file, not just the scripts/*.mjs paths the older, narrower check covers.
const PLUGIN_DIR_NAMES = ['scripts', 'skills', 'agents', 'references', 'hooks'];
const rootedOrNot = new RegExp(
  `(\\$\\{CLAUDE_PLUGIN_ROOT\\}/)?\\b(${PLUGIN_DIR_NAMES.join('|')})/[\\w./-]+`,
  'g',
);

function findUnrootedPluginPaths(content) {
  const offenders = [];
  for (const m of content.matchAll(rootedOrNot)) {
    if (!m[1]) offenders.push(m[0]);
  }
  return offenders;
}

test('the workflow commands exist', async () => {
  const files = await commandFiles();
  for (const f of ['init.md', 'next.md', 'status.md']) {
    assert.ok(files.includes(f), `missing commands/${f}`);
  }
});

test('every command has frontmatter with a description', async () => {
  for (const f of await commandFiles()) {
    const content = await readFile(path.join(commandsDir, f), 'utf8');
    assert.ok(content.startsWith('---\n'), `${f} must open with frontmatter`);
    const fm = content.slice(4, content.indexOf('\n---', 4));
    assert.match(fm, /description:\s*\S/, `${f} needs a description`);
  }
});

test('every script referenced by a command exists', async () => {
  for (const f of await commandFiles()) {
    const content = await readFile(path.join(commandsDir, f), 'utf8');
    for (const m of content.matchAll(/scripts\/([a-z-]+\.mjs)/g)) {
      await access(path.join(root, 'scripts', m[1]));
    }
  }
});

test('every reference into the plugin tree from a command or agent file is rooted with ${CLAUDE_PLUGIN_ROOT}', async () => {
  for (const [dir, files] of [
    [commandsDir, await commandFiles()],
    [agentsDir, await agentFiles()],
  ]) {
    for (const f of files) {
      const content = await readFile(path.join(dir, f), 'utf8');
      const offenders = findUnrootedPluginPaths(content);
      assert.deepEqual(
        offenders, [],
        `${f} references its own plugin tree without \${CLAUDE_PLUGIN_ROOT}, which ENOENTs `
        + `once installed as a plugin (resolves against the user's project cwd instead): ${offenders.join(', ')}`,
      );
    }
  }
});

test('init command states the no-force rule', async () => {
  const content = await readFile(path.join(commandsDir, 'init.md'), 'utf8');
  assert.match(content, /never/i);
  assert.match(content, /consent|approval|permission/i);
});

test('next command encodes the stop-on-ambiguity rule', async () => {
  const content = await readFile(path.join(commandsDir, 'next.md'), 'utf8');
  assert.match(content, /drift/i);
  assert.match(content, /awaiting_approval/);
});

test('init command does not claim automatic phase backfilling', async () => {
  const content = await readFile(path.join(commandsDir, 'init.md'), 'utf8');
  // Regression: this used to claim retrofit "backfills" phase statuses from disk —
  // a feature that was never built (createDefaultState() always sets not_started;
  // nothing inspects on-disk artifacts to infer progress). See the corresponding fix
  // and regression test on scripts/lib/init-plan.mjs's retrofit warning.
  assert.doesNotMatch(content, /backfill/i,
    'must not claim automatic backfilling, which does not exist');
  assert.match(content, /not_started/,
    'retrofit guidance should honestly say phases start at not_started');
});

test('init command gives git-init its own consent framing, not the file/marker one', async () => {
  const content = await readFile(path.join(commandsDir, 'init.md'), 'utf8');
  // Regression: Step 2 used to frame every approval-gated action as "a file you did
  // not write" with content to show and a marker block to explain. git-init is also
  // consent-gated (whenever the project isn't already a git repo) but has no file
  // content and no markers, so it needs its own explanation and ask.
  assert.match(content, /git init/i,
    'git initialization is a distinct consent-gated action and needs its own instructions');
});

test('init command names "." as the git-init consent token', async () => {
  const content = await readFile(path.join(commandsDir, 'init.md'), 'utf8');
  // Regression: scripts/lib/init-plan.mjs's git-init action carries path: '.', which is
  // also the literal --consent token an agent must pass to approve it. The docs never
  // said so explicitly, so an agent writing the --consent list from prose had no way to
  // know to include a bare "." for git-init — a space-separated approval list like
  // "CLAUDE.md, AGENTS.md" would silently never include it.
  assert.match(content, /consent token/i,
    'must explicitly name a consent token for git-init, not just describe the action');
  assert.match(content, /`\.`/,
    'must name the literal "." as that consent token');
});

test('next command sources budget from state.json, not from :next --json', async () => {
  const content = await readFile(path.join(commandsDir, 'next.md'), 'utf8');
  // Regression: resolveNext() only ever returns {outcome, phase, drift, reason} — no
  // budget field. Step 3 used to imply the budget check reads from :next --json's
  // output; it must instead point at .koud/state.json directly.
  assert.match(content, /state\.json/,
    'budget must be read from state.json directly, not implied to come from :next --json');
});

// --- stack.md --------------------------------------------------------------------------

test('the stack command stops at the approval gate, after showing the table', async () => {
  const md = await readCommand('stack.md');
  const gate = md.slice(md.indexOf('## Step 6'));
  assert.match(gate, /\bawaiting_approval\b/);
  const step5 = md.indexOf('## Step 5');
  const step6 = md.indexOf('## Step 6');
  assert.ok(step5 !== -1 && step6 !== -1, 'both steps must exist');
  assert.ok(step6 > step5, 'the gate is the last step, not an aside partway through');
  assert.match(gate, /explicit yes/i);
});

test('the stack command loads its skills before resolving anything', async () => {
  const md = await readCommand('stack.md');
  const preamble = md.slice(0, md.indexOf('## Step 1'));
  for (const skill of ['monorepo-structure', 'framework-drift-guard']) {
    assert.ok(preamble.includes(skill), `${skill} must load before the work starts`);
  }
});

test('the stack command never assumes a stack', async () => {
  const md = await readCommand('stack.md');
  assert.match(md, /Never assume the stack/);
});

test('the brief comes first: required tech, then preferred, then defaults', async () => {
  const md = await readCommand('stack.md');
  const step2 = md.slice(md.indexOf('## Step 2'), md.indexOf('## Step 3'));
  const required = step2.indexOf('Required technology is fixed');
  const preferred = step2.indexOf('Preferred technology');
  const defaults = step2.indexOf('Defaults fill the slots');
  assert.ok(required !== -1 && preferred !== -1 && defaults !== -1, 'all three must be named in Step 2');
  assert.ok(required < preferred, 'a preference must never be presented as outranking a requirement');
  assert.ok(preferred < defaults);
});

// F23: :stack must preview before it writes, same as :architect.
test('the stack command dry-runs before it applies', async () => {
  const md = await readCommand('stack.md');
  const dryRun = md.indexOf('--dry-run');
  const apply = md.indexOf('apply .`');
  assert.ok(dryRun !== -1, 'the dry-run flag must be shown to the user');
  assert.ok(apply !== -1, 'the real apply command must be shown to the user');
  assert.ok(dryRun < apply,
    'the preview must come before the write, or the warning arrives too late');
});

// --- architect.md ------------------------------------------------------------------------

test('the architect command exists', async () => {
  const files = await commandFiles();
  assert.ok(files.includes('architect.md'), 'missing commands/architect.md');
});

test('the architect command previews, stops for the user, and only then applies with a recorded decision', async () => {
  const md = await readCommand('architect.md');
  const dryRun = md.indexOf('--dry-run');
  const stop = md.indexOf('**Stop here.**');
  const allow = md.indexOf('apply . --allow-project-writes`');
  const koudOnly = md.indexOf('apply . --koud-only`');
  assert.ok(dryRun !== -1 && stop !== -1 && allow !== -1 && koudOnly !== -1,
    'the preview, the stop and both apply forms must all be shown');
  assert.ok(dryRun < stop && stop < allow && stop < koudOnly,
    'the user is asked between the preview and any write');
  assert.equal(md.includes('apply .`'), false,
    'a bare apply writes outside .koud without a decision, and the script refuses it');
  assert.match(md, /Never pass\s+`--allow-project-writes` on your own judgement/);
  assert.match(md, /Outside \.koud\//);
});

test('the architect command stops at the gate', async () => {
  const md = await readCommand('architect.md');
  const gate = md.slice(md.lastIndexOf('## Step'));
  assert.match(gate, /explicit yes/i);
  assert.match(gate, /\bshort\b/, 'it must tell the user a short invariant list is legitimate');
  assert.match(gate, /your proposal and not read\s+from the brief or the code/,
    'guessed values must be listed apart from found ones');
});

// --- requirements.md ---------------------------------------------------------------------

test('the requirements command exists', async () => {
  const files = await commandFiles();
  assert.ok(files.includes('requirements.md'), 'missing commands/requirements.md');
});

test('the requirements command warns that an unclaimed criterion is a promise nothing keeps', async () => {
  const md = await readCommand('requirements.md');
  assert.match(md, /A criterion no\s+feature claims is a promise nothing is being built to keep/);
  assert.ok(/both\s+ways/.test(md),
    'two-way coverage of the success criteria is the rule this command exists to enforce');
});

test('the requirements command stops at the gate', async () => {
  const md = await readCommand('requirements.md');
  assert.match(md.slice(md.lastIndexOf('## Step')), /explicit yes/i);
});

test('the requirements command previews, stops for the user, and only then applies with a recorded decision', async () => {
  const md = await readCommand('requirements.md');
  const dryRun = md.indexOf('--dry-run');
  const stop = md.indexOf('**Stop here.**');
  const allow = md.indexOf('apply . --allow-project-writes`');
  const koudOnly = md.indexOf('apply . --koud-only`');
  assert.ok(dryRun !== -1 && stop !== -1 && allow !== -1 && koudOnly !== -1,
    'the preview, the stop and both apply forms must all be shown');
  assert.ok(dryRun < stop && stop < allow && stop < koudOnly,
    'the user is asked between the preview and any write');
  assert.equal(md.includes('apply .`'), false,
    'a bare apply writes outside .koud without a decision, and the script refuses it');
  assert.match(md, /Never pass\s+`--allow-project-writes` on your own judgement/);
  assert.match(md, /Outside \.koud\//);
});

// --- spec.md ------------------------------------------------------------------------------

test('the spec command exists', async () => {
  const files = await commandFiles();
  assert.ok(files.includes('spec.md'), 'missing commands/spec.md');
});

test('the spec command dry-runs before it applies', async () => {
  const md = await readCommand('spec.md');
  const dryRun = md.indexOf('--dry-run');
  // 'apply .`' (inline-code close) singles out the real apply command, not the
  // '--dry-run' line above it, which also contains the substring 'apply .'.
  const apply = md.indexOf('apply .`');
  assert.ok(dryRun !== -1, 'the dry-run flag must be shown to the user');
  assert.ok(apply !== -1, 'the real apply command must be shown to the user');
  assert.ok(dryRun < apply,
    'the preview must come before the write, or the warning arrives too late');
});

test('the spec command stops at the gate', async () => {
  const md = await readCommand('spec.md');
  assert.match(md.slice(md.lastIndexOf('## Step')), /explicit yes/i);
});

// --- build.md ------------------------------------------------------------------------

test(':build command file names the tasks.md-is-the-plan contract and mentions no external spec tool', async () => {
  const content = await readCommand('build.md');
  assert.match(content, /test-driven-build/);
  assert.doesNotMatch(content, /superpowers/, 'the build must not depend on another plugin');
  assert.match(content, /tasks\.md/);
  assert.doesNotMatch(content, /openspec/i, 'OpenSpec was removed in 0.3.0');
});

// --- check.md ------------------------------------------------------------------------

test(':check command file never claims a manifest dependency counts as evidence', async () => {
  const content = await readCommand('check.md');
  assert.match(content, /file:line/);
  assert.match(content, /manifest|package\.json/i);
});

// --- ship.md ------------------------------------------------------------------------

test(':ship command file requires a curl-verified URL before the gate, and names the Compose fallback', async () => {
  const content = await readCommand('ship.md');
  assert.match(content, /curl/i);
  assert.match(content, /docker-compose|Docker Compose/i);
  assert.match(content, /resume_note/);
});

test(':ship command file has the agent consult ship.mjs suggest before choosing targets', async () => {
  const content = await readCommand('ship.md');
  assert.match(content, /ship\.mjs suggest/);
});

// --- review.md ------------------------------------------------------------------------

test(':review command file delegates code-level review to /code-review rather than reimplementing it', async () => {
  const content = await readCommand('review.md');
  assert.match(content, /\/code-review/);
  assert.doesNotMatch(content, /reimplement/i);
});

test(':review command file gates on blocking findings only, not should-fix or post-release', async () => {
  const content = await readCommand('review.md');
  assert.match(content, /blocking/i);
  assert.match(content, /only blocking items are mandatory|do not.*present should-fix.*as blockers/i);
});

test(':review command file merges before applying, in the documented order', async () => {
  const content = await readCommand('review.md');
  const mergeAt = content.indexOf('review.mjs merge');
  const applyAt = content.indexOf('review.mjs apply');
  assert.ok(mergeAt !== -1 && applyAt !== -1);
  assert.ok(mergeAt < applyAt, 'merge must run before apply');
});

// --- log.md --------------------------------------------------------------------------

test(':log command file has no approval gate -- it is a running log, not a judgment', async () => {
  const content = await readCommand('log.md');
  assert.match(content, /challenges\.md/);
  assert.doesNotMatch(content, /awaiting_approval/);
});

// --- submit.md ------------------------------------------------------------------------

// --- brief.md ------------------------------------------------------------------------

test('the brief command loads its skill and decides the track first', async () => {
  const md = await readCommand('brief.md');
  assert.ok(md.slice(0, md.indexOf('## Step 1')).includes('project-brief'));
  const step1 = md.slice(md.indexOf('## Step 1'), md.indexOf('## Step 2'));
  assert.match(step1, /`new`/);
  assert.match(step1, /`existing`/);
});

test('the brief command reads an existing repository before asking anything', async () => {
  const md = await readCommand('brief.md');
  assert.match(md, /read before you ask/);
  assert.match(md, /never assume a stack/);
});

test('the brief command records what nobody could answer instead of inventing it', async () => {
  const md = await readCommand('brief.md');
  assert.match(md, /do not invent an answer/);
  assert.match(md, /unresolved/);
});

test('the brief command states the retry bound so a failing validation cannot loop forever', async () => {
  const md = await readCommand('brief.md');
  assert.match(md, /At most two\s+retries/);
});

test('the brief command dry-runs before it applies and stops at the gate', async () => {
  const md = await readCommand('brief.md');
  const dryRun = md.indexOf('--dry-run');
  const apply = md.lastIndexOf('brief.mjs apply .');
  assert.ok(dryRun !== -1 && dryRun < apply, 'the preview must come before the write');
  assert.match(md, /brief\.draft\.json/, 'the payload is written as a draft so a re-run can back up the old brief');
  assert.match(md, /Do not continue to `:stack` without an explicit yes/);
});

test('the brief command forbids reading secrets files', async () => {
  const md = await readCommand('brief.md');
  assert.match(md, /Never read a secrets file/);
  assert.match(md, /\.env\.example/);
});

test('the brief command asks for the scope first and separates core from tooling, system from outcome', async () => {
  const md = await readCommand('brief.md');
  const questions = md.slice(md.indexOf('Then ask the user'), md.indexOf('## Step 3'));
  assert.match(questions, /1\. Does this brief cover the whole product/);
  assert.match(md, /"role": "tooling"/);
  assert.match(md, /"kind": "outcome"/);
});

// --- 0.3.0: what the first full run on an existing project showed --------------------------

test('no command, agent or skill mentions OpenSpec any more', async () => {
  const { readdir, readFile } = await import('node:fs/promises');
  const roots = ['commands', 'agents', 'skills', 'scripts', 'hooks', 'docs'];
  const offenders = [];
  async function walk(dir) {
    for (const entry of await readdir(new URL(`../${dir}/`, import.meta.url), { withFileTypes: true })) {
      const rel = `${dir}/${entry.name}`;
      if (entry.isDirectory()) await walk(rel);
      else if (/openspec/i.test(await readFile(new URL(`../${rel}`, import.meta.url), 'utf8'))) offenders.push(rel);
    }
  }
  for (const r of roots) await walk(r);
  assert.deepEqual(offenders, []);
});

test('the spec command writes only under .koud and runs no external tool', async () => {
  const md = await readCommand('spec.md');
  assert.match(md, /runs no external tool, installs\s+nothing and touches no file outside `\.koud\/`/);
  assert.match(md, /\*\*prove\*\* task/);
});

test('the brief command stops before replacing a brief that already exists', async () => {
  const md = await readCommand('brief.md');
  const stop = md.indexOf('**Stop.**');
  const replace = md.indexOf('--replace`');
  assert.ok(stop !== -1 && replace !== -1 && stop < replace);
  assert.match(md, /do not skip the questions because a brief exists/);
  assert.match(md, /Every concrete value is one you read or were told/);
});

test('the requirements command separates delivered from to_build and forbids invented values', async () => {
  const md = await readCommand('requirements.md');
  assert.match(md, /`"delivered"`/);
  assert.match(md, /`"to_build"`/);
  assert.match(md, /When in doubt it is `to_build`/);
  assert.match(md, /A value taken from a seed file or a test fixture is a test value/);
});

test('the build command tells prove from build, announces services and commits only its own files', async () => {
  const md = await readCommand('build.md');
  assert.match(md, /\*\*Prove\*\* — behaviour the project already has/);
  assert.match(md, /Report it to the user with the failing output before changing any code/);
  assert.match(md, /Say before you start anything that outlives the command/);
  assert.match(md, /\*\*Commit only the task\.\*\*/);
});

test('the init command asks before creating a file at the project root, not only before changing one', async () => {
  const md = await readCommand('init.md');
  assert.match(md, /whether they already exist or\s+would be created/);
  assert.match(md, /Declining both is a normal answer/);
});

test('the architect agent describes an existing project instead of redesigning it, and labels its own values', async () => {
  const { readFile } = await import('node:fs/promises');
  const md = await readFile(new URL('../agents/solution-architect.md', import.meta.url), 'utf8');
  assert.match(md, /## On an existing project, describe — do not redesign/);
  assert.match(md, /Where the code and a\s+skill disagree, the code is the architecture/);
  assert.match(md, /## Every value is read, or labelled/);
  assert.match(md, /my proposals, not read from the project/);
});

test('the ship command gets a plan and stops before anything is written or deployed', async () => {
  const md = await readCommand('ship.md');
  const plan = md.indexOf('in plan mode');
  const stop = md.indexOf('**Stop here.**');
  const execute = md.indexOf('## Step 3 — Execute what was approved');
  assert.ok(plan !== -1 && stop !== -1 && execute !== -1 && plan < stop && stop < execute);
  assert.match(md, /which environment/);
  assert.match(md, /A general yes to the plan is not a yes to that/);
  const { readFile } = await import('node:fs/promises');
  const agent = await readFile(new URL('../agents/deploy-engineer.md', import.meta.url), 'utf8');
  assert.match(agent, /\*\*Plan mode\*\* — the first time\. Write nothing, deploy nothing, start nothing/);
  assert.match(agent, /Production is never implied/);
});

// --- 0.4.0: the build that does not need a person at every task ---------------------------

test('the build command states its standing rules before any step', async () => {
  const md = await readCommand('build.md');
  const rules = md.indexOf('## Standing rules');
  const step1 = md.indexOf('## Step 1');
  assert.ok(rules !== -1 && rules < step1);
  const section = md.slice(rules, step1);
  for (const rule of [
    /\*\*Nothing leaves the machine\.\*\* No push, no deploy, no migration applied to a remote\s+database/,
    /\*\*Never on the default branch\.\*\*/,
    /git branch --show-current/,
    /\*\*Secrets stay unread\.\*\*/,
    /\*\*Only test data\.\*\*/,
    /\*\*A call that costs money or reaches a third party is announced\.\*\*/,
  ]) assert.match(section, rule);
});

test('the build command agrees on a first end-to-end slice before the first task', async () => {
  const md = await readCommand('build.md');
  const slice = md.indexOf('## Step 2 — On the first run, agree on the first slice');
  const work = md.indexOf('## Step 3 — Work the tasks');
  assert.ok(slice !== -1 && slice < work);
  assert.match(md, /smallest slice that works end to end/);
  assert.match(md, /with a real trial before anything is built on it/);
  assert.match(md, /Then stop and wait for a yes/);
});

test('continuous mode names every reason to stop and never loosens a standing rule', async () => {
  const md = await readCommand('build.md');
  assert.match(md, /argument-hint: "\[--feature <FR-id>\] \[--continuous\]"/);
  const mode = md.slice(md.indexOf('### How often to stop'), md.indexOf('## Step 4'));
  assert.match(mode, /\*\*Default\*\* — stop after each task/);
  for (const stop of [
    /a test fails for a reason you do not understand, or a \*\*prove\*\* task fails/,
    /a real trial of something nobody has tried yet/,
    /going on would break a standing rule or a rule the user gave/,
    /need a decision the specs do not make/,
    /the slice or the feature is finished/,
  ]) assert.match(mode, stop);
  assert.match(mode, /applied to the \*\*local\*\* database without asking/);
  assert.match(mode, /Do not let "continuous" stretch to anything\s+in the standing rules/);
  assert.match(mode, /how the user can\s+check the result with their own eyes/);
});

test('the build command ticks boxes in the commit of the task', async () => {
  const md = await readCommand('build.md');
  assert.match(md, /commit the ticked `tasks\.md` with the task/);
});

test('the requirements command keeps behaviour out of the non-functional list', async () => {
  const md = await readCommand('requirements.md');
  assert.match(md, /\*\*A non-functional requirement is a check, not a behaviour\.\*\*/);
  assert.match(md, /or nothing will build it/);
});

test('the architect command recommends keeping files in .koud on a case collision or a partial scope', async () => {
  const md = await readCommand('architect.md');
  assert.match(md, /The preview marks a file `!!`/);
  assert.match(md, /The brief's `scope` is one piece of work, not the whole product/);
});

test('the init command proposes excluding .koud from a repository-wide formatter', async () => {
  const md = await readCommand('init.md');
  assert.match(md, /propose adding `\.koud\/` to\s+its ignore file/);
});
