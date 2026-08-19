---
title: "Normalize Paths Everywhere — one URL shape for every client + service"
lede: "Today every tool lives at a raw Railway hostname; the goal is one owned, legible shape — lossless.at/<client>/<service>/… — for humans and agents alike."
date_created: 2026-08-02
date_modified: 2026-08-09
authors:
  - Michael Staton
augmented_with:
  - Claude Code on Claude Opus 4.8
  - Claude Code on Claude Opus 5
semantic_version: 0.0.2.0
status: Partially-Shipped
date_first_published: 2026-08-06
tags:
  - Issue-Resolution
  - Path-Normalization
  - Homebase
  - Gateway
  - MCP
  - Reverse-Proxy
  - lossless.at
site_uuid: c736b2b7-86d5-40d7-8002-a74e50946386
hex_code: 8tl9vg
date_authored_initial_draft: 2026-08-09
date_authored_current_draft: 2026-08-09
publish: true
---

# Normalize Paths Everywhere

## Why care?

Right now the same client's tools are addressed by unrelated, opaque strings:
`twenty-server-production-9e79.up.railway.app`,
`outline-production-ef02.up.railway.app`,
`postiz-production-36c1.up.railway.app`. Nobody can read them, remember them,
or trust them, and they leak the hosting substrate. The aspiration is a single
**owned, legible URL shape** under `lossless.at`:

```
lossless.at/<client-handle>/                         → the client homebase page
lossless.at/<client-handle>/<service-handle>/mcp     → that service's MCP connector
lossless.at/<client-handle>/<service-handle>/api     → that service's REST API
```

One namespace, per client, per service — stable even if the backend moves hosts.
The homebase page half already exists (portal, path-based `/[client]`); the
service-path half does not.

## Current state (the gap)

- **Homebase page:** DONE — `lossless-at.vercel.app/<client>` renders each client's
  homebase from `hubs/lossless-at/src/config/clients.ts`. `lossless.at` apex
  attaches once DNS propagates (nameservers moved to Vercel 2026-08-02).
- **Service paths:** BUILT for the human surface (2026-08-06). Every tool a
  client runs answers at `lossless.at/<client>/<handle>` and 307s to its origin.
  Handles are role-based (`crm`, `wiki`, `social`, `dataroom`) with the vendor
  name as a per-client alias (`/twenty` → `/crm`). Everything below a service
  passes through: `/<client>/crm/<anything>` → `<origin>/<anything>`, query
  string preserved.
- **What's advertised today:** the homebase cards now link portal paths. The
  **MCP connector box still hands out the raw Railway host** —
  `https://twenty-server-production-9e79.up.railway.app/mcp` — for the reason in
  "The crux" below.

## Desired end state

Every externally-handed-out address is a `lossless.at/<client>/<service>/…` path:

- the "add to Claude" connector URL,
- any REST/API base a client or agent is given,
- the links surfaced on the homebase page,
- the values stored in `clients.ts` and the `docs/twenty/connect-your-ai.md` guide.

Raw `*.up.railway.app` hosts become an internal implementation detail, never
handed to a human or pasted into an AI.

## The crux, sharpened — a redirect cannot carry a bearer token

**Measured 2026-08-06, and it kills the redirect approach for MCP specifically.**
The blocker below (discovery advertising the wrong host) is real but secondary.
The decisive one is simpler: **`Authorization` does not survive a cross-origin
redirect.** The Fetch spec requires clients to strip it when a redirect crosses
an origin boundary, and they do. Proven against a header-echoing origin behind
the live 307:

| Request | What the upstream received |
|---|---|
| Direct to origin | `Bearer TESTTOKEN123` |
| Through the 307 (default client behavior) | **stripped** |
| Through the 307, `curl --location-trusted` | `Bearer TESTTOKEN123` |

So a connector added at `lossless.at/<client>/crm/mcp` would complete OAuth
against the Railway host, store its token, and then 401 forever — the token is
discarded on every hop. `--location-trusted` is an explicit opt-in to leak
credentials across origins; no MCP client does that, and none should.

**Consequence:** the pretty MCP path can only become real by **proxying**
(same-origin, no redirect, headers forwarded deliberately), never by redirecting.
That upgrades option 1/2 below from "nice to have" to "the only way", and it is
why the MCP box on the homebase still hands out the Railway URL.

## The original crux — MCP OAuth under a subpath

A naive reverse-proxy of `/<client>/<service>/mcp` → the tool's `/mcp`
**half-breaks the connector login.** Twenty's MCP speaks OAuth, and its discovery
documents (`/.well-known/oauth-authorization-server`,
`/.well-known/oauth-protected-resource`) advertise **absolute** URLs derived from
`SERVER_URL` — currently the Railway host. So a client who pastes the pretty path
would start the handshake there and get bounced to the ugly Railway host mid-flow,
and the MCP resource identifier wouldn't match the URL they added.

