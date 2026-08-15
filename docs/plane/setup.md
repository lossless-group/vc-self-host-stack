# Plane on Railway — per-client deployment runbook

**Status:** Written 2026-08-14 from the pinned source at `core/plane` (v1.4.1).
**FIRST EXECUTED 2026-08-14 for `lossless`** — deployed, healthy, HTTP 200 in
about 60 seconds from redeploy. The Gotchas section has been corrected against
that boot; one hypothesis was wrong and is struck through rather than deleted.

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
- **Set both secrets explicitly.** `SECRET_KEY` and `LIVE_SERVER_SECRET_KEY` are
  **auto-generated on first boot if unset** — which means they change on a fresh
  container, invalidating every session and signed token on redeploy. Pin them.
  See Gotchas for the correction to what this doc originally claimed.
- **`APP_PROTOCOL=https`.** Documented as optional, required in practice behind
  Railway's TLS edge. Same class of bug as Twenty's `TRUST_PROXY=1`.
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
   doctrine): load the instance, then go to **`<domain>/god-mode/` — with the
   trailing slash, in a private window** (gotcha 5; the welcome screen's own
   button links to a path the router rejects, and the shell caches badly).
   Create the first admin account, create a project and a work item, confirm the
   board and list layouts render. Then **invite a second user and confirm the
   mail arrives** — see Gotchas.
10. **Mint an API token** (Profile Settings → Personal Access Tokens) and
    confirm the REST API answers with `X-API-Key`. This is the whole reason
    Plane is in `core/`; verify it rather than assume it.

    ```bash
    curl -H "X-API-Key: $PLANE_PERSONAL_ACCESS_TOKEN" "$PLANE_BASE_URL/api/v1/users/me/"
    ```

    `/api/v1/users/me/` is the cheapest proof the token is live. Note there is
    **no list-workspaces endpoint** — everything else is workspace-scoped as
    `/api/v1/workspaces/<slug>/…`, so record the workspace slug when it is
    created. A wrong slug returns **403**, not 404, which reads like a
    permissions problem rather than a typo.

    For agent access, add the token and the instance base URL to `~/.secrets`
    (`chmod 600`) as `PLANE_PERSONAL_ACCESS_TOKEN` and `PLANE_BASE_URL`, and
    declare both in `client-stacks/<client>/secretspec.toml`. Scripts source
    `~/.secrets` explicitly — it is not on the shell's default path.
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

1. **Set both secrets explicitly — but not for the reason first assumed.**
   ~~The image ships public default secrets.~~ **Corrected 2026-08-14 by watching
   an actual boot.** The AIO entrypoint prints:

   ```
   SECRET_KEY (auto-generated on first boot if not set)
   LIVE_SERVER_SECRET_KEY (auto-generated on first boot if not set)
   ```

   Auto-generated, not a fixed public default — so the risk is **not** that a
   stranger can forge a session against a known key. The real risk is that an
   unset key is regenerated on a fresh container, which **invalidates every
   session and signed token on redeploy**. Users get logged out for no visible
   reason, and anything signed with the old key stops verifying.

   Setting both explicitly is still correct, and still the first thing to do.
   The reason is durability, not disclosure.

2. **`SITE_ADDRESS` vs Railway's `PORT` — did not bite.** The AIO proxy binds
   `:80`, and setting the Railway domain's target port to **80** was sufficient.
   No `SITE_ADDRESS` override was needed. Healthcheck path `/`, timeout 600.

   Note the timeout unit: Railway's healthcheck timeout is **seconds, not
   milliseconds** — the MCP `update_service` call rejects `600000` as invalid
   input. Same delta the Twenty runbook recorded for reach-edu.

3. **Set `APP_PROTOCOL=https`.** Listed as optional in the boot output, and it
   is not optional behind Railway's TLS edge. Railway terminates TLS and
   forwards plain HTTP, so an app left to infer its own scheme generates `http://`
   URLs in links, redirects and callbacks. Exactly the family of bug that
   `TRUST_PROXY=1` fixes for Twenty, where http-scheme OAuth metadata broke MCP
   client registration.

   **Set it BEFORE the first deploy, with every other variable.** See gotcha 5.

