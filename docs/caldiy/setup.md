# Cal.diy on Railway — per-client deployment runbook

**Status:** Written 2026-08-22 from the pinned source at `core/cal.diy`
(`176037d0`, upstream `main` of 2026-08-08). **FIRST EXECUTED 2026-08-22 for
`lossless`** — built and booted to the point of `Please set NEXTAUTH_SECRET`,
which is the expected failure when the secrets have not been written yet. The
Gotchas section has been corrected against that build; two hypotheses were
wrong and are marked as such rather than deleted.

Per-client values (IDs, URLs, secrets) live in `client-stacks/<client>/caldiy/`
(gitignored). No secret values in this file.

## Why Cal.diy

Scheduling — the Calendly lane. It earns a `core/` slot on the same test Plane
passed and Docmost failed: **the capability we actually need is not behind a
commercial licence.** One identity fronting N calendars, unlimited per-audience
booking links, per-event-type destination calendars, and an embeddable booker —
all MIT, all in the community fork.

The licensing history matters and is why this bundle is named `caldiy`, not
`calcom`. Cal.com moved its commercial codebase closed-source in April 2026;
the genuinely open remainder was split off as `calcom/cal.diy` under MIT. Our
2026-07-20 changelog entry recorded that split. This runbook is the other half
of that entry — the part where we actually deploy the thing we said to point at.

## The finding that shapes this entire procedure

**There is no published Cal.diy Docker image.** Verified 2026-08-22 against the
registries, not inferred:

| Probe | Result |
|---|---|
| `registry-1.docker.io/v2/calcom/cal.diy/tags/list` | `NAME_UNKNOWN` — the repository does not exist |
| `hub.docker.com/v2/repositories/calcom/cal.diy/tags` | `count: 0` |
| `ghcr.io/calcom/cal.diy` | anonymous pull denied; no public package |
| `registry-1.docker.io/v2/calcom/cal.com/tags/list` | exists, newest `v6.2.0`, published **2026-03-02** |

The fork's own `apps/docs/content/docker.mdx` tells you to
`docker pull calcom/cal.diy:<tag>` and its `docker-compose.yml` names
`calcom.docker.scarf.sh/calcom/cal.diy`. Both are inherited Cal.com text that
was never rewired after the split — note the `build:` block sitting directly
under that image reference in the compose file. Building **is** the supported
path; the image line is vestigial.

`calcom/cal.com:v6.2.0` is real and pullable, but it predates the April split:
it is the mixed AGPL + commercial-EE codebase, frozen five months, unpatched.
Deploying it would reintroduce exactly the rot the changelog entry called out.
So: **build from source.**

## Decisions this procedure encodes

- **Fork, then build the fork.** `core/cal.diy` points at
  `lossless-group/cal.diy`, not upstream — matching `twenty-crm` and `papermark`
  rather than `plane`/`karakeep`/`plunk`. A source build has no image tag to
  pin, so the fork's `main` *is* the pin. Upstream moves when we sync it, never
  under us mid-deploy.
- **Postgres 15.7-alpine, identical to `plane-postgres`.** Upstream's dev compose
  uses `postgres:18` and the root compose uses unpinned `postgres`. Nothing in
  the schema needs anything past 13. Pattern uniformity wins (D2); one less
  distinct image across the stack.
- **No Redis.** Unlike Twenty and Plane, Cal.diy's web app needs only Postgres.
  There is no `REDIS_URL` in `.env.example`. Two services, not four.
- **No `api/v2` service.** `apps/api/v2` is a separate NestJS app with its own
  Dockerfile, needed only for the Platform/atoms product. The booker, the
  dashboard and the app store all live in `apps/web`. Skip it until something
  actually asks for it.
- **Mail wired from birth, not after.** Every tool in this stack has shipped
  with mail quietly disabled, and Twenty's `LOGGER` default stranded a
  stakeholder for four days across four instances. `EMAIL_SERVER_*` points at
  the shared send-scoped Resend key from `no-reply@didi.sh`, same as `onyx` and
  `outline`.

## Topology

```
Railway project: <client>                 (one private network)
  caldiy            source build from lossless-group/cal.diy @ main, port 3000
  caldiy-postgres   postgres:15.7-alpine   volume at /var/lib/postgresql/data
```

## How the build actually works

