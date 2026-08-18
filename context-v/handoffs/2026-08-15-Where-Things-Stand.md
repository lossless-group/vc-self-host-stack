---
title: "Where things stand — self-host-stack, 2026-08-15"
lede: "Read this first when you come back. Two things want a human: one Plane invitation, and a decision about Postiz. Everything else is either done or parked on purpose."
date_created: 2026-08-15
date_modified: 2026-08-15
authors:
  - Michael Staton
augmented_with:
  - Claude Code on Claude Opus 5
semantic_version: 0.0.0.1
status: Draft
tags:
  - Handoff
  - Plane
  - Twenty
  - Postiz
  - lossless.at
  - Changelog
site_uuid: 9e7c297e-f875-49bf-8ca6-ff9f42ce5727
hex_code: 45gjpc
date_authored_initial_draft: 2026-08-15
date_authored_current_draft: 2026-08-15
---

# Where things stand

Supersedes [[2026-08-08-Where-Things-Stand]]. That one opened with *nothing is
waiting on you*. This one doesn't — two items want a decision only you can make,
and they're both small.

## 🔴 Waiting on you

**1. Send one Plane invitation.** Plane has been live since 2026-08-14 and has
exactly one user in it: you. Its email path has **never been exercised**. Every
other tool in the stack needed an `EMAIL_DRIVER` / SMTP fix before invitations
worked — Twenty defaulted to `LOGGER` and silently swallowed mail for months (see
below). Plane is the one instance where we haven't proven otherwise. Name an
address and it takes a minute. Until then, treat "a teammate can be added to
Plane" as unverified rather than working.

**2. Decide what happens to TWF's Postiz.** It was deployed 2026-08-03 and has
never been usable — Railway's `*.up.railway.app` is on the Public Suffix List, so
browsers refuse the auth cookie and nobody can stay signed in. It sat that way
for eleven days before anyone noticed, because it was deployed but never routed
into the portal. It is also the single heaviest thing we run: **2,648 MB, or
3,169 MB with its dependencies — 56% of that project's footprint.** Memory is
**93% of the Railway bill** ($48.56 of $52.40 last month), so this one idle
service is the largest single line item across all four clients. Either give it
an owned host and a user, or take it down. Written up in
[[Postiz-Is-The-Heaviest-Thing-We-Run]].

## ✅ Landed since 2026-08-08

**Every CRM could only ever have had one user.** Twenty's `EMAIL_DRIVER` defaults
to `LOGGER` — it writes the invitation to stdout and reports success. No client
had it set. The second stakeholder at the-water-foundation couldn't log in, and
neither could a second person at any of the other three. Resend SMTP is now set
on **both** the server and the worker for all four clients; the worker matters
because that's the process that actually sends. Fixed 2026-08-14.

**Plane is deployed** for `lossless` — project tracking, the thing you wanted
before agents could be asked to work a queue. Runs on the AIO community image,
which collapses thirteen services into one container plus Postgres, Valkey,
RabbitMQ, and a bucket. Runbook at `docs/plane/setup.md`, now marked as executed
rather than theoretical, with six gotchas from the first run. The two that will
bite again: **Plane returns HTTP 200 while completely broken** (Caddy serves
"Looks like Plane didn't start up correctly!" with a success status, so a
healthcheck passing means nothing), and **never change a variable during
first-boot migrations** — doing so killed the migrator mid-run and left two
containers migrating the same database concurrently. Recovery was a TCP proxy
and `DROP DATABASE plane WITH (FORCE)`.

**Release 0.0.0.1 is tagged**, with notes in `changelog/releases/`. The thing
being marked isn't the landing page — it's that four funds are running on this,
with Twenty, Outline, Papermark, and Postiz between them.

**lossless.at is a paradigm showcase**, not a link list. The apex page argues the
per-seat case with a named nine-vendor basket at $264/seat/mo, unified around the
full-suite / one-agent-harness / single-MCP framing. Security has its own
emphasized line. Cards are a CSS Grid, not `columns` — the masonry version
self-scrolled 5,412px unprompted because 79 lazy images kept triggering reflow.

