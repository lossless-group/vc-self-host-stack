---
title: "Normalize Paths Everywhere — one URL shape for every client + service"
lede: "Today every tool lives at a raw Railway hostname; the goal is one owned, legible shape — lossless.at/<client>/<service>/… — for humans and agents alike."
date_created: 2026-08-02
date_modified: 2026-08-02
authors:
  - Michael Staton
augmented_with:
  - Claude Code on Claude Opus 4.8
semantic_version: 0.0.0.1
status: Open
tags:
  - Issue-Resolution
  - Path-Normalization
  - Homebase
  - Gateway
  - MCP
  - Reverse-Proxy
  - lossless.at
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
- **Service paths:** NOT built. `lossless.at/<client>/<service>/mcp` (and `/api`)
  404 — the portal serves only the page at `/<client>`, nothing behind it.
- **What's advertised today:** the raw Railway host, e.g. Twenty's connector is
  `https://twenty-server-production-9e79.up.railway.app/mcp`, and `clients.ts`
  stores those raw hosts.

## Desired end state

Every externally-handed-out address is a `lossless.at/<client>/<service>/…` path:

- the "add to Claude" connector URL,
- any REST/API base a client or agent is given,
- the links surfaced on the homebase page,
- the values stored in `clients.ts` and the `docs/twenty/connect-your-ai.md` guide.

Raw `*.up.railway.app` hosts become an internal implementation detail, never
handed to a human or pasted into an AI.

## The crux — MCP OAuth under a subpath

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
2. **Dedicated gateway service** (the Phase-2 "homebase-MCP") — a small server that
   federates Twenty (proxy) / Outline (OAuth) / Postiz + Papermark (service key),
   and exposes both the clean paths and skills/scripts as MCP resources+prompts.
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

## Related

- [[lossless-at-path-based-homebase]] — the decision that set the path model
- `ai-labs/id-didi-sh` — homebase-as-capability-plane parent spec (identity/JWKS)
- `hubs/lossless-at` — the portal repo (Vercel), path-based `/[client]`