4. **Plane returns HTTP 200 while broken.** The Caddy proxy answers `200 OK` and
   serves a page reading *"Looks like Plane didn't start up correctly!"* when the
   app behind it has failed. Railway's healthcheck passes. `curl -o /dev/null -w
   '%{http_code}'` passes. The deployment reports SUCCESS.

   **A 200 from Plane means the proxy is alive, not that Plane works.** Load the
   page in a browser (Playwright MCP per the anchor CLAUDE.md doctrine) before
   believing any of it. This was caught only because step 9's browser-drive is in
   the procedure — every automated signal said healthy.

5. **The first-admin setup page needs a TRAILING SLASH, and probably a private
   window.** Two separate problems that present identically — an endless
   spinner on a blank page.

   **(a) The trailing slash.** Plane's own "Get started" button on the welcome
   screen links to `/god-mode`. The admin SPA's router is mounted at
   `/god-mode/`. The bare path serves the HTML but the router matches nothing
   and renders an empty document. The console says so outright:

   ```
   <Router basename="/god-mode/"> is not able to match the URL "/god-mode"
   because it does not start with the basename, so the <Router> won't render anything.
   ```

   A conventional static server would 301 `/god-mode` → `/god-mode/`. The AIO
   image's Caddy does not. **Go directly to `<domain>/god-mode/` — with the
   slash.** Do not use the button. This is upstream behavior, not a
   misconfiguration on our side, and it will recur on every AIO deployment.

   **(b) Cache.** The admin shell is served with **no `cache-control` header** —
   only an ETag and a `last-modified` that is weeks old (the image build date).
   Browsers fall back to heuristic freshness off that timestamp and can pin a
   stale copy for hours without revalidating. If the instance was loaded at any
   point while it was broken, a normal reload may keep serving the broken shell.

   **Open the setup page in a private/incognito window.** It bypasses the cache
   entirely and takes five seconds to rule out. This is the single most useful
   move when the page spins and the server looks healthy from `curl`.

   Both were hit on the lossless first execution, in that order.

6. **NEVER change a variable while first-boot migrations are running.** This is
   the one that actually bit, and it is expensive.

   Plane's `migrator` runs under supervisord with autorestart. Setting any
   variable triggers a Railway redeploy, which kills the container mid-migration
   and leaves the schema **half-applied**. Supervisord then restarts `migrator`
   every ~10s, and each pass fails on work the previous pass had already done:

   ```
   ERROR: duplicate key value violates unique constraint "pg_type_typname_nsp_index"
   ERROR: column "sort_order" of relation "stickies" already exists
   ERROR: relation "global_views" does not exist
   ERROR: relation "asset_entity_type_idx" already exists
   ```

   Django does not self-heal from this. `django_migrations` never records the
   interrupted migration, so it retries forever against a schema that already has
   the objects.

   **Prevention:** set the complete variable set with `--skip-deploys`, then
   deploy **once**, then leave it alone until the API answers in a browser.

   **Recovery** (safe only when the instance has no data, which is true on first
   boot): drop and recreate the database, then redeploy once.

   ```bash
   # Railway → plane-postgres → create a TCP proxy on 5432, then:
   docker run --rm -e PGPASSWORD=<pw> postgres:15.7-alpine \
     psql -h <proxy-host> -p <proxy-port> -U plane -d postgres \
     -c "DROP DATABASE plane WITH (FORCE);"
   docker run --rm -e PGPASSWORD=<pw> postgres:15.7-alpine \
     psql -h <proxy-host> -p <proxy-port> -U plane -d postgres \
     -c "CREATE DATABASE plane OWNER plane;"
   ```

   Two mechanics worth knowing: `DROP DATABASE` **cannot run inside a transaction
   block**, so `psql -c "DROP …; CREATE …;"` fails — issue them as separate `-c`
   calls. And `WITH (FORCE)` (Postgres 13+) terminates the crash-looping
   migrator's open connections, which otherwise block the drop.
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

- **lossless (2026-08-14) — first execution.** Ran close to as written. The AIO
  bet paid off: five services (`plane`, `plane-postgres`, `plane-redis`,
  `plane-mq`, plus the `plane-storage` bucket) rather than the ten a
  compose-shaped deploy would have needed. Boot to HTTP 200 was ~60 seconds,
  with all seven supervisord programs — `migrator`, `api`, `space`, `beat`,
  `live`, `proxy`, `worker` — entering RUNNING within two seconds of spawn, and
  the entrypoint's own env check printing `✅ Required environment variables are
  available`.

  Three corrections to the pre-write, all now folded into Gotchas above:
  1. `SECRET_KEY` / `LIVE_SERVER_SECRET_KEY` are **auto-generated on first boot**,
     not shipped as fixed public defaults. Set them anyway — the real failure is
     session invalidation on redeploy, not key disclosure.
  2. `SITE_ADDRESS` needed no override. Target port 80 on the Railway domain was
     enough.
  3. `APP_PROTOCOL=https` is required behind Railway's edge and is documented as
     optional. Not caught by any healthcheck; it shows up later as `http://`
     links.

  Confirmed unchanged from the Twenty bundle: services created from an image
  deploy **immediately**, before variables exist — set with `--skip-deploys`,
  then `railway redeploy` in dependency order (datastores first, app second).
  Healthcheck timeout is **seconds**, not milliseconds.

  Still unverified on this instance: a real API token round-trip, and whether
  invitation email sends. Both are in the Procedure and neither has been done.

## Related

- Source pinned at `core/plane` (v1.4.1) — `deployments/aio/community/README.md`
  is the upstream authority for AIO variables
- `docs/twenty/setup.md` — the bundle this procedure is shaped after, including
  the email lesson in its Deltas
- Official MCP server: <https://github.com/makeplane/plane-mcp-server>
- Plane self-hosting docs: <https://developers.plane.so/self-hosting/overview>
