---
description: Describe the project once — what it is, who it is for, how success is judged and which technology is imposed — so no later phase has to ask again
argument-hint: "[--track new|existing]"
allowed-tools: Bash, Read, Write, Glob, Grep
---

Write the project brief.

Load the `project-brief` skill before starting.

The brief is the only place this project is described. Every later phase reads
`.koud/brief.json` instead of asking the user again, so a gap left here comes back as the
same question in `:stack`, `:architect` and `:requirements`.

## Step 1 — Decide the track

- **`new`** — the project starts from an idea. Nothing is imposed that the user does not
  state.
- **`existing`** — the repository already has code. The stack is a fact to be read, not a
  choice to be made.

If `$ARGUMENTS` names a track, use it. Otherwise look: a repository with source files and
a dependency manifest is `existing`. Say which track you chose and why, in one sentence.

## Step 2 — Gather, asking only what you cannot find

**On the `existing` track, read before you ask.** Read the dependency manifests, the
lockfiles, the configuration, the README and the directory layout. What the code already
uses goes into `tech.required`, each with a `reason` that says where you saw it
(`"already in the codebase: package.json, prisma/schema.prisma"`). Never write a
technology you did not find evidence for, and never assume a stack from the project's
name or from another project.

Then ask the user for what no file can tell you. Ask in one batch, not one question at a
time, and skip anything the user already said:

1. What is it, in one sentence?
2. What problem does it solve, and for whom?
3. What must be true for it to count as done? (These become the success criteria.)
4. What is deliberately out of scope?
5. Is any technology imposed, forbidden or preferred — and why?
6. Is there a delivery date, a budget or a compliance constraint?

If the user cannot answer something, do not invent an answer: record the question in
`unresolved`.

## Step 3 — Write the payload

Write `.koud/brief.json`. The `project-brief` skill has the shape and what makes each
field good; `${CLAUDE_PLUGIN_ROOT}/docs/contracts.md` has every validation rule. Three rules the validator enforces because they are where briefs go wrong:

- **Every success criterion has a `statement` anyone could check** — "a first-time user
  finds X in under thirty seconds", not "easy to use".
- **Every required technology has a `reason`.** A constraint with no reason outlives the
  fact that justified it.
- **Every date carries an explicit UTC offset.** A floating `2027-01-15T17:00:00` is a
  different instant in every time zone.

## Step 4 — Validate

`node ${CLAUDE_PLUGIN_ROOT}/scripts/brief.mjs validate .koud/brief.json`

The script prints every problem at once. Fix them all, then re-run. **At most two
retries** — a third is a loop, not a fix, so stop and show the user the errors.

## Step 5 — Preview, then apply

`node ${CLAUDE_PLUGIN_ROOT}/scripts/brief.mjs apply . --dry-run`

If it reports it would overwrite an existing `brief.json`, `brief.md` or `project.md`,
tell the user which files **before** applying. Then:

`node ${CLAUDE_PLUGIN_ROOT}/scripts/brief.mjs apply .`

## Step 6 — Stop at the gate

Read back the one-liner, the success criteria in priority order, and the required
technology. List anything in `unresolved` and ask the user to answer or accept each one.
Ask whether the brief is right. **Do not continue to `:stack` without an explicit yes.**
The phase is `awaiting_approval` and `:next` will not advance past it.
