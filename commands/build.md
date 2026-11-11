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
folder), its `features/<slug>.feature` Gherkin, `AGENTS.md`, and `.koud/stack.md`. If the
project kept koud's files inside `.koud/`, the Gherkin and `AGENTS.md` are under
`.koud/out/` at the same relative path.

Load the `test-driven-build` skill and follow it with that feature's `tasks.md` as the
plan. `tasks.md` is not background reading — it *is* the plan, executed checkbox by
checkbox, each one ending in `test → confirm it fails → implement → suite → commit`,
exactly as it was rendered.

`tasks.md` holds two kinds of task, and each is labelled:

- **Build** — new work. The failing-test step is not optional: if the test passes before
  any implementation exists, the test is not testing the task. Stop and fix the test first.
- **Prove** — behaviour the project already has. The test is expected to pass at once. If
  it fails, **stop**: you have found a gap between what the project claims and what it
  does. Report it to the user with the failing output before changing any code — closing
  it may be a one-line fix or a decision about scope, and that call is theirs.

**Say before you start anything that outlives the command.** A database container, a
development server, Docker itself: tell the user what you are about to start and why, and
start it only once they have seen that. Say at the end what is still running.

**Do not commit what is not this task.** Stage the files the task changed, by name. An
uncommitted change that was in the worktree before the build began is the user's, not
yours.

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
