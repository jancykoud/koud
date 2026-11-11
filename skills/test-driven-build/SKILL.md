---
name: test-driven-build
description: Use at :build — executes a feature's tasks.md one checkbox at a time, each task test-first in its own subagent, with a review before the box is ticked
---

# The loop

`tasks.md` is the plan. Each unchecked box is one task, and each task goes through the
same five steps, in order, with nothing skipped:

1. **Test.** Write the test the task names. It describes behaviour a user or a caller
   could observe, not the shape of the implementation.
2. **Confirm it fails.** Run it. It must fail, and fail for the reason the task is about
   — an assertion, not an import error or a typo. A test that passes before the code
   exists is not testing the task.
3. **Implement.** Write the least code that makes the test pass. Nothing the task did not
   ask for.
4. **Suite.** Run the whole test suite, not just the new test. A green new test over a red
   suite is a regression, not progress.
5. **Tick, then commit.** Tick the task's boxes in `tasks.md`, then make one commit for
   the task, its message naming it, staging by name only the files the task changed and
   that `tasks.md` — never an uncommitted change that was already in the worktree. The
   box and the code it describes travel together, so a checkout of any commit is honest
   about what is done.

## Prove tasks

A task labelled **prove** covers behaviour the project already has. It has no "confirm it
fails" step, because there is nothing to implement:

1. **Test.** Write the test the task names, or point to the existing one that already
   covers it — a second test for the same behaviour is noise.
2. **Run it.** It is expected to pass at once.
3. **Suite**, then tick the box and **commit**.

If the test fails, the project does not do what it was believed to do. That is a finding,
not a task: stop, show the user the failing output, and let them decide whether it becomes
a build task. Do not fix it quietly and tick the box.

Progress lives in those checkboxes and nowhere else. `:build` reads them back to decide
what is next, so a box ticked early is a lie the next session will believe.

## One subagent per task

Dispatch each task to a fresh subagent with the Task tool. A fresh context cannot lean on
half-remembered decisions from the previous task, and the main session keeps only the
summary instead of every file read along the way.

Give the subagent exactly:

- the task's text from `tasks.md`, verbatim;
- the feature's `design.md`, `requirements.md` and Gherkin file;
- `AGENTS.md` (the invariants) and `.koud/stack.md` (the stack);
- the five steps above, and the instruction to report the failing output from step 2 and
  the passing output from step 4.

Do not paste earlier tasks' conversations into it. If a task needs something an earlier
task produced, it is in the repository.

Tasks run one after another. Two subagents editing the same files at once produce a
merge, not a feature.

## Review before ticking

When the subagent returns, check its work before the box is ticked:

- **It did the task.** Compare the diff to the task text and the requirement it cites.
  Extra scope is a finding, not a bonus.
- **The evidence is real.** The report shows the test failing first and the suite passing
  after. If either is missing, run them yourself.
- **No invariant was bent.** Read the diff against `AGENTS.md`. A change that works by
  bypassing an invariant is not done: stop and flag it.
- **The test would catch a regression.** If deleting the implementation would leave the
  test green, the test is decoration.

If the review finds something, send it back to a subagent with the finding — do not fix
it by hand in the main session and tick the box.

## When to stop instead of pushing on

Stop and tell the user, rather than improvising, when:

- a **build** task cannot be made to fail first (the behaviour already exists, or the
  task is not testable as written);
- a **prove** task fails;
- running the tests needs something that is not running — a database, a container, Docker
  itself. Say what you would start and why, and start it once the user has seen that;
- the task contradicts `design.md`, an invariant in `AGENTS.md`, or the stack;
- the same task has failed review twice;
- finishing the task would mean touching another feature's files in a way its spec does
  not mention.

A wrong task is fixed in the spec, by the user, not worked around in the code.

## What "done" means

A feature is done when every box in its `tasks.md` is ticked, the whole suite is green,
and its Gherkin scenarios hold against the running product. Say what you ran and what it
printed. "It should work" is not a result.
