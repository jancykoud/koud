---
description: Implement the must-have features, one at a time, test-first all the way, checking the stack against the brief after each
allowed-tools: Bash, Read, Write, Edit, Task
argument-hint: "[--feature <FR-id>]"
---

Build the application.

## Step 1 — Find the next feature

Run: `node ${CLAUDE_PLUGIN_ROOT}/scripts/build.mjs status "$PWD" $ARGUMENTS`

This names the next must-have feature not yet fully checked off in its
`.koud/specs/NNNN-<slug>/tasks.md`. If it reports everything is done, skip to Step 4.

## Step 2 — Assemble the context and hand off

Read the feature's `design.md`, `requirements.md` (from the same `specs/NNNN-<slug>/`
folder), its `features/<slug>.feature` Gherkin, `AGENTS.md`, and `.koud/stack.md`.

Load the `test-driven-build` skill and follow it with that feature's `tasks.md` as the
plan. `tasks.md` is not background reading — it *is* the plan, executed checkbox by
checkbox, each one ending in `test → confirm it fails → implement → suite → commit`,
exactly as it was rendered.

The failing-test step is not optional. If a task's test passes before any implementation
exists, the test is not testing the task: stop and fix the test first.

**Do not read the OpenSpec change proposal for this feature** (the folder OpenSpec calls
`changes/<slug>/`). It is a record for reviewers, not build context: `tasks.md`,
`design.md` and the Gherkin file already carry everything the build needs, and a second
description of the same feature is a second thing that can disagree with them.

If this is the last must-have feature, confirm the product can be started and reached the
way the README says before moving to Step 3.

## Step 3 — Check compliance, then loop

Run `/koud:check`. If it reports a regression, fix it before starting the next
feature — a technology the brief requires that the code stopped using is cheapest to
fix the day it broke.

Return to Step 1.

## Step 4 — Close the gate

Run: `node ${CLAUDE_PLUGIN_ROOT}/scripts/build.mjs gate "$PWD"`

If it reports something is still not done, go back to Step 1 for that feature.

## Step 5 — Stop at the gate

Show the user which features were built and the last `:check` result. Ask whether to
proceed. **Do not continue to `:ship` without an explicit yes.**