Worth understanding before you watch it fail. The root `Dockerfile` is three
stages:

1. **`builder`** — `node:20`, hard-codes
   `NEXT_PUBLIC_WEBAPP_URL=http://NEXT_PUBLIC_WEBAPP_URL_PLACEHOLDER` (it ignores
   any build arg you pass at this stage), runs `turbo prune`, `yarn install`,
   then four sequential builds: `@calcom/trpc`, `embed-core`,
   `copy-app-store-static`, `@calcom/web`. This is the long, memory-hungry part.
   `NODE_OPTIONS=--max-old-space-size=${MAX_OLD_SPACE_SIZE}`, default **6144**.
2. **`builder-two`** — takes `ARG NEXT_PUBLIC_WEBAPP_URL` (default
   `http://localhost:3000`), records it as `BUILT_NEXT_PUBLIC_WEBAPP_URL`, and
   runs `scripts/replace-placeholder.sh` to `sed` the placeholder out of
   `apps/web/.next/` and `apps/web/public/`.
3. **`runner`** — `CMD ["/calcom/scripts/start.sh"]`.

`scripts/start.sh` at every boot:

```sh
scripts/replace-placeholder.sh "$BUILT_NEXT_PUBLIC_WEBAPP_URL" "$NEXT_PUBLIC_WEBAPP_URL"
scripts/wait-for-it.sh ${DATABASE_HOST} -- echo "database is up"
npx prisma migrate deploy --schema /calcom/packages/prisma/schema.prisma
npx ts-node --transpile-only /calcom/scripts/seed-app-store.ts
yarn start
```

Three consequences worth internalising:

- **The public URL is swappable at runtime.** If `NEXT_PUBLIC_WEBAPP_URL` differs
  from what was baked, `replace-placeholder.sh` rewrites the static assets in
  place on boot. So the eventual `*.didi.sh` cutover is a variable change and a
  restart — **not** a rebuild. That is unusually kind for a Next.js app and is
  the single fact that makes this bundle tolerable to self-host.
- **Migrations run on every boot**, unconditionally. No separate migrator
  service, and no `DISABLE_DB_MIGRATIONS` equivalent to set on a worker (there
  is no worker).
- **`start.sh` does not `set -e`.** A `wait-for-it` timeout (default 15s) does
  not abort the boot; it falls through to `prisma migrate deploy`, which will
  produce the real error if the database is genuinely unreachable. Read past the
  first failure in the logs.

## Procedure

### 1. Fork and vendor

```bash
gh repo fork calcom/cal.diy --org lossless-group --clone=false
git submodule add https://github.com/lossless-group/cal.diy.git core/cal.diy
git -C core/cal.diy log -1 --format='%H %ad'   # record this in the client .env
```

~217 MB. Record the commit — it is the pin.

### 2. Postgres

```
service   caldiy-postgres
image     postgres:15.7-alpine
volume    /var/lib/postgresql/data
vars      POSTGRES_DB=calendso
          POSTGRES_USER=calendso
          POSTGRES_PASSWORD=<openssl rand -hex 24>     # hex — it goes in a URL
          PGDATA=/var/lib/postgresql/data/pgdata
```

### 3. The app service, and the ordering that matters

Create the service against the fork, **then generate the domain before the first
build**, so the real public URL is available to bake in:

```
service   caldiy
source    lossless-group/cal.diy @ main
domain    generate, target port 3000
```

`RAILWAY_DOCKERFILE_PATH=Dockerfile` — **set this explicitly.** A freshly
created service reports `Builder: RAILPACK`, and Railpack turned loose on a
Turborepo of this size will not produce the container you want.

### 4. Variables

Non-secret:

```
NEXT_PUBLIC_WEBAPP_URL     https://<domain>
NEXT_PUBLIC_WEBSITE_URL    https://<domain>
NEXTAUTH_URL               https://<domain>
PORT                       3000
TZ                         UTC
CALCOM_TELEMETRY_DISABLED  1
RAILWAY_DOCKERFILE_PATH    Dockerfile
EMAIL_FROM                 no-reply@didi.sh
EMAIL_FROM_NAME            <client> Scheduling
EMAIL_SERVER_HOST          smtp.resend.com
EMAIL_SERVER_PORT          587
EMAIL_SERVER_USER          resend
```

