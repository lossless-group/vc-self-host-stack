# Docmost on Railway — per-client deployment runbook

> **RETIRED 2026-07-27, same day it was written.** Docmost gates API keys
> behind an Enterprise license in the self-hosted edition; agent/API access
> is a headline feature of every Lossless stack, so it's disqualified.
> The palmer-ai deployment was deleted. Replacement: **Outline** —
> `docs/outline/setup.md`. Kept for the redis-on-Railway-volume findings
> in the delta log below, which apply to any future bundle.

**Status:** Living doc, first executed 2026-07-27 for `palmer-ai`.
This is the client-agnostic procedure; per-client values (IDs, URLs, secrets)
live in `client-stacks/<client>/docmost/` (gitignored). No secret values here.

## Decisions this procedure encodes

- **Deploy the official image `docmost/docmost:<pinned-tag>`** directly,
  mirroring upstream `docker-compose.yml` (no Railway template). Pin the tag,
  never `latest` — upgrades are deliberate acts.
- **Volume storage, not S3.** Unlike Twenty (server + worker sharing files),
  Docmost is a SINGLE service — upstream's local-volume default
  (`/app/data/storage`) works fine on Railway. One less credential set.
- **Postgres 18, volume at `/var/lib/postgresql`** (not `.../data`) —
  upstream's compose does this because the pg18 image keeps PGDATA in a
  versioned subdir under it; mounting the parent needs no PGDATA override.
- **Redis 8 with AOF persistence** (`--appendonly yes`) + `noeviction`,
  volume at `/data` — upstream parity (note: Twenty's redis is
  deliberately volumeless; Docmost's is not).
- Services named with the `docmost-` bundle prefix, in the client's ONE
  Railway project (D1); bundle brings its own datastores (D2).

## Topology

```
Railway project: <client>
  docmost           docmost/docmost:<tag>   web+API+collab, port 3000, volume /app/data/storage
  docmost-postgres  postgres:18             volume at /var/lib/postgresql
  docmost-redis     redis:8                 start: `redis-server --appendonly yes --maxmemory-policy noeviction --stop-writes-on-bgsave-error no`, volume /data
```

Migrations run automatically on app boot.

## Procedure

1. **Create services** in the client's existing project: `docmost-postgres`
   (postgres:18), `docmost-redis` (redis:8), `docmost`
   (docmost/docmost:<tag>).
2. **Volumes:** postgres `/var/lib/postgresql`, redis `/data`, docmost
   `/app/data/storage`. **Redis start command** as above.
3. **Generate domain** for `docmost`, target port 3000 → becomes `APP_URL`.
4. **Generate secrets:** `APP_SECRET=$(openssl rand -hex 32)`; postgres
   password `openssl rand -hex 24` (URL-embedded, no special chars). Write
   ALL values to `client-stacks/<client>/docmost/.env` first.
5. **Set variables** (literals via `railway variables --skip-deploys` from a
   linked scratch dir; composites via MCP set_variables with `${{}}` refs):
   - `docmost-postgres`: `POSTGRES_DB=docmost`, `POSTGRES_USER=docmost`,
     `POSTGRES_PASSWORD=<gen>` (no PGDATA needed on pg18)
   - `docmost`: `PORT=3000`, `APP_URL=<domain>`, `APP_SECRET=<gen>`,
     `DATABASE_URL=postgresql://docmost:${{docmost-postgres.POSTGRES_PASSWORD}}@${{docmost-postgres.RAILWAY_PRIVATE_DOMAIN}}:5432/docmost`,
     `REDIS_URL=redis://${{docmost-redis.RAILWAY_PRIVATE_DOMAIN}}:6379`
6. **Redeploy** all three (image services deploy at creation BEFORE variables
   exist — same delta as the lossless Twenty run): datastores first, then app.
7. **Verify by browser-drive:** root URL redirects to `/setup/register`
   ("Create workspace" form) on a fresh instance. The operator creates the
   first workspace/admin live — the gate.
8. **Write `client-stacks/<client>/docmost/restore-runbook.md`.**

Optional integrations, unset until asked: SMTP (`MAIL_DRIVER` etc. — needed
for invites/password reset), S3 storage driver, SSO.

## Deltas observed per deployment

- **palmer-ai (2026-07-27):** first execution — this doc *is* the delta log.
  App booted straight to healthy on first try (~30s); no PORT/healthcheck
  trap (no Railway healthcheck configured; Docmost reads `PORT` directly).
  **Post-deploy failure at the gate:** workspace creation 500'd. Root cause:
  redis RDB background snapshots fail on the Railway volume (fork/bgsave —
  redis's own stdout was NOT retrievable via API or CLI to get the exact
  errno), and redis's default `stop-writes-on-bgsave-error yes` then rejects
  ALL writes (`MISCONF` ReplyErrors flooding the app logs). AOF persistence
  works fine on the same volume (redis would refuse to boot otherwise), so
  the fix is `--stop-writes-on-bgsave-error no` in the start command — AOF
  is the persistence layer of record, RDB snapshot failures become log
  noise instead of an outage. Now part of the canonical start command above.
  Note Twenty's volumeless redis never hit this — the volume is the delta.
