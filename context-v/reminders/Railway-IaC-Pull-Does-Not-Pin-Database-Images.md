---
title: "railway config pull does not pin database images — read the plan"
lede: "A pulled Railway IaC config re-declares every postgres() and redis() at the helper's default version. Applying it unchanged proposes a major-version upgrade on live databases."
date_created: 2026-08-09
date_modified: 2026-08-09
authors:
  - Michael Staton
augmented_with:
  - Claude Code on Claude Opus 5
semantic_version: 0.0.0.1
status: Draft
tags:
  - Reminder
  - Railway
  - Infrastructure-As-Code
  - Postgres
  - Near-Miss
site_uuid: dffe18e3-c0a5-4a93-baf0-23ce7cff8a4c
hex_code: w7jdux
date_authored_initial_draft: 2026-08-09
date_authored_current_draft: 2026-08-09
publish: true
---

# `railway config pull` does not pin database images

## The near-miss (2026-08-09)

Adding one backup service to `reach-edu` via Railway IaC. Ran
`railway config pull`, added a `pg-dump-outline` block, ran `railway config plan`:

```
Plan: 1 to add, 7 to change, 0 to destroy
  + Create service pg-dump-outline
  ~ Update twenty-postgres   source.image (unset → "postgres:18")
  ~ Update outline-postgres  source.image (unset → "postgres:18")
  ~ Update postiz-postgres   source.image (unset → "postgres:18")
  ~ Update temporal-postgres source.image (unset → "postgres:18")
  ~ Update twenty-redis      source.image (unset → "redis:8")
  ~ Update outline-redis     source.image (unset → "redis:8")
  ~ Update postiz-redis      source.image (unset → "redis:8")
```

Those databases were on **16 / 17-alpine** and Redis **7 / 7.2**, all with live
volumes. A Postgres major-version bump is **not an upgrade** — the on-disk data
directory format is incompatible, so the new server refuses to start on the old
volume. Applying would have taken down every database in the project, including
a CRM with real client data.

Nothing in the pull warned about it. The `postgres()` and `redis()` IaC helpers
emit no image, and Railway resolves "no image" to *latest* at apply time.

## The rule

**Never `railway config apply` without reading the plan line by line.** The
service you intended to add will be one line among several you did not intend.

Before applying, pin every database to what is actually running:

```bash
railway service list --json | python3 -c "…"   # read the real images first
```

```ts
twentyPostgres.source   = image("postgres:16");
temporalPostgres.source = image("postgres:16");
outlinePostgres.source  = image("postgres:16");
postizPostgres.source   = image("postgres:17-alpine");
twentyRedis.source      = image("redis:7");
outlineRedis.source     = image("redis:7");
postizRedis.source      = image("redis:7.2");
```

Then re-plan. **The only acceptable plan is one where every line is a change you
asked for** — in that case `1 to add, 0 to change, 0 to destroy`.

## Second trap in the same tool

**IaC deletes variables the file does not declare.** Anything set with
`railway variable set` after a pull is absent from the file and is removed on the
next apply. Declare secrets as `preserve()` so they survive:

```ts
env: {
  AWS_ACCESS_KEY_ID:     preserve(),
  AWS_SECRET_ACCESS_KEY: preserve(),
  BACKUP_DATABASE_URL:   preserve(),
}
```

The plan does show these as `- Delete variable …`, which is another reason to
read it rather than skim it.

## Why we use IaC at all

`railway add -r <github repo>` returns `Unauthorized` even with a valid session —
creating a GitHub-sourced service needs the Railway GitHub App scope the CLI
token doesn't carry. IaC is the only working path for those, so this trap is not
avoidable by preferring the CLI.

Setup note: `railway config` requires the **`railway`** npm package (not
`@railway/sdk`, not `railway-ts-sdk`) installed in the directory containing
`.railway/railway.ts`.

## Related

- `client-stacks/reach-edu/outline/stack.md` — where this was hit (gitignored)
- `docs/outline/setup.md` — the Outline runbook
- [[Normalize-Paths-Everywhere]]