Database — composed reference expressions, wired from birth:

```
DATABASE_URL         postgresql://${{caldiy-postgres.POSTGRES_USER}}:${{caldiy-postgres.POSTGRES_PASSWORD}}@${{caldiy-postgres.RAILWAY_PRIVATE_DOMAIN}}:5432/${{caldiy-postgres.POSTGRES_DB}}
DATABASE_DIRECT_URL  (identical — the Prisma datasource declares directUrl and fails without it)
DATABASE_HOST        ${{caldiy-postgres.RAILWAY_PRIVATE_DOMAIN}}:5432
```

`DATABASE_HOST` is `host:port` with no scheme — it is fed straight to
`wait-for-it.sh`, not to Prisma. Setting it to a full URL silently breaks the
wait (harmlessly, per the no-`set -e` note above, but you'll waste time reading
the traceback).

Secrets:

```
NEXTAUTH_SECRET          openssl rand -base64 32
CALENDSO_ENCRYPTION_KEY  openssl rand -base64 32
CRON_API_KEY             openssl rand -hex 16
EMAIL_SERVER_PASSWORD    the shared Resend key
```

**`CALENDSO_ENCRYPTION_KEY` must be exactly 32 CHARACTERS — do not use
`openssl rand -base64 32` here.** This is the one place cal.diy departs from the
convention every other bundle in this stack follows, and it cost us a deployment
evening. `packages/lib/crypto.ts`:

```js
const _key = Buffer.from(key, "latin1");   // one byte per character
crypto.createCipheriv("aes256", _key, iv); // demands exactly 32 bytes
```

Latin-1 means the key is measured in characters, not decoded entropy.
`openssl rand -base64 32` produces 44 characters → 44 bytes → Node throws.
Use `openssl rand -hex 16` (32 characters, and no `+` `/` `=` to get mangled in
a shell or a variable panel). Contrast `TWENTY_ENCRYPTION_KEY`, which genuinely
does want base64 — copying that recipe across is the trap.

The failure mode is what makes this expensive: it surfaces in the UI as
**"Invalid key length"** inside the connect-a-calendar dialog, immediately under
the app-specific-password field. It reads as a rejected credential. It is not —
`symmetricEncrypt` throws before any request reaches the calendar provider, so
the password is irrelevant and regenerating it repeatedly gets you nowhere.

Beyond length: this key encrypts stored credentials for every connected
calendar, so losing it means every user reconnects everything. It belongs in the
client `.env` recovery copy the moment it is generated. **Rotate it only before
the first successful calendar connection** — after that, every stored credential
is sealed with the live key and changing it orphans them.

### 5. Deploy

**Observed 2026-08-22: a cold first build took about 8 minutes**, not the 30–45
this doc originally budgeted. Railway's builder carried the 6 GB heap without
complaint. Do not plan the afternoon around it.

Set the secrets *before* the first deploy if you can. The build does not need
them — the Dockerfile supplies `ARG NEXTAUTH_SECRET=secret` and
`ARG CALENDSO_ENCRYPTION_KEY=secret` defaults — but the container exits
immediately on boot without the real values, so a build without them buys you
nothing but a red deployment.

### 6. Close the gates

1. Open the domain. First run shows a **setup wizard** — it creates the first
   user. Until that is done the instance is an open door; do it immediately.
2. Create an event type, open its **Advanced** tab, confirm **Add to calendar**
   offers a destination-calendar selector. That selector is the whole reason
   this bundle exists.
3. Invite a second user and confirm the mail lands in a real inbox. Assume mail
   is broken until proven otherwise.
4. Only then add the row to `hubs/lossless-at/src/config/clients.ts`. That file
   is the portal's **routing table**, not an inventory — cf. the-water-foundation's
   Postiz, deployed and healthy and unloggable-into for eleven days because
   nobody could see it.

## Gotchas

Corrected against the 2026-08-22 `lossless` build. ✅ = observed to work,
⚠️ = observed to bite, ❌ = hypothesis that turned out wrong.

- ⚠️ **Railpack instead of Dockerfile.** Real. A freshly created service reports
  `Builder: RAILPACK` even with a `Dockerfile` at the repo root. Setting
  `RAILWAY_DOCKERFILE_PATH=Dockerfile` fixed it and the build log then showed
  the expected `[builder N/15]` / `[builder-two N/12]` / `[runner 4/4]` stages.
