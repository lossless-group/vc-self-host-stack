---
title: "Postiz is the heaviest thing we run"
lede: "Postiz and its dependencies account for more than half the memory in the client projects that have it — and memory is 93% of the Railway bill. Nobody is visibly getting value back."
date_created: 2026-08-14
date_modified: 2026-08-14
authors:
  - Michael Staton
augmented_with:
  - Claude Code on Claude Opus 5
semantic_version: 0.0.0.1
status: Open
tags:
  - Issue-Resolution
  - Postiz
  - Railway
  - Cost
  - Capacity
site_uuid: 63724a1b-4309-4346-8ecb-d438404db9c7
hex_code: 2pq8mx
date_authored_initial_draft: 2026-08-14
date_authored_current_draft: 2026-08-14
publish: true
---

## Why care?

Our Railway bill is almost entirely memory. Not CPU, not egress, not traffic —
**memory of always-on containers.** For the Jul 7 – Aug 7 cycle: memory $48.56,
CPU $2.39, egress $0.09, volumes $1.35, on a $52.40 total. That's 93% memory.

Which means cost has nothing to do with how many people use a tool. An idle
container and a busy one cost the same. The only question that moves the bill is
**how much RAM a service holds while sitting there**.

By that measure, Postiz is by a wide margin the most expensive thing in the
stack — and it is not obvious that anyone is getting anything back for it.

## What was measured

Live averages, 2026-08-14, via `railway metrics`:

| Client | Service | Memory |
|---|---|---:|
| the-water-foundation | **postiz** | **2,648 MB** |
| the-water-foundation | temporal | 323 MB |
| the-water-foundation | temporal-postgres | 142 MB |
| the-water-foundation | postiz-postgres | 47 MB |
| the-water-foundation | postiz-redis | 9 MB |
| | **Postiz + dependencies** | **3,169 MB** |
| | *the-water-foundation, whole project* | *5,627 MB* |

**Postiz accounts for 56% of that project's memory footprint.**

reach-edu is the same story: `postiz` measures **2,797 MB**, plus 331 MB of
Temporal and 136 MB of temporal-postgres.

For scale, in the same snapshot:

| Service | Memory |
|---|---:|
| twenty-server (the CRM, the thing clients actually open) | 808 MB |
| outline (the wiki) | 495 MB |
| papermark (the data room) | 244 MB |
| postiz | 2,648 MB |

Postiz is roughly **three Twentys, five Outlines, or eleven Papermarks.**

Temporal is worth naming separately: it exists in exactly the two projects that
run Postiz, and only because Postiz requires it as its durable workflow engine
(`TEMPORAL_ADDRESS=temporal.railway.internal:7233`). It is not a capability we
chose. It arrived attached to Postiz, and it brings its own Postgres.

## The part that makes this an issue rather than a fact

Heavy is fine when something is earning it. Twenty is 808 MB and four clients
open it daily.

Postiz is 2.6 GB and:

- **the-water-foundation's instance cannot be logged into at all.** Its
  `FRONTEND_URL` still points at a `*.up.railway.app` host, and `*.up.railway.app`
  is on the Public Suffix List, so browsers refuse the auth cookie Postiz sets.
  It has been deployed and healthy since 2026-08-03 and has never been usable.
  It is also absent from `hubs/lossless-at/src/config/clients.ts`, so nobody at
  the client could reach it even if it worked. See
  [[Which-Domain-Hosts-What-lossless-at-vs-didi-sh]] for the domain half of this.
- **reach-edu's instance works** — it sits on `postiz.reach-edu.didi.sh`, a real
  host — but we have no signal that anyone is posting from it.

So the most expensive service in the fleet is, in one project, definitively
unusable, and in the other, of unknown value.

## Bill context

The current cycle's estimate is **$102.79 against $52.39 actual last month** —
roughly double. The timing lines up with Papermark, Postiz and Temporal all
coming online at the-water-foundation on 2026-08-02/03, right after the previous
cycle closed. Postiz is the largest single contributor to that step change.

## What this issue is *not* claiming

- Not that Postiz is bad software, or that the category is wrong. A post planner
  is a real line item — it's in the README's stack tables for a reason.
- Not that it should be removed. That's a call about whether the capability is
  wanted, and this doc doesn't have that information.
- Not that the-water-foundation's cookie-domain problem is hard to fix. It isn't;
  it's the same custom-domain cutover reach-edu already got.

The claim is narrower and just this: **we are spending the majority of two
projects' memory on a tool with no demonstrated use, and one of the two
instances has never been openable.** That's worth deciding about deliberately
rather than continuing to pay for by default.

## Open questions

- Is anyone actually scheduling posts from reach-edu's Postiz? If yes, this is
  simply an expensive tool doing its job. If no, the whole category is a
  candidate for removal from the managed tier.
- Does the-water-foundation want a post planner at all? It was deployed as part
  of a bundle, not in response to a stated need.
- Should the managed tier have a **memory budget per client**, so a bundle that
  quietly doubles a project's footprint surfaces at deploy time rather than on
  a bill?

## Related

- [[Which-Domain-Hosts-What-lossless-at-vs-didi-sh]] — the cookie-domain and host
  problem that makes TWF's instance unusable
- `docs/postiz/setup.md` — the deployment runbook
- `changelog/releases/0.0.0.1.md` — records TWF's Postiz as deployed-but-not-usable
