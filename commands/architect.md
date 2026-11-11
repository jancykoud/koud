---
description: Design the system — architecture, data model, diagrams, invariants and the agent contract
allowed-tools: Bash, Read, Write, Task
---

Design the system.

## Step 1 — Check the inputs exist

`.koud/stack.json` must exist and its phase must be approved. If `:stack` has not run,
stop and say so — designing against an undecided stack wastes the design.

## Step 2 — Dispatch the architect

Dispatch the `solution-architect` agent. It writes `.koud/architecture.json` and nothing
else. Tell it which track the brief is on: on the `existing` track its job is to describe
the architecture the code already has, gaps included, not to design a better one. Do not design in this conversation — the exploration is large and none of it is needed
after the payload exists.

## Step 3 — Validate

`node ${CLAUDE_PLUGIN_ROOT}/scripts/architect.mjs validate .koud/architecture.json`

Send the whole error list back to the agent. **At most two retries**, then stop and show the
user.

## Step 4 — Preview, then stop

`node ${CLAUDE_PLUGIN_ROOT}/scripts/architect.mjs apply . --dry-run`

This phase is the first that writes outside `.koud/`: `AGENTS.md`, `CLAUDE.md`,
`docs/architecture.md`, `docs/data-model.md` and the diagrams under `docs/assets/`. The
preview lists them under `Outside .koud/`. Those files belong to the project, so the
decision is the user's, every time, including on a re-run.

**Stop here.** Show the user that list, saying for each file whether it is new or already
exists. For one that exists, say what would change: additions to `AGENTS.md` and
`CLAUDE.md` are confined between `<!-- BEGIN:koud -->` and `<!-- END:koud -->`, and
anything outside those markers is kept. Then ask one question with two answers:

- **Yes, write them in the project** — they sit where people and tools expect them.
- **No, keep them inside `.koud/`** — the same files are written under `.koud/out/`, and
  nothing in the project moves. The right answer for a repository shared with people who
  have not agreed to these files.

Do not apply before the answer. Running the apply without a flag is refused by the script
(exit code 3, nothing written) — that is the guard working, not an error to work around.

## Step 5 — Apply the way the user chose

If they said yes:

`node ${CLAUDE_PLUGIN_ROOT}/scripts/architect.mjs apply . --allow-project-writes`

The user will be prompted to confirm this command. That prompt is deliberate.

If they said no:

`node ${CLAUDE_PLUGIN_ROOT}/scripts/architect.mjs apply . --koud-only`

Never pass `--allow-project-writes` on your own judgement, and never pick it because it is
"what the phase normally does". Everything replaced is backed up under
`.koud/backups/<timestamp>/` first.

## Step 6 — Stop at the gate

Show the user the Mermaid diagram, the component legend and the numbered invariants. Say
plainly if the invariant list came out short — a project with no tenancy story *should*
have few invariants. A padded list is worse than a short one.

Then say, as a separate list, **which values in the design are your proposal and not read
from the brief or the code**: a size, a breakpoint, a threshold, a colour. The user cannot
tell a fact from a guess unless you label the guesses.

Ask whether to proceed. **Do not continue to `:requirements` without an explicit yes.** The
phase is `awaiting_approval` and `:next` will not advance past it.
