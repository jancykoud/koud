---
description: Implement the must-have features, one at a time, test-first all the way, checking the stack against the brief after each
allowed-tools: Bash, Read, Write, Edit, Task
argument-hint: "[--feature <FR-id>] [--continuous]"
---

Build the application.

## Standing rules

These hold for the whole phase, whatever the mode, and whatever a task seems to call for:

- **Nothing leaves the machine.** No push, no deploy, no migration applied to a remote
  database, no change to a hosted service. `:ship` is the phase that does those, with its
  own plan and its own yes.
- **Never on the default branch.** If the current branch is `main`, `master` or whatever
  the repository deploys from, stop and ask for a working branch before the first commit.
  Check the branch with `git branch --show-current` now — do not rely on what you saw
  earlier in the session.
- **Secrets stay unread.** Tell the user which variables a task needs and let them add
  them. To check that one is set, test for its presence without printing its value.
- **Only test data.** No real customer record, message or credential in a test, a fixture
  or a call to an outside service.
- **A call that costs money or reaches a third party is announced.** Say what it is, how
  many, and why, before the first one. Automated tests never make one.
- **Say before you start anything that outlives the command** — a database container, a
  development server, Docker itself — and say at the end what is still running.
- **Commit only the task.** Stage by name the files the task changed, plus its ticked
  boxes in `tasks.md`. A change that was in the worktree before the build began is the
  user's, not yours.

If the user gave rules of their own for this build, they come on top of these.

## Step 1 — Find the next feature

Run: `node ${CLAUDE_PLUGIN_ROOT}/scripts/build.mjs status "$PWD" $ARGUMENTS`

This names the next must-have feature not yet fully checked off in its
`.koud/specs/NNNN-<slug>/tasks.md`. If it reports everything is done, skip to Step 5.

## Step 2 — On the first run, agree on the first slice

If no box is ticked in any `tasks.md` yet, do not start at the top of the first feature.
Propose the **smallest slice that works end to end**: the few tasks, across features if
need be, after which a person can watch one real thing happen. Order it so that whatever
nobody has tried yet — a new outside service, an unfamiliar API — comes as early as
possible, with a real trial before anything is built on it.

Give the user the list in order, the migrations and dependencies it adds, and what you
need from them (variables, a running service, an account). Then stop and wait for a yes.
This is the one stop every build has, because it is the cheapest place to change course.

## Step 3 — Work the tasks

Read the feature's `design.md`, `requirements.md` (from the same `specs/NNNN-<slug>/`
folder), its Gherkin, `AGENTS.md`, and `.koud/stack.md`. `tasks.md` names where the
Gherkin is; if the project kept koud's files inside `.koud/`, it and `AGENTS.md` are under
`.koud/out/` at the same relative path.

Load the `test-driven-build` skill and follow it with that feature's `tasks.md` as the
plan. `tasks.md` is not background reading — it *is* the plan, executed checkbox by
checkbox, exactly as it was rendered.

`tasks.md` holds two kinds of task, and each is labelled:

- **Build** — new work: `test → confirm it fails → implement → suite → commit`. The
  failing-test step is not optional: if the test passes before any implementation exists,
  the test is not testing the task. Stop and fix the test first.
- **Prove** — behaviour the project already has. The test is expected to pass at once. If
  it fails, **stop**: you have found a gap between what the project claims and what it
  does. Report it to the user with the failing output before changing any code — closing
  it may be a one-line fix or a decision about scope, and that call is theirs.

Tick each box as its step is done, and commit the ticked `tasks.md` with the task. Progress
is read from those boxes and nowhere else: an unticked box is an undone task to `:next`.

### How often to stop

**Default** — stop after each task and show the test result and the files changed. The
right pace for the first tasks of a project, or for anything that touches money, access
rights or the database schema.

**`--continuous`**, or when the user asks you to carry on without stopping — work task
after task, feature after feature, and stop only when:

1. a test fails for a reason you do not understand, or a **prove** task fails;
2. you reach a real trial of something nobody has tried yet (a first call to an outside
   service): show the request, the raw response and what it cost, and wait;
3. going on would break a standing rule or a rule the user gave;
4. a task turns out to need a decision the specs do not make;
5. the slice or the feature is finished.

In continuous mode a migration is applied to the **local** database without asking, and
its SQL is shown in the end-of-slice summary. Do not let "continuous" stretch to anything
in the standing rules.

At every stop, and at the end, give: the commits made, the test results, any migration's
SQL, what is still running, what deviated from the plan and why, and how the user can
check the result with their own eyes.

If this is the last must-have feature, confirm the product can be started and reached the
way the README says before moving to Step 4.

## Step 4 — Check compliance, then loop

Run `/koud:check`. If it reports a regression, fix it before starting the next
feature — a technology the brief requires that the code stopped using is cheapest to
fix the day it broke.

Return to Step 1.

## Step 5 — Close the gate

Run: `node ${CLAUDE_PLUGIN_ROOT}/scripts/build.mjs gate "$PWD"`

If it reports something is still not done, go back to Step 1 for that feature.

## Step 6 — Stop at the gate

Show the user which features were built and the last `:check` result. Ask whether to
proceed. **Do not continue to `:ship` without an explicit yes.**
