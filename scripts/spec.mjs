#!/usr/bin/env node
import { readFile } from 'node:fs/promises';
import path from 'node:path';
import { applySpec } from './lib/spec-apply.mjs';
import { requirementsPath, architecturePath } from './lib/paths.mjs';

const [subcommand, target, ...rest] = process.argv.slice(2);
const flags = new Set(rest.filter((a) => a.startsWith('--')));

function usage() {
  console.error('usage: spec.mjs apply <project-root> [--requirements <path>] [--architecture <path>] [--dry-run]');
  process.exit(2);
}

async function readJson(p, { optional = false } = {}) {
  try {
    return JSON.parse(await readFile(p, 'utf8'));
  } catch (err) {
    if (optional && err.code === 'ENOENT') return undefined;
    console.error(err.code === 'ENOENT' ? `no such file: ${p}` : `${p} is not valid JSON`);
    process.exit(1);
  }
}

if (subcommand === 'apply') {
  const root = target ? path.resolve(target) : process.cwd();
  const reqIdx = rest.indexOf('--requirements');
  const reqSource = reqIdx === -1 ? requirementsPath(root) : path.resolve(rest[reqIdx + 1]);
  const archIdx = rest.indexOf('--architecture');
  const archSource = archIdx === -1 ? architecturePath(root) : path.resolve(rest[archIdx + 1]);
  const requirements = await readJson(reqSource);
  const architecture = await readJson(archSource, { optional: true });
  const dryRun = flags.has('--dry-run');

  try {
    const {
      artifacts, skipped, backedUp, warnings, wouldOverwrite,
    } = await applySpec(root, { requirements, architecture, dryRun });

    // :spec has no `validate` subcommand of its own (it validates the requirements payload
    // :requirements already produced), so `apply` is the only place these warnings can
    // surface. Without this, an absent architecture.json degrades every design.md to a stub
    // with no signal to the user.
    for (const w of warnings ?? []) console.log(`warning: ${w}`);

    console.log(dryRun ? 'Dry run — nothing was written. Would write:' : `Wrote ${artifacts.length} artifact(s):`);
    for (const a of artifacts) console.log(`  ${dryRun ? '?' : '+'} ${a}`);

    // The consent gate: commands/spec.md tells the agent to name these to the user before
    // applying, which it can only do if the preview actually reports them. tasks.md matters
    // most — a build agent ticks it off, and a rerun regenerates it.
    if (wouldOverwrite?.length > 0) {
      console.log('\nWould overwrite:');
      for (const w of wouldOverwrite) console.log(`  ! ${w}`);
    }

    if (backedUp?.length > 0) {
      console.log('\nBacked up before overwriting:');
      for (const b of backedUp) console.log(`  ~ ${b}`);
    }

    if (skipped.length > 0) {
      console.log('\nLeft in place:');
      for (const s of skipped) console.log(`  ~ ${s}`);
    }

    // Tasks are generated from the requirements of a feature. A non-functional requirement
    // gets none, which is right for a review check and wrong for a behaviour: say so, or a
    // limit or a fallback filed there is silently never built.
    const nfrs = requirements.non_functional ?? [];
    if (nfrs.length > 0) {
      console.log(`\n${nfrs.length} non-functional requirement(s) have no task — they are checks for the review:`);
      for (const n of nfrs) console.log(`  - ${n.id ?? '?'} ${n.statement ?? ''}`.trimEnd());
      console.log('  If one describes behaviour someone could observe (a limit, a fallback, a refusal), move it');
      console.log('  into a feature as a requirement with a scenario, or nothing will build it.');
    }

    if (!dryRun) {
      console.log('\nPhase "spec" is now awaiting_approval. Show what landed, then ask.');
    }
  } catch (err) {
    console.error(err.message);
    process.exit(1);
  }
} else {
  usage();
}