To make the path a first-class connector URL, the proxy must also carry the OAuth
routes (`/.well-known/*`, `/authorize`, `/oauth/token|register|revoke|introspect`)
**and** `SERVER_URL` must be set to the proxied path so discovery advertises the
`lossless.at/<client>/<service>` base. Side effect to watch: `SERVER_URL` also
feeds Twenty's own UI/webhook links — changing it to a proxied path may affect
the web app, which does not cleanly serve under a subpath. This is why the web
**dashboards** stay links-out (open on their own host) while only the **API/MCP**
surface gets the clean path.

## Options (not yet chosen)

1. **Vercel rewrites/edge proxy** — the portal already lives on Vercel; add
   rewrites for `/<client>/<service>/{mcp,api,.well-known,oauth}/*` → the backend,
   plus per-service `SERVER_URL` pointed at the path. Prototype on Twenty first.
2. **Dedicated gateway service** (the Phase-2 "homebase-MCP") — a small server
   that federates Twenty (proxy) / Outline / Postiz / Papermark, and exposes both
   the clean paths and skills as MCP resources + prompts.
   **→ Now specced: [[Homebase-MCP-One-Connector-Per-Client]] (2026-08-09).**
   The token-stripping measurement above promotes this from "an option" to the
   only viable path for the MCP surface, and the spec argues the id-didi-sh gate
   covers secrets/identity rather than federation.
   See `ai-labs/id-didi-sh` (D7, JWKS identity) and [[lossless-at-path-based-homebase]].
3. **Clean host per service** (rejected aesthetically) — give each tool a real
   subdomain and set `SERVER_URL` to it. Sidesteps subpath-OAuth entirely but
   reintroduces the per-tool-hostname sprawl this issue exists to kill.

## Scope — "everywhere"

When resolved, normalize in all of:

- `hubs/lossless-at/src/config/clients.ts` (crm/mcp/wiki/social/dataroom values)
- the homebase page links + the "connect Claude" walkthrough
- `docs/twenty/connect-your-ai.md` (the agent-facing setup guide)
- per-client `client-stacks/<client>/*/stack.md` records
- any operator hand-off that currently pastes a `*.up.railway.app` URL

## Remaining work (as of 2026-08-06)

**Shipped**

- Role-based service handles + per-client vendor aliases, in `clients.ts` as data
  (`services[]`), replacing the four hardcoded `*_url` fields.
- `/<client>/<service>` and `/<client>/<service>/<rest...>` routes, 307 with
  method + body preserved, query string carried, `cache-control: no-store` so a
  backend move takes effect immediately.
- Homebase cards render from config and link portal paths.
- Two guards worth keeping: leading `/` and `\` are stripped from the passthrough
  remainder (otherwise `/<client>/crm//evil.com` is an open redirect via
  protocol-relative resolution), and the built URL is re-checked against the
  intended origin before it is sent.
- `security.checkOrigin: false` — Astro's CSRF guard 403s any POST without a
  matching `Origin`, which silently broke the MCP path. Safe here: no forms, no
  writes. **Re-evaluate the moment this app accepts a write.**

**Left**

- **The MCP path is not a connector URL.** It resolves, but see "The crux,
  sharpened" — needs a proxy, not a redirect. `clients.ts` still advertises the
  origin URL, and `mcpPortalUrl()` carries a do-not-use warning.
- **`docs/twenty/connect-your-ai.md`** still pastes the raw Railway host. Correct
  as-is, since that IS the working connector address — revisit when the proxy lands.
- **Postiz is not in the portal, and a redirect cannot fix it.** See the section
  below — it needs a host of its own, which is a different piece of work.
- **Per-client `client-stacks/<client>/*/stack.md`** records still carry raw hosts.

## Postiz is the exception — it needs a host, not a path

The redirect model assumes a tool only needs to be *addressed* by a nice URL,
not *served* from one. Postiz breaks that assumption, and it is worth writing
down because it is the one case where this whole approach doesn't apply.

Per `client-stacks/the-water-foundation/postiz/stack.md`, Postiz is **parked
before first-signup**: it derives its auth cookie `Domain=` from `FRONTEND_URL`,
and `*.up.railway.app` resolves to a Public Suffix apex (`.railway.app`) that
browsers refuse to set cookies against. Register and login return 200 and the
user stays logged out forever.

A 307 from `lossless.at/<client>/postiz` lands the browser on that same rejected
apex, so it changes nothing. Postiz stays blocked until it gets a real custom
host (`*.lossless.at` or similar) with `MAIN_URL` / `FRONTEND_URL` /
`NEXT_PUBLIC_BACKEND_URL` set to it — the procedure is already written in that
stack.md. Only then is there a working URL worth putting in `clients.ts`.

Naming note: the handle is **`postiz`, not `social`**. Postiz is a cross-platform
*post planner* — it publishes on a schedule; it is not a place to read or monitor
feeds. `social` is deliberately reserved for the social-perusing surface, which
has no good open-source option and is expected to be built from scratch. Calling
the scheduler `social` would have squatted on that name.

## Related

- [[lossless-at-path-based-homebase]] — the decision that set the path model
- `ai-labs/id-didi-sh` — homebase-as-capability-plane parent spec (identity/JWKS)
- `hubs/lossless-at` — the portal repo (Vercel), path-based `/[client]`
