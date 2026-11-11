# Changelog

Releases are cut by tag. Each version gets one section here, and the release workflow
publishes that section as the GitHub Release notes.

## [0.4.0] - 2026-11-11

Driven by a second real run: adding a new piece of work — an agent that drafts replies to
customer messages — to an existing Next.js and Supabase application.

### Added

- **`/koud:build --continuous`.** Works task after task and stops only when a test fails
  for a reason it does not understand, a *prove* task fails, it reaches the first real
  trial of something untried, going on would break a rule, a decision is missing, or the
  slice is finished. Without the flag it still stops after each task.
- **A first slice.** On its first run `:build` proposes the smallest set of tasks that
  works end to end, with whatever is untried placed early, and waits for a yes.
- **Standing rules for `:build`**, stated before any step: nothing leaves the machine,
  never on the default branch, secrets unread, only test data, any paid or third-party
  call announced, only the task committed.
- **Case-collision warning.** A file the project already has under another letter case
  (`docs/ARCHITECTURE.md` for `docs/architecture.md`) is marked `!!` in the preview and
  in the refusal, by its real name. On a case-insensitive disk the 0.3.0 preview said
  only "exists, would be changed".

### Fixed

- **`tasks.md` pointed at `features/` after `--koud-only`.** It now names
  `.koud/out/features/` when that is where the Gherkin is.
- **A behaviour filed as a non-functional requirement was never built.** `:spec` now
  lists the non-functional requirements that get no task and says why; `:requirements` is
  told a limit, a fallback or a refusal belongs in a feature.
- **Boxes in `tasks.md` were left unticked** by an assistant trying to commit only the
  task's files. The ticked `tasks.md` is now explicitly part of the task's commit.
- **The branch was reported from memory.** `:build` checks it at the start instead of
  trusting what was seen earlier in the session.

### Removed

- **The commit-stamp hook.** After every `git commit` it wrote the commit and the elapsed
  hours into `.koud/state.json`, which nothing read, and which left that file modified
  after every commit. One fewer process on every shell command, too.

### Changed

- `:architect` recommends keeping its files inside `.koud/` when the brief covers one
  piece of work rather than the whole product, or when a name collides.
- `:init` proposes adding `.koud/` to the ignore file of a formatter that runs over the
  whole repository, after asking.
- The README says plainly that in auto mode the consent hook produces no prompt.

## [0.3.0] - 2026-11-11

Driven by the first run from `:brief` to `:build` on an existing monorepo. The workflow
held and found a real defect in the project. It also took several liberties with the
project it was working on; this release removes them.

### Changed — things the plugin no longer does without asking

- **Writing outside `.koud/`.** `:architect` and `:requirements` created `AGENTS.md`,
  `docs/` and `features/` at the project root without showing a list first. A real apply
  now refuses (exit code 3, nothing written) unless `--allow-project-writes` or
  `--koud-only` records the user's answer. `--koud-only` writes the same files under
  `.koud/out/`; `:build` reads them from there.
- **Creating `AGENTS.md` and `CLAUDE.md` at `:init`.** Creating a file at the project root
  now needs the same per-file yes as changing one.
- **Replacing an approved brief.** A re-run of `:brief` applied a new brief without
  asking. The preview now lists what changes, and the apply refuses without `--replace`.
- **Deploying.** `:ship` first returns a plan — services, environments, files, commands —
  and stops. Nothing is written or deployed until the user approves it, and production is
  asked about by name.
- **Starting services and committing.** `:build` says what it is about to start (Docker, a
  database) before starting it, and stages only the files a task changed.

### Added

- **Consent hook.** A `PreToolUse` hook turns an apply carrying a consent flag, and any
  deploy command, into a permission prompt, so a yes the agent assumed still has to be
  given by a person.
- **`state` on a requirement**: `delivered` or `to_build`. On an existing project every
  task used to demand a failing test first, including for behaviour already in the code.
  A delivered requirement is now a *prove* task: the test is expected to pass, and a
  failure is reported instead of quietly fixed. `requirements.md` lists the new work on
  its own.
- **`.koud/.gitignore`** excludes `backups/`, written on the first backup. A backup is a
  verbatim copy and can hold an uncommitted edit.
- The architect is told what the `existing` track means: describe the architecture the
  code has, report gaps with file and line, and say which it verified.

### Removed

- **OpenSpec.** `:spec` ran `npx @fission-ai/openspec`, which downloaded and executed an
  external tool, wrote twelve files into `.claude/`, and produced proposals its own
  validator rejected. `:spec` now writes only under `.koud/specs/` and spawns nothing. The
  `openspec-workflow` skill is gone.