**`lossless.at/changelog` renders 22 entries** through LFM, with a header button
from the apex page. Three older periods were backfilled so the log doesn't start
mid-story: Day One (2026-05-20), the roster filling out (2026-07-20), and the
portal moving out (2026-08-02). Entries sort on `date_created`, deliberately — a
build log wants the date the work happened, not the date it was written up.

**`prep-images-for-embed` is a skill** and is symlinked, so it loads next
session. Screenshot → ImageKit → markdown in one call, with alt text required and
JPEG enforced on upload (measured: the browser still gets 43.5 KB of WebP via
content negotiation, while an unfurler that can't negotiate gets 70 KB of JPEG
instead of a 151 KB PNG). `changelog-conventions` now names it **in its
description**, not just its body, so a changelog session involving screenshots
pulls both skills without you naming the second one.

**Two dead `hub` services deleted.** They'd been failing since 2026-08-09 —
their root directory stopped existing at commit `88e93c9` — while continuing to
serve stale content on a 200.

## ⏸ Parked — pick up whenever

Carried forward from the last handoff, none of them urgent:

1. **Reach's Outline `restore-runbook.md`.** The backup cron is proven to
   *write* (2026-08-09). Nobody has proven it *restores*. Mirror
   `client-stacks/the-water-foundation/twenty/restore-runbook.md`.
2. **The corpora question.** "reach-edu is not loading the corpora I already
   have built in for it" — still unresolved, still unclear whether you meant the
   Outline wiki, the local Chroma corpora, or `client-stacks/reach-edu/context-v/`.
3. **One Resend key is shared** by id-didi-sh, augment-it, three wikis, and now
   four Twenty instances. Revoking it breaks every login in the stack at once.
   The blast radius grew this week.
4. **Which domain hosts what** — [[Which-Domain-Hosts-What-lossless-at-vs-didi-sh]].
   Still undecided, now written down.

New, small:

5. **Plane's workspace slug isn't recorded anywhere.** The token in `~/.secrets`
   authenticates fine (confirmed as `michael@humain.vc`), but Plane's public API
   is addressed as `/api/v1/workspaces/<slug>/…` and exposes no endpoint to list
   your workspaces — so without the slug an agent can authenticate and still
   reach nothing. Read it off the URL bar in the Plane UI and add it to
   `client-stacks/lossless/plane/.env` next to the token.
6. **`clients.ts` is a routing table, not an inventory.** A service can be
   deployed, costing money, and invisible — that's exactly how TWF's Postiz hid
   for eleven days. Nothing reconciles what's deployed against what's routed.
7. **The changelog is `noindex`** along with the rest of the hub. When the apex
   goes public the changelog goes with it, and at that point the roll-up
   question is live — these entries are one feed among several.

## 🔭 The open design thread

Unchanged from the last handoff: **homebase-proxy**, specced as
[[Homebase-MCP-One-Connector-Per-Client]], still Draft, still awaiting sign-off
on decisions H1–H7. The load-bearing bet is **H2** — using each client's own
Twenty as the OAuth authorization server, which is what removes the id-didi-sh
dependency for v1. Phase 0 exists to kill that assumption in days rather than
weeks. Nothing this week moved it either direction.

## Reference — what's where

| Thing | Path |
|---|---|
| Portal (the lossless.at site) | `hubs/lossless-at/` — `src/config/clients.ts` is the registry |
| Changelog surface | `hubs/lossless-at/src/pages/changelog/`, synced by `scripts/sync-changelog.mjs` |
| Per-client secrets + deploy records | `client-stacks/<client>/<bundle>/` (gitignored) |
| Deploy runbooks | `docs/<tool>/setup.md` — `docs/plane/setup.md` is the newest |
| Release notes | `changelog/releases/0.0.0.1.md` |
| Plane | `https://plane-production-3e83.up.railway.app` — Railway project `lossless` |
| Resend key (shared, see Parked #3) | `ai-labs/id-didi-sh/.env` |
| Image pipeline | `context-v/skills/prep-images-for-embed/` at the monorepo root |
