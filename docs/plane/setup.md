# Plane on Railway — per-client deployment runbook

**Status:** Written 2026-08-14 from the pinned source at `core/plane` (v1.4.1).
**NOT YET EXECUTED.** No client is running Plane. Everything below is derived
from Plane's own `deployments/aio/community/` assets, not from a deployment we
have watched boot. Treat the Deltas section as empty-because-untested, not
empty-because-clean. The first execution should edit this file as it goes, the
way `docs/twenty/setup.md` did for reach-edu.

Per-client values (IDs, URLs, secrets) live in `client-stacks/<client>/plane/`
(gitignored). No secret values in this file.

## Why Plane

Project and issue tracking — the Linear/Jira lane. It earns a place in `core/`
on one specific test: **the REST API, webhooks and personal access tokens are in
the free community edition**, not behind a commercial licence. That is the same
test Docmost failed (API keys gated behind Enterprise), and failing it is
disqualifying regardless of how good the product is, because agent access is a
headline feature of every Lossless stack.

It also ships an **official MCP server** (`makeplane/plane-mcp-server`, MIT),
which makes it one of very few tools in the catalog that joins the
one-connector-per-client story without an adapter to write.

## Decisions this procedure encodes

- **Use the All-In-One image, not the 13-service compose.** Plane's standard
  self-host topology is `web + admin + space + api + worker + beat-worker +
  live + migrator + proxy` plus four datastores — roughly ten Railway services
  per client. The AIO image (`makeplane/plane-aio-community`) runs all nine app
  processes under supervisord in one container, leaving four external
  dependencies. That collapses Plane to a Twenty-shaped footprint. See Topology.
- **Pin the image tag** (`v1.4.1`), never `latest` or `stable` — same rule as
  every other bundle here. Upgrades are deliberate acts.
- **Railway bucket instead of MinIO.** The compose ships MinIO as a container;
  we do what the Twenty bundle does and point `AWS_S3_*` at a Railway bucket.
  One less service, one less volume, and file storage survives a redeploy.
- **RabbitMQ is not optional.** Unlike most of the stack, Plane needs a message
  broker *in addition to* Redis. `AMQP_URL` is a required variable; the app does
  not boot without it. This is the one genuinely new dependency Plane introduces
  to the stack.
- **Override both shipped secrets.** `SECRET_KEY` and `LIVE_SERVER_SECRET_KEY`
  have **defaults baked into the image**. An instance running the defaults is
  running a publicly-known Django signing key. See Gotchas.
- **`core/plane` is pinned upstream** (`makeplane/plane`), not forked under
  `lossless-group/`, matching `plunk`, `postiz-app` and `karakeep`. Fork only if
  we need to carry patches.

## Topology

```
Railway project: <client>                 (one private network)
  plane            makeplane/plane-aio-community:v1.4.1   all app processes, port 80
  plane-postgres   postgres:15.7-alpine                   volume at /var/lib/postgresql/data
  plane-redis      valkey/valkey:7.2.11-alpine            cache + sessions
  plane-mq         rabbitmq:3.13.6-management-alpine      volume for durable queues
  plane-storage    Railway bucket                         S3-compatible uploads
```

Inside the `plane` container, supervisord runs: `migrator`, `api`, `worker`,
`beat`, `space`, `live`, and a Caddy `proxy`. The web and admin apps are served
through the same proxy. Ports 3001–3005 are internal; only 80 is exposed.

Datastore image versions above are the ones Plane's own compose pins at v1.4.1 —
note it uses **Valkey**, not Redis proper, and **Postgres 15**, not 16 like the
Twenty bundle. Match Plane's pins rather than the house default; this app is the
one that has to be happy.

## Procedure

