---
description: Pick a deploy target, write Dockerfiles/Terraform/CI, actually deploy, and verify every URL before the gate
allowed-tools: Bash, Read, Task
---

Ship the application.

## Step 1 — Check the inputs exist

`.koud/stack.json` must exist and be `approved`. If `:build` has not reached its own
gate, ask before shipping something unfinished — it is not this command's job to block
that outright, only to make sure the user is choosing it knowingly.

## Step 2 — Get a plan, and stop

Dispatch the `deploy-engineer` agent **in plan mode**: tell it to return a deployment plan
and to write nothing and deploy nothing yet. Tell it to start from
`node ${CLAUDE_PLUGIN_ROOT}/scripts/ship.mjs suggest .` for a deterministic per-slot target
before applying `deploy-targets`'s fuller judgment, and to find out first what is already
deployed — an existing project usually has a live environment, and its configuration is in
the repository.

**Stop here.** Show the user the plan:

- every service, its target, and **which environment** the deploy reaches — a preview, a
  staging service, or production that real users are on;
- every file that would be created or changed (Dockerfiles, `infra/`, workflows,
  `.env.example`), saying which already exist;
- every command that would run, in order;
- what it could not determine.

Ask whether to go ahead. If production is involved, ask about it by name: "this replaces
the production release of the API — yes?" A general yes to the plan is not a yes to that.

## Step 3 — Execute what was approved

Dispatch the `deploy-engineer` agent again with the approved plan. It writes the files the
user agreed to, deploys, and `curl`s every URL — it does not stop at "the config looks
right." Each deploy command prompts the user to confirm; that is deliberate. If the user
declines one, that service stays undeployed and is reported as such.

## Step 4 — Validate, then preview and apply

`node ${CLAUDE_PLUGIN_ROOT}/scripts/ship.mjs apply . --dry-run`

If it reports it would overwrite an existing `deploy.json`, say which files before
applying. Then:

`node ${CLAUDE_PLUGIN_ROOT}/scripts/ship.mjs apply .`

## Step 5 — A blocked deploy is not a failure to hide

If any service is not `verified: true` — missing CLI, missing auth, a failed build —
leave `phases.ship` at `in_progress` (do not run the apply above until every service the
agent could verify is verified), write a `resume_note` naming exactly what is blocking,
and tell the user what to run to unblock it. **A deploy that has not been fetched
successfully is not shipped.** Docker Compose is an acceptable target on its own, not only
a stopgap — degrading to it is a legitimate outcome, not a partial failure.

## Step 6 — Stop at the gate

Show the user every service's URL and verification status. Ask whether to proceed. **Do
not continue to `:review` without an explicit yes.**
