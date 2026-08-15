# Postiz on Railway — per-client deployment runbook

**Status:** Living doc, first executed 2026-07-28 for `reach-edu`. Per-client
values live in `client-stacks/<client>/postiz/` (gitignored). No secret values
here.

## Decisions this procedure encodes

- **Why Postiz:** open-source social command center (Hootsuite/Buffer/Sprout
  alternative already on the README roster) — write once, publish to ~30
  channels, unlimited users, AGPL-3.0, full REST API self-hosted.
- **Official image `ghcr.io/gitroomhq/postiz-app:<pinned-tag>`**, never
  `latest`. Pin from the latest GitHub release
  (`gh api repos/gitroomhq/postiz-app/releases/latest`).
- **Postiz v2 requires Temporal.** `TEMPORAL_ADDRESS` is a required setting;
  scheduled posts execute as Temporal workflows (apps/orchestrator upstream).
  Without it the app boots but nothing publishes. The bundle is therefore
  FIVE services, not three.
- **Temporal runs WITHOUT Elasticsearch** (`ENABLE_ES=false`, Postgres
  visibility). Upstream's compose ships ES for advanced visibility; on
  Railway it's a heavyweight service Postiz doesn't need. We also skip
  `temporal-ui` and `temporal-admin-tools` (add later if operating Temporal
  itself becomes a need).
- **Single volume per Railway service** → postiz mounts `/uploads` only
  (`STORAGE_PROVIDER=local`). Upstream's second volume (`/config`) is
  env-var-driven on Railway, nothing to persist.
- **Volumeless redis** (Twenty/Outline pattern) — queue/cache state is
  disposable; avoids the Railway-volume bgsave trap.
- **No shared postgres** across bundles; within the bundle, temporal gets its
  own postgres (mirrors upstream, keeps Temporal schema churn away from the
  app database).

## Topology

```
Railway project: <client>
  postiz             ghcr.io/gitroomhq/postiz-app:<tag>   web+API port 5000, volume /uploads
  postiz-postgres    postgres:17-alpine                   volume /var/lib/postgresql/data (PGDATA subdir /pgdata)
  postiz-redis       redis:7.2                            start: `redis-server --maxmemory-policy noeviction`, NO volume
  temporal           temporalio/auto-setup:1.28.1         gRPC :7233 (private only), NO volume
  temporal-postgres  postgres:16                          volume /var/lib/postgresql/data (PGDATA subdir /pgdata)
```

## Procedure

