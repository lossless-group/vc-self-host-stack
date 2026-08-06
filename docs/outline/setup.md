# Outline on Railway — per-client deployment runbook

**Status:** Living doc, first executed 2026-07-27 for `palmer-ai` (replacing
Docmost, which gates API keys behind an Enterprise license — see README's
Knowledge Management section). Per-client values live in
`client-stacks/<client>/outline/` (gitignored). No secret values here.

## Decisions this procedure encodes

- **Why Outline:** full REST API + API keys FREE in self-hosting (the Docmost
  dealbreaker), markdown-native documents, Notion-adjacent UX, existing MCP
  servers in the wild. License is BUSL (free self-host, converts to Apache
  per-version after 4 years).
- **Official image `outlinewiki/outline:<pinned-tag>`**, never `latest`.
- **Volume storage** (`FILE_STORAGE=local`, volume at `/var/lib/outline/data`)
  — single service, no S3 needed (same reasoning as Docmost had).
- **Volumeless redis** (Twenty pattern) — avoids the Railway-volume bgsave
  trap entirely; queue state is disposable.
- **`FORCE_HTTPS=false`** — Railway's edge terminates TLS.

## Topology

```
Railway project: <client>
  outline           outlinewiki/outline:<tag>   web+API+collab, port 3000, volume /var/lib/outline/data
  outline-postgres  postgres:16                 volume /var/lib/postgresql/data (PGDATA subdir /pgdata)
  outline-redis     redis:7                     start: `redis-server --maxmemory-policy noeviction`, NO volume
```

## Procedure

1. **Create services** (three, per topology). **Volumes + redis start command
   + domain (port 3000)** before any variable work.
2. **Secrets:** `SECRET_KEY` and `UTILS_SECRET` = `openssl rand -hex 32` each;
   postgres password `openssl rand -hex 24`. Write to
   `client-stacks/<client>/outline/.env` first.
3. **Variables** (literals via CLI `--skip-deploys`; composite URLs via MCP
   set_variables with `${{}}` refs):
   - `outline-postgres`: `POSTGRES_DB=outline`, `POSTGRES_USER=outline`,
     `POSTGRES_PASSWORD=<gen>`, `PGDATA=/var/lib/postgresql/data/pgdata`
   - `outline`: `NODE_ENV=production`, `PORT=3000`, `URL=<domain>`,
     `SECRET_KEY`, `UTILS_SECRET`, `PGSSLMODE=disable`, `FILE_STORAGE=local`,
     `FILE_STORAGE_LOCAL_ROOT_DIR=/var/lib/outline/data`,
     `FORCE_HTTPS=false`, `WEB_CONCURRENCY=1`,
     `DATABASE_URL=postgres://outline:${{outline-postgres.POSTGRES_PASSWORD}}@${{outline-postgres.RAILWAY_PRIVATE_DOMAIN}}:5432/outline`,
     `REDIS_URL=redis://${{outline-redis.RAILWAY_PRIVATE_DOMAIN}}:6379`
4. **CRITICAL — trigger fresh deployments, do NOT `railway redeploy`:**
   `railway redeploy` re-runs the OLD deployment spec and silently drops
   start-command/config changes (discovered the hard way on docmost-redis,
   2026-07-27). Instead set a throwaway variable WITHOUT `--skip-deploys`
   (convention: `CONFIG_EPOCH=<n>`) on each service — that mints a new
   deployment carrying the current service config.
5. **Verify by browser-drive:** root URL shows the first-run **"Create
   workspace"** screen (workspace name + admin name/email) — v1.9+ needs NO
   auth provider for bootstrap. Operator completes it live — the gate.
6. **Auth provider for subsequent logins** — one of:
   - Google OAuth: `GOOGLE_CLIENT_ID`/`GOOGLE_CLIENT_SECRET` (operator mints
     in GCP console; redirect URI `<URL>/auth/google.callback`)
   - SMTP magic links: `SMTP_HOST/PORT/USERNAME/PASSWORD/FROM_EMAIL`
     (Plunk once deployed, or any provider)
7. **API key** (the point of picking Outline): mint in-app after login →
   record as `OUTLINE_API_KEY` in the client `.env`; wire MCP from there.
8. **Write `client-stacks/<client>/outline/restore-runbook.md`.**

## Deltas observed per deployment

- **palmer-ai (2026-07-27):** first execution — this doc *is* the delta log.
  Booted healthy in under a minute; first-run setup screen rendered without
  any auth provider configured (docs elsewhere claiming a provider is
  required for bootstrap are stale for ≥1.9).

- **reach-edu (2026-08-06):** two traps, both costly, both now avoidable.

  1. **The Docker tag has no `v`.** GitHub releases Outline as `v1.9.2`; Docker
     Hub publishes `1.9.2`. `outlinewiki/outline:v1.9.2` does not exist and
     fails at image pull with **no useful log line** — the deployment just
     reads FAILED. **Read the tag off Docker Hub, never the GitHub release
     page.** Verify before deploying:
     `curl -s https://hub.docker.com/v2/repositories/outlinewiki/outline/tags/<tag>`

  2. **A failed first boot deadlocks every boot after it.** Before
     `checkPendingMigrations`, Outline takes a Redlock lock on the redis key
     `migrations` (TTL ~180s). A container that dies holding it leaves the lock
     live, and the next container's retry window is *shorter* than the TTL — so
     it logs `The operation was unable to achieve a quorum during its retry
     window` and quits, forever. Restarting only feeds the loop.

     **Break it:** stop the service (`railway down --service outline -y`), poll
     `railway ssh --service outline-redis -- redis-cli TTL migrations` until it
     returns `-2`, then mint exactly ONE deploy via `CONFIG_EPOCH`. It migrates
     and boots cleanly.

  Also confirmed: **step 4's warning is real** — `railway redeploy` re-ran the
  original deployment *including its empty variable set*. `CONFIG_EPOCH` is the
  only reliable trigger.

  And a correction to step 1's implied ordering: the **redis start command is
  not load-bearing**. reach-edu's `outline-redis` runs with no start command and
  still reports `maxmemory-policy=noeviction` (the redis default when no
  maxmemory is set), `protected-mode=no`, `bind=* -::*`. Set it for uniformity
  with the other bundles; it is not what makes the thing work.

  **Tooling floor: Railway CLI ≥5.30.** On 4.8.0, `railway logs <id>` returns
  "Deployment id does not exist" for every deployment, and there is no way to
  change a service's image or delete a service — the failure above is
  undiagnosable. 5.30 adds `railway service source connect --image`,
  `railway service status`, working `railway logs --lines`, and
  `railway ssh -- <cmd>`. Note the CLI's stored session token is **not** valid
  for the public GraphQL API (403); that needs a dashboard-minted token.
