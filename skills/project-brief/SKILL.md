---
name: project-brief
description: Use at :brief — how to write the one description of a project that every later phase reads, so nothing has to be explained twice
---

# What the brief is for

A project gets described once. `:stack` reads the brief for what technology is imposed,
`:requirements` reads it for what success means, `:check` reads it to verify the code
kept its promises, and the session hook quotes it at the start of every conversation.
Whatever is vague here is vague five times.

The test for every field: **could a later phase act on this without asking a question?**

## The shape

```json
{
  "schema_version": 1,
  "track": "new",
  "scope": "…",
  "identity": { "name": "…", "one_liner": "…" },
  "problem": "…",
  "audience": [{ "name": "…", "who": "…", "need": "…" }],
  "goals": ["…"],
  "non_goals": ["…"],
  "criteria": { "items": [{ "rank": 1, "id": "…", "name": "…", "statement": "…", "kind": "system" }] },
  "tech": {
    "required": [{ "name": "…", "role": "core", "one_of": ["…"], "reason": "…" }],
    "forbidden": [{ "name": "…", "reason": "…" }],
    "preferred": [{ "name": "…", "reason": "…" }]
  },
  "constraints": { "hosting": "…", "budget": "…", "compliance": ["…"] },
  "dates": [{ "label": "…", "at": "2027-01-15T17:00:00+01:00", "kind": "hard" }],
  "unresolved": ["…"]
}
```

## Field by field

**`scope`** — optional, and worth filling on an existing repository: does this brief
describe the whole product at its current stage, or one piece of work on it? Ask before
writing anything else; the answer changes how much of the code the brief speaks for.

**`identity.one_liner`** — what the product does for whom, in one sentence under 160
characters. Not a slogan. "One shared record for a family coordinating the care of a
relative" tells `:architect` what the system must guarantee; "Care, reimagined" tells it
nothing. `:stack` asks which technology makes this sentence true.

**`problem`** — the situation today and what it costs, stated so that someone outside the
project recognises it. If the problem could be pasted into another project's brief
unchanged, it is not specific enough.

**`audience`** — one entry per kind of user, each with a `need`. A persona without a need
is a label: no feature can be traced back to it.

**`goals` and `non_goals`** — goals are outcomes, not features ("a caregiver knows today's
medication without calling the family", not "a medication page"). Non-goals are the things
a reasonable person would expect and will not get. An empty `non_goals` means the scope
was never discussed; the validator warns on it.

**`criteria.items`** — how the finished product is judged. Three to five is typical.

- `id` is a lowercase slug; every feature in `:requirements` points at it, so it never
  changes once approved.
- `statement` is the check itself: an observable fact with a threshold. "Fast" is not a
  criterion. "The first page renders in under two seconds on a mid-range phone" is.
- `rank` is the priority order, contiguous from 1. When two criteria pull in different
  directions, the lower rank wins — decide that here, calmly, not in the middle of a build.
- `kind` says how the criterion can be confirmed. `system` (the default) is a property of
  the product: a test or a review settles it before release. `outcome` is a result in the
  world — "each of the four doctors has received one paid consultation" — that only real
  use can confirm. Both are legitimate; mixing them up is not. An outcome criterion still
  needs features that make it possible, and the build is done when those features work,
  not when the outcome has happened.

**`tech.required`** — technology that is not up for discussion, each with a `reason`.

- On the `new` track this is what the user, the client or the organisation imposes. An
  empty array is a real answer and is allowed; a missing one is not.
- On the `existing` track this is what the code already uses, with the evidence as the
  reason: `"already in the codebase: package.json, prisma/schema.prisma"`.
- `role` separates what the product is made of from what helps build it. `core` (the
  default): the framework, the database, the runtime, the host — replace one and you are
  rewriting the product. `tooling`: the test runner, the linter, the CSS utility, the
  data-fetching library — replaceable without changing what the product does. `:stack`
  must cover every core entry with a slot; tooling is recorded and left alone. On an
  existing repository, listing every dependency as core makes the stack phase a
  bureaucratic exercise: reserve it for the handful of choices everything else rests on.
- Use `one_of` when several options satisfy the constraint ("a managed PostgreSQL":
  Supabase, Neon, RDS). `:stack` must then choose one of them.

**`tech.forbidden` and `tech.preferred`** — forbidden is a hard no; preferred is a default
that `:stack` follows unless it states a reason not to.

**`dates`** — optional. At most one `hard` date, the delivery deadline. Every `at` carries
an explicit UTC offset.

**`unresolved`** — questions nobody could answer yet. Writing a question here is always
better than guessing: a guess becomes a fact the moment the brief is approved.

## Reading an existing repository

**Never read a secrets file** — `.env`, `.env.local`, private keys, credentials. Nothing in
a brief needs their values; variable names are in `.env.example` and in the deployment
documentation.

Evidence first, in this order: dependency manifests and lockfiles, framework
configuration, database schema or migrations, deployment and CI configuration, then the
README. State only what you found, and where. Two traps:

- **A dependency is not a usage.** A package listed in a manifest may be dead. Prefer
  what the code imports and what the configuration wires up.
- **The README describes an intention.** When it disagrees with the code, the code is the
  fact and the disagreement goes into `unresolved`.

- **A value is read or it is absent.** An amount, a threshold, a count: if it is in the
  code, a seed file or a test fixture, say which — a test value is not a product fact. If
  it is nowhere, do not supply one.

## A re-run replaces something the user approved

When `.koud/brief.json` already exists, the new brief is a change to an agreed document.
Ask what the new fields need instead of filling them in, show only what differs, and wait
for a yes before replacing it. The previous brief is backed up, but a backup is for
recovery, not a licence to overwrite.

## Before you present it

Read the one-liner and the top-ranked criterion aloud, one after the other. If the
criterion does not obviously follow from the one-liner, one of the two is wrong.
