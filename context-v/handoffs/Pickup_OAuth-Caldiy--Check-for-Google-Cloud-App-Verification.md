---
title: "Pickup: Cal.diy OAuth — check whether Google approved the app"
lede: "Cal.diy is deployed, serving, and connected to Apple. Google Calendar is blocked on one thing only: a sensitive-scope verification review Google quoted at 3–5 days from 2026-08-22. This says what to check, what to do with either answer, and what is still uncommitted."
summary: "Resume point for the Cal.diy deployment. First action is checking verification status of the lossless-caldiy OAuth client in the mps-caldiy-sync Google Cloud project; everything else in this doc is state needed to act on that answer without re-deriving it. Also carries the uncommitted-work inventory from the 2026-08-22 session."
date_created: 2026-08-23
date_modified: 2026-08-23
authors:
  - Michael Staton
augmented_with:
  - Claude Code on Claude Opus 5
semantic_version: 0.0.0.1
status: Draft
tags:
  - Handoff
  - Cal.diy
  - OAuth
  - Google-Cloud
  - Scheduling
  - lossless.at
site_uuid: c07d46f8-36eb-4cf4-9580-e9ad448755f0
hex_code: 5889jb
date_authored_initial_draft: 2026-08-23
date_authored_current_draft: 2026-08-23
publish: false
---

# Pickup: Cal.diy OAuth verification

## Do this first

