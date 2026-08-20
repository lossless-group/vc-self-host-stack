# Onyx on Railway — per-client deployment runbook

**Status:** Living doc, first executed 2026-08-20 for `palmer-ai`. Per-client
values live in `client-stacks/<client>/onyx/` (gitignored). No secret values
here.

Onyx (formerly Danswer) is an open-source AI chat / enterprise-search platform:
connectors into 40+ sources, embeddings + vector search, works with any LLM.
This is the **heaviest bundle in the stack by an order of magnitude** — read
the Cost section before deploying it for a client.

## Decisions this procedure encodes

- **License verified from source, not from GitHub's metadata.** GitHub reports
  "Other/NOASSERTION". The actual `LICENSE` is **MIT Expat**, except every `ee/`
  directory (`backend/ee`, `web/src/app/ee`, `web/src/ee`) which is under the
  Onyx Enterprise License. Community Edition is what we run; the image logs
  `License enforcement is enabled … behaves as Community Edition` at boot.
- **Pinned image tag `v4.5.6`** across all three images (`onyx-backend`,
  `onyx-web-server`, `onyx-model-server`) — never `latest`, never `nightly-*`,
  never `*-cloud.*`. Same pin-everything discipline as Twenty (D2).
- **OpenSearch, not Vespa.** Current Onyx replaced Vespa with OpenSearch; stale
  guides describing a `vespa` service are pre-v4 and do not apply.
- **nginx is deployed, not dropped.** Onyx serves ONE origin split by path.
  Railway's edge maps a domain to a single service and cannot path-route, so
  upstream's nginx has to run as a Railway service. It is the ONLY Onyx service
  with a public domain.
- **Railway bucket replaces MinIO** (`FILE_STORE_BACKEND=s3`) — same reasoning
  as Twenty's `twenty-storage`.
- **No HuggingFace cache volume on the model servers.** The images ship the
  embedding models baked in at `/app/.cache/temp_huggingface` and copy them to
  `HF_HOME` at boot. A Railway volume mounted there is root-owned, breaks that
  copy (`Permission denied: '.cache/huggingface/hub'`), and forces a re-download
  every start. Upstream's own compose calls the volume "not necessary."
- **Redis runs WITHOUT auth**, matching Onyx's own compose. See Delta 3.

## The three Railway constraints that shape this deploy

These cost the most time on the first run. All three are Railway-vs-image
impedance mismatches, not Onyx bugs.

### 1. Railway does not apply start-command ARGUMENTS to Docker-image services

Proven twice on the palmer-ai run:

- `alembic upgrade head && uvicorn …` ran only the alembic half, then exited.
  The container sat at the image's default `CMD ["tail","-f","/dev/null"]`
  burning 6MB of RAM and looking "SUCCESS" in the dashboard.
- `redis-server --requirepass <x>` produced a server where
  `CONFIG GET requirepass` returned **empty**.

**Therefore:** never rely on `&&`, shell variables (`$VAR`), or extra CLI flags
in a Railway start command for an image-based service. Use
`pre_deploy_command` for migrations and a single bare command to start. Where
config must reach the process, use env vars or bake a config file into a
wrapper image.

Diagnostic that settles it in one shot:

```bash
railway ssh --service <svc> "cat /proc/1/cmdline" | tr '\0' ' '
railway ssh --service onyx-redis "redis-cli config get requirepass"
```

### 2. Railway's private network is IPv6; Onyx binds IPv4 by default

`*.railway.internal` resolves to IPv6. A process bound only to `0.0.0.0` is
unreachable — and the symptom is a **hang (curl 000)**, not a refusal, because
nothing RSTs. Overrides required:

| Service | Fix |
|---|---|
| onyx-api | start command `uvicorn onyx.main:app --host :: --port 8080` |
| onyx-web | `HOSTNAME=::` (Next.js standalone reads it) |
| onyx-inference-model / onyx-indexing-model | start command `uvicorn model_server.main:app --host :: --port 9000` — the module **hardcodes** `host = "0.0.0.0"` with no env override, but `app` is a module-level object so uvicorn can be driven directly |
| onyx-opensearch | `network.host=::` |
| onyx-nginx | `listen [::]:${PORT} ipv6only=off` |

