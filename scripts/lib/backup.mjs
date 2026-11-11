import { copyFile, mkdir, access, writeFile, readFile } from 'node:fs/promises';
import path from 'node:path';
import { KOUD_DIR, backupDir } from './paths.mjs';

/**
 * Copies one pre-existing file into `backups/<stamp>/<relPath>`. Returns null when there is
 * nothing to back up. Callers that back up more than one file in a single run should use
 * openBackupSet() instead, which additionally guarantees the run gets a directory of its own.
 */
export async function backupFile(root, relPath, stamp) {
  const src = path.join(root, relPath);
  try {
    await access(src);
  } catch {
    return null;
  }
  const dest = path.join(backupDir(root, stamp), relPath);
  await mkdir(path.dirname(dest), { recursive: true });
  await copyFile(src, dest);
  return dest;
}

/**
 * Keeps backups out of version control. A backup is a verbatim copy of whatever was about
 * to be replaced — including uncommitted edits to CLAUDE.md or AGENTS.md the user never
 * meant to publish — so committing `.koud/` must not carry them along. The rule goes in
 * `.koud/.gitignore`: the project's own .gitignore is not touched, and the backups
 * directory keeps holding nothing but backup sets. A rule already present is not repeated;
 * anything else the user put in that file is kept.
 */
const BACKUPS_IGNORE_RULE = 'backups/';

async function ignoreBackups(root) {
  const file = path.join(root, KOUD_DIR, '.gitignore');
  const current = await readFile(file, 'utf8').catch((err) => {
    if (err.code === 'ENOENT') return '';
    throw err;
  });
  if (current.split(/\r?\n/).some((line) => line.trim() === BACKUPS_IGNORE_RULE)) return;
  const sep = current === '' || current.endsWith('\n') ? '' : '\n';
  await writeFile(file, `${current}${sep}${BACKUPS_IGNORE_RULE}\n`, 'utf8');
}

/**
 * Claims a backup directory nobody else is using, by creating it. `timestamp()` has
 * one-second resolution, so two applies of the same command inside one wall-clock second
 * would otherwise share a directory and the second run's copyFile() would silently overwrite
 * — and destroy — what the first run had preserved there. A finer-grained clock only narrows
 * that window; creating the directory with a non-recursive mkdir closes it, because mkdir
 * fails with EEXIST rather than succeeding on a directory that already exists. A taken name
 * gets a numeric suffix: `<stamp>`, then `<stamp>-2`, `<stamp>-3`, ...
 */
async function claimBackupDir(root, stamp) {
  const backups = path.join(root, KOUD_DIR, 'backups');
  await mkdir(backups, { recursive: true });
  await ignoreBackups(root);
  for (let n = 1; ; n += 1) {
    const candidate = n === 1 ? stamp : `${stamp}-${n}`;
    try {
      // Deliberately NOT recursive: recursive mkdir treats an existing directory as success,
      // which is exactly the collision this needs to detect.
      await mkdir(backupDir(root, candidate));
      return candidate;
    } catch (err) {
      if (err.code !== 'EEXIST') throw err;
    }
  }
}

/**
 * One backup set for one apply invocation. Every file backed up through the returned handle
 * lands in the same directory (that co-timestamped set is the whole backup promise), and no
 * other invocation can land in it.
 *
 * The directory is claimed lazily, on the first file that actually needs backing up, so an
 * apply run that overwrites nothing leaves no empty directory behind.
 */
export function openBackupSet(root, stamp) {
  let claimed = null;
  return {
    /** Returns the destination path, or null when `relPath` does not exist yet. */
    async backup(relPath) {
      const src = path.join(root, relPath);
      try {
        await access(src);
      } catch {
        return null;
      }
      if (claimed === null) claimed = await claimBackupDir(root, stamp);
      const dest = path.join(backupDir(root, claimed), relPath);
      await mkdir(path.dirname(dest), { recursive: true });
      await copyFile(src, dest);
      return dest;
    },
    /** The directory name actually used, or null while nothing has been backed up. */
    get stamp() {
      return claimed;
    },
  };
}

/**
 * Which of `relPaths` already exist under `root`. Used by every apply module's dry-run branch
 * to answer "what would this overwrite?" without writing anything — the preview the command
 * files' overwrite-consent step asks the agent to relay to the user.
 */
export async function existingPaths(root, relPaths) {
  const checked = await Promise.all(relPaths.map(async (rel) =>
    access(path.join(root, rel)).then(() => rel).catch(() => null)));
  return checked.filter((rel) => rel !== null);
}

/**
 * A payload the agent wrote in place (`.koud/stack.json`, then `stack.mjs apply`) already
 * holds the new content when the preview runs, so listing it under "would overwrite" warns
 * about a file the same run just created. Drop it from the preview in that one case; a
 * payload supplied from another path is still reported, because then the file on disk
 * really is an older version about to be replaced.
 */
export function withoutInPlacePayload(wouldOverwrite, root, sourcePath, payloadRel) {
  if (!Array.isArray(wouldOverwrite)) return wouldOverwrite;
  const inPlace = path.resolve(sourcePath) === path.resolve(root, payloadRel);
  return inPlace ? wouldOverwrite.filter((rel) => rel !== payloadRel) : wouldOverwrite;
}
