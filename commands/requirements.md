---
description: Turn the architecture into verifiable features — FR ids, acceptance criteria and Gherkin scenarios
allowed-tools: Bash, Read, Write
---

Turn the architecture into verifiable requirements.

Load the `gherkin-requirements` skill before starting.

## Step 1 — Read the inputs

Read `.koud/architecture.json` (the components and invariants), `.koud/project.md`
(the product and who it is for) and `.koud/brief.json` (the success criteria).

## Step 2 — Write one feature per thing the product actually does

Each feature claims the success criteria it serves, via `criterion_refs`. Check this both
ways: every feature's criteria should be real, and — the direction that is easy to miss —
every criterion in the brief should be claimed by at least one feature. **A criterion no
feature claims is a promise nothing is being built to keep**, and the validator will
reject a payload that leaves one unclaimed.

## Step 3 — Give every must-have a scenario

Every `must` priority feature needs at least one scenario with concrete Given/When/Then
steps — written so it could be executed against the running product, not merely read as a
description of intent.

## Step 4 — Say what is already there

On the `existing` track, give every requirement a `state`:

- `"delivered"` — the behaviour is already in the code. You read the code and found it;
  say where. Its task will be a **prove** task: the test is expected to pass at once.
- `"to_build"` — it is not there yet, or you could not confirm that it is.

When in doubt it is `to_build`. A failing test costs a few minutes; a requirement wrongly
marked delivered is a claim nobody checks again. On the `new` track, leave `state` out.

A requirement with no scenario cannot be demonstrated. If neither the brief nor the code
says what it should do, do not write one from imagination: ask the user, or propose
dropping it from this phase.

**Every concrete value in a scenario — an amount, a duration, a count, a name — is read
from the brief, the code or the user's own words.** If you need one that none of them
gives, write the scenario without the number ("the practitioner's fee", not "15 000 XAF")
or ask. A value taken from a seed file or a test fixture is a test value: say so, do not
present it as a fact about the product.

**A non-functional requirement is a check, not a behaviour.** "The SDK version is pinned",
"no new paid service": a reviewer verifies those, and `:spec` gives them no task. Anything
a person could observe the system doing — a daily limit, a fallback, a refusal — is a
functional requirement: put it in a feature, with a scenario, or nothing will build it.

## Step 5 — Flag the demo moment

Exactly one feature is the demo moment: the one scenario that, shown in thirty seconds,
makes the brief's one-liner obviously true. Set `demo_moment: true` on it, and nowhere
else.

## Step 6 — Write and validate

Write `.koud/requirements.json` — its shape and rules are in
`${CLAUDE_PLUGIN_ROOT}/docs/contracts.md` — then run:

`node ${CLAUDE_PLUGIN_ROOT}/scripts/requirements.mjs validate .koud/requirements.json`

The script prints every problem at once. Fix them all, then re-run. **At most two retries** —
a third is a loop, not a fix, so stop and show the user the errors.

## Step 7 — Preview, then stop

`node ${CLAUDE_PLUGIN_ROOT}/scripts/requirements.mjs apply . --dry-run`

This writes `.koud/requirements.json`, `.koud/requirements.md`, and one
`features/<slug>.feature` per feature. The Gherkin files are outside `.koud/`: the preview
lists them under `Outside .koud/`, and whether a `features/` folder appears in the project
is the user's decision.

**Stop here.** Show the user that list and ask one question with two answers:

- **Yes, write `features/` in the project** — where a test runner would look for them.
- **No, keep them inside `.koud/`** — they are written under `.koud/out/features/`.

If the preview also reports it would overwrite `.koud/requirements.md` or
`.koud/requirements.json`, say so in the same message. Do not apply before the answer;
an apply without a flag is refused by the script (exit code 3, nothing written).

## Step 8 — Apply the way the user chose

`node ${CLAUDE_PLUGIN_ROOT}/scripts/requirements.mjs apply . --allow-project-writes`

or

`node ${CLAUDE_PLUGIN_ROOT}/scripts/requirements.mjs apply . --koud-only`

The first prompts the user to confirm; that is deliberate. Never pass
`--allow-project-writes` on your own judgement.

`requirements.json` and `requirements.md` are backed up under `.koud/backups/<timestamp>/`
before being overwritten; the `.feature` files are not — regenerating them on every run is
the intended contract, so never hand-edit one. If a `.feature` file from a previous run is
no longer in the requirements, the script reports it under `Left in place:` rather than
deleting it.

## Step 9 — Stop at the gate

Show the user the criteria-coverage table and the Definition of Done from
`requirements.md`. On the `existing` track, show the new work on its own — the
requirements that are `to_build` — because that list, not the full one, is the size of the
job. Say which rankings and which demo moment are your proposal. Ask whether to proceed. **Do not continue to `:spec` without an
explicit yes.** The phase is `awaiting_approval` and `:next` will not advance past it.