`502` vs `000` is the useful signal: 502 = resolved and refused (process down,
DNS fine); 000 = resolved but hanging (bound to the wrong family).

### 3. Railway volumes mount root-owned; OpenSearch refuses to run as root

Stock image → `AccessDeniedException /usr/share/opensearch/data`.
`RAILWAY_RUN_UID=0` → `OpenSearch cannot run as root`. **Neither knob alone can
work.** Fix is the committed wrapper at `docs/onyx/railway/opensearch/`: start
as root, `chown` the mount, drop to UID 1000 via `setpriv`, exec the upstream
entrypoint unchanged. Requires `RAILWAY_RUN_UID=0` on the service.

Note `setpriv` lives in the full `util-linux` package — `util-linux-core` on
AL2023 ships `chrt`/`nsenter` but not `setpriv`.

## Topology

```
Railway project: <client>
  onyx-nginx            BUILD docs/onyx/railway/nginx/       PUBLIC DOMAIN, path router, $PORT
  onyx-web              onyxdotapp/onyx-web-server:v4.5.6    :3000  HOSTNAME=::
  onyx-api              onyxdotapp/onyx-backend:v4.5.6       :8080  pre-deploy: alembic upgrade head
  onyx-background       onyxdotapp/onyx-backend:v4.5.6       supervisord (Celery); no inbound port
  onyx-inference-model  onyxdotapp/onyx-model-server:v4.5.6  :9000  no volume
  onyx-indexing-model   onyxdotapp/onyx-model-server:v4.5.6  :9000  INDEXING_ONLY=True, no volume
  onyx-opensearch       BUILD docs/onyx/railway/opensearch/  :9200 HTTPS, volume /usr/share/opensearch/data
  onyx-postgres         postgres:15.2-alpine                 volume /var/lib/postgresql/data (PGDATA subdir)
  onyx-redis            redis:7.4-alpine                     no volume, no auth
  bucket onyx-storage   Railway object storage (sjc)         replaces MinIO
```

Only `onyx-nginx` gets a domain. Everything else stays private.

## Procedure

1. **OpenSearch FIRST, alone.** It is the highest-risk service; prove it GREEN
   before spending on the other eight. Create the service from
   `docs/onyx/railway/opensearch/`, attach the volume at
   `/usr/share/opensearch/data`, then set:
   `RAILWAY_RUN_UID=0`, `discovery.type=single-node`,
   `bootstrap.memory_lock=false`, `network.host=::`, `http.port=9200`,
   `OPENSEARCH_JAVA_OPTS=-Xms2g -Xmx2g`, `OPENSEARCH_INITIAL_ADMIN_PASSWORD`.
   Wait for `Cluster health status changed from [YELLOW] to [GREEN]`.

   `discovery.type=single-node` is what lets this work at all — it skips the
   bootstrap checks Railway can't satisfy (`vm.max_map_count` is a host sysctl).

2. **Datastores.** `onyx-postgres` (`POSTGRES_USER/PASSWORD/DB` + `PGDATA=
   /var/lib/postgresql/data/pgdata` — the subdir trick, same as outline),
   `onyx-redis` (no volume, no auth), and the `onyx-storage` bucket. Grab
   credentials with `railway bucket credentials --bucket onyx-storage --json`.

3. **Secrets.** `USER_AUTH_SECRET` and `ENCRYPTION_KEY_SECRET` =
   `openssl rand -hex 32` each. **`USER_AUTH_SECRET` is mandatory — Onyx
   refuses to start without it, and it is NOT in `env.prod.template`.**
   `ENCRYPTION_KEY_SECRET` encrypts stored connector credentials; losing it
   means re-authing every connector. Write both to
   `client-stacks/<client>/onyx/.env`.