Open [console.cloud.google.com/auth/verification](https://console.cloud.google.com/auth/verification)
in project **`mps-caldiy-sync`** and read the status of the OAuth client
**`lossless-caldiy`**.

Submitted 2026-08-22. Google quoted **3–5 days**, so expect an answer between
**2026-08-25 and 2026-08-27**. There may also be mail to the developer-contact
address on the Branding page.

Everything below exists so that whichever answer comes back, you can act on it
without reconstructing the evening that produced it.

## Identifiers you will need

| Thing | Value |
|---|---|
| Google Cloud project | `mps-caldiy-sync` |
| OAuth client name | `lossless-caldiy` |
| Client ID | `59588567964-39c6rtv413pstig5kgbje61f8eoe0sf9.apps.googleusercontent.com` |
| Redirect URI | `https://caldiy-production-b476.up.railway.app/api/integrations/googlecalendar/callback` |
| Scopes | `calendar.events`, `calendar.readonly`, `userinfo.profile` |
| Privacy / terms | `https://lossless.at/privacy`, `https://lossless.at/terms` |
| Search Console TXT | `google-site-verification=CV3Pi506sE4wBSyMHQc8Ny2uwYPgfLcrYydf6xNzEBk` (Vercel rec `rec_d6ff0425902c7fcf329782cf`) |

**Unresolved from the last session:** the Cloud project is under a humain.vc
account, but Search Console ownership of `lossless.at` is verified by
`mpstaton@gmail.com`. The other six addresses were added as **Full**, which is a
permission level, not ownership. If the review comes back rejected on domain
ownership, that is the reason — promote `michael@humain.vc` to **Owner** in
Search Console → Settings → Users and permissions and resubmit. Worth doing
pre-emptively; it costs nothing and removes a three-day round trip.

## If approved

1. Download the client JSON (Clients → `lossless-caldiy` → download icon beside
   the client secret). The secret is only fully visible at creation — if it is
   masked, **Add secret** and use the new one.
2. Set it on Railway without pasting the secret anywhere:

   ```bash
   railway variables --set "GOOGLE_API_CREDENTIALS=$(jq -c . ~/Downloads/client_secret_*.json)" \
     --service caldiy --environment production \
     --project 32e27528-07fd-4bdc-ae47-e96c5d7ae1cf
   ```

   `scripts/seed-app-store.ts:111` parses it on **every boot** and upserts the
   app keys, so the install survives container replacement and a database
   restore. It also installs Google Meet from the same credentials.
3. Watch the deploy log for `Error adding google credentials to DB:` — silence
   means it seeded and Google Calendar is installable from Cal's app store.
4. Connect the seven accounts (below), one at a time, ideally each in its own
   incognito window so Google's account picker cannot mis-select.

## If rejected

Read which check failed; the two that already failed once are:

- **Home-page domain not registered to you** → the Search Console ownership
  issue above.
- **Logo does not uniquely identify your brand** → an earlier attempt used
  Cal.com's icon, which Google correctly read as impersonation. The current
  asset is the Lossless mark at `~/Downloads/lossless-logo-120.png` (120×120
  PNG, rendered from `site/public/appIcon__Lossless_Record--Rounded-Rectangle.svg`).

If verification turns into a slog, the fallback that avoids it entirely:
**publish the app unverified** (Audience → Publish) and mark the client
**Trusted** in each Workspace domain's admin console — Security → Access and
data control → API controls → App access control → *Configure new app* → OAuth
Client ID. Publishing is what stops the 7-day refresh-token expiry; Trusted is
what stops org policy blocking the grant and removes the warning interstitial
for users in that domain. Six of the seven addresses are on domains we
administer, so this is available.

## The seven accounts

`michael@humain.vc`, `michael@avalanche.vc`, `michael@hypernova.capital`,
`michael@lossless.group`, `michael@colearn.com`, `michael@learnstart.vc`,
`mpstaton@gmail.com`.

Six distinct Workspace domains plus one consumer account, which is why
**Internal** app type was ruled out — Internal authorizes one org only.

One OAuth client covers all seven; verification attaches to the app, not the
users. `googlecalendar/api/callback.ts:79` calls `CredentialRepository.create`,
not an upsert, so each account stacks as its own credential rather than
replacing the last.

## State of the deployment

**Working now.** Cal.diy serves at
`https://caldiy-production-b476.up.railway.app`, reachable from the portal at
`lossless.at/lossless/scheduling` (alias `/lossless/caldiy`). Apple/iCloud is
connected via app-specific password. Admin account created.

| Railway | |
|---|---|
| project | `lossless` `32e27528-07fd-4bdc-ae47-e96c5d7ae1cf` |
| environment | `production` `a1e433c0-fd00-4633-bd0b-d2beaadda8a5` |
| `caldiy` | `c4506654-e540-4b9e-b28b-4f8e8114636a` |
| `caldiy-postgres` | `c82ced7a-ba07-4377-bc4d-9373dea80f8c`, volume `23cb7608` |
| source | `lossless-group/cal.diy` @ `main`, pinned `176037d0` in `core/cal.diy` |

Secrets and per-deploy values: `client-stacks/lossless/caldiy/.env` (gitignored).
Procedure and every gotcha: `docs/caldiy/setup.md`.

**Two traps that cost the most time, both documented but worth re-reading before
touching this again:**

- `CALENDSO_ENCRYPTION_KEY` must be **exactly 32 characters** — `crypto.ts` does
  `Buffer.from(key, 'latin1')`. `openssl rand -base64 32` gives 44 and surfaces
  as "Invalid key length" *in the calendar dialog under the password field*,
  which reads as a rejected credential and is not. Use `openssl rand -hex 16`.
- **Read the deploy log before regenerating any credential.** Cal renders one
  canned error for several distinct failures. `cannot find homeUrl` means login
  *succeeded* and the account has no calendar provisioned — nothing to do with
  the password.

## Deliberately not done

- **Backups.** No `pg-dump-caldiy` service. Only irreplaceable state is Postgres
  plus the encryption key. `client-stacks/lossless/caldiy/restore-runbook.md` is
  written; nothing runs it.
- **`*.didi.sh` cutover.** Cheap when wanted — Cal rewrites its baked public URL
  at boot, so it is a variable change and a restart, not a rebuild. **But
  Google's authorized redirect URI does not follow automatically**; add the new
  one in Clients *before* cutting over or every calendar connection breaks at
  once.
- **`email_sender` on the portal card.** Mail is wired to the shared Resend key
  from birth but nothing has been observed to send. That field is stated on the
  page as fact, so it stays off until an invite lands in a real inbox.
- **ICS stopgap.** Considered and declined. Read-only, so it can never be a
  booking destination — and the `/public/basic.ics` form derives from the email
  address, making it readable by anyone who knows it. If ever wanted, use the
  **secret address** (`/private-<hash>/basic.ics`), never the public one.

## Uncommitted as of 2026-08-23

`self-host-stack`, all from the 2026-08-22 session:

```
M  .gitmodules                                          core/cal.diy submodule
M  README.md                                            cal.diy into core/, out of Coming next; arithmetic shown
M  context-v/issues/Which-Domain-Hosts-What-...          new "Records of record" section
A  core/cal.diy                                          submodule @ 176037d0
M  hubs/lossless-at                                      pointer bump (7 commits, through 9cb2735)
?? changelog/2026-08-22_01.md                            "The Tool We Recommended Had No Image"
?? context-v/reminders/Creating-a-Railway-Service-...    build-args ordering trap
?? docs/caldiy/setup.md                                  the runbook
```

`content-farm/plugin-modules/stenographer` on `development`:

```
?? context-v/specs/Local-Transcription-Engine.md         local Whisper engine spec
```

**The changelog is missing its screenshots.** Two were captured — the Apple
Calendar "Connected" badge, and the Enable-apps onboarding step — but the files
were lost when macOS cleared its screenshot temp dir. If they can be
re-captured, run them through `prep-images-for-embed` (JPEG not WebP, ImageKit,
absolute URLs, real alt text) before committing. The entry stands without them.

## Related

- `docs/caldiy/setup.md` — the runbook, gotchas marked ✅ observed / ⚠️ bit us / ❌ hypothesis-wrong
- `client-stacks/lossless/caldiy/README.md` — this deployment specifically (gitignored)
- [[Creating-a-Railway-Service-Fires-a-Build-Before-You-Configure-It]]
- [[Which-Domain-Hosts-What-lossless-at-vs-didi-sh]] — DNS records of record
- `changelog/2026-08-22_01.md` — the narrative version
