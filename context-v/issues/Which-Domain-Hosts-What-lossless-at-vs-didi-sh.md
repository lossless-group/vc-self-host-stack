---
title: "Which domain hosts what — lossless.at vs didi.sh"
lede: "Client-facing apps have landed on both domains by accident of chronology, not decision. Nothing is broken; the next deploy will guess, and guess differently than the last one."
date_created: 2026-08-09
date_modified: 2026-08-09
authors:
  - Michael Staton
augmented_with:
  - Claude Code on Claude Opus 5
semantic_version: 0.0.0.1
status: Open
tags:
  - Issue-Resolution
  - Domains
  - lossless.at
  - didi.sh
  - DNS
  - Naming
---

# Which domain hosts what

## Why care?

Two owned domains now carry client-facing surfaces, and which one a thing lives
on was decided by **when it was deployed**, not by what it is. Nothing is broken
today. The cost is that the next tool deployed for the next client has no rule to
follow, so it gets placed by whoever is at the keyboard — and every such choice is
sticky, because moving an app's host later means a forced re-login at best and a
broken auth flow at worst.

Deliberately **not decided now** (2026-08-09) — Michael's call, mid-session, with
the wiki cutovers just finished and no appetite to disturb working services.

## Current state — as of 2026-08-09

### `lossless.at`

| Host | What | Notes |
|---|---|---|
| `lossless.at` | the portal (Vercel) | apex ALIAS; `/[client]` homebases + `/[client]/[service]` redirects |
| `wiki.palmer-ai.lossless.at` | Outline | cut over 2026-08-09 |
| `wiki.reach-edu.lossless.at` | Outline | cut over 2026-08-09 |
| `wiki.the-water-foundation.lossless.at` | Outline | cut over 2026-08-09 |

### `didi.sh`

| Host | What | Notes |
|---|---|---|
| `id.didi.sh` | the identity service (A + AAAA) | id-didi-sh, the identity plane |
| `send.didi.sh` + `resend._domainkey` | Resend sending domain | `no-reply@didi.sh` sends every wiki's magic links |
| `postiz.reach-edu.didi.sh` | Postiz | **load-bearing** — see constraints |
| `palmer-ai.didi.sh` | the old hub | superseded by `lossless.at/palmer-ai`; deploy currently failed |
| `home.reach-edu.didi.sh` | the old hub | superseded; **not resolving** |
| `augment.didi.sh`, `ws.augment.didi.sh` | augment-it | different product, not client-stack |
| `mailtrack.didi.sh` | — | unaudited |

### Still on raw Railway hostnames

| What | Why it hasn't moved |
|---|---|
| 4 × `twenty-server-*.up.railway.app` | Twenty's `SERVER_URL` is also its **OAuth issuer** — it appears in the MCP connector's discovery documents, so changing it forces every connected Claude Desktop to re-authenticate |
| `papermark-production-722f.up.railway.app` | Lower risk, but nobody passes links out of it the way they do from Outline |

## What forced the current split

Not aesthetics — three real constraints:

1. **Outline share links must survive the click.** A redirect *points at* a host,
   it can't hide one, and Outline can't be masked under a subpath because it
   requests `/static` and `/api` as absolute paths from a host root. Share links
   go to people outside the team, so each wiki needed a real owned host. It got
   `lossless.at` because that's the client-facing brand.
2. **Postiz needs a real host to function at all.** It derives its auth cookie
   `Domain` from `FRONTEND_URL`, and `*.up.railway.app` is a Public Suffix apex
   browsers reject — first-signup returns 200 and leaves the user logged out
   forever (this is still the-water-foundation's state). Reach's Postiz works
   *because* it sits on `postiz.reach-edu.didi.sh`. It got didi.sh because that's
   what existed at the time.
3. **Auth email belongs to the identity plane.** `no-reply@didi.sh` was chosen
   deliberately (2026-08-08): didi.sh is where identity lives, and Resend's free
   tier allows one verified domain, which didi.sh already was.

So (1) and (2) reached the same conclusion — *apps that own their host* — and
landed on different domains purely by chronology.

## The candidate rule

Not adopted. Written down so it can be argued with:

> **`lossless.at` is what a client looks at. `didi.sh` is what signs them in.**
>
> - Client-facing app hosts → `<service>.<client>.lossless.at`
> - Identity, auth email, and machine-to-machine → `didi.sh`
> - The portal path `lossless.at/<client>/<service>` stays the memorable front
>   door and redirects to whichever host the app actually needs

That describes where things have landed anyway, except Postiz.

## Open questions

1. **Does Postiz move?** Consistency says yes; risk says no. Reach's is the only
   working Postiz and its login depends on the cookie domain. A lateral move buys
   tidiness and risks the one instance that works. Leaning **leave it**, and
   deploy *future* Postiz instances on lossless.at.
2. **Do the Twenty instances ever move?** Changing `SERVER_URL` breaks existing
   MCP connector grants. Possibly this only happens when
   [[Homebase-MCP-One-Connector-Per-Client]] fronts them and the client-facing
   address stops being Twenty's own host — in which case the question dissolves.
3. **Is the shape `wiki.<client>.lossless.at` or `<client>.lossless.at/wiki`?**
   The latter is impossible for apps that need a host root (that's what started
   this). Three-label subdomains work fine; confirm nothing downstream assumes
   two labels.
4. **Dead hosts.** `home.reach-edu.didi.sh` doesn't resolve and `palmer-ai.didi.sh`
   has a failed deploy — both superseded by portal paths. Retire the services and
   the DNS records, or leave them as redirects for anyone holding old links?
5. **What is `mailtrack.didi.sh`?** Unaudited; predates this work.
6. **Does a client ever get its own apex** (a white-label domain the client owns)?
   If yes, the rule needs a third tier and the portal needs to handle it.

## Related

- [[Normalize-Paths-Everywhere]] — the path model these hosts sit behind
- [[lossless-at-path-based-homebase]] — the decision that made lossless.at the front door
- [[Homebase-MCP-One-Connector-Per-Client]] — may dissolve open question #2
- `context-v/agent-skills/custom-domain-cutover/SKILL.md` — the cutover procedure
- `client-stacks/reach-edu/postiz/stack.md` + `client-stacks/the-water-foundation/postiz/stack.md` — the cookie-domain constraint, both sides of it
