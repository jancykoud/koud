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
| `/koud:init [--dry-run]` | Sets up (or adopts) the workflow in this project. Never creates or changes a file at the project root without a per-file yes; there is no force flag. |
| `/koud:next` | Resolves which phase comes next from on-disk state and starts it. Reports drift when state and the filesystem disagree. |
| `/koud:status` | Phase board, track, deadline, stack, required technology not yet verified, missing tools. Changes nothing. |
| `/koud:brief [--track new\|existing]` | Describes the project once. On an existing repository it reads the code for evidence before asking anything. |
| `/koud:stack` | Resolves the technology stack: what the brief requires first, then what it prefers, then defaults, every slot with a reason. |
| `/koud:architect` | Designs the system — or, on an existing project, describes the one the code already has, gaps included: architecture, data model, three diagram formats and the `AGENTS.md` invariants, all rendered from one validated payload. |
| `/koud:requirements` | Turns the architecture into FR ids with acceptance criteria, a test matrix and executable Gherkin scenarios. On an existing project each requirement says whether it is already delivered or still to build. |
| `/koud:spec` | Turns requirements into per-feature specs (requirements, design, tasks) under `.koud/specs/`. Runs no external tool. |
| `/koud:build [--feature <FR-id>] [--continuous]` | Works the must-have features: new behaviour test-first, existing behaviour proven by a test that is expected to pass, `:check` after each feature. Starts by agreeing on the smallest end-to-end slice. Stops after each task, or with `--continuous` only when something needs you. |
| `/koud:check` | Verifies with `file:line` evidence that the code really uses the technology the brief requires and none it forbids. Safe to run any time; does not gate. |
| `/koud:ship` | Proposes a deployment plan and stops; once approved, writes Dockerfiles, Terraform and CI, deploys, and verifies every URL with a real request before the gate. |
| `/koud:review` | Runs `/code-review` and an architecture-level reviewer, and merges both into a validated `review.json`. Refuses the gate while any finding is `blocking`. |
| `/koud:log <text>` | Appends a timestamped entry to `challenges.md`, the running log of problems met and how they were solved. |

Each phase command ends at an approval gate and stops. `:check` and `:log` are the
exceptions: one is a repeatable audit, the other a running log.

## What each phase produces

