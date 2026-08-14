# Twenty CRM on Railway — per-client deployment runbook

**Status:** Living doc, first executed 2026-07-24 for `reach-edu` (Phase 1 of
`context-v/specs/Per-Client-Stack-Deployment-Spec-Twenty-First.md`).
This is the client-agnostic procedure; per-client values (IDs, URLs, secrets)
live in `client-stacks/<client>/` (gitignored). No secret values in this file.

## Decisions this procedure encodes

- **No template.** No Twenty-managed Railway template exists (official docs
  endorse Docker Compose only; zero Railway-verified templates as of 2026-07).
  We deploy the official image `twentycrm/twenty:<pinned-tag>` directly,
  mirroring upstream `packages/twenty-docker/docker-compose.yml`.
- **Pin the image tag** (e.g. `v2.24.1`), never `latest` — upgrades are
  deliberate acts (the Phase 3+ ops loop owns them).
- **S3 storage, not a volume.** Upstream shares one local-storage volume
  between server and worker; Railway volumes attach to a single service, so
  file attachments would break. Use a Railway bucket with `STORAGE_TYPE=s3`.
- **`ENCRYPTION_KEY`, not `APP_SECRET`.** Upstream marks `APP_SECRET`
  legacy ("only required for instances that pre-date ENCRYPTION_KEY").
  New deploys set `ENCRYPTION_KEY` only.
- **One Railway project per client** (D1), each bundle brings its own
  datastore (D2), services named with the `twenty-` prefix (D3).

## Topology

```
Railway project: <client>            (one private network)
  twenty-server     twentycrm/twenty:<tag>   web+API, port 3000, /healthz, public domain
  twenty-worker     twentycrm/twenty:<tag>   start: `yarn worker:prod`
  twenty-postgres   postgres:16              volume at /var/lib/postgresql/data
  twenty-redis      redis:7                  start: `redis-server --maxmemory-policy noeviction`
  twenty-storage    Railway bucket           S3-compatible file storage
```

The `noeviction` redis policy is required — Twenty's BullMQ queues corrupt
under key eviction. Server owns migrations and cron registration; the worker
runs with both disabled.

## Procedure

1. **Create the project** in The Lossless Group workspace:
   `create_project <client>` → record project + environment IDs in
   `client-stacks/<client>/stack.md`.
2. **Create services** (all in one pass):
   - `twenty-postgres` from image `postgres:16`
   - `twenty-redis` from image `redis:7`
   - `twenty-server` from image `twentycrm/twenty:<tag>`
   - `twenty-worker` from same image
   - bucket `twenty-storage` (default region sjc)
3. **Configure services:**
   - volume on `twenty-postgres` at `/var/lib/postgresql/data`
   - `twenty-redis` start command: `redis-server --maxmemory-policy noeviction`
   - `twenty-worker` start command: `yarn worker:prod`
   - `twenty-server` healthcheck path `/healthz`, timeout 300s
     (first boot runs migrations — takes minutes)
4. **Generate the domain** for `twenty-server`, target port 3000. Record it —
   it becomes `SERVER_URL`.
5. **Fetch bucket credentials:** `railway bucket credentials --bucket
   twenty-storage --json` (link a scratch dir, not the repo). Yields
   accessKeyId / secretAccessKey / bucketName / endpoint / region.
   Twenty's S3 driver uses AWS-SDK defaults (virtual-host style) — matches
   Railway storage; no `forcePathStyle` concerns.
6. **Generate secrets:** `ENCRYPTION_KEY=$(openssl rand -base64 32)`;
   postgres password without special characters (e.g. `openssl rand -hex 24` —
   it gets embedded in a URL). Write ALL values to
   `client-stacks/<client>/twenty/.env` (gitignored) — that file is the
   recovery copy of record until a vault exists (D4).
