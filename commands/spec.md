---
description: Turn requirements into per-feature specs — requirements, design and tasks for each must-have
allowed-tools: Bash, Read
---

Turn requirements into per-feature specs.

## Step 1 — Confirm the input is approved

`:requirements` must have run and its phase must be approved. If it has not, stop and say
so — spec'ing against requirements that might still change wastes the work.

## Step 2 — Preview

`node ${CLAUDE_PLUGIN_ROOT}/scripts/spec.mjs apply . --dry-run`

Everything this phase writes is under `.koud/specs/`. It runs no external tool, installs
nothing and touches no file outside `.koud/`.

If the preview lists anything under `Would overwrite:` — an existing `requirements.md`,
`design.md` or `tasks.md` — **stop**. Tell the user which files, and that a `tasks.md` the
build has been ticking off would be regenerated (the old one is backed up). Apply only
after they say yes. On a first run there is nothing to overwrite: go on.

## Step 3 — Apply

`node ${CLAUDE_PLUGIN_ROOT}/scripts/spec.mjs apply .`

## Step 4 — Explain what landed

For every must-have feature this writes one `.koud/specs/NNNN-<slug>/` folder holding
`requirements.md`, `design.md` and `tasks.md`. `design.md` is the slice of the architecture
the build reads for that feature; it does not read the full architecture document.

In `tasks.md`, a requirement marked `delivered` in `requirements.json` is a **prove** task:
the test is expected to pass at once. Everything else is a **build** task, test-first. Tell
the user how many of each there are — on an existing project that split is the real size
of the work.

Every triad file that already existed was copied to `.koud/backups/<timestamp>/` before
being overwritten, so a previous run's checked-off `tasks.md` is recoverable from there.

## Step 5 — Stop at the gate

Show the user the folder list and the prove / build split. Ask whether to proceed. **Do not
continue to `:build` without an explicit yes.** The phase is `awaiting_approval` and
`:next` will not advance past it.