Working documents land in `.koud/`; reader-facing ones land in `docs/`, `features/` and the
repository root — but only if you say so. See [Where files go](#where-files-go).

| Phase | Artifacts |
|---|---|
| `:brief` | `brief.json`, `brief.md` (scope, success criteria, core technology and tooling, constraints), `project.md` (the product and who it is for) |
| `:stack` | `stack.json`, `stack.md` — every slot with a source (`required`, `preferred`, `default`, `replacement`) and a reason |
| `:architect` | `architecture.json`, `docs/architecture.md`, `docs/data-model.md`, diagrams, plus `AGENTS.md` and `CLAUDE.md` blocks at the repository root |
| `:requirements` | `requirements.json`, `requirements.md`, `features/<slug>.feature` (executable Gherkin) |
| `:spec` | `specs/NNNN-<slug>/{requirements,design,tasks}.md` per must-have feature |
| `:build` | Application source code. Progress is read back from the checkboxes in each feature's `tasks.md`, not tracked a second way in `state.json` |
| `:ship` | `deploy.json` — per-service target, verified URL and verification method — plus the infrastructure and CI files |
| `:review` | `review.json`, `review.md` — findings classed `blocking`, `should-fix` or `post-release` |

The shape and rules of every payload are in [`docs/contracts.md`](docs/contracts.md).

## Where files go

`.koud/` belongs to the plugin. Everything else belongs to the project, and nothing is
written there without your answer.

`:init`, `:architect` and `:requirements` are the phases that want files outside `.koud/`
(`AGENTS.md`, `CLAUDE.md`, `docs/`, `features/`). Each one previews the list, stops, and
asks. You have two answers:

| Answer | What happens | When |
|---|---|---|
| Yes | The files are written where listed. You confirm the command in a permission prompt. | Your own project. |
| No | The same files are written under `.koud/out/`, at the same relative path. Nothing in the project moves, and later phases read them from there. | A repository shared with people who have not agreed to these files. |

The scripts enforce this, not just the instructions: an apply that would write outside
`.koud/` without `--allow-project-writes` or `--koud-only` exits with code 3 and writes
nothing. The same holds for replacing a brief that already exists (`--replace`).

A file the project already has under another letter case — `docs/ARCHITECTURE.md` when
the phase wants `docs/architecture.md` — is marked `!!` in the preview. On macOS and
Windows those are the same file, so "yes" would replace your document.

`.koud/backups/` holds a verbatim copy of every file a phase replaced. It is excluded from
Git by a rule in `.koud/.gitignore`, because a backup can contain an uncommitted edit you
never meant to publish. To keep the whole of `.koud/` out of a shared repository, add
`.koud/` to `.git/info/exclude`.

## Rules the validators enforce

These are mechanical, not conventions:

- Every success criterion has a statement someone could check. "Fast" is rejected.
- Every technology the brief requires carries a reason, and every core one is covered by a
  stack slot.
- A stack slot may not use a technology the brief forbids.
- Every date carries an explicit UTC offset. A floating `2027-01-15T17:00:00` is rejected.
- A success criterion no feature claims fails `:requirements`: nothing would be built to
  meet it.
- A requirement's `state`, when given, is `delivered` or `to_build`; a delivered one is
  rendered as a test expected to pass, not as work.
- An apply never writes outside `.koud/`, and never replaces an existing brief, without a
  flag recording the user's decision.
- A service marked `verified` in `deploy.json` must carry when and how it was verified.
- `:review` cannot reach its gate while any finding is `blocking`.

## Hooks

| Event | What it does |
|---|---|
| Session start | Injects the project, track, deadline, success criteria, approved phases, next phase and required technology. Silent in a project with no `.koud/`. |
| Before a file tool or a shell command | Denies reading secrets files (`.env`, private keys, keystores) and asks before editing them or running a command that names them. Templates such as `.env.example` pass. Only acts in a project with a `.koud/` directory. |
| Before a shell command | Turns three kinds of command into a permission prompt: an apply that writes outside `.koud/`, an apply that replaces the brief, and a deploy (`vercel deploy`, `gcloud run deploy`, `railway up`, `terraform apply`, `prisma migrate deploy` and the like). Only acts in a project with a `.koud/` directory. |
| Stop | When the session hit real failures and `challenges.md` was not updated, lists up to three of them and points at `/koud:log`. |

Every hook is written to never crash a session: on a corrupt state it prints one line and
exits cleanly.

## Status and limits

This is version 0.4.0.

- **Run on two real projects, short of deployment.** `:init` through `:build` have run in
  Claude Code on an existing monorepo and on an existing Next.js and Supabase application,
  the second time to add a new piece of work. A project started from an empty folder has
  not been tried yet, and neither have `:ship` and `:review`, which have only been
  exercised through the test suite and from the command line with example payloads.
- **In auto mode there is no permission prompt.** The consent hook answers "ask"; when
  Claude Code is approving tool calls on its own, it approves that too. What still holds
  in every mode: the scripts refuse to write outside `.koud/` or replace a brief without
  a flag recording the decision, and the commands tell the assistant to ask you in the
  conversation first. For `:build` and `:ship`, leave auto mode.
- **`--continuous` is an instruction, not a mechanism.** It tells the assistant when to
  stop; nothing in the scripts enforces it. The standing rules of `:build` (no push, no
  deploy, no remote migration, never on the default branch) are instructions too, backed
  only by the deploy prompt of the consent hook.
- **The frontend and backend skills are written around Next.js and FastAPI**, and cite one
  reference project. On an existing project the architect is told to describe the code and
  treat those skills as vocabulary; on a new project with another stack they only partly
  apply.
- **`:ship` falls back to Vercel and Cloud Run** when the brief requires no cloud. Treat
  its suggestion as a starting point.
- **The guards are tripwires, not a sandbox.** They catch the ordinary cases; a command
  built to evade them will.

Planned next: questions specific to a project that contains an AI agent (narrow tools, an
evaluation set, manipulation attempts, a cost ceiling), stack-neutral architecture skills,
a browser test loop and a security audit phase.

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
