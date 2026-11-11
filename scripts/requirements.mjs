#!/usr/bin/env node
import { readFile } from 'node:fs/promises';
import path from 'node:path';
import { validateRequirements } from './lib/requirements-schema.mjs';
import { applyRequirements } from './lib/requirements-apply.mjs';
import { requirementsPath, briefPath, architecturePath } from './lib/paths.mjs';
import { withoutInPlacePayload } from './lib/backup.mjs';
import {
  writeModeFromFlags, projectPaths, renderConsentRequest, findCaseVariants, describeProjectWrite,
  CONSENT_EXIT_CODE, ALLOW_FLAG, KOUD_ONLY_FLAG,
} from './lib/project-writes.mjs';

const [subcommand, target, ...rest] = process.argv.slice(2);
const flags = new Set(rest.filter((a) => a.startsWith('--')));

function usage() {
  console.error('usage: requirements.mjs validate <path-to-requirements.json> [--json]');
  console.error('       requirements.mjs apply <project-root> [--requirements <path>] [--dry-run] [--allow-project-writes | --koud-only]');
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

if (subcommand === 'validate') {
  if (!target) usage();
  const reqs = await readJson(path.resolve(target));
  const root = path.resolve(path.dirname(target), '..');
  const brief = await readJson(briefPath(root), { optional: true });
  const architecture = await readJson(architecturePath(root), { optional: true });
  const result = validateRequirements(reqs, { brief, architecture });

  if (flags.has('--json')) {
    console.log(JSON.stringify(result, null, 2));
    process.exit(result.valid ? 0 : 1);
  }
  for (const w of result.warnings) console.log(`warning: ${w}`);
  if (result.valid) {
    console.log('requirements.json is valid.');
    process.exit(0);
  }
  console.error(`requirements.json is not valid (${result.errors.length} problem(s)):`);
  for (const e of result.errors) console.error(`  - ${e}`);
  process.exit(1);
} else if (subcommand === 'apply') {
  const root = target ? path.resolve(target) : process.cwd();
  const idx = rest.indexOf('--requirements');
  const source = idx === -1 ? requirementsPath(root) : path.resolve(rest[idx + 1]);
  const reqs = await readJson(source);
  const brief = await readJson(briefPath(root), { optional: true });
  const architecture = await readJson(architecturePath(root), { optional: true });
  const dryRun = flags.has('--dry-run');

  try {
    // Anything this phase writes outside .koud/ is the user's decision, not the agent's.
    // Without a flag recording that decision, a real apply refuses and lists the files.
    const mode = writeModeFromFlags(flags);
    const projectWrites = mode === 'ask' ? 'allow' : mode;
    if (mode === 'ask') {
      const preview = await applyRequirements(root, reqs, { brief, architecture, dryRun: true, projectWrites });
      const outside = projectPaths(preview.artifacts);
      if (outside.length > 0 && !dryRun) {
        console.error(renderConsentRequest(
          'requirements.mjs apply', outside, preview.wouldOverwrite, await findCaseVariants(root, outside),
        ));
        process.exit(CONSENT_EXIT_CODE);
      }
    }
    const { artifacts, backedUp, skipped, wouldOverwrite } = await applyRequirements(
      root, reqs, { brief, architecture, dryRun, projectWrites },
    );
    console.log(dryRun ? 'Dry run — nothing was written. Would write:' : `Wrote ${artifacts.length} artifact(s):`);
    for (const a of artifacts) console.log(`  ${dryRun ? '?' : '+'} ${a}`);
    const outsideKoud = projectPaths(artifacts);
    if (dryRun && outsideKoud.length > 0) {
      console.log(`\nOutside .koud/ (${outsideKoud.length}) — the user decides before any apply:`);
      const variants = await findCaseVariants(root, outsideKoud);
      const taken = new Set(wouldOverwrite ?? []);
      for (const a of outsideKoud) console.log(`  ${describeProjectWrite(a, taken, variants)}`);
      if (variants.size > 0) {
        console.log(`  A file above would replace one the project has under another spelling: recommend ${KOUD_ONLY_FLAG}.`);
      }
      console.log(`  yes -> apply with ${ALLOW_FLAG}; no -> apply with ${KOUD_ONLY_FLAG} (files go under .koud/out/)`);
    }
    // The consent gate: commands/requirements.md tells the agent to name these to the user
    // before applying, which it can only do if the preview actually reports them.
    const overwritten = withoutInPlacePayload(wouldOverwrite, root, source, '.koud/requirements.json');
    if (overwritten?.length > 0) {
      console.log('\nWould overwrite:');
      for (const w of overwritten) console.log(`  ! ${w}`);
    }
    if (backedUp.length > 0) {
      console.log('\nBacked up before overwriting:');
      for (const b of backedUp) console.log(`  ~ ${b}`);
    }
    if (skipped.length > 0) {
      console.log('\nLeft in place:');
      for (const s of skipped) console.log(`  ~ ${s}`);
    }
    if (!dryRun) {
      console.log('\nPhase "requirements" is now awaiting_approval. Show the criteria coverage table, then ask.');
    }
  } catch (err) {
    console.error(err.message);
    process.exit(1);
  }
} else {
  usage();
}