- ❌ **Build OOM — did not happen.** The cold build completed in ~8 minutes with
  the default `MAX_OLD_SPACE_SIZE=6144`; Next.js generated 88 static pages with
  31 workers and the image exported cleanly. Keeping the fallback documented
  anyway (local `docker buildx build --platform linux/amd64` → push to
  `ghcr.io/lossless-group/cal.diy:<sha>` → switch the service to that image),
  because the runtime URL replacement means an image built anywhere still works
  here. But do not reach for it pre-emptively.
- ⚠️ **Creating the service fires a build immediately, before you can configure
  it.** This is the ordering trap, and it produced a misreading worth recording.
  The first `lossless` build ran `replace-placeholder.sh <placeholder>
  http://localhost:3000` — the `ARG` default — which looked like proof that
  Railway does not pass service variables as build args. It is not. The build
  had simply started at service-creation time, before the domain existed and
  before any variable was set. The second build, with everything in place, ran
  `replace-placeholder.sh <placeholder> https://caldiy-production-b476.up.railway.app`.
  **Railway does pass service variables as Docker build args.** Create the
  service, generate the domain, set every variable, and treat the build that
  fires on creation as throwaway.
- ✅ **When the URL is baked correctly, boot skips the replacement entirely** —
  `BUILT_NEXT_PUBLIC_WEBAPP_URL` matches the runtime value and
  `replace-placeholder.sh` exits with "Nothing to replace". The runtime rewrite
  remains available for a later domain change; it just is not paid on every boot.
- ⚠️ **`NEXT_PUBLIC_*` other than `WEBAPP_URL` still cannot be set.** Not for the
  reason above — for a different one. `NEXT_PUBLIC_APP_NAME`,
  `NEXT_PUBLIC_COMPANY_NAME` and `NEXT_PUBLIC_SUPPORT_MAIL_ADDRESS` are inlined
  at build time and are **not declared as `ARG`s in the Dockerfile**, so there is
  nothing for Railway's build args to bind to. Rebranding the instance means
  editing the fork and rebuilding. Do not promise a client a white-labelled
  booker on the strength of an env var.
- ❌ **Private-network timing — not an issue.** `wait-for-it.sh
  caldiy-postgres.railway.internal:5432` returned `database is up` in **4
  milliseconds**. Railway's IPv6 private DNS was ready before the app asked.
- ✅ **`prisma migrate deploy` and `seed-app-store.ts` both ran clean** on an
  empty database, seeding the full app store (~100 `📲 Created app:` lines).
  Adds maybe 20 seconds to first boot; near-zero after.
- ⚠️ **Missing `NEXTAUTH_SECRET` fails at `next.config.ts` load, not at
  sign-in.** The error is `⨯ Failed to load next.config.ts` followed by
  `Error: Please set NEXTAUTH_SECRET`, and the container exits 1 *before*
  serving anything. It looks like a config-file problem and is not one. Note
  the ordering in the logs is confusing: turbo's failure output is flushed
  before `start.sh`'s trace of the preceding steps, so the crash appears
  *above* the migration lines that ran before it.
- **`ALLOWED_HOSTNAMES` / `RESERVED_SUBDOMAINS`** default to localhost values in
  `.env.example`. They govern embed origins and username validation. Left unset
  in this deployment; revisit if the embed refuses to load cross-origin from a
  client site.

## Connecting calendars

### Apple / iCloud — no setup, but read the log when it fails

Works out of the box; the `applecalendar` app talks CalDAV to
`https://caldav.icloud.com` with an Apple ID and an **app-specific password**
generated at appleid.apple.com → Sign-In and Security. Apple blocks basic auth on
2FA accounts, so the real account password can never work.

⚠️ **The failure messages in that dialog are actively misleading.** Two distinct
failures render as the same user-blaming string, and neither is necessarily about
the password:

| Log line | Actually means |
|---|---|
| `Invalid key length` | `CALENDSO_ENCRYPTION_KEY` is not 32 characters. Throws in `symmetricEncrypt`, before any request to Apple. The password is never evaluated. |
| `Error: Invalid credentials` (`tsdav:1140`) | Genuine auth rejection — wrong or revoked app-specific password. |
| `Error: cannot find homeUrl` (`tsdav:1164`) | **Login succeeded.** CalDAV discovery found no `calendar-home-set` — the Apple ID has no iCloud Calendar provisioned. Common on Gmail-based Apple IDs created for App Store purchases. Fix is in Apple's settings, not Cal's. |

