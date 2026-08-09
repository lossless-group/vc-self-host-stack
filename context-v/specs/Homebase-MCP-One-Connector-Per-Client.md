---
title: "Homebase MCP — one connector per client, every tool behind it"
lede: "A client adds one address to Claude and their agent can move across CRM, wiki, data room, and post planner in a single task — because one small service per client fronts them all, holds the credentials, and serves our skills as prompts."
date_created: 2026-08-09
date_modified: 2026-08-09
authors:
  - Michael Staton
augmented_with:
  - Claude Code on Claude Opus 5
semantic_version: 0.0.0.1
status: Draft
tags:
  - Spec
  - Homebase
  - MCP
  - Capability-Plane
  - Agent-Skills
  - lossless.at
  - Self-Host-Stack
---

# Homebase MCP — one connector per client

## Why Care?

Today a client who wants their AI to reach their tools adds **one connector per
tool**, each at a raw Railway hostname, each with its own login. Twenty has a
native MCP endpoint; Outline, Postiz, and Papermark have none, so their data is
simply unreachable by an agent. Nothing can span them: no agent can answer
*"find this company in the CRM, pull our research note from the wiki, and draft
a post about it"* — because nothing sees more than one tool at a time.

Homebase is one small service per client that fronts the whole roster. The client
adds **one** address. Behind it, an agent gets every tool, every service's data,
and our own agent-skills as callable prompts.

Three things make this the right moment:

1. **The measurement.** A redirect cannot carry a login — `Authorization` is
   stripped across an origin boundary by every conforming client (measured
   2026-08-09, [[Normalize-Paths-Everywhere]]). So `lossless.at/<client>/…/mcp`
   can only ever work as a **proxy**. Homebase *is* that proxy. The clean URL
   shape and the aggregator turn out to be the same build.
2. **The gate was on the other half.** Phase 6 of
   [[Per-Client-Stack-Deployment-Spec-Twenty-First]] blocks homebase on the
   id-didi-sh parent spec absorbing *"one-service-or-two, workspace scoping,
   BYO-key custody."* All three are **secrets-and-identity** questions. An
   aggregator that federates tools and serves skills holds no keys of its own and
   answers none of them. Two things were fused under one word and the gate froze
   both. See *Relationship to the id-didi-sh gate*.
3. **The registry already exists.** `hubs/lossless-at/src/config/clients.ts`
   already knows every client, every service, and every origin — as structured
   data, as of 2026-08-08. Homebase needs exactly that list.

## What "aggregate" means here — three distinct planes

The word covers three different things with different difficulty. Naming them
separately is most of the design.

| Plane | What it aggregates | Needs identity? | Needs secret custody? |
|---|---|---|---|
| **Tools** | Twenty's native MCP (proxied) + tools we write over Outline / Postiz / Papermark REST + BYO SaaS | Yes — acts *as* a person | Yes — per-service credentials |
| **Context** | `context-v/` docs, stack records, service inventory, the connect guide | No | No |
| **Skills** | `SKILL.md` files served as MCP **prompts** | No | No |

Context and Skills are shippable with no identity story at all. Tools are where
the real work is. **Phase order follows that gradient** — the cheap planes prove
the connector and the client experience before the expensive one starts.

## Decisions inherited (do NOT relitigate)

From [[Per-Client-Stack-Deployment-Spec-Twenty-First]]:

- **D1/D2** — one Railway project per client, no shared datastore, no
  multi-tenancy. Homebase is **one instance per client**, never a shared service.
- **D5** — clients get **full read-write**. Safety comes from engineering
  (transactions, audit rows, snapshots, confirmation on destructive/bulk
  operations), never from read-only ceilings.
- **D6** — remote connectors only. Claude Desktop, ChatGPT Desktop, Claude
  mobile, ChatGPT mobile — all day one. No local config, no terminal, ever.
- **D7** — homebase is a small always-on container *inside the client's own
  Railway project*, so it reaches their databases over the private network while
  those databases stay dark to the internet.
