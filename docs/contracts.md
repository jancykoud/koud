# Payload contracts

Every judgment phase writes one JSON payload, validates it, and only then renders anything
from it. This file is the shape of each payload: what an agent must write, and the rules
the validators enforce. The validators in `scripts/lib/*-schema.mjs` are the source of
truth — when this file and a validator disagree, the validator is right and this file has
a bug.

| Phase | Payload | Validator |
|---|---|---|
| `:brief` | `.koud/brief.json` | `scripts/lib/brief-schema.mjs` |
| `:stack` | `.koud/stack.json` | `scripts/lib/stack-schema.mjs` |
| `:architect` | `.koud/architecture.json` | `scripts/lib/architecture-schema.mjs` |
| `:requirements` | `.koud/requirements.json` | `scripts/lib/requirements-schema.mjs` |
| `:ship` | `.koud/deploy.json` | `scripts/lib/deploy-schema.mjs` |
| `:review` | `.koud/review.json` | `scripts/lib/review-schema.mjs` |

The contracts for `stack.json`, `architecture.json`, `requirements.json`, `deploy.json`
and `review.json` come from the design documents of
[win-hackathon](https://github.com/rogerjeasy/win-hackathon) by Roger Jeasy Bavibidila,
adapted here to projects that are not hackathon entries.

## `.koud/brief.json`

The one description of the project. Everything downstream reads it: `:stack` for the
technology constraints, `:requirements` for the success criteria, `:check` for what the
code must really use.

```jsonc
{
  "schema_version": 1,
  "track": "new",                               // new | existing
  "identity": {
    "name": "Care Circle",
    "one_liner": "One shared record for a family coordinating the care of a relative."
  },
  "problem": "Families keep the care plan in group chats and paper notes; nobody is sure they act on the latest version.",
  "audience": [
    { "name": "Coordinating relative", "who": "An adult child organising care from another city",
      "need": "One record every family member and caregiver sees" }
  ],
  "goals": ["A family can run a relative's care from one shared record"],
  "non_goals": ["Clinical decision support or medical advice"],

  "criteria": {
    "items": [
      { "rank": 1, "id": "technical-implementation", "name": "Technical implementation",
        "statement": "A member of one care circle cannot read another circle's record through any route." }
    ]
  },

  "tech": {
    "required":  [{ "name": "AWS Database", "one_of": ["Aurora PostgreSQL", "DynamoDB"],
                    "reason": "The organisation's data must stay in one AWS account." }],
    "forbidden": [],
    "preferred": [{ "name": "v0", "reason": "Fastest route to a first interface." }]
  },

  "constraints": { "hosting": "Vercel for the front end", "budget": "…", "compliance": ["…"] },
  "dates": [{ "label": "First usable version", "at": "2027-01-15T17:00:00+01:00", "kind": "hard" }],
  "unresolved": []
}
```

**Validation rules**

| Rule | Severity | Why |
|---|---|---|
| `track` is `new` or `existing` | **error** | The two tracks treat technology differently: chosen on one, read from the code on the other |
| `identity.name` and `identity.one_liner` are non-empty | **error** | Every later phase quotes them |
| `identity.one_liner` is at most 160 characters | warning | Past that it is no longer one line on a status board |
| `problem` is non-empty | **error** | A project with no stated problem cannot be scoped |
| `audience` has at least one entry, each with `name` and `need` | **error** | A persona without a need is a label nothing can be traced to |
| `goals` is a non-empty array | **error** | |
| `non_goals` is present | **error** | Missing means the scope was never discussed |
| `non_goals` is non-empty | warning | |
| `criteria.items` has at least one entry | **error** | `:requirements` builds toward these |
| Each criterion has a slug `id`, a `name` and a `statement` | **error** | The statement is what a reviewer checks the product against |
| Criterion ids are unique; ranks are contiguous from 1 | **error** | The id is a join key; the rank decides conflicts |
| `tech.required` is present (empty is allowed) | **error** | Empty is an answer; missing means nobody asked |
| Each `tech.required` entry has a `name` and a `reason` | **error** | A constraint with no reason outlives the fact that justified it |
| `one_of`, when present, is a non-empty array of strings | **error** | `:stack` must pick one of them |
| Each date has a `label`, an `at` with an explicit UTC offset, and a `kind` of `hard` or `milestone` | **error** | A floating time is a different instant in every zone |
| At most one date is `hard` | **error** | One delivery deadline |
| `unresolved` is non-empty | warning | Each open question is answered or accepted before approval |
| Unknown top-level keys | warning | Kept, not validated |

On the `existing` track, `tech.required` is what the code already uses, and each `reason`
names the evidence (`"already in the codebase: package.json, prisma/schema.prisma"`).

## `.koud/stack.json`

Every slot records what filled it and why it could not have been otherwise. `source` is the
brief-first precedence made mechanical.

```jsonc
{
  "schema_version": 1,
  "repo_shape": "next-monolith",              // | "multi-service"
  "shape_rationale": "Server actions cover every write; no second deployable earns its keep.",

  "slots": [
    {
      "id": "database",
      "choice": "Amazon Aurora DSQL",
      "source": "required",                    // required | default | preferred | replacement
      "requirement_ref": "aws-database",       // → requirementKey(brief.tech.required[i]); required only
      "rationale": "Multi-region active-active is the availability claim the thesis rests on.",
      "thesis_support": "carries"              // carries | supports | neutral
    },
    {
      "id": "frontend",
      "choice": "Next.js 16 + TypeScript + Tailwind + shadcn/ui",
      "source": "default",
      "rationale": "Personal default; fills an open slot the rules leave unspecified.",
      "thesis_support": "neutral"
    }
  ],

  "bleeding_edge": [
    { "slot": "frontend", "package": "next", "pin": "16.x",
      "docs_path": "node_modules/next/dist/docs/" }
  ],

  "rejected": [
    { "slot": "database", "choice": "DynamoDB",
      "why_not": "The access pattern is relational and transactional; single-table would fight it." }
  ]
}
```

#### Validation rules

| Rule | Severity | Why |
|---|---|---|
| Every `brief.tech.required[]` id is covered by a slot with `source: "required"` | **error** | A technology the brief requires and no slot claims is not the project that was asked for |
| No slot `choice` matches anything in `brief.tech.forbidden[]` | **error** | Same reason |
| At least one slot has `thesis_support: "carries"` | **error** | If nothing carries the thesis, the brief.s one-liner has no architecture behind it |
| `repo_shape` is one of the two known shapes | error | `monorepo-structure` only has playbooks for two |
| Every slot has a non-empty `rationale` | error | A slot with no reason is an undocumented default |
| `source: "required"` slot has a `requirement_ref` | error | Traceability into `brief.json` |
| Every `requirement_ref` resolves to an uncovered `brief.tech.required[]` entry, and if that entry carries `one_of`, the slot's `choice` matches one of those options | error | A declared `requirement_ref` that does not resolve, or resolves to a choice outside the sponsor's allowed set, is decorative traceability |
| `bleeding_edge[]` entry has a `docs_path` | warning | The drift banner needs somewhere to point |
| `brief.json` absent | warning | Required/forbidden checks skipped; state the reason plainly |

`brief.tech.required[]`/`forbidden[]` entries carry a human `name` (e.g. `"AWS Database"`),
not a stable `id` — brief extraction never mints one. `requirement_ref` needs something
short and stable to point at, so `stack-schema.mjs` derives it deterministically:
`requirementKey(entry)` returns an explicit `entry.id` when present, otherwise a lowercase,
hyphenated slug of `entry.name` (non-alphanumeric runs collapse to one `-`, trimmed at both
ends). A `required` entry may also carry `one_of: string[]` — the choices the brief allows
for that mandate (e.g. multiple acceptable databases). When present, the covering slot's
`choice` must case-insensitively contain at least one of those options, or validation fails
even though the `requirement_ref` resolves: naming the mandate is not the same as satisfying
it.

The thesis check is the one that earns the most. The failure it guards against is the classic one:
"a product promise the architecture does not actually support"; this makes
that failure mechanical instead of a matter of taste.

## `.koud/architecture.json`

One graph, six consumers.

```jsonc
{
  "schema_version": 1,
  "thesis_line": "The database is the thesis, not a default.",
  "context_bar": {
    "track": "Monetizable B2C",
    "primary_database": "Amazon Aurora PostgreSQL (Serverless v2 — RLS · pgvector)",
    "ai": "Amazon Bedrock — Claude Sonnet 4.5 + Titan embeddings",
    "frontend": "Next.js on Vercel"
  },

  "components": [
    {
      "id": "web", "label": "Next.js on Vercel", "tier": 1, "kind": "frontend",
      "what_it_is": "The single deployable surface.",
      "what_it_does": "Serves marketing and the authenticated app; server actions do the writes.",
      "why_this_choice": "One deployable removes a network hop from every mutation.",
      "stack_slot": "frontend",
      "trust_zone": "public"                  // public | authenticated | privileged | external
    }
  ],

  "edges": [
    { "from": "web", "to": "db", "label": "RLS-scoped transaction", "crosses_boundary": true }
  ],

  "trust_boundaries": [
    { "id": "aws", "label": "AWS account boundary", "contains": ["db", "s3", "bedrock"] }
  ],

  "flows": [
    { "id": "ask", "title": "Ask — the RAG pipeline", "steps": ["…", "…"] }
  ],

  "entities": [
    {
      "name": "care_circle", "group": "identity-and-tenancy",
      "purpose": "The tenant. Everything else hangs off it.",
      "tenant_scoped": false,
      "fields": [{ "name": "id", "type": "uuid", "note": "primary key" }],
      "relationships": [{ "to": "membership", "kind": "one-to-many" }]
    }
  ],

  "access_control": {
    "model": "rls",                            // rls | app-layer | none
    "session_context": "app.current_user_id",
    "capability_matrix": [
      { "role": "owner", "can": ["read:all", "write:all", "invite"] }
    ],
    "policies": [
      { "id": "tenant-isolation", "applies_to": ["care_circle", "membership"],
        "rule": "row visible only when the circle is in the caller's membership set" }
    ]
  },

  "invariants": [
    { "id": "protected-by-default",
      "statement": "Every authenticated page lives under the (app) route group, whose layout runs requireSession().",
      "enforced_by": "src/app/(app)/layout.tsx" }
  ],

  "design_system": {
    "personality": "Calm, warm, human, dignified. Quiet confidence.",
    "anti_generic": ["no purple/indigo gradients", "no neon", "no glassmorphism everywhere",
                     "no emoji as UI icons", "avoid pure #000 on #FFF"],
    "tokens": {
      "light": { "background": "#FBFAF8", "primary": "#0F766E", "accent": "#EC7C5A" },
      "dark":  { "background": "#101512", "primary": "#14B8A6", "accent": "#F0916F" }
    },
    "type": { "ui": "Inter", "display": "Fraunces", "base_px": 16, "min_meaningful_px": 14 },
    "breakpoints_px": [375, 820, 1024, 1440]
  }
}
```

`tier` is an integer and it is what makes deterministic layout possible: tier 1 is the top
row, tier *n* sits below it, edges flow downward, components within a tier space evenly across
the canvas. That is the layout a hand-drawn tiered diagram has, so generated output lands in
the same visual family rather than looking like a graph library's output.

#### The six consumers

| Consumer | Reads |
|---|---|
| `docs/architecture.md` | `context_bar`, `thesis_line`, `components`, `flows`, `invariants`, `design_system`, plus the Mermaid diagram |
| `docs/data-model.md` | `entities`, `access_control` |
| `docs/assets/architecture.{mmd,svg,drawio}` | `components`, `edges`, `trust_boundaries` |
| `AGENTS.md` | `invariants` (statement + `enforced_by`), `bleeding_edge` from `stack.json` |
| `:build` | `design_system`, `components`, `invariants` |
| `compliance-checker` | `components[].stack_slot`, `invariants` |

#### Validation rules

| Rule | Severity |
|---|---|
| Every `edges[].from` / `.to` resolves to a component id | **error** |
| Every `trust_boundaries[].contains[]` entry resolves to a component id | **error** |
| `tier` is a positive integer, and tiers form a gapless sequence from 1 | **error** |
| Every `invariants[].enforced_by` is a non-empty path or symbol | **error** — an invariant nobody enforces is a wish |
| `access_control.model == "rls"` ⟹ every `tenant_scoped` entity is named by at least one policy | **error** — this is the check that catches a new table shipped without a policy |
| Every `components[].stack_slot` exists in `stack.json` | error when `stack.json` present, warning when absent |
| Component ids and entity names are unique | error |
| `design_system.tokens` defines both `light` and `dark` | warning |
| At least one component's `stack_slot` names a slot whose `thesis_support` is `"carries"` | warning — the thesis has a technology behind it but no component realising it |

## `.koud/requirements.json`

Scenarios are structured rather than prose, which is what lets Gherkin render mechanically
instead of being written twice.

```jsonc
{
  "schema_version": 1,
  "features": [
    {
      "id": "F1", "slug": "shared-care-record", "title": "One shared care record",
      "priority": "must",                         // must | should | wont
      "criterion_refs": ["technical-implementation", "design"],
      "component_refs": ["web", "db"],
      "user_story": {
        "as_a": "an adult child coordinating care from another city",
        "i_want": "one record every family member and caregiver sees",
        "so_that": "nobody acts on a stale copy"
      },
      "requirements": [
        { "id": "FR-1.1",
          "statement": "A member sees only circles they belong to.",
          "invariant_refs": ["tenant-isolation"] }
      ],
      "scenarios": [
        { "id": "FR-1.1-S1", "name": "A non-member cannot read the record",
          "requirement_ref": "FR-1.1",
          "given": ["a circle owned by another family"],
          "when": ["I request that circle's timeline"],
          "then": ["the response is empty", "an audit row records the attempt"],
          "tags": ["@must", "@security"] }
      ],
      "demo_moment": true
    }
  ],
  "non_functional": [
    { "id": "NFR-1", "statement": "First contentful paint under 2s on the demo path.",
      "verify": "Lighthouse run recorded in the runbook" }
  ]
}
```

#### Validation rules

| Rule | Severity |
|---|---|
| Every success criterion in `brief.json` is claimed by at least one `must` feature | **error** — a success criterion with nothing built against it is a promise the product will not keep |
| A criterion claimed only by `should` / `wont` features | warning |
| Every `criterion_refs[]` entry exists in the brief | **error** when brief present |
| Every `must` feature has at least one scenario | **error** |
| `requirements[].id` unique and matching `^FR-\d+\.\d+$` | error |
| `scenarios[].requirement_ref` resolves within its own feature | error |
| `component_refs[]` resolve into `architecture.json` | error when present, warning when absent |
| `invariant_refs[]` resolve into `architecture.json.invariants` | error when present, warning when absent |
| Each scenario has non-empty `given`, `when` and `then` arrays | error |
| At least one feature has `demo_moment: true` | warning |
| Feature `slug` unique and filesystem-safe | error — it becomes a filename in three places |

---


## `.koud/deploy.json`

```jsonc
{
  "target_strategy": "vercel" | "cloud-run" | "railway" | "render" | "aws" | "docker-compose",
  "services": [
    {
      "name": "web",
      "kind": "frontend" | "backend" | "agent" | "worker",
      "target": "vercel",
      "dockerfile": "web/Dockerfile",        // null when the target has no image (e.g. Vercel)
      "url": "https://…",
      "verified": true,
      "verified_at": "2026-09-01T02:14:00Z",
      "verification_method": "curl -sf <url> (exit 0)"
    }
  ],
  "infra": {
    "terraform_modules": ["network", "database", "iam"],
    "state_backend": "local" | "remote"
  },
  "cicd": {
    "workflows": [".github/workflows/deploy-web.yml"],
    "auth": "wif" | "oidc" | "static-secret"
  }
}
```

**Validation rules (`deploy-schema.mjs`):**

- Every entry in `stack.json`'s slot table that is a deployable service must have a matching
  `services[]` entry — a validated stack with an undeployed frontend fails validation before
  the file is written, the same "nothing is silently dropped" rule `requirements-schema.mjs`
  already enforces for success criteria.
- `verified: true` requires a non-null `verified_at` and `verification_method` — the schema
  itself makes "shipped on faith" structurally impossible, not just discouraged in prose.
- `auth: "static-secret"` is valid (a degraded path exists) but `:ship`'s command file must
  say plainly that this is a fallback, not the default — the parent design's "keyless cloud
  auth… no long-lived secrets in the repo" principle stays the target, not a requirement the
  schema silently drops.

`state.json.project.deploy = { "primary_url": "…" | null, "ref": ".koud/deploy.json" }`
mirrors `project.stack`'s digest-plus-ref shape exactly: the one fact hooks and `:status`
need without opening a second file, full rationale one hop away.

---


## `.koud/review.json`

```jsonc
{
  "schema_version": 1,
  "findings": [
    {
      "id": "REV-1",
      "source": "code-review" | "quality-reviewer",
      "severity": "blocking" | "should-fix" | "post-release",
      "title": "Protected-by-default route group missing on /admin/reports",
      "summary": "…",
      "file": "src/app/admin/reports/page.tsx",   // nullable — architecture findings may cite no single file
      "line": 14,                                  // nullable
      "user_visible": true
    }
  ]
}
```

**Validation rules (`review-schema.mjs`):**

- Every finding needs a unique `id`, a `source` and `severity` from the enums above, and a
  non-empty `title` + `summary`. `file`/`line` are nullable — an architecture-level finding
  ("no invariant enforces tenant isolation on the new export route") may not reduce to one
  call site.
- No `verdict` field is stored. Whether the review is clean is `!findings.some(f =>
  f.severity === 'blocking')`, computed at render time and at the `:review` gate — storing
  it separately is exactly the two-sources-of-truth class of bug that is expensive to close after the fact.
- `user_visible` is required, not inferred at render time, because the person best placed
  to decide "is this on a real user.s path" is the reviewer with the diff in front of it, not a
  renderer working from a boolean-free finding after the fact.

**Classification rule**, codified in the `quality-reviewer` agent prompt and the
`/code-review` invocation's own framing rather than the schema (the schema only constrains
the *shape*, not who calls something blocking): **blocking** = a correctness bug or
security-invariant violation reachable from a real user.s path (the deployed product, the
README.s instructions) or a required technology the code claims to use and does not; **should-fix** = real
but off that path, or a simplification/efficiency finding with concrete impact;
**post-release** = a nice-to-have, style, or no-user-visible-effect refactor. `review.md`
orders findings blocking-first, then by `user_visible` within each severity — not by file
path.

---
