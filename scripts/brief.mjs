#!/usr/bin/env node
import { readFile } from 'node:fs/promises';
import path from 'node:path';
import { validateBrief } from './lib/brief-schema.mjs';
import { applyBrief } from './lib/brief-apply.mjs';
import { briefPath } from './lib/paths.mjs';

const [subcommand, target, ...rest] = process.argv.slice(2);
const flags = new Set(rest.filter((a) => a.startsWith('--')));

function usage() {
  console.error('usage: brief.mjs validate <path-to-brief.json> [--json]');
  console.error('       brief.mjs apply <project-root> [--brief <path>] [--dry-run]');
  process.exit(2);
}

async function readJson(p) {
  try {
    return JSON.parse(await readFile(p, 'utf8'));
  } catch (err) {
    console.error(err.code === 'ENOENT' ? `no such file: ${p}` : `${p} is not valid JSON`);
    process.exit(1);
  }
}

if (subcommand === 'validate') {
  if (!target) usage();
  const result = validateBrief(await readJson(path.resolve(target)));

  if (flags.has('--json')) {
    console.log(JSON.stringify(result, null, 2));
    process.exit(result.valid ? 0 : 1);
  }
  for (const w of result.warnings) console.log(`warning: ${w}`);
  if (result.valid) {
    console.log('brief.json is valid.');
    process.exit(0);
  }
  console.error(`brief.json is not valid (${result.errors.length} problem(s)):`);
  for (const e of result.errors) console.error(`  - ${e}`);
  process.exit(1);
} else if (subcommand === 'apply') {
  const root = target ? path.resolve(target) : process.cwd();
  const idx = rest.indexOf('--brief');
  const source = idx === -1 ? briefPath(root) : path.resolve(rest[idx + 1]);
  const brief = await readJson(source);
  const dryRun = flags.has('--dry-run');

  try {
    const { artifacts, backedUp, wouldOverwrite } = await applyBrief(root, brief, { dryRun });
    console.log(dryRun ? 'Dry run — nothing was written. Would write:' : `Wrote ${artifacts.length} artifact(s):`);
    for (const a of artifacts) console.log(`  ${dryRun ? '?' : '+'} ${a}`);
    // The consent gate: commands/brief.md tells the agent to name these to the user before
    // applying, which it can only do if the preview actually reports them.
    if (wouldOverwrite?.length > 0) {
      console.log('\nWould overwrite:');
      for (const w of wouldOverwrite) console.log(`  ! ${w}`);
    }
    if (backedUp?.length > 0) {
      console.log('\nBacked up before overwriting:');
      for (const b of backedUp) console.log(`  ~ ${b}`);
    }
    if (!dryRun) {
      console.log('\nPhase "brief" is now awaiting_approval. Read the one-liner and the success criteria back, then ask.');
    }
  } catch (err) {
    console.error(err.message);
    process.exit(1);
  }
} else {
  usage();
}
