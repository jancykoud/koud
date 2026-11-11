import { readFile } from 'node:fs/promises';
import { createDefaultState } from '../../scripts/lib/schema.mjs';
import { readState, writeState } from '../../scripts/lib/state.mjs';
import { applyBrief } from '../../scripts/lib/brief-apply.mjs';
import { applyStack } from '../../scripts/lib/stack-apply.mjs';
import { applyArchitecture } from '../../scripts/lib/architect-apply.mjs';
import { applyRequirements } from '../../scripts/lib/requirements-apply.mjs';
import { applySpec } from '../../scripts/lib/spec-apply.mjs';
import { applyShip } from '../../scripts/lib/ship-apply.mjs';
import { applyReview } from '../../scripts/lib/review-apply.mjs';

const fx = async (n) => JSON.parse(await readFile(new URL(`../fixtures/${n}`, import.meta.url), 'utf8'));

async function approve(root, phase) {
  const s = await readState(root);
  s.phases[phase].status = 'approved';
  await writeState(root, s);
}

/**
 * Scaffolds a project through :spec (brief/stack/architect/requirements/spec all
 * approved) from the h0- fixtures, so the integration tests share one setup. Returns the
 * requirements.json object used, so callers don't need a second fixture read.
 */
export async function scaffoldStage2Project(root) {
  const s = createDefaultState({ pluginVersion: '0.1.0' });
  await writeState(root, s);
  await applyBrief(root, await fx('h0-brief.json'));
  await approve(root, 'brief');

  const [brief, stack, architecture, requirements] = await Promise.all([
    fx('h0-brief.json'), fx('h0-stack.json'), fx('h0-architecture.json'), fx('h0-requirements.json'),
  ]);

  await applyStack(root, stack, { brief });
  await approve(root, 'stack');
  await applyArchitecture(root, architecture, { stack });
  await approve(root, 'architect');
  await applyRequirements(root, requirements, { brief, architecture });
  await approve(root, 'requirements');
  await applySpec(root, { requirements, architecture });
  await approve(root, 'spec');
  return requirements;
}

/**
 * Extends scaffoldStage2Project through an approved :ship, from the h0-deploy.json
 * fixture. Shared by the :review integration test.
 */
export async function scaffoldStage4Project(root) {
  const requirements = await scaffoldStage2Project(root);
  const deploy = await fx('h0-deploy.json');
  await applyShip(root, deploy, {});
  await approve(root, 'ship');
  return { requirements, deploy };
}
