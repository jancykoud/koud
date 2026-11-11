/**
 * Recognises a shell command that deploys — something that changes what real users reach.
 *
 * `:ship` is meant to deploy, and on a new project that is the point. On a project that is
 * already live, the same command replaces a production release. Either way it is the one
 * step in the workflow that cannot be taken back by `git checkout`, so it is the user who
 * presses the button: in a project koud manages, a deploy command becomes a permission
 * prompt.
 *
 * This is a tripwire for the ordinary cases, not a sandbox. Local commands — a build, a
 * `docker compose up`, a plan, a dry run, `--help` — are left alone.
 */
const DEPLOY_COMMANDS = [
  [/\bvercel\b[^|;&]*\s(deploy|--prod)\b/, 'Vercel'],
  [/\bgcloud\s+(run|app|functions)\s+deploy\b/, 'Google Cloud'],
  [/\brailway\s+(up|redeploy)\b/, 'Railway'],
  [/\b(fly|flyctl)\s+deploy\b/, 'Fly.io'],
  [/\bnetlify\s+deploy\b/, 'Netlify'],
  [/\bfirebase\s+deploy\b/, 'Firebase'],
  [/\bterraform\s+(apply|destroy)\b/, 'Terraform'],
  [/\bkubectl\s+(apply|delete|rollout)\b/, 'Kubernetes'],
  [/\bhelm\s+(install|upgrade|uninstall)\b/, 'Helm'],
  [/\beas\s+(submit|update)\b/, 'Expo EAS'],
  [/\bprisma\s+migrate\s+deploy\b/, 'a database migration (prisma migrate deploy)'],
];

const HARMLESS = /(^|\s)(--help|-h|--dry-run|--dry_run)(\s|=|$)/;

export function evaluateDeployCommand(command) {
  if (typeof command !== 'string' || command.trim() === '') return null;
  if (HARMLESS.test(command)) return null;
  for (const [pattern, target] of DEPLOY_COMMANDS) {
    if (pattern.test(command)) {
      return {
        decision: 'ask',
        reason: `this command deploys to ${target}. Approve only if you know which environment ` +
          'it reaches and you asked for it.',
      };
    }
  }
  return null;
}
