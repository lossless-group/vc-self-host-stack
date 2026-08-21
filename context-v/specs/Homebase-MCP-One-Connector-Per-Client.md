---
title: "Homebase MCP — one connector per client, every tool behind it"
lede: "A client adds one address to Claude and their agent can move across CRM, wiki, data room, and post planner in a single task — because one plane fronts them all, authenticates them through didi.sh, holds the credentials, and serves our skills as both prompts and resources."
date_created: 2026-08-09
date_modified: 2026-08-20
authors:
  - Michael Staton
augmented_with:
  - Claude Code on Claude Opus 5
semantic_version: 0.0.1.0
status: Draft
tags:
  - Spec
  - Homebase
  - MCP
  - Capability-Plane
  - Agent-Skills
  - lossless.at
  - Self-Host-Stack
site_uuid: c5166dc9-157d-4f2f-b448-84e7d005f477
hex_code: p7y02f
date_authored_initial_draft: 2026-08-09
date_authored_current_draft: 2026-08-20
publish: true
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
| **Skills** | `SKILL.md` files served as MCP **prompts _and_ resources** (A2 — Onyx's MCP client does not read prompts) | No | No |

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
- **D7** — ⚠️ *narrowed 2026-08-20 by A3: applies once a capability needs direct
  database access; until then the plane may be central.* homebase is a small always-on container *inside the client's own
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
| **H2** | ⛔ **SUPERSEDED 2026-08-20 by A1 — didi.sh is the authorization server.** ~~The client's own Twenty is the OAuth authorization server for homebase.~~ | Every client user already has a Twenty account, and Twenty already ships a working authorization server (verified: `/.well-known/oauth-authorization-server`, `/authorize`, `/oauth/token`). This gives per-user identity, per-client scoping, and offboarding-by-CRM-deactivation with **zero new identity infrastructure** — and it is what removes the id-didi-sh dependency for v1. didi.sh JWKS replaces it later without changing the client-facing URL. **This is the highest-risk assumption in the spec — Phase 1 exists to kill it early.** |
| **H3** | **One connector per client, not per service.** `lossless.at/<client>/mcp`. | The whole point. Per-service paths remain as human links. |
| **H4** | **Tools are namespaced by service** — `twenty_*`, `outline_*`, `postiz_*`, `dataroom_*`. | An agent traversing services needs to know which system it is touching, and name collisions across four products are certain otherwise. |
| **H5** | **Credentials live in homebase's environment, never in the transcript.** Agents receive capabilities; no tool ever returns a secret value. | The parent exploration's reframe: *distribute capabilities, not secrets*. |
| **H6** | ⚠️ **AMENDED 2026-08-20 by A2 — prompts AND resources.** Skills ship as MCP prompts *and* resources, sourced from `context-v/agent-skills/`. | Makes our accumulated know-how executable by the client's own agent instead of trapped in our repo. **Prototyped 2026-08-09 without homebase** — see below. |
| **H7** | **Read-only in Phase 1–2; writes gated behind explicit confirmation from Phase 3.** | Not a read-only ceiling (D5 forbids that) — a **sequencing** choice, so the connector matrix is proven before an agent can mutate a client's CRM. |

## Amendments — 2026-08-20 (`0.0.0.1` → `0.0.1.0`)

Three decisions change. Read these **before** the table above; where they
conflict, the amendment wins.

### A1 — H2 is SUPERSEDED. didi.sh is the authorization server, not Twenty.

**Ruling (Michael, 2026-08-20):** didi.sh is our own auth system for a *suite* of
products, and self-host-stack is one product in that suite. Homebase authenticates
against didi.sh.

H2 picked Twenty specifically to *dodge* the id-didi-sh dependency for v1. That
dependency is now taken on deliberately, which makes the dodge cost rather than
save: Twenty-as-AS would build a client-facing identity path and then throw it
away, and per H3 the client-facing URL never changes anyway, so there was nothing
durable to gain.

**What is already live** (measured 2026-08-20, not assumed):

| Surface | State |
|---|---|
| `https://id.didi.sh/.well-known/jwks.json` | **200** — EdDSA / Ed25519 signing key |
| `/api/me` | Returns `didi_id`, primary + alt emails, name, handle, avatar, **`memberships` with `org_id` + `role`**, session expiry. This *is* the `whoami` Phase 0 was going to write |
| `/api/workspaces`, `/api/workspaces/:slug/join` | **Workspace scoping exists in code** — the unit the parent exploration names as where a key attaches |
| `/api/magic-links` create + redeem, `/api/session/refresh` | Passwordless auth, live |

The spec said "didi.sh JWKS replaces it later." It is not later. It is live.

**The one real gap:** didi.sh has **no OAuth 2.1 authorization-server surface** —
no `/authorize`, no token endpoint, no dynamic client registration, no AS
metadata. Magic-link + JWKS makes didi.sh an excellent token *issuer and
verifier*; it is not yet an *authorization server*, and OAuth-server semantics are
what MCP clients speak. Already recorded at
`id-didi-sh/context-v/explorations/Serving-Secrets-Server-Side-as-an-MCP-Capability-Plane.md`
line 52, with two candidate paths — grow the endpoints in Phoenix, or exchange an
existing `didi_session` for an MCP access token — and both gated on measuring
what the desktop clients actually accept.

**Consequence for Phase 0:** it is repointed at didi.sh and **merges with the
parent's spike #1**. They were always the same experiment — stand up a stub MCP
server, connect from the 2×2 client matrix, record which auth flows are accepted
and whether resources and prompts surface — differing only in which authorization
server sits behind it. They have been sitting in two repos blocking each other.
Run once, against didi.sh, and both discharge.

Note the matrix is **not empty**: cell #1 is already **PASS** (2026-07-25, parent
Findings) — Claude Desktop → Twenty native MCP, full discovery → RFC 7591 DCR →
PKCE → tool calls, with the `TRUST_PROXY=1` gotcha found and fixed. The OAuth
*mechanics* are de-risked; what is unrun is that flow against didi.sh.

