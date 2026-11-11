/**
 * Feature-loop mechanics for `:build`. No JSON payload of its own -- per-feature progress
 * is read from the tasks.md that emit-kiro.mjs already renders, not duplicated into
 * state.json.
 */
import { readFile } from 'node:fs/promises';
import path from 'node:path';
import { specsDir, featurePath, FEATURES_DIR } from './paths.mjs';
import { OUT_DIR } from './project-writes.mjs';

const pad = (n) => String(n).padStart(4, '0');

/** Same numbering emit-kiro.mjs uses, computed independently over the same filter+order
 * so a drift between the two would show up as a wrong `dir` in a test fixture, not as a
 * shared import silently keeping both in lockstep by construction. */
export function mustHaveFeatures(requirements, cutFeatures = []) {
  const cut = new Set(cutFeatures);
  const musts = (requirements.features ?? []).filter((f) => f.priority === 'must');
  const kept = musts.filter((f) => !(f.requirements ?? []).some((r) => cut.has(r.id)));
  // Numbering follows position among ALL must-haves (matching emit-kiro.mjs), not
  // position among the kept ones -- a cut feature does not renumber its neighbors.
  const dirBySlug = new Map(musts.map((f, i) => [f.slug, `${pad(i + 1)}-${f.slug}`]));
  return kept.map((f) => ({ id: f.id, title: f.title, slug: f.slug, dir: dirBySlug.get(f.slug) }));
}

const CHECKBOX_RE = /^[ \t]*-\s*\[( |x|X)\]/gm;

export function parseTasksProgress(tasksMd) {
  const matches = [...(tasksMd ?? '').matchAll(CHECKBOX_RE)];
  const total = matches.length;
  const checked = matches.filter((m) => m[1].toLowerCase() === 'x').length;
  return { total, checked, done: total > 0 && checked === total };
}

async function readOrNull(p) {
  try {
    return await readFile(p, 'utf8');
  } catch (err) {
    if (err.code === 'ENOENT') return null;
    throw err;
  }
}

export async function featureDone(root, specDirName) {
  const raw = await readOrNull(path.join(specsDir(root), specDirName, 'tasks.md'));
  return raw === null ? false : parseTasksProgress(raw).done;
}

export async function nextFeature(root, requirements, cutFeatures = [], { featureId } = {}) {
  const features = mustHaveFeatures(requirements, cutFeatures);
  if (featureId) {
    const owner = (requirements.features ?? []).find((f) =>
      (f.requirements ?? []).some((r) => r.id === featureId));
    const match = features.find((f) => f.slug === owner?.slug);
    if (!match) return null;
    return { feature: match, done: await featureDone(root, match.dir) };
  }
  for (const feature of features) {
    if (!(await featureDone(root, feature.dir))) return { feature, done: false };
  }
  return null;
}

/** The first of `paths` that can be read, or null when none can. */
async function readFirst(...paths) {
  for (const p of paths) {
    const body = await readOrNull(p);
    if (body !== null) return body;
  }
  return null;
}

export async function buildContextBundle(root, feature) {
  const dir = path.join(specsDir(root), feature.dir);
  const [designMd, requirementsMd, gherkin, agentsMd, stackMd] = await Promise.all([
    readOrNull(path.join(dir, 'design.md')),
    readOrNull(path.join(dir, 'requirements.md')),
    // A project that kept koud's files inside .koud/ (`--koud-only`) has these under
    // .koud/out/ instead; the project's own copy wins when both exist.
    readFirst(featurePath(root, feature.slug), path.join(root, OUT_DIR, FEATURES_DIR, `${feature.slug}.feature`)),
    readFirst(path.join(root, 'AGENTS.md'), path.join(root, OUT_DIR, 'AGENTS.md')),
    readOrNull(path.join(root, '.koud', 'stack.md')),
  ]);
  return { designMd, requirementsMd, gherkin, agentsMd, stackMd };
}
