# koud

A Claude Code plugin that runs a software project as one guided, gated workflow. You
describe the project **once**. From then on, choosing the stack, designing the
architecture, writing requirements and specs, building test-first, deploying and
reviewing each read that one description instead of asking you again.

koud is a fork of [win-hackathon](https://github.com/rogerjeasy/win-hackathon) by
Roger Jeasy Bavibidila, reworked for projects that are not hackathon entries. The state
machine, the validate-before-write pattern, the hooks and most of the engineering skills
are his; see [Credits](#credits).

## How it works

Eight gated phases. Nothing advances without your explicit approval.

`:brief` → `:stack` → `:architect` → `:requirements` → `:spec` → `:build` → `:ship` → `:review`

You never need to remember that order: `/koud:next` resolves it from the state on disk.

Three ideas hold the workflow together:

- **One brief.** `:brief` writes `.koud/brief.json`: what the project is, who it is for,
  how success is judged, and which technology is imposed. Every later phase reads it.
- **Validate, then render.** Every judgment phase writes a JSON payload that must pass a
  schema before anything else is written. Every document and diagram is rendered from
  that payload, so nothing downstream can drift from it.
- **State on disk.** `.koud/state.json` records where the project is. A session-start hook
  re-injects it, so clearing the conversation costs nothing.

## Install

Directly from GitHub, in one step (Claude Code 2.1.275 or later):

```
/plugin install koud --marketplace jancykoud/koud
```

From a local clone:

```
git clone https://github.com/jancykoud/koud.git
/plugin marketplace add /path/to/koud
/plugin install koud
```

The git root is the plugin root: `/plugin marketplace add` expects `.claude-plugin/` at
the top level. The plugin needs Node.js 20 or later and has no dependencies to install.

## Commands

| Command | What it does |
|---|---|
| `/koud:init [--dry-run]` | Sets up (or adopts) the workflow in this project. Never overwrites a file without a per-file yes; there is no force flag. |
| `/koud:next` | Resolves which phase comes next from on-disk state and starts it. Reports drift when state and the filesystem disagree. |
| `/koud:status` | Phase board, track, deadline, stack, required technology not yet verified, missing tools. Changes nothing. |
| `/koud:brief [--track new\|existing]` | Describes the project once. On an existing repository it reads the code for evidence before asking anything. |
| `/koud:stack` | Resolves the technology stack: what the brief requires first, then what it prefers, then defaults, every slot with a reason. |
| `/koud:architect` | Designs the system: architecture, data model, three diagram formats and the `AGENTS.md` invariants, all rendered from one validated payload. |
| `/koud:requirements` | Turns the architecture into FR ids with acceptance criteria, a test matrix and executable Gherkin scenarios. |
| `/koud:spec` | Turns requirements into per-feature specs (requirements, design, tasks), plus OpenSpec change proposals when that CLI is reachable. |
| `/koud:build [--feature <FR-id>]` | Implements the must-have features one at a time, test-first, running `:check` after each one. |
| `/koud:check` | Verifies with `file:line` evidence that the code really uses the technology the brief requires and none it forbids. Safe to run any time; does not gate. |
| `/koud:ship` | Picks a deploy target, writes Dockerfiles, Terraform and CI, deploys, and verifies every URL with a real request before the gate. |
| `/koud:review` | Runs `/code-review` and an architecture-level reviewer, and merges both into a validated `review.json`. Refuses the gate while any finding is `blocking`. |
| `/koud:log <text>` | Appends a timestamped entry to `challenges.md`, the running log of problems met and how they were solved. |

Each phase command ends at an approval gate and stops. `:check` and `:log` are the
exceptions: one is a repeatable audit, the other a running log.

## What each phase produces

Working documents land in `.koud/`; reader-facing ones land in `docs/` and the repository
root.

| Phase | Artifacts |
|---|---|
| `:brief` | `brief.json`, `brief.md` (success criteria, technology, constraints), `project.md` (the product and who it is for) |
| `:stack` | `stack.json`, `stack.md` — every slot with a source (`required`, `preferred`, `default`, `replacement`) and a reason |
| `:architect` | `architecture.json`, `docs/architecture.md`, `docs/data-model.md`, diagrams, plus `AGENTS.md` and `CLAUDE.md` blocks at the repository root |
| `:requirements` | `requirements.json`, `requirements.md`, `features/<slug>.feature` (executable Gherkin) |
| `:spec` | `specs/NNNN-<slug>/{requirements,design,tasks}.md` per must-have feature |
| `:build` | Application source code. Progress is read back from the checkboxes in each feature's `tasks.md`, not tracked a second way in `state.json` |
| `:ship` | `deploy.json` — per-service target, verified URL and verification method — plus the infrastructure and CI files |
| `:review` | `review.json`, `review.md` — findings classed `blocking`, `should-fix` or `post-release` |

The shape and rules of every payload are in [`docs/contracts.md`](docs/contracts.md).

## Rules the validators enforce

These are mechanical, not conventions:

- Every success criterion has a statement someone could check. "Fast" is rejected.
- Every technology the brief requires carries a reason, and is covered by a stack slot.
- A stack slot may not use a technology the brief forbids.
- Every date carries an explicit UTC offset. A floating `2027-01-15T17:00:00` is rejected.
- A success criterion no feature claims fails `:requirements`: nothing would be built to
  meet it.
- A service marked `verified` in `deploy.json` must carry when and how it was verified.
- `:review` cannot reach its gate while any finding is `blocking`.

## Hooks

| Event | What it does |
|---|---|
| Session start | Injects the project, track, deadline, success criteria, approved phases, next phase and required technology. Silent in a project with no `.koud/`. |
| After a `git commit` | Stamps the commit and the elapsed time into the state. |
| Stop | When the session hit real failures and `challenges.md` was not updated, lists up to three of them and points at `/koud:log`. |

Every hook is written to never crash a session: on a corrupt state it prints one line and
exits cleanly.

## Status and limits

This is version 0.1.0, the first milestone of the fork.

- **The two tracks share one path.** `:brief` records whether a project is `new` or
  `existing` and treats technology accordingly, but there is not yet a dedicated phase
  that analyses an existing repository in depth.
- **Repository shapes are still `next-monolith` and `multi-service`**, and the frontend
  and backend skills are written around Next.js and FastAPI. A project on another stack
  can use the workflow, but those skills and the shape names do not fit it yet.
- **`:ship` and `:review` are inherited as they were** and have only been exercised here
  through the test suite, not on a live deployment.

Planned next: an `:analyze` phase for existing repositories, stack-neutral repository
shapes, a browser test loop, a security audit phase, and a map of what can be automated
by a script, a workflow or an agent.

## Development

```bash
npm test        # node --test, no install step
```

The suite needs nothing but Node.js. One integration test starts a container with Docker
Compose and skips itself when no Docker daemon is reachable.

Releases are cut by tag: add a section to [`CHANGELOG.md`](CHANGELOG.md), bump `version`
in `.claude-plugin/plugin.json` and `package.json`, then tag and push `vX.Y.Z`.

## Credits

koud is built on [win-hackathon](https://github.com/rogerjeasy/win-hackathon) by
**Roger Jeasy Bavibidila**, released under the MIT license. The phase state machine, the
drift detection, the schema-validated payloads, the diagram emitters, the hooks, the
agents and the architecture, data-modelling, security, deployment and CI skills come from
that project. Several skills cite his project Kintwadi as their reference implementation.

What koud changes is listed in [`CHANGELOG.md`](CHANGELOG.md).

## License

MIT. See [`LICENSE`](LICENSE).