7. **Set variables** (private-network hostnames are `<service>.railway.internal`):
   - `twenty-postgres`: `POSTGRES_DB=default`, `POSTGRES_USER=postgres`,
     `POSTGRES_PASSWORD=<gen>`, `PGDATA=/var/lib/postgresql/data/pgdata`
     (subdir dodges initdb's non-empty-mount complaint)
   - `twenty-server`: `NODE_PORT=3000`, `PORT=3000` (**both** — Twenty reads
     `NODE_PORT`; Railway's healthcheck prober reads `PORT` and fails the
     deployment without it), `TRUST_PROXY=1` (**required** — without it
     Express ignores `X-Forwarded-Proto` and Twenty's OAuth discovery
     metadata advertises `http://` endpoints; Railway's edge 301s http
     POSTs, which breaks MCP clients' dynamic client registration with
     "Couldn't register with …'s sign-in service"),
     `PG_DATABASE_URL=postgres://postgres:${{twenty-postgres.POSTGRES_PASSWORD}}@${{twenty-postgres.RAILWAY_PRIVATE_DOMAIN}}:5432/default`,
     `REDIS_URL=redis://${{twenty-redis.RAILWAY_PRIVATE_DOMAIN}}:6379`
     (**reference variables, not literals** — password lives in ONE place so
     rotation propagates, and Railway draws the dependency arrows on the
     canvas),
     `SERVER_URL=<domain>`, `ENCRYPTION_KEY=<gen>`, `STORAGE_TYPE=s3`,
     `STORAGE_S3_NAME/REGION/ENDPOINT/ACCESS_KEY_ID/SECRET_ACCESS_KEY` from
     the bucket credentials,
     `EMAIL_DRIVER=SMTP` + `EMAIL_SMTP_HOST/PORT/USER/PASSWORD` +
     `EMAIL_FROM_ADDRESS` + `EMAIL_FROM_NAME` + `EMAIL_SYSTEM_ADDRESS`
     (**not optional — see the email section below**)
   - `twenty-worker`: same as server minus `NODE_PORT`, plus
     `DISABLE_DB_MIGRATIONS=true`, `DISABLE_CRON_JOBS_REGISTRATION=true`.
     The `EMAIL_*` block belongs here **too** — the worker is what actually
     sends. A server-only email config looks correct and delivers nothing.
8. **Watch first boot:** poll deployments/logs until `twenty-server` is
   healthy. Migrations on first boot take minutes. The worker may crash-loop
   until the server finishes migrating — that's the compose dependency order
   flattened; it self-heals via restart policy.
9. **Verify by browser-drive** (Playwright MCP, anchor CLAUDE.md doctrine):
   load login page, create the first workspace/admin account (credentials from
   the operator, live), create a test Person + Company, confirm list views.
   Then the human logs in themselves — the gate.
   **Also verify the SECOND user.** Invite someone and confirm the mail
   actually arrives. The first admin never exercises the email path, so a
   broken one stays invisible until a second stakeholder is handed the URL
   — which is precisely how it went undetected on four instances.
10. **Write `client-stacks/<client>/twenty/restore-runbook.md`** before
    backups exist: services, volumes, what a from-scratch redeploy needs.

## Backups (Phase 3 pattern, proven on reach-edu 2026-07-24)

Per client project, one service `pg-dump-twenty` from repo
`railwayapp-templates/postgres-s3-backups` (branch main):

- Vars: `AWS_ACCESS_KEY_ID`/`AWS_SECRET_ACCESS_KEY` (bucket-scoped R2 token),
  `AWS_S3_BUCKET=<client>`, `AWS_S3_REGION=auto`, `AWS_S3_ENDPOINT`
  (account-level, no bucket path), `BACKUP_DATABASE_URL` (private-network),
  `SINGLE_SHOT_MODE=true`, `BUCKET_SUBFOLDER=backups/twenty-postgres`,
  `BACKUP_FILE_PREFIX=twenty-postgres`.
- Service config: cron `0 5 * * 5` (Fri 00:00 EST), restart policy NEVER.
- **Storage: one R2 bucket per client, named `<client>`** — extends D2's
  no-shared-infrastructure to backups; bucket-scoped tokens keep blast
  radius per-client. Set vars via `railway variable set` from the client's
  `.env` so values stay out of transcripts.
- Manual backup = `railway redeploy --service pg-dump-twenty --yes`.
- Restore: dump is a **gzipped** pg_dump tar — gunzip before `pg_restore`.
  Full drilled procedure: `client-stacks/reach-edu/twenty/restore-runbook.md`.
- Agent-initiated backups: the `twenty-interface` skill tells agents to
  offer a backup after ~10+ record creations in a session.

**Twenty API-key gotcha:** tokens copied from the API *playground* are
`type: PLAYGROUND` with a 2-hour expiry. Real keys: Settings → APIs →
Create key. Decode the JWT payload and check `type`/`exp` when an
integration 401s unexpectedly.

## Variable manifest

Declared per client in `client-stacks/<client>/secretspec.toml` (bundle-prefixed
declarations; runtime names in descriptions). Optional integrations (Google/
Microsoft auth, calendar/messaging sync) stay unset until a client asks.

**SMTP is NOT one of them.** It used to be listed here as optional; that was
wrong and it cost us a stranded stakeholder (see the-water-foundation delta
below). Set it during initial deployment, every time.

## Email — required, not optional

Twenty's `EMAIL_DRIVER` defaults to `LOGGER`
(`packages/twenty-server/src/engine/core-modules/twenty-config/config-variables.ts:320`).
Leaving it unset does **not** disable email — it renders every message into the
container's stdout and drops it. No error, no bounce, no queue failure. The
deployment looks perfectly healthy.

That matters more than it sounds, because Twenty gates the second user:

- With `IS_MULTIWORKSPACE_ENABLED` unset (default false) there is no self-serve
  "create a workspace" path.
- With only `password` in `authProviders`, there's no magic-link fallback.
- So joining an existing workspace **requires an invite token**, which is
  delivered by exactly one channel: email.

No email ⇒ no second user, ever. And password reset is dead by the same
mechanism, so any member who forgets a password is locked out permanently with
no recovery path.

Canonical settings (Resend, sender on the identity plane `didi.sh`, matching
`email_sender` in `hubs/lossless-at/src/config/clients.ts`):

```
EMAIL_DRIVER=SMTP
EMAIL_SMTP_HOST=smtp.resend.com
EMAIL_SMTP_PORT=587
EMAIL_SMTP_USER=resend            # note: Outline calls this SMTP_USERNAME
EMAIL_SMTP_PASSWORD=<send-scoped Resend key>
EMAIL_FROM_ADDRESS=no-reply@didi.sh
EMAIL_FROM_NAME=<Client> CRM
EMAIL_SYSTEM_ADDRESS=no-reply@didi.sh
```

On **both** `twenty-server` and `twenty-worker`. Verify with a real send, not
by reading back the variables — config present and mail leaving the box are
different claims.

## Deltas observed per deployment

- **the-water-foundation (2026-08-14) — the email gap, found the hard way:**
  a second stakeholder could neither log in nor create an account. Cause: no
  `EMAIL_*` vars on either service, so invitations rendered into the worker's
  deploy log instead of sending. The first stakeholder had been onboarded by
  hand-delivering her link, which masked the problem for eight days. Fixed by
  setting the block above on both services, `CONFIG_EPOCH` → 2.
  **The doc was complicit:** SMTP was listed under "optional integrations…
  until a client asks," so all four instances shipped without it. The other
  three (`lossless`, `palmer-ai`, `reach-edu`) have no `EMAIL_*` in their
  recovery `.env` either — unverified against live Railway, but presumed
  stranded the same way and worth a sweep.
- **ALL DEPLOYMENTS — Railway redeploy gotcha (2026-07-27):** `railway
  redeploy` re-runs the PREVIOUS deployment spec — start-command, healthcheck,
  and other service-config changes made since are SILENTLY DROPPED (proven
  via an in-network diagnostic against docmost-redis, whose config never
  applied through three redeploys). To apply config changes, mint a NEW
  deployment: set a throwaway variable without `--skip-deploys`
  (convention: `CONFIG_EPOCH=<n>`). Variables, unlike config, ARE picked up
  by redeploys — which is why the Twenty deploys *appeared* to work; audit
  any service whose start command was set post-creation (lossless
  twenty-worker/twenty-redis flagged, unverified — Michael declined the
  bump 2026-07-27 since the app works; revisit if background jobs misbehave).
- **lossless (2026-07-27):** third execution (our own org's instance) — ran
  nearly verbatim. Two deltas, both tooling-shaped: (1) services created from
  an image deploy IMMEDIATELY, before variables are set — set vars with
  `--skip-deploys` then explicitly `railway redeploy` each service (postgres's
  var-less first boot fails harmlessly; the redeploy does a clean initdb);
  (2) the Railway MCP `add_reference_variable` tool rejects embedded
  references (value must START with `${{`) — set composite URLs like
  `PG_DATABASE_URL` via plain `set_variables`; Railway resolves the template
  syntax either way.
- **reach-edu (2026-07-24):** first execution — this doc *is* the delta log.
  Notable: healthcheck timeout is seconds not ms; `railway bucket credentials`
  has no `--project` flag (needs linked dir); spec said "generate APP_SECRET"
  but upstream had moved to `ENCRYPTION_KEY` (documented deviation); first
  server deploy FAILED healthcheck after 04:52 because `PORT` wasn't set —
  Railway probes the port named in `PORT`, not the domain's target port, and
  Twenty only reads `NODE_PORT`. Fix: set both.
