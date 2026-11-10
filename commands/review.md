---
description: Review architecture and code quality -- delegates code-level review to /code-review, dispatches quality-reviewer for architecture-level findings, gates on zero blocking findings
allowed-tools: Bash, Read, Write, Task
---

Review the application.

## Step 1 — Check the inputs exist

`.koud/deploy.json` must exist and be `approved`. If `:ship` has not reached its own
gate, ask before reviewing an unshipped state -- it is not this command's job to block that
outright, only to make sure the user is choosing it knowingly.

## Step 2 — Code-level review

Invoke the `/code-review` skill against the current branch/diff, at an effort level
appropriate to the project's size. **Do not duplicate its logic here -- delegate to it.**
Translate each of its findings into this shape:

```json
{ "severity": "blocking", "title": "…", "summary": "…", "file": "…", "line": 14, "user_visible": true }
```

Use the same three-bucket rule `quality-reviewer` uses below: **blocking** is a
correctness bug or security-invariant violation reachable from a real user's path (the
deployed product, the README's instructions) or a required technology the code claims to
use and does not;
**should-fix** is real but off that path, or a simplification/efficiency finding with
concrete impact; **post-release** is a nice-to-have, style, or no-user-visible-effect
refactor. Write the resulting array to `.koud/.tmp-code-review-findings.json`.

## Step 3 — Architecture-level review

Dispatch the `quality-reviewer` agent. Write its JSON report's `findings` array to
`.koud/.tmp-quality-reviewer-findings.json`.

## Step 4 — Merge

Run:

`node ${CLAUDE_PLUGIN_ROOT}/scripts/review.mjs merge "$PWD" .koud/.tmp-code-review-findings.json .koud/.tmp-quality-reviewer-findings.json`

This assigns `REV-` IDs in pass order -- code-review findings first, then
quality-reviewer's -- and writes the validated, combined payload to
`.koud/review.json`. Delete both temp files afterward; neither is a durable artifact.

## Step 5 — Preview, then apply

`node ${CLAUDE_PLUGIN_ROOT}/scripts/review.mjs apply "$PWD" --dry-run`

If it reports it would overwrite an existing `review.json`/`review.md`, say which files
before applying. Then:

`node ${CLAUDE_PLUGIN_ROOT}/scripts/review.mjs apply "$PWD"`

## Step 6 — Check the gate

**If any finding is `blocking`, the phase stays `in_progress`.** Show the user the blocking
findings from `review.md` and stop -- do not present should-fix/post-release findings as
blockers. Only blocking items are mandatory.

If there are zero blocking findings, the phase is now `awaiting_approval`. Show the
should-fix and post-release findings too, but say plainly that they don't block.

## Step 7 — Stop at the gate

Ask whether to approve the review. **Do not mark the phase approved without an explicit
yes.** `:review` is the last phase: once it is approved, `/koud:next` reports the project
complete.
