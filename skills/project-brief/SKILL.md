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
  "identity": { "name": "…", "one_liner": "…" },
  "problem": "…",
  "audience": [{ "name": "…", "who": "…", "need": "…" }],
  "goals": ["…"],
  "non_goals": ["…"],
  "criteria": { "items": [{ "rank": 1, "id": "…", "name": "…", "statement": "…" }] },
  "tech": {
    "required": [{ "name": "…", "one_of": ["…"], "reason": "…" }],
    "forbidden": [{ "name": "…", "reason": "…" }],
    "preferred": [{ "name": "…", "reason": "…" }]
  },
  "constraints": { "hosting": "…", "budget": "…", "compliance": ["…"] },
  "dates": [{ "label": "…", "at": "2027-01-15T17:00:00+01:00", "kind": "hard" }],
  "unresolved": ["…"]
}
```

## Field by field

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

**`tech.required`** — technology that is not up for discussion, each with a `reason`.

- On the `new` track this is what the user, the client or the organisation imposes. An
  empty array is a real answer and is allowed; a missing one is not.
- On the `existing` track this is what the code already uses, with the evidence as the
  reason: `"already in the codebase: package.json, prisma/schema.prisma"`.
- Use `one_of` when several options satisfy the constraint ("a managed PostgreSQL":
  Supabase, Neon, RDS). `:stack` must then choose one of them.

**`tech.forbidden` and `tech.preferred`** — forbidden is a hard no; preferred is a default
that `:stack` follows unless it states a reason not to.

**`dates`** — optional. At most one `hard` date, the delivery deadline. Every `at` carries
an explicit UTC offset.

**`unresolved`** — questions nobody could answer yet. Writing a question here is always
better than guessing: a guess becomes a fact the moment the brief is approved.

## Reading an existing repository

Evidence first, in this order: dependency manifests and lockfiles, framework
configuration, database schema or migrations, deployment and CI configuration, then the
README. State only what you found, and where. Two traps:

- **A dependency is not a usage.** A package listed in a manifest may be dead. Prefer
  what the code imports and what the configuration wires up.
- **The README describes an intention.** When it disagrees with the code, the code is the
  fact and the disagreement goes into `unresolved`.

## Before you present it

Read the one-liner and the top-ranked criterion aloud, one after the other. If the
criterion does not obviously follow from the one-liner, one of the two is wrong.
