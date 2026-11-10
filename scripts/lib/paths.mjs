import path from 'node:path';

export const KOUD_DIR = '.koud';
export const STATE_FILE = 'state.json';
export const BRIEF_FILE = 'brief.json';

/**
 * The gated phases, in order. `brief` is the single place a project is described; every
 * later phase reads `.koud/brief.json` instead of asking again.
 */
export const PHASES = [
  'brief', 'stack', 'architect', 'requirements', 'spec', 'build', 'ship', 'review',
];

export function statePath(root) {
  return path.join(root, KOUD_DIR, STATE_FILE);
}

export function briefPath(root) {
  return path.join(root, KOUD_DIR, BRIEF_FILE);
}

export function backupDir(root, stamp) {
  return path.join(root, KOUD_DIR, 'backups', stamp);
}

/** Filesystem-safe ISO timestamp, e.g. 2026-08-21T14-32-05Z */
export function timestamp(now = new Date()) {
  return now.toISOString().replace(/\.\d+Z$/, 'Z').replace(/:/g, '-');
}

export const STACK_FILE = 'stack.json';
export const ARCHITECTURE_FILE = 'architecture.json';
export const REQUIREMENTS_FILE = 'requirements.json';
export const SPECS_DIR = 'specs';
export const DOCS_DIR = 'docs';
export const ASSETS_DIR = 'assets';
export const FEATURES_DIR = 'features';

export function stackPath(root) {
  return path.join(root, KOUD_DIR, STACK_FILE);
}

export function architecturePath(root) {
  return path.join(root, KOUD_DIR, ARCHITECTURE_FILE);
}

export function requirementsPath(root) {
  return path.join(root, KOUD_DIR, REQUIREMENTS_FILE);
}

export function specsDir(root) {
  return path.join(root, KOUD_DIR, SPECS_DIR);
}

/** Showroom. docs/ is reader-facing and deliberately NOT under .koud/. */
export function docsPath(root, name) {
  return path.join(root, DOCS_DIR, name);
}

export function assetsPath(root, name) {
  return path.join(root, DOCS_DIR, ASSETS_DIR, name);
}

export function featurePath(root, slug) {
  return path.join(root, FEATURES_DIR, `${slug}.feature`);
}

export const DEPLOY_FILE = 'deploy.json';

export function deployPath(root) {
  return path.join(root, KOUD_DIR, DEPLOY_FILE);
}

export const REVIEW_FILE = 'review.json';

export function reviewPath(root) {
  return path.join(root, KOUD_DIR, REVIEW_FILE);
}