### Fixed

- **Invented values.** A scenario carried an amount taken from a seed file, and the design
  system carried a font size and breakpoints nobody had read anywhere. Commands, the
  architect and the brief skill now require every concrete value to be read from the
  brief, the code or the user — or left out, or listed apart as a proposal.
- `spent_hours` was stored as `1.1295291666666667`. It is rounded to two decimals.

### Upgrading

Nothing to migrate. A project set up with 0.2.0 keeps working; the next `:architect` or
`:requirements` run will ask where its files should go. An `openspec/` folder and
`.claude/commands/opsx*`, `.claude/skills/openspec-*` left by 0.2.0 can be deleted.

## [0.2.0] - 2026-11-11

Driven by the first real run of `:brief`, on an existing monorepo with an API, a web app
and a mobile app.

### Fixed

- **A hook failed on every prompt.** 0.1.0 removed `hooks/deadline-pressure.mjs` but left
  its `UserPromptSubmit` entry in `hooks.json`. The entry is gone, and a test now checks
  that every registered hook has a script and every script is registered.
- **False "would overwrite" warning.** A payload written in place (`.koud/stack.json`,
  then `apply`) was reported as about to be overwritten by the same run that had just
  created it. The preview now stays silent about that one file and still names every
  rendered artifact.

### Added

- **Secrets guard.** A `PreToolUse` hook denies reading `.env` files, private keys and
  keystores, and asks before editing them or running a shell command that names them.
  Templates such as `.env.example` are not affected. It only acts in a project that has a
  `.koud/` directory.
- **`scope`** in the brief: whether it covers the whole product at its current stage or
  one piece of work.
- **`role` on required technology**: `core` (the default) or `tooling`. Only core
  technology must be covered by a stack slot; tooling is recorded and left alone.
- **`kind` on success criteria**: `system` (the default) or `outcome`. An outcome is a
  result in the world that only real use can confirm; `brief.md` marks it as checked
  after release.
- **Draft flow for `:brief`.** The payload is written to `.koud/brief.draft.json` and
  applied from there, so a re-run backs up the previous brief instead of replacing it
  unseen. The draft is removed once applied.

### Changed

- The `next-monolith` repository shape is now `single-app`: one deployable, in any
  language or framework. `multi-service` covers workspace monorepos.
- `:brief` asks for the scope first, forbids reading secrets files, and treats "nothing
  formal" as an open question rather than as "nothing applies".
- The Stop hook points at `/koud:log`.
- The planned `:analyze` phase is dropped: on an existing repository `:brief` already does
  that reading.

## [0.1.0] - 2026-11-11

First version of koud, forked from
[win-hackathon](https://github.com/rogerjeasy/win-hackathon) 1.0.0 by Roger Jeasy
Bavibidila and reworked for projects that are not hackathon entries.

### Added

- `:brief` — the project is described once, in a validated `brief.json`: identity,
  problem, audience, goals and non-goals, ranked success criteria, required / preferred /
  forbidden technology, constraints and dates. Renders `brief.md` and `project.md`.
- A `track` on every brief: `new` for a project that starts from an idea, `existing` for
  a repository that already has code.
- `project-brief` skill: how to write the brief, and how to read an existing repository
  for evidence instead of assuming its stack.
- `test-driven-build` skill: the build loop (test, confirm it fails, implement, suite,
  commit), one subagent per task, with a review before a task is ticked. `:build` no
  longer depends on any other plugin.
- `docs/contracts.md`: the shape and validation rules of every payload.

### Changed

- The workflow is eight phases: `brief`, `stack`, `architect`, `requirements`, `spec`,
  `build`, `ship`, `review`.
- `:stack` covers what the brief requires, then what it prefers, then defaults. The
  `bonus` slot source is now `preferred`.
- `:requirements` checks every success criterion in the brief is claimed by a feature.
- `:check` verifies the code against the technology the brief requires and forbids.
- Review findings are classed `blocking`, `should-fix` or `post-release`, and carry
  `user_visible`.
- State lives in `.koud/`, at schema version 1.
- The Docker Compose integration test skips when no Docker daemon is reachable.

### Removed

- The hackathon-specific phases and everything that served only them: `:recon`,
  `:brainstorm`, `:describe`, `:pivot`, `:submit`, the deadline-pressure hook, their
  agents, skills, schemas and tests.
- State migrations from win-hackathon schema versions 1 to 5. A win-hackathon project is
  not upgraded in place.