The rule: **read the deploy log before regenerating any credential.** The dialog
shows one canned string for all three.

### Google Calendar — needs your own OAuth client

Google is not preinstalled, because a self-hosted instance has to bring its own
OAuth app. Two ways to install it; prefer the second.

**In Google Cloud Console:**

1. Create or pick a project, and enable the **Google Calendar API**.
2. OAuth consent screen → add scopes
   `https://www.googleapis.com/auth/calendar.events`,
   `https://www.googleapis.com/auth/calendar.readonly`, and
   `.../auth/userinfo.profile` (the exact set from
   `GOOGLE_CALENDAR_SCOPES` in `packages/lib/constants.ts`).
3. Credentials → Create OAuth client ID → **Web application** → authorized
   redirect URI:

   ```
   https://<your-caldiy-domain>/api/integrations/googlecalendar/callback
   ```

   That path is built in `googlecalendar/api/add.ts:26` from
   `WEBAPP_URL_FOR_OAUTH`, which resolves to `NEXT_PUBLIC_WEBAPP_URL` in
   production. It must match exactly, including scheme.
4. Download the client JSON.

**Then, the declarative install (preferred):** set the whole downloaded JSON as
one line in `GOOGLE_API_CREDENTIALS` and restart. `scripts/seed-app-store.ts:111`
parses it on **every boot** and upserts the app keys, so the install survives a
container replacement and lives in `.env`/`secretspec.toml` like everything else:

```json
{"web":{"client_id":"…","client_secret":"…","redirect_uris":["https://<domain>/api/integrations/googlecalendar/callback"]}}
```

The seeder installs **Google Meet from the same credentials** as a bonus, so
conferencing links come for free.

The alternative is the admin UI at `/settings/admin/apps/calendar`, which writes
the same `App.keys` JSON. It works, but the values then exist only in Postgres —
invisible to `secretspec.toml` and lost on a restore without the database.

⚠️ **Publish the consent screen, don't leave it in Testing.** Google expires
refresh tokens after 7 days for apps in Testing status, so calendars silently
disconnect a week later. Moving it to "In production" avoids that; unverified is
fine at our user counts, verification is only about the warning interstitial.

## What this deployment deliberately does not get

Teams, Organizations, Insights, Workflows, SSO/SAML — all removed from the fork,
which is the point of the fork. Consequences:

- No `/team/<slug>` booking page. The only booking routes that exist are
  `/[user]`, `/[user]/[type]`, and `/d/[link]/[slug]` (hashed private links).
  The `Team` / `Membership` / `Profile` tables survive in `schema.prisma`, but
  nothing renders them.
- `brandColor`, `theme`, `avatarUrl` and `bio` are `User`-level, not
  `EventType`-level. Per-audience *routing* is free — unlimited event types, each
  with its own slug, destination calendar, availability schedule, and `hidden`
  flag. Per-audience *branding* is not: it needs either a second user account or
  the `[user]/[type]/embed` route dropped into a page you already control.

## Backups

Not yet wired. Follows the same shape as the other bundles: a `pg-dump-caldiy`
service against the R2 bucket, weekly cron. The only irreplaceable state is
Postgres — everything else is rebuildable from the fork.

`restore-runbook.md` in the client folder is written **before** the first backup
is needed, not after.

## Deltas observed per deployment

| Client | Date | Delta |
|---|---|---|
| lossless | 2026-08-22 | First execution. Build ~8 min, no OOM. Railpack→Dockerfile fix required. Service-creation fires a throwaway build before the domain and variables exist — the real build is the second one. See `client-stacks/lossless/caldiy/README.md`. |

## Related

- `context-v/explorations/Aggregate-Historical-Calendar-Items-for-Lossless-Twenty.md`
  — why cal.diy is the *booking* layer and explicitly not the history layer
- `changelog/2026-07-20_01.md` — the Cal.com → Cal.diy licensing split
- `docs/plane/setup.md` — the runbook shape this one follows
- `context-v/agent-skills/custom-domain-cutover/` — for the `*.didi.sh` phase
