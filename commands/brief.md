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
lockfiles, the configuration, the README and the directory layout. Prefer a targeted
search to opening a whole file. What the code already uses goes into `tech.required`,
each with a `reason` that says where you saw it
(`"already in the codebase: package.json, prisma/schema.prisma"`). Never write a
technology you did not find evidence for, and never assume a stack from the project's
name or from another project.

**Never read a secrets file.** No `.env`, `.env.local`, private key or credentials file:
nothing in a brief needs their values. Variable names come from `.env.example` or from the
deployment documentation. A hook refuses the read; do not work around it.

Then ask the user for what no file can tell you. Ask in one batch, not one question at a
time, and skip anything the user already said:

1. Does this brief cover the whole product at its current stage, or one piece of work on
   it? (This becomes `scope`.)
2. What is it, in one sentence?
3. What problem does it solve, and for whom?
4. What must be true for it to count as done? (These become the success criteria.)
5. What is deliberately out of scope?
6. Is any technology imposed, forbidden or preferred — and why?
7. Is there a delivery date, a budget or a compliance constraint?

If the user cannot answer something, do not invent an answer: record the question in
`unresolved`. "Nothing formal" is not the same as "nothing applies" — a constraint the
user has not checked stays an open question.

## Step 3 — Write the draft

Write the payload to `.koud/brief.draft.json`, **not** to `brief.json`. Applying from a
draft is what lets a re-run back up the previous brief instead of silently replacing it.
The `project-brief` skill has the shape and what makes each field good;
`${CLAUDE_PLUGIN_ROOT}/docs/contracts.md` has every validation rule. The rules that
matter most, because they are where briefs go wrong:

- **Every success criterion has a `statement` anyone could check** — "a first-time user
  finds X in under thirty seconds", not "easy to use".
- **Say what kind each criterion is.** A property of the product that a test or a review
  can confirm is `"kind": "system"`. A result in the world — real users, real payments —
  is `"kind": "outcome"`: the build can make it possible, only use can confirm it.
- **Separate what the product is made of from what merely helps build it.** A framework,
  a database, a runtime or a host is `"role": "core"`. A test runner, a linter, a CSS
  utility or a data-fetching library is `"role": "tooling"`: recorded, kept, but not
  something `:stack` must justify slot by slot.
- **Every required technology has a `reason`.** A constraint with no reason outlives the
  fact that justified it.
- **Every date carries an explicit UTC offset.** A floating `2027-01-15T17:00:00` is a
  different instant in every time zone.

## Step 4 — Validate

`node ${CLAUDE_PLUGIN_ROOT}/scripts/brief.mjs validate .koud/brief.draft.json`

The script prints every problem at once. Fix them all, then re-run. **At most two
retries** — a third is a loop, not a fix, so stop and show the user the errors.

## Step 5 — Preview, then apply

`node ${CLAUDE_PLUGIN_ROOT}/scripts/brief.mjs apply . --brief .koud/brief.draft.json --dry-run`

If it reports it would overwrite an existing `brief.json`, `brief.md` or `project.md`,
tell the user which files **before** applying — on a first run there is nothing to
overwrite and it says nothing. Then:

`node ${CLAUDE_PLUGIN_ROOT}/scripts/brief.mjs apply . --brief .koud/brief.draft.json`

The apply backs up whatever it replaces, then removes the draft.

## Step 6 — Stop at the gate

Read back the scope, the one-liner, the success criteria in priority order — saying which
are checked before release and which only after — and the core technology. Say which
criteria and rankings are your proposal rather than the user's words. List anything in `unresolved` and ask the user to answer or accept each one.
Ask whether the brief is right. **Do not continue to `:stack` without an explicit yes.**
The phase is `awaiting_approval` and `:next` will not advance past it.