1. **Create the project** (or use the client's existing one):
   `create_project <client>` → record project + environment IDs in
   `client-stacks/<client>/plane/stack.md`.
2. **Create services:**
   - `plane-postgres` from `postgres:15.7-alpine`
   - `plane-redis` from `valkey/valkey:7.2.11-alpine`
   - `plane-mq` from `rabbitmq:3.13.6-management-alpine`
   - `plane` from `makeplane/plane-aio-community:v1.4.1`
   - bucket `plane-storage`
3. **Configure services:**
   - volume on `plane-postgres` at `/var/lib/postgresql/data`, with
     `PGDATA=/var/lib/postgresql/data/pgdata` (subdir dodges initdb's
     non-empty-mount complaint — same as the Twenty bundle)
   - volume on `plane-mq` at `/var/lib/rabbitmq` so queues survive restarts
   - healthcheck on `plane`: path `/`, generous timeout — first boot runs Django
     migrations through supervisord's `migrator` program before the API answers
4. **Generate the domain** for `plane`, target port 80. Record it — it becomes
   `DOMAIN_NAME`.
5. **Fetch bucket credentials:** `railway bucket credentials --bucket
   plane-storage --json` (link a scratch dir, not the repo).
6. **Generate secrets:**
   ```bash
   openssl rand -hex 32     # SECRET_KEY
   openssl rand -hex 32     # LIVE_SERVER_SECRET_KEY
   openssl rand -hex 24     # POSTGRES_PASSWORD  (no special chars — goes in a URL)
   openssl rand -hex 24     # RABBITMQ_PASSWORD  (same constraint)
   ```
   Write ALL values to `client-stacks/<client>/plane/.env` (gitignored) — the
   recovery copy of record until a vault exists.
7. **Set variables** (private-network hostnames are `<service>.railway.internal`):

   `plane-postgres`:
   ```
   POSTGRES_DB=plane
   POSTGRES_USER=plane
   POSTGRES_PASSWORD=<gen>
   PGDATA=/var/lib/postgresql/data/pgdata
   ```

   `plane-mq`:
   ```
   RABBITMQ_DEFAULT_USER=plane
   RABBITMQ_DEFAULT_PASS=<gen>
   RABBITMQ_DEFAULT_VHOST=plane
   ```

   `plane` — reference variables, not literals, so rotation propagates and
   Railway draws the dependency arrows:
   ```
   DOMAIN_NAME=<domain, no scheme>
   DATABASE_URL=postgresql://plane:${{plane-postgres.POSTGRES_PASSWORD}}@${{plane-postgres.RAILWAY_PRIVATE_DOMAIN}}:5432/plane
   REDIS_URL=redis://${{plane-redis.RAILWAY_PRIVATE_DOMAIN}}:6379
   AMQP_URL=amqp://plane:${{plane-mq.RABBITMQ_DEFAULT_PASS}}@${{plane-mq.RAILWAY_PRIVATE_DOMAIN}}:5672/plane
   SECRET_KEY=<gen>
   LIVE_SERVER_SECRET_KEY=<gen>
   AWS_REGION=auto
   AWS_ACCESS_KEY_ID=<from bucket>
   AWS_SECRET_ACCESS_KEY=<from bucket>
   AWS_S3_BUCKET_NAME=<bucket name>
   AWS_S3_ENDPOINT_URL=<bucket endpoint>
   FILE_SIZE_LIMIT=10485760
   ```
8. **Watch first boot.** Migrations run inside the container before the API
   answers; the healthcheck will fail until they finish. Tail deploy logs and
   look for supervisord bringing up `api` after `migrator` exits 0.
9. **Verify by browser-drive** (Playwright MCP, per the anchor CLAUDE.md
   doctrine): load the instance, create the first admin account, create a
   project and a work item, confirm the board and list layouts render. Then
   **invite a second user and confirm the mail arrives** — see Gotchas.
10. **Mint an API token** (Profile Settings → Personal Access Tokens) and
    confirm the REST API answers with `X-API-Key`. This is the whole reason
    Plane is in `core/`; verify it rather than assume it.
11. **Write `client-stacks/<client>/plane/restore-runbook.md`** before backups
    exist: services, volumes, what a from-scratch redeploy needs.

## Backups

Follow the `pg-dump-twenty` pattern: one `pg-dump-plane` service per client from
`railwayapp-templates/postgres-s3-backups`, weekly cron, `SINGLE_SHOT_MODE=true`,
restart policy NEVER, writing to `backups/plane-postgres/` in the client's R2
bucket.

Two things the Twenty pattern does not cover:

- **Uploads live in the bucket**, not the database. The pg_dump restores issues,
  comments and projects; attachments come back only if the bucket survives or is
  separately replicated.
- **RabbitMQ state is not worth backing up** — queues are transient work, not
  records. A restore starts with empty queues, which is correct.

## Gotchas (anticipated, not yet observed)

Flagged honestly: these are derived from reading Plane's assets and from what has
bitten every other bundle here. None has been confirmed against a running
deployment.

1. **Shipped default secrets.** `SECRET_KEY` and `LIVE_SERVER_SECRET_KEY` have
   defaults in the image. Django uses `SECRET_KEY` to sign sessions and tokens —
   an instance on the default is one where anyone who reads the public image can
   forge a session. **Override both, every deployment.** This is the single most
   important line in this document.
2. **`SITE_ADDRESS` vs Railway's `PORT`.** The AIO proxy binds `:80` by default
   while Railway injects `PORT` and probes it. Expect to set the domain's target
   port to 80, and if the healthcheck fails, try `SITE_ADDRESS=:${PORT}`. This is
   the same family as Twenty's `PORT` + `NODE_PORT` trap, which cost a failed
   deploy the first time.
3. **Email is almost certainly not configured out of the box.** Every other tool
   in this stack shipped with mail silently disabled, and Twenty's `LOGGER`
   default cost us a stranded stakeholder for four days across four instances.
   **Assume Plane is broken the same way until a real invitation arrives in a
   real inbox.** Step 9's second-user check is not optional ceremony.
4. **Postgres 15, not 16.** Plane pins 15.7. Do not "helpfully" upgrade to match
   the Twenty bundle; Django migrations are the fussiest consumer here.
5. **RabbitMQ needs a volume.** Without one, a redeploy loses in-flight jobs.
   Not catastrophic, but it will look like silently dropped notifications.
6. **`CONFIG_EPOCH`.** As everywhere: `railway redeploy` reuses the previous
   deployment spec. To apply service-config changes, bump a throwaway variable
   to mint a fresh deployment.

## Deltas observed per deployment

*(empty — Plane has not been deployed for any client yet. First executor: append
here, and correct anything above that turns out to be wrong. The Gotchas section
above is a hypothesis list, and some of it will be wrong.)*

## Related

- Source pinned at `core/plane` (v1.4.1) — `deployments/aio/community/README.md`
  is the upstream authority for AIO variables
- `docs/twenty/setup.md` — the bundle this procedure is shaped after, including
  the email lesson in its Deltas
- Official MCP server: <https://github.com/makeplane/plane-mcp-server>
- Plane self-hosting docs: <https://developers.plane.so/self-hosting/overview>
