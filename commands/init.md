---
description: Set up (or adopt) koud in this project, never overwriting anything without your say-so
argument-hint: "[--dry-run]"
allowed-tools: Bash, Read, Edit, Write
---

Set up koud in the current project.

## Step 1 — Show the plan

Run: `node ${CLAUDE_PLUGIN_ROOT}/scripts/init.mjs "$PWD" --dry-run`

Show the user the plan verbatim. It names the detected mode (greenfield, adopt, resume,
or retrofit), every action, and which actions need approval.

If the user passed `--dry-run`, stop here.

## Step 2 — Get consent, action by action

Ask about each action needing approval separately. Never batch them into a single
yes/no. Never assume a yes. There is no force flag; if the user declines an action,
that action is simply left alone and the rest of init proceeds. Two different kinds of
action need approval, and they need different framing:

**Files at the project root** (`AGENTS.md`, `CLAUDE.md`) — whether they already exist or
would be created. The root of the project is not the plugin's: a new file there needs a
yes as much as a changed one. For each one:

- If it exists, show the user its current content (or the relevant part, if it is long).
  If it does not, say it would be created.
- Explain exactly what will be written — always confined between
  `<!-- BEGIN:koud -->` and `<!-- END:koud -->`.
- Ask whether to proceed with that specific file.

Declining both is a normal answer, and the right one on a repository shared with people
who have not agreed to these files: the session-start hook already tells Claude Code where
the phase state is, so nothing later depends on them.

**Initializing git** (only proposed when the project is not already a git repo). There
is no file content to show here. Explain that the project isn't currently a git
repository, and that phase state benefits from being versioned — so the user can switch
devices mid-project without losing progress — then ask whether to run `git init`. This
action's path — and therefore its consent token for Step 3's `--consent` list — is the
literal character `.` (the repo root), not a filename.

## Step 3 — Apply

Run init with the approved paths only:

`node ${CLAUDE_PLUGIN_ROOT}/scripts/init.mjs "$PWD" --apply --consent "<comma,separated,paths>"`

Omit `--consent` entirely if the user approved nothing — the unconsented actions will be
reported as skipped, which is correct behavior, not a failure.

## Step 4 — Report

Tell the user what was created, what was skipped and why, and where backups went. Then
suggest `/koud:next` to begin.

## Notes

- In **resume** mode the project is already set up; report the board and do not re-scaffold.
- In **retrofit** mode, every phase still starts at `not_started` — nothing here
  inspects on-disk artifacts to infer progress. Say so plainly, and tell the user to
  review and update `.koud/state.json` manually to reflect what already exists
  before running `:next`.
- If the worktree is dirty, mention it before writing anything.