### A2 — H6 is AMENDED. Skills ship as prompts **and** resources.

**Measured 2026-08-20 against Onyx v4.5.6.** Onyx's MCP *client*
(`backend/onyx/server/features/mcp/client.py`) calls `list_tools`, `call_tool`,
and `list_resources`. There is **no `list_prompts` / `get_prompt`** anywhere in
the codebase.

H6 as written ships skills as prompts only. Claude Desktop would see them; **Onyx
would see nothing** — and Onyx is now the team-facing UI (deployed for palmer-ai
2026-08-20, `docs/onyx/setup.md`). Serve each `SKILL.md` as **both** a prompt
(Claude Desktop, where prompts are user-invocable) and a resource (Onyx, which
discovers resources). One source, two affordances. Decided now it is an
afternoon; discovered later it is a rewrite of the plane.

The Prior-art finding below still holds and now applies to both affordances:
enumerate cheap, materialise the body on fetch.

This also **partially answers OQ#2** for a client the question did not anticipate:
for Onyx, **resources yes, prompts no.**

### A3 — the D7 colocation test is NARROWED to "needs direct database access."

D7 put homebase inside the client's Railway project. The parent exploration
(OQ#2) gives the actual reason: colocation buys **private-network access to the
client's databases** — "no public TCP proxy, no internet-reachable Postgres… it's
what makes client-facing read/write/report database tools safe enough to
contemplate."

That is a narrower test than "tools." Applied to the current roster: Twenty,
Outline, and Onyx all expose **HTTP APIs**; Decile and Streak are hosted SaaS.
**Nothing we run today requires raw database access.** So the per-client container
is *deferred*, not cancelled — it earns its existence the first time a capability
needs SQL-level reach, and D7 governs from that moment.

Until then the plane may be central, anchored on didi.sh.

**This is not secret-pooling, and the D1/D2 objection does not apply.** Per the
parent exploration, keys attach to **workspaces** — "a personal workspace carries
a personal key; a team workspace carries the org-wide key" — with an admin UI
where an account holder manages their own. That is *productised* custody with a
per-tenant owner, not a shared pool. D1/D2 continue to govern the client
**stacks** (one Railway project each, no shared datastore); they were never a
statement about the identity plane's tenancy.

**Still blocked:** OQ#7 (BYO-key custody — encryption posture, masked visibility,
export/delete on departure, liability for keys spent through the plane) must be
answered before the **non-client** tier onboards. Clients are unblocked today,
since they use our keys under a paid relationship — the case the parent calls
settled.

### Unchanged

H1, H3, H4, H5, H7 stand as written. D5, D6, D8, D10 stand. The acceptance
criteria are unchanged except that "authenticates as the *person*" is now
satisfied via didi.sh — and Onyx's `PT_OAUTH` (pass-through OAuth) means Onyx
forwards the end user's identity upstream rather than a service account, so the
plane resolves *that person's* workspace and keys without Onyx-specific work.

## Prior art — the Skills plane already works, crudely (2026-08-09)

Before building anything, the Skills plane was proven end-to-end using Outline as
the store: `vc-firm-profile-ingest` was published into Palmer AI's wiki in an
**Agent Playbooks** collection, then enumerated and read back over MCP from a
different client. It works today, with no new service.

Two findings that carry into the real build:

1. **Enumerate cheap, load lazily.** Outline exposes both `list_templates`
   (returns every template's **full body inline**) and
   `list_collection_documents` (returns titles + ids only, then `fetch` per doc).
   Templates look like the closer analogue to MCP prompts, but they invert the
   cost model: asking "what playbooks exist?" would load every body. **Homebase's
   `prompts/list` must return names and descriptions only**, with the body
   materialized on `prompts/get`. The MCP spec already works this way; the point
   is not to "improve" on it by inlining.
2. **Publishing forks the source.** The Outline copy is what agents load, the git
   copy is what we edit, and nothing reconciles them. This is precisely the
   problem homebase removes by serving `context-v/agent-skills/` directly — and
   it is the argument for open question #4 resolving toward **fetch at runtime**
   rather than bake-at-build.

Until homebase ships, the discipline is: **edit in git, re-publish to Outline.**

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

⚠️ **Repointed 2026-08-20 by A1.** Stand up a **throwaway** MCP server that does
exactly one thing: delegate OAuth to **didi.sh** and expose a single `whoami`
tool — which `/api/me` already implements, so the stub wraps rather than writes
it. This is now **the same experiment as the parent's spike #1**; run it once and
both discharge. It is a *measurement, not a build*: the point is to learn what
the clients accept before deciding whether didi.sh grows full `/authorize` + DCR
endpoints or exchanges an existing `didi_session` for an MCP access token.

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

1. ~~**Does Twenty work as an authorization server for a third party?**~~
   **MOOT as of A1** — Twenty is no longer the authorization server. Replaced by:
   *which OAuth surface must didi.sh grow* — full `/authorize` + token endpoint +
   DCR, or a `didi_session` → MCP token exchange? Phase 0 answers it by
   measurement.
2. **Do resources and prompts surface in ChatGPT's UI, or only tools?** If only
   tools, Phase 1's value collapses on half the matrix and skills must be
   re-shaped as tools. Shared with ai-labs OQ#1. **Partially answered 2026-08-20
   for a client this question did not anticipate: Onyx reads tools and resources,
   NOT prompts** — hence A2.
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
