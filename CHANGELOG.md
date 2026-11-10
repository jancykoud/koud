# Changelog

Releases are cut by tag. Each version gets one section here, and the release workflow
publishes that section as the GitHub Release notes.

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
