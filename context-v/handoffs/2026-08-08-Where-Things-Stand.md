---
title: "Where things stand — self-host-stack, 2026-08-08"
lede: "Read this first when you come back to this repo. Nothing is waiting on you right now — this says what landed and what is parked."
date_created: 2026-08-08
date_modified: 2026-08-08
authors:
  - Michael Staton
augmented_with:
  - Claude Code on Claude Opus 5
semantic_version: 0.0.0.1
status: Draft
tags:
  - Handoff
  - Outline
  - lossless.at
  - Email
site_uuid: 53e45e24-acc3-4fc6-8f82-80f60e199bc9
hex_code: 9w60yj
date_authored_initial_draft: 2026-08-08
date_authored_current_draft: 2026-08-08
publish: false
---

# Where things stand

## ✅ NOTHING IS WAITING ON YOU

As of 2026-08-08 every item that needed a human is closed. Palmer AI is
recovered, all three wikis can be logged into and can send invitations, and
Reach's Outline secrets are backed up to the password manager.

Pick from the **Parked** list below whenever you want. Nothing is broken and
nothing is time-sensitive.

## ✅ Cleared 2026-08-08

Magic link clicked; `lastActiveAt` confirmed 22:54Z. Palmer AI's wiki was
unreachable 2026-07-27 → 2026-08-08 because no auth provider was set at deploy
time. Nothing was lost — workspace, docs, and user were all intact the whole
time. Reach's link was sent to `mstaton@reach.edu` at the same time.

**Secrets backed up.** Reach's `SECRET_KEY`, `UTILS_SECRET`, and
`PG_DATABASE_PASSWORD` are now in the password manager, closing the
single-copy-on-one-machine risk.

## ✅ Done (no action needed)

- **Client tools have readable addresses.** `lossless.at/<client>/<tool>` opens
  the right thing for every client. Nine paths live and verified.
  - the-water-foundation: `/crm` `/wiki` `/dataroom`
  - palmer-ai: `/crm` `/wiki`
  - reach-edu: `/crm` `/wiki` `/postiz`
  - lossless: `/crm`
- **All three wikis on owned hosts** (`wiki.<client>.lossless.at`, 2026-08-09) —
  Outline now *generates* clean share links instead of redirecting to a Railway
  hostname. Requires one fresh sign-in per wiki; old links still resolve.
  - Vendor names work as nicknames (`/reach-edu/twenty` → `/reach-edu/crm`).
- **Outline deployed for Reach University** — workspace created, API key minted
  and verified.
- **Email sign-in live on all three wikis**, so logins AND invitations work.
  Until now no teammate could be added to any wiki at all.
- **Homebase pages name the sender** — clients are told sign-in mail comes from
  `no-reply@didi.sh`, so they can spot a forged link.

## ⏸ Parked — pick up whenever, in this order

1. **Reach's Outline `restore-runbook.md`.** The backup cron is live and proven
   to write (2026-08-09); nobody has proven it *restores*. Mirror
   `client-stacks/the-water-foundation/twenty/restore-runbook.md`.
2. **The corpora question.** You said "reach-edu is not loading the corpora I
   already have built in for it" and we never got back to it. Unclear whether
   you meant the Outline wiki (currently 1 collection: "Funders"), the local
   Chroma corpora, or `client-stacks/reach-edu/context-v/`.
3. **One Resend key is shared** by id-didi-sh, augment-it, and three wikis.
   Revoking it breaks every login at once. Worth per-service keys eventually.
4. **Which domain hosts what** — [[Which-Domain-Hosts-What-lossless-at-vs-didi-sh]].
   Client apps have landed on both lossless.at and didi.sh by chronology rather
   than rule. Nothing broken; the next deploy has nothing to follow. Deliberately
   parked 2026-08-09.

## 🔭 The open design thread

The **homebase-proxy** — see [[Normalize-Paths-Everywhere]] and
[[lossless-at-path-based-homebase]].

The short version: `lossless.at/<client>/<service>/mcp` can't work as a redirect,
because logins don't survive a cross-origin hop (measured). It needs a
*same-origin proxy*. That proxy is also what would pack agent-skills and federate
each tool's MCP — the thing you originally wanted "homebase" to be.

The spec gates homebase on id-didi-sh. You pushed back on that and you were
right: the gate's stated reasons (one-service-or-two, workspace scoping,
BYO-key custody) are all **secrets/identity** questions. A proxy that forwards
each tool's own OAuth holds no secrets, so none of them apply. Two things got
fused under one word and the gate froze both.

**Now specced (2026-08-09):**
[[Homebase-MCP-One-Connector-Per-Client]] in `context-v/specs/`. Draft, awaiting
sign-off on seven proposed decisions (H1–H7). The load-bearing bet is **H2** —
using each client's own Twenty as the OAuth authorization server, which is what
removes the id-didi-sh dependency for v1. Phase 0 exists to kill that assumption
in days rather than weeks.

## Reference — what's where

| Thing | Path |
|---|---|
| Portal (the lossless.at site) | `hubs/lossless-at/` — `src/config/clients.ts` is the registry |
| Per-client secrets + deploy records | `client-stacks/<client>/<bundle>/` (gitignored) |
| Deploy runbooks | `docs/<tool>/setup.md` |
| Resend key (already existed) | `ai-labs/id-didi-sh/.env` |
