---
title: "Creating a Railway service fires a build before you can configure it"
lede: "The build that starts the instant a service is created runs with no domain, no variables, and the Dockerfile's ARG defaults. Read anything from it and you will draw the wrong conclusion about what Railway does and does not pass to a build."
date_created: 2026-08-22
date_modified: 2026-08-22
authors:
  - Michael Staton
augmented_with:
  - Claude Code on Claude Opus 5
semantic_version: 0.0.0.1
status: Draft
tags:
  - Reminder
  - Railway
  - Docker
  - Build-Args
  - Debugging-Discipline
site_uuid: 93907458-d8e2-4bcd-8f8e-5b4d189fd7a6
hex_code: vrlj7p
date_authored_initial_draft: 2026-08-22
date_authored_current_draft: 2026-08-22
publish: true
---

# Creating a Railway service fires a build before you configure it

## What happened (2026-08-22, `caldiy` on `lossless`)

Deploying Cal.diy, which has no published image and must be built from its root
`Dockerfile`. The Dockerfile bakes the public URL as a placeholder and replaces
it in a later stage:

```dockerfile
# builder-two
ARG NEXT_PUBLIC_WEBAPP_URL=http://localhost:3000
RUN scripts/replace-placeholder.sh http://NEXT_PUBLIC_WEBAPP_URL_PLACEHOLDER ${NEXT_PUBLIC_WEBAPP_URL}
```

Order of operations was: create the service against the repo → generate the
domain → set `NEXT_PUBLIC_WEBAPP_URL` and everything else. Then read the build
log:

```
[builder-two 12/12] RUN scripts/replace-placeholder.sh \
  http://NEXT_PUBLIC_WEBAPP_URL_PLACEHOLDER http://localhost:3000
```

The `ARG` default — not the domain that was sitting right there in the variable
panel. The obvious reading is **"Railway does not pass service variables as
Docker build args,"** and that reading got written into a runbook as an observed
fact.

It is false. The next build, triggered by a later variable change, ran:

```
[builder-two 12/12] RUN scripts/replace-placeholder.sh \
  http://NEXT_PUBLIC_WEBAPP_URL_PLACEHOLDER https://caldiy-production-b476.up.railway.app
```

**Railway does pass service variables as Docker build args.** The first build
had simply started at service-creation time — before the domain existed, before
a single variable was set — and finished with the defaults it was born with.

## The rule

**Treat the build that fires on service creation as throwaway.** It is a race
you cannot win: the service starts building the moment it has a source, and
there is no window in which to configure it first.

Sequence for any source-built service:

1. Create the service with its repo source. *A build starts. Ignore it.*
2. Generate the domain (or attach the custom one).
3. Set every variable — including `RAILWAY_DOCKERFILE_PATH` if the Dockerfile
   isn't being picked up.
4. **The build triggered by step 3 is the first real one.** Read *that* log.

If a variable-change redeploy isn't going to happen naturally, force one before
you conclude anything.

## The debugging discipline this is really about

A build log is evidence about *the build that produced it*, not about the
platform in general. Before generalising from one run — "the platform doesn't do
X" — check what the run actually had available when it started. A single
observation of a default value is equally consistent with "the value was never
passed" and "the value did not exist yet," and those have opposite fixes.

Cheapest disambiguation: change one variable, let it rebuild, read it again. Two
runs beat one confident inference.

## Corollary — the same ordering hides a second trap

A freshly created Railway service reports `Builder: RAILPACK` even when the repo
has a `Dockerfile` at its root. Set `RAILWAY_DOCKERFILE_PATH=Dockerfile`
explicitly. Because of the same race, the creation build may well have already
run under Railpack and failed in a way that has nothing to do with your actual
container.

## Cost when you get it wrong

Low if caught, annoying if not. In this case the incorrect reading also carried a
second, worse claim into the runbook: that **no** `NEXT_PUBLIC_*` value could be
influenced from Railway. Half of that survived correction for a different reason
— `NEXT_PUBLIC_APP_NAME` and friends genuinely are unreachable, because they are
not declared as `ARG`s in the Dockerfile at all — but the mechanism was wrong,
and a wrong mechanism generalises wrongly to the next tool.

The practical upshot flipped once corrected: with the URL baked correctly,
`start.sh` skips its boot-time asset rewrite entirely instead of paying it on
every restart.

## Related

- `docs/caldiy/setup.md` — the runbook this correction lives in; Gotchas are
  marked ✅ observed / ⚠️ bit us / ❌ hypothesis-was-wrong for exactly this reason
- [[Railway-IaC-Pull-Does-Not-Pin-Database-Images]] — the other Railway trap
  where the tool's output is not what it appears to be
- `client-stacks/lossless/caldiy/README.md` — the deployment where this happened
  (gitignored)
