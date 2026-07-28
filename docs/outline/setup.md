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
