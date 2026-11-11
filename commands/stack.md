---
description: Resolve the technology stack — what the brief requires first, sensible defaults filling the gaps, every slot with a reason
allowed-tools: Bash, Read, Write
---

Resolve the stack for this project.

Load the `monorepo-structure` and `framework-drift-guard` skills before starting.

## Step 1 — Read the inputs

Read `.koud/brief.json` (required, preferred and forbidden technology, and the success
criteria) and `.koud/project.md` (the product and who it is for).

**Never assume the stack.** It comes from the brief, and on the `existing` track the brief's
required technology is what the code already uses. If the brief says nothing about a slot,
that slot is open — it is not an invitation to reuse the last project's choices.

## Step 2 — Resolve each slot, the brief's constraints first

1. **Required technology is fixed.** It cannot be traded away for something you like
   better. Every entry in `brief.tech.required` gets a slot with `source: "required"` and a
   `requirement_ref` naming it.
2. **Preferred technology is used unless there is a stated reason not to.** A slot that
   follows `brief.tech.preferred` carries `source: "preferred"`. A slot that declines one
   says why in `rejected`.
3. **Defaults fill the slots the brief leaves open** (`source: "default"`). Choose what
   the project's success criteria and constraints point to, and say which one decided it.
4. **Every slot records a rationale** — why this choice, not merely what it is.

Exactly one slot should carry the thesis (`thesis_support: "carries"`): the technology
that makes the brief's one-liner true rather than merely possible. If nothing carries it,
the product promise has no architecture behind it — go back to the brief rather than
inventing a claim here.

## Step 3 — Choose the repository shape

| Shape | When |
|---|---|
| `single-app` | one deployable: a full-stack app, an API or a site, with no second unit that ships on its own |
| `multi-service` | separate `web/`, `api/`, `agents/`, each independently deployable |

`monorepo-structure` has the criteria and what each shape costs.

## Step 4 — Write and validate

Write `.koud/stack.json` — its shape and rules are in `${CLAUDE_PLUGIN_ROOT}/docs/contracts.md` — then run:

`node ${CLAUDE_PLUGIN_ROOT}/scripts/stack.mjs validate .koud/stack.json`

The script prints every problem at once. Fix them all, then re-run. **At most two retries** —
a third is a loop, not a fix, so stop and show the user the errors.

## Step 5 — Preview, then apply

`node ${CLAUDE_PLUGIN_ROOT}/scripts/stack.mjs apply . --dry-run`

Everything this phase writes is under `.koud/`. If the preview lists an existing
`.koud/stack.md` under `Would overwrite:`, **stop** and tell the user a stack they already
approved is about to be replaced, and what differs. Apply only after they say yes. On a
first run there is nothing to overwrite: go on.

`node ${CLAUDE_PLUGIN_ROOT}/scripts/stack.mjs apply .`

## Step 6 — Stop at the gate

Show the user the slot table and the rejected alternatives. Say separately what is your
proposal rather than a fact from the brief or the code, and what you did not verify — a
version you read in a manifest is a fact; "this version is still supported" is a claim you
checked today or did not. Ask whether to proceed.
**Do not continue to `:architect` without an explicit yes.** The phase is
`awaiting_approval` and `:next` will not advance past it.
