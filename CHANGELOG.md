# Changelog

Releases are cut by tag. Each version gets one section here, and the release workflow
publishes that section as the GitHub Release notes.

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