1. **Create services** (five, per topology). **Volumes + redis start command
   + domain (postiz, port 5000)** before any variable work. The domain that
   goes into `MAIN_URL` must be the **custom `postiz.<client>.didi.sh`
   domain, not the Railway-generated one** — auth cookies are dead on
   `*.up.railway.app` (gotcha #5), so start the DNS cutover immediately.
2. **Secrets:** `JWT_SECRET` = `openssl rand -hex 32`; two postgres passwords
   `openssl rand -hex 24`. Write to `client-stacks/<client>/postiz/.env` first.
3. **Variables** (all `--skip-deploys`; composite URLs use `${{}}` refs):
   - `postiz-postgres`: `POSTGRES_DB=postiz`, `POSTGRES_USER=postiz`,
     `POSTGRES_PASSWORD=<gen>`, `PGDATA=/var/lib/postgresql/data/pgdata`
   - `temporal-postgres`: `POSTGRES_USER=temporal`, `POSTGRES_PASSWORD=<gen>`,
     `PGDATA=/var/lib/postgresql/data/pgdata` (no `POSTGRES_DB`; auto-setup
     creates `temporal` + `temporal_visibility`)
   - `temporal`: `DB=postgres12`, `DB_PORT=5432`, `POSTGRES_USER=temporal`,
     `POSTGRES_PWD=<gen>`, `POSTGRES_SEEDS=${{temporal-postgres.RAILWAY_PRIVATE_DOMAIN}}`,
     `ENABLE_ES=false`, `TEMPORAL_NAMESPACE=default`,
     **`SKIP_ADD_CUSTOM_SEARCH_ATTRIBUTES=true`** — REQUIRED, see gotcha #1
   - `postiz`: `PORT=3000` (see gotcha #3), `MAIN_URL=<domain>`, `FRONTEND_URL=<domain>`,
     `NEXT_PUBLIC_BACKEND_URL=<domain>/api`, `JWT_SECRET=<gen>`,
     `BACKEND_INTERNAL_URL=http://localhost:3000`, `IS_GENERAL=true`,
     `DISABLE_REGISTRATION=false` (flip to `true` after first signup),
     `STORAGE_PROVIDER=local`, `UPLOAD_DIRECTORY=/uploads`,
     `NEXT_PUBLIC_UPLOAD_DIRECTORY=/uploads`, `NX_ADD_PLUGINS=false`,
     `API_LIMIT=30`,
     `DATABASE_URL=postgresql://postiz:<pw>@${{postiz-postgres.RAILWAY_PRIVATE_DOMAIN}}:5432/postiz`,
     `REDIS_URL=redis://${{postiz-redis.RAILWAY_PRIVATE_DOMAIN}}:6379`,
     `TEMPORAL_ADDRESS=${{temporal.RAILWAY_PRIVATE_DOMAIN}}:7233`
4. **Fresh deployments via `CONFIG_EPOCH=<n>`** (never `railway redeploy` —
   see Outline runbook step 4), in dependency order: both postgres + redis
   first, then temporal (wait for schema setup + server start), then postiz.
5. **Temporal on Railway's IPv6 private network just works:** the auto-setup
   entrypoint resolves the container's own address ("TEMPORAL_ADDRESS is not
   set, setting it to fd12:…:7233") and binds/broadcasts on it. No
   `BIND_ON_IP` override needed.
6. **Verify by browser-drive:** root URL renders the Postiz register screen;
   create the first account (it becomes superadmin), then set
   `DISABLE_REGISTRATION=true` (this also mints the next fresh deploy).
7. **Channels:** each platform (X, LinkedIn, Mastodon, Bluesky, …) needs its
   own OAuth app credentials set as env vars on `postiz` (see upstream
   docker-compose.yaml "Social Media API Settings") — collect per client as
   needed.
8. **API key** for agent-driven posting: mint in-app (Settings → API) →
   record as `POSTIZ_API_KEY` in the client `.env`.
9. **Write `client-stacks/<client>/postiz/restore-runbook.md`.**

## Scope note — what Postiz does NOT do

Postiz schedules and publishes; it has **no "follow accounts" capability** on
any platform. Bulk-following a list of people/orgs (e.g. from a SurrealDB
canonical layer) is a per-platform job against platform APIs directly —
feasible on Bluesky (AT Protocol) and Mastodon (ActivityPub), not offered at
accessible API tiers on LinkedIn/X/Instagram. Plan that workflow separately.

## Gotchas (all hit on first execution, 2026-07-28)

1. **`SKIP_ADD_CUSTOM_SEARCH_ATTRIBUTES=true` on temporal is mandatory with
   SQL visibility.** Without it, auto-setup registers demo attributes
   including `CustomStringField` + `CustomTextField` (2 Text), and Postgres
   visibility allows only 3 Text total. Postiz's backend then crashes at
   `TemporalRegister.onModuleInit` registering its own `organizationId` +
   `postId` (both Text): *"cannot have more than 3 search attribute of type
   Text"*. Symptom at the surface: frontend renders, every auth call 502s
   (backend crashlooped behind the container's internal nginx). If the DB
   was already initialized with the demo attributes, wipe it — zero
   workflows exist pre-launch, so recreate the service (see #2).
2. **Railway volume deletion is a soft-delete with ~2-day grace** ("Deletes
   on <date>"), the volume stays attached, there is NO recover mutation in
   the public API, and a detach can sit in staged-changes limbo blocking any
   new volume attach. Don't fight it: `serviceDelete` (GraphQL) the whole
   postgres service and recreate service + volume + vars — takes a minute.
3. **Set `PORT=3000` on the postiz service.** Railway injects `PORT=8080`
   into every container; the Postiz backend honors `process.env.PORT` and
   binds 8080, while the image's internal nginx proxies `/api` to
   `localhost:3000` → every API call 502s even though all three PM2 apps
   report healthy. Upstream compose never sets PORT, so this only bites on
   Railway. (The public domain targets port 5000 — the internal nginx —
   regardless of PORT.)
4. **`${{service.RAILWAY_PRIVATE_DOMAIN}}` references break silently when
   the referenced service is deleted** — the var resolves to EMPTY, not an
   error. After any service recreate, re-set every reference that pointed at
   it (here: temporal's `POSTGRES_SEEDS`).
5. **Auth is IMPOSSIBLE on the `*.up.railway.app` domain — custom domain is
   NOT optional for Postiz.** The backend sets the session cookie with
   `Domain=` derived from `FRONTEND_URL` via tldts, which resolves
   `<x>.up.railway.app` to `Domain=.railway.app` — a Public Suffix List
   apex, so every browser rejects the cookie. Register returns 200 and
   creates the account, login returns 200 with a JWT, but the user stays
   logged out forever. Symptom chain observed: "signup didn't work" with
   zero backend errors. Fix: cut over `postiz.<client>.didi.sh` (see the
   custom-domain-cutover skill) and point `MAIN_URL`/`FRONTEND_URL`/
   `NEXT_PUBLIC_BACKEND_URL` at it — cookie becomes `.didi.sh`, which is
   not on the PSL. Note the resulting cookie is scoped to ALL of didi.sh
   (cross-client bleed among our hosted apps) — acceptable for now,
   revisit if didi.sh ever hosts untrusted tenants.

## Deltas observed per deployment

- **reach-edu (2026-07-28):** first execution — this doc *is* the delta log.
  Pinned `v2.22.1` (release 2026-07-25). Temporal schema setup (default +
  visibility) took ~1 min against temporal-postgres. Temporal on Railway's
  IPv6 private network needed no BIND_ON_IP override (entrypoint
  self-resolves). Hit all three gotchas above; temporal-postgres was
  recreated once (new service id) with `SKIP_ADD_CUSTOM_SEARCH_ATTRIBUTES`
  set before its second init.
