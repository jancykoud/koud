---
name: deploy-targets
description: Selection criteria and time-to-first-URL for Vercel, Cloud Run, Railway, Render, AWS, and Docker Compose
---

# Choosing a deploy target

**A cloud the brief requires always wins.** If a `stack.json` slot's `source` is `"required"`
and names a specific cloud, that slot deploys there — the same brief-first precedence
`:stack` already applies to technology choices applies here too. Everything below is the
table for slots the rules leave open.

## The table

| Target | Best for | Time to first URL | Notes |
|---|---|---|---|
| **Vercel** | Next.js frontends, `single-app` repos | Minutes | The default for any Next.js slot the brief does not constrain |
| **Cloud Run** | Containerized backends in a `multi-service` repo, GCP-adjacent stacks | ~10-20 min including image build | Scales to zero, good fit for a small project.s traffic profile |
| **Railway** | Fast multi-service deploys without writing Terraform | Minutes | Good fallback when time is tighter than the Cloud Run/Terraform path allows |
| **Render** | Similar to Railway; a reasonable alternative when the brief forbids Railway | Minutes | |
| **AWS** | AWS stacks the brief requires (Bedrock, Aurora, etc.) | Highest setup cost of the list | Budget more of the ship-phase hours here than for any other target |
| **Docker Compose** | Local-only fallback when no cloud CLI is usable, or a milestone validation run | Seconds | First-class, not a failure state — `:ship`'s own milestone check targets this |

## Evidence

Deploy target follows the stack the brief requires and the repo shape `:stack` already
chose — a `single-app` and a `multi-service` repo don't ship to the same place, and a
cloud the brief requires overrides either default. This table is a selection aid, not a
single recommendation, for that reason.