4. **Model servers.** Both from `onyx-model-server:v4.5.6` with the uvicorn
   `--host ::` start command. Indexing one also gets `INDEXING_ONLY=True`.
   No volumes (see Decisions).

5. **nginx + domain.** Deploy `docs/onyx/railway/nginx/`, set
   `ONYX_BACKEND_API_HOST=onyx-api.railway.internal:8080` and
   `ONYX_WEB_SERVER_HOST=onyx-web.railway.internal:3000`, generate the domain.
   Do this BEFORE step 6 so `WEB_DOMAIN` is known.

6. **onyx-api and onyx-background.** Same backend env on both (Postgres,
   OpenSearch, Redis, S3, model-server hosts, `AUTH_TYPE`, secrets,
   `WEB_DOMAIN`). onyx-api additionally gets
   `pre_deploy_command: ["alembic upgrade head"]` and start command
   `uvicorn onyx.main:app --host :: --port 8080`. onyx-background gets start
   command `/app/scripts/supervisord_entrypoint.sh` and the two
   `INDEXING_MODEL_SERVER_*` vars. Set `REDIS_PASSWORD=""` on both.

7. **onyx-web.** `INTERNAL_URL=http://onyx-api.railway.internal:8080`,
   `HOSTNAME=::`, `PORT=3000`, `WEB_DOMAIN`.

8. **Verify before handing over.**
   ```bash
   curl -s $URL/nginx-health          # router itself -> ok
   curl -s $URL/api/health            # -> {"success":true,...}
   curl -s -o /dev/null -w '%{http_code}' $URL/   # web UI -> 200
   curl -s $URL/api/auth/type         # has_users:false until admin claims
   ```
   All four must pass. `/api/health` returning 200 proves the OpenSearch index
   pair was created, because onyx-api exits on startup if it wasn't.

9. **Claim the admin account immediately.** `AUTH_TYPE=basic` +
   `has_users:false` means the FIRST signup becomes admin — an unclaimed
   instance on a public URL is an open door. This is the Outline lesson
   (deployed 2026-07-27 with no auth provider, unreachable for 12 days)
   inverted: auth is configured at deploy time here, so close it out at deploy
   time too.

10. **Turn ON invite-only.** `invite_only_enabled` defaults to **`False`**
    (`backend/onyx/server/settings/models.py`), which means ANY visitor who
    finds the URL can self-register. This is a runtime setting in the KV store,
    NOT an env var, so it can only be set in the admin UI (Settings →
    Workspace) after an admin exists. Between deploy and this step the instance
    is an open door — do both in the same sitting.

11. **Email (SMTP).** Required for invite emails, password reset, and email
    verification. Onyx reads `SMTP_SERVER`, `SMTP_PORT`, `SMTP_USER`,
    `SMTP_PASS`, `SMTP_STARTTLS`, `EMAIL_FROM`.

    **Two gotchas.** `EMAIL_CONFIGURED` is derived —
    `bool(SMTP_SERVER) and bool(EMAIL_FROM)` — so `EMAIL_FROM` is not optional
    even though it silently defaults to `SMTP_USER` (which for Resend is the
    literal string `resend`, not an address). And **`ENABLE_EMAIL_INVITES`
    defaults to `false`**: with SMTP perfectly configured but this flag unset,
    invites are still created and the UI reports `NOT_CONFIGURED`/`DISABLED`
    rather than sending anything. Set it to `true` explicitly.

    Lossless clients share the Resend SMTP sender already used by Outline
    (`smtp.resend.com:587`, user `resend`, password = Resend API key,
    `EMAIL_FROM=no-reply@didi.sh`). Verify credentials WITHOUT sending mail:

    ```bash
    python3 -c "
    import smtplib,ssl
    s=smtplib.SMTP('smtp.resend.com',587,timeout=25); s.ehlo()
    s.starttls(context=ssl.create_default_context()); s.ehlo()
    s.login('resend','<resend-api-key>'); print('AUTH OK'); s.quit()"
    ```

    `REQUIRE_EMAIL_VERIFICATION` is deliberately left OFF. Turning it on before
    deliverability is proven can lock every new user out — the same shape as the
    Outline auth incident (2026-07-27 → 2026-08-08).