- **D8** — every client is a mixed stack. The plane fronts BYO SaaS too
  (reach-edu's Streak), not only what we host.
- **D10** — no blueprint until the pattern is proven. This spec produces none.

## New decisions this spec proposes

Each needs sign-off before implementation.

| # | Decision | Why |
|---|---|---|
| **H1** | **Proxy, never redirect.** Homebase terminates the MCP session same-origin and forwards upstream server-side. | Measured: cross-origin redirects strip `Authorization`. There is no redirect-shaped version of this. |
| **H2** | **The client's own Twenty is the OAuth authorization server for homebase.** | Every client user already has a Twenty account, and Twenty already ships a working authorization server (verified: `/.well-known/oauth-authorization-server`, `/authorize`, `/oauth/token`). This gives per-user identity, per-client scoping, and offboarding-by-CRM-deactivation with **zero new identity infrastructure** — and it is what removes the id-didi-sh dependency for v1. didi.sh JWKS replaces it later without changing the client-facing URL. **This is the highest-risk assumption in the spec — Phase 1 exists to kill it early.** |
| **H3** | **One connector per client, not per service.** `lossless.at/<client>/mcp`. | The whole point. Per-service paths remain as human links. |
| **H4** | **Tools are namespaced by service** — `twenty_*`, `outline_*`, `postiz_*`, `dataroom_*`. | An agent traversing services needs to know which system it is touching, and name collisions across four products are certain otherwise. |
| **H5** | **Credentials live in homebase's environment, never in the transcript.** Agents receive capabilities; no tool ever returns a secret value. | The parent exploration's reframe: *distribute capabilities, not secrets*. |
| **H6** | **Skills ship as MCP prompts, sourced from `context-v/agent-skills/`.** | Makes our accumulated know-how executable by the client's own agent instead of trapped in our repo. |
| **H7** | **Read-only in Phase 1–2; writes gated behind explicit confirmation from Phase 3.** | Not a read-only ceiling (D5 forbids that) — a **sequencing** choice, so the connector matrix is proven before an agent can mutate a client's CRM. |

## Architecture

```
Claude / ChatGPT (desktop + mobile)
        │  one connector URL
        ▼
lossless.at/<client>/mcp          ← Vercel portal, same-origin proxy pass
        │
        ▼
homebase (client's own Railway project, private network)
        │
        ├── Tools   ──┬── twenty_*     → proxied to Twenty's native /mcp
        │             ├── outline_*    → Outline REST (OUTLINE_API_KEY)
        │             ├── postiz_*     → Postiz REST
        │             ├── dataroom_*   → Papermark REST
        │             └── <byo>_*      → client's BYO SaaS (e.g. Streak)
        │
        ├── Resources ── context-v docs, stack records, service inventory
        │
        └── Prompts  ── agent-skills (SKILL.md) as callable prompts
```

**Auth flow (H2).** Client pastes `lossless.at/<client>/mcp` → homebase answers
401 with `WWW-Authenticate` pointing at its own protected-resource metadata →
which delegates to that client's Twenty as authorization server → the person
signs in with the CRM account they already have → homebase receives a token it
can verify against Twenty, and maps it to a `homebase_subject` for audit.

Per-service credentials are homebase's own environment variables. The user's
identity governs *whether* a call is allowed; homebase's credentials govern *how*
it reaches the service. This is the split that lets one connector span four
products without the human holding four logins.

## Relationship to the id-didi-sh gate

The gate is real and this spec does not remove it — it **narrows** it.

- **Still gated, still theirs:** BYO-key custody, org/workspace scoping grammar,
  the admin dashboards where a non-client manages their own keys, the vault
  bake-off, and the one-service-or-two contract for a *central* plane.
- **Not gated:** federating tools a client already pays us to run, serving our
  own docs and skills, and proxying an MCP session so a URL works. Homebase v1
  holds only credentials **we already hold** for services **we already operate**
  on behalf of a **paying client** — the exact case the parent exploration says
  is settled (*"clients use our API keys for as long as they're paying us"*).

Homebase v1 is therefore a **consumer** of the identity decision, not an input to
it. H2 deliberately picks an identity source that already exists per client, so
the plane can ship and be replaced from underneath when didi.sh JWKS is ready.

**This spec must not** grow BYO-key entry, key visibility, or ownership transfer.
The moment those appear, it has become the capability plane and belongs to the
parent spec.

## Phases

Each phase ends in a gate: a thing observed, not a thing believed.

### Phase 0 — Kill the risky assumption first

Before building anything real, prove H2. Stand up a **throwaway** MCP server in
reach-edu's project that does exactly one thing: delegate OAuth to reach-edu's
Twenty and expose a single `whoami` tool.

Test across the full matrix (D6): Claude Desktop, ChatGPT Desktop, Claude mobile,
ChatGPT mobile. Record which auth flows each accepts and whether **resources** and
**prompts** surface in each UI, or only tools — this is open question #1 in the
ai-labs exploration and it is the binding constraint on the entire architecture.

> **GATE 0:** The matrix is filled in, in the ai-labs Findings section. If Twenty
> cannot serve as authorization server for a third-party resource, H2 dies here
> and the spec returns for an identity decision — having spent days, not weeks.

### Phase 1 — Context and Skills (no identity required)

Ship homebase serving **resources** (service inventory, the connect guide, stack
facts) and **prompts** (agent-skills). Read-only, no client data.

> **GATE 1:** From a phone, an operator asks their agent *"what tools does
> reach-edu run and where do I sign in"* and gets a correct answer sourced from
> homebase — not from the model's memory.

### Phase 2 — Read across services

Add read tools for all four products, namespaced per H4. Twenty proxied; the
other three written over their REST APIs.

> **GATE 2:** One prompt spans two services with no human glue — e.g. *"find
> Acme in the CRM and show me any wiki page that mentions them."*

### Phase 3 — Writes, with the safety D5 requires

Enable writes: transactions where the API allows, an audit row per mutation
carrying the authenticated subject, snapshot-before-bulk, and explicit
confirmation on destructive or multi-record operations.

> **GATE 3:** A real stakeholder — not an operator — completes a cross-service
> write from a phone, and the audit trail shows their identity, not ours.

### Phase 4 — Retire the per-service connector

Point `clients.ts`'s `mcp_url` at the homebase path, update
`docs/twenty/connect-your-ai.md`, and stop handing out `*.up.railway.app`
addresses entirely — closing [[Normalize-Paths-Everywhere]].

> **GATE 4:** No Railway hostname appears in any client-facing surface. Retro:
> is the pattern nailed enough for a blueprint (D10)?

## Acceptance criteria

- [ ] One connector URL per client; a client adds exactly one address, ever
- [ ] Works on all four harnesses (2 vendors × 2 form factors) — D6
- [ ] Authenticates as the *person*, and the audit trail proves it — D5
- [ ] Spans at least three services in a single task with no human glue
- [ ] Serves at least three agent-skills as prompts that a client's agent runs
- [ ] No secret value ever appears in an agent transcript — H5
- [ ] One instance per client, in the client's own project, no shared state — D1/D2/D7
- [ ] Fronts at least one BYO SaaS, not only our own deployments — D8
- [ ] `clients.ts` is the only place the service roster is declared

## Anti-goals

- **Not the vault, not the admin dashboards, not BYO-key custody** — those stay
  with id-didi-sh
- **Not multi-tenant.** One instance per client or it violates D1/D2
- **Not a read-only product.** Phase 1–2 read-only is sequencing, not a ceiling (D5)
- **Not a replacement for the human-facing paths.** `lossless.at/<client>/wiki`
  and friends stay exactly as they are
- **No blueprint** until the Phase 4 retro says so (D10)

## Open questions

1. **Does Twenty work as an authorization server for a third party?** (H2, the
   whole bet.) Its discovery documents advertise the endpoints; whether it will
   issue tokens for a resource that isn't itself is unverified. Phase 0.
2. **Do resources and prompts surface in ChatGPT's UI, or only tools?** If only
   tools, Phase 1's value collapses on half the matrix and skills must be
   re-shaped as tools. Shared with ai-labs OQ#1.
3. **Where does homebase's code live?** A new `core/homebase/` in this repo, or
   its own repo mounted as a submodule? Affects the deploy story per client.
4. **How do skills get from `context-v/agent-skills/` into a running homebase** —
   baked at build, or fetched at runtime so a skill edit doesn't need a redeploy?
5. **What is the per-client cost** of an always-on container across N clients, and
   does it change the answer for clients running only one tool?
6. **Does the Vercel portal proxy, or does homebase take the domain directly?**
   Proxying through Vercel keeps one certificate and one URL shape; a direct
   custom domain per homebase is fewer hops. Interacts with Postiz's
   cookie-domain constraint.

## Related

- [[Normalize-Paths-Everywhere]] — the measurement that makes this a proxy
- [[lossless-at-path-based-homebase]] — the path model this completes
- [[Per-Client-Stack-Deployment-Spec-Twenty-First]] — D1–D10, and the Phase 6 gate
- `ai-labs/context-v/explorations/Secrets-for-Collaborators-Who-Will-Never-Open-a-Terminal.md` — the capabilities-not-secrets reframe, workspaces, OQ#1–7
- `ai-labs/id-didi-sh/context-v/explorations/Serving-Secrets-Server-Side-as-an-MCP-Capability-Plane.md` — implementation-local notes
- [[Hermes-Agent-Colocation-and-Hackability]] — Option D (shared connector gateway) is this, arrived at from the agent-hosting side
