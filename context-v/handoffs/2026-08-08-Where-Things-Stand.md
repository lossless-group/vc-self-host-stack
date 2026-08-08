---
title: "Where things stand — self-host-stack, 2026-08-08"
lede: "Read this first when you come back to this repo. One action is waiting on you; everything else is done or parked."
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
---

# Where things stand

## ⬜ DO THIS FIRST (2 minutes)

**Open your email. Click the magic link sent to `michael@humain.vc`** from
`no-reply@didi.sh`. That gets you back into **Palmer AI's wiki**, which had been
unreachable since 2026-07-27.

A second link went to `mstaton@reach.edu` for Reach's wiki — click that too.

If either expired, ask for a resend. Nothing else is urgent. Nothing is broken.

## ✅ Done (no action needed)

- **Client tools have readable addresses.** `lossless.at/<client>/<tool>` opens
  the right thing for every client. Nine paths live and verified.
  - the-water-foundation: `/crm` `/wiki` `/dataroom`
  - palmer-ai: `/crm` `/wiki`
  - reach-edu: `/crm` `/wiki` `/postiz`
  - lossless: `/crm`
  - Vendor names work as nicknames (`/reach-edu/twenty` → `/reach-edu/crm`).
- **Outline deployed for Reach University** — workspace created, API key minted
  and verified.
- **Email sign-in live on all three wikis**, so logins AND invitations work.
  Until now no teammate could be added to any wiki at all.
- **Homebase pages name the sender** — clients are told sign-in mail comes from
  `no-reply@didi.sh`, so they can spot a forged link.

## ⏸ Parked — pick up whenever, in this order

1. **Copy Reach's Outline secrets to your password manager.** `SECRET_KEY`,
   `UTILS_SECRET`, `PG_DATABASE_PASSWORD` in
   `client-stacks/reach-edu/outline/.env` exist on ONE machine in a gitignored
   folder. This is the largest remaining risk and it's a copy-paste.
2. **Reach's Outline backup cron.** Fully scoped — Reach already has the R2
   bucket and a working `pg-dump-twenty` to clone. Just needs doing.
3. **The corpora question.** You said "reach-edu is not loading the corpora I
   already have built in for it" and we never got back to it. Unclear whether
   you meant the Outline wiki (currently 1 collection: "Funders"), the local
   Chroma corpora, or `client-stacks/reach-edu/context-v/`.
4. **One Resend key is shared** by id-didi-sh, augment-it, and three wikis.
   Revoking it breaks every login at once. Worth per-service keys eventually.

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

**Not yet written up as a proper exploration** — that was the offer on the table.

## Reference — what's where

| Thing | Path |
|---|---|
| Portal (the lossless.at site) | `hubs/lossless-at/` — `src/config/clients.ts` is the registry |
| Per-client secrets + deploy records | `client-stacks/<client>/<bundle>/` (gitignored) |
| Deploy runbooks | `docs/<tool>/setup.md` |
| Resend key (already existed) | `ai-labs/id-didi-sh/.env` |