12. **Add an LLM provider** in Settings → the instance is inert without one.

### How invites actually work (they are not links)

Onyx invites are an **allowlist entry, not a tokenised URL**. `bulk_invite_users`
writes the address to the invited-users list regardless of whether mail sends;
`verify_email_is_invited` then gates registration against that list. So the
invitee signs up at the normal public URL using the invited address and a
password of their own choosing.

Practical consequence: **email delivery is a notification, not the access
mechanism.** If SMTP misbehaves, the invited person can still get in — tell
them the URL and which address to use. Conversely, an invite email arriving
does not by itself prove the account is reachable.

## Cost — read before deploying for a client

Onyx is **~$100–200/month on Railway for a single client**, an order of
magnitude above Twenty + Outline combined. Drivers: OpenSearch holds a 2GB JVM
heap permanently (`-Xms2g`), and both model servers keep embedding models
resident. Upstream's own `docker-compose.resources.yml` sets limits of 10g
(background), 5g (each model server), 4g (api), 4g (postgres).

Railway is the right host for a **trial** — it fits the stack's conventions,
the ops tooling, and the backup story, and it is reversible. It is NOT the
cheap long-term home for this workload: a fixed-price box (e.g. Hetzner CCX23,
4 dedicated vCPU / 16GB, ~€25/mo) running upstream's `docker-compose.prod.yml`
unmodified does the same job for roughly a fifth, and is the path Onyx actually
documents and tests. Onyx's state is Postgres + OpenSearch + object storage —
all portable. If the trial proves out and the bill stings, migrate; this runbook
is what makes that migration cheap.

## Deltas observed per deployment

### palmer-ai, 2026-08-20 (first execution)

- **Delta 1 — start-command arguments.** Cost the most time. `alembic … &&
  uvicorn …` silently ran half. Resolved by moving migrations to
  `pre_deploy_command`. See constraint 1.
- **Delta 2 — IPv6.** Model servers hardcode `0.0.0.0`; driving
  `model_server.main:app` through uvicorn directly was the fix. See
  constraint 2.
- **Delta 3 — redis auth abandoned.** `--requirepass` never reached the server
  (constraint 1), so Onyx sent AUTH to a passwordless redis and died with
  `AuthenticationError`. That ALSO masqueraded as an OpenSearch failure —
  `Document index OpenSearchIndexPair setup did not succeed` ×10 then
  `Application startup failed` — because index setup takes a redis lock first.
  Resolved by setting `REDIS_PASSWORD=""`, matching upstream's compose.
  **Hardening follow-up:** bake `requirepass` into a `redis.conf` in a wrapper
  image rather than passing CLI args.
- **Delta 4 — updating a start command does not redeploy.** The redis fix
  appeared not to work because no new deployment was created. `railway
  redeploy --service <svc> --yes` is required after `update_service`.
- **Delta 5 — benign noise.** onyx-background logs `Failed to load Kubernetes
  configuration` (probing for k8s autoscaling) and onyx-api logs a license
  notice. Both expected; ignore.
- **Delta 6 — untested surfaces.** Connector ingest, S3 upload round-trip (the
  bucket is `urlStyle: virtual-host`, which boto3 can be fussy about), and the
  code-interpreter service (not deployed) are NOT yet exercised.

## Related

- `docs/onyx/railway/opensearch/` — volume-ownership wrapper image
- `docs/onyx/railway/nginx/` — path router image
- `client-stacks/palmer-ai/onyx/.env` — generated secrets (gitignored)
- Upstream compose this was derived from:
  `ai-labs/studies/conversational-ui-and-native-shells/onyx/deployment/docker_compose/docker-compose.prod.yml`
- `docs/outline/setup.md` — the runbook shape this follows
