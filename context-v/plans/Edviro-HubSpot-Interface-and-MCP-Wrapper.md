---
title: "Edviro: Interface with HubSpot, then Wrap It in Our Own MCP"
lede: "Our first client whose CRM we don't host. We give Edviro a homebase landing page and an AI connection to the HubSpot they already pay for. The custom MCP wrapper has to earn its place against HubSpot's own GA remote MCP server."
date_created: 2026-10-25
date_modified: 2026-10-25
authors:
  - Michael Staton
augmented_with:
  - Claude Code on Claude Opus 5.5
semantic_version: 0.0.0.1
status: Draft
tags:
  - Plan
  - Self-Host-Stack
  - Edviro
  - HubSpot
  - MCP
  - Homebase
  - BYO-SaaS
site_uuid: be8bb481-d033-49c8-b89c-d603f8d6c724
hex_code: xbtmmi
date_authored_initial_draft: 2026-10-25
date_authored_current_draft: 2026-10-25
publish: false
---

# Edviro: Interface with HubSpot, then Wrap It in Our Own MCP

## Why Care?

Edviro keeps HubSpot. We stand nothing up at first. That makes Edviro the
second BYO-SaaS client after humain-vc (Decile Hub), and the first where
*we* build the agent surface instead of pointing at the vendor's. If the
wrapper works here, the same shape covers any client who arrives with a SaaS
CRM: an interface layer that's ours, over a system of record that's theirs.

## The fact that shapes everything

HubSpot already ships a remote MCP server, `https://mcp.hubspot.com`. It went
GA on 2026-04-13, works on every tier, and has a native Claude connector.
It's per-user OAuth 2.1 with PKCE and respects each user's HubSpot permissions.
It covers CRM records (including custom objects), activities, content and
campaigns, plus pipelines and properties for writes.
(Sources: developers.hubspot.com/ai-tools/mcp, fetched 2026-10-25;
scalekit.com/blog/hubspot-mcp-server, 2026-10-22.)

So a wrapper that just re-exposes HubSpot CRUD is negative value: one more
hop, one more thing to keep alive, and HubSpot ships faster than we do. The
wrapper is only worth building for what HubSpot's server **doesn't** do:

| Gap in HubSpot's MCP | What the wrapper adds |
|---|---|
| Search API underneath: ≤200 results/page, 5×6 filters, no vector search | Paginating composite tools ("every deal touching this company, all pages") |
| `query_crm_data` has no joins or association traversal | Association-walking tools built on the v4 associations API |
| Generic tools, no knowledge of how Edviro works | Edviro-shaped workflow tools and our agent-skills as MCP prompts/resources (the homebase spec's skills plane) |
| Writes go straight in | Our safety layer: audit log, pre-write snapshot, confirm-before-bulk ([[clients-get-full-read-write-not-read-only-ceilings]]: safety through engineering, never denial) |
| No DCR: every Claude user must paste a client ID + secret | Our server does DCR in front, so setup is "paste one URL", same as Twenty clients today |
| One tool, one connector | Becomes Edviro's homebase connector, so later tools join behind the same address |

## Phases

### Phase 0 — Day one, no code (do first)

1. Get from Edviro: portal ID, Hubs and tiers, Sensitive Data on/off, custom
   objects and properties in use, number of AI seats, and a Super Admin who
   can create apps. (The checklist is in `client-stacks/edviro/hubspot/README.md`.)
2. Point Edviro's team at **HubSpot's native Claude connector**. It works
   today, costs nothing, and its gaps tell us what the wrapper must do.
   We build from observed friction, not from a guess.
3. Deploy the landing page (`lossless.at/edviro`, entry added 2026-10-25).
   Once the portal ID is known, set `origin` to the portal's deep link.

### Phase 1 — Operator channel

Create a private app on Edviro's portal with the minimal scopes for the read
and write tools we expect. Its token goes in `client-stacks/edviro/hubspot/.env`
and is used for discovery only: pull the properties and object schemas and
write them into a client-constants section, same as the `decilehub-interface`
skill does for humain. Pin a snapshot of HubSpot's REST and MCP tool list in a
`studies/` collection per `study-repos-first`, instead of working from
training data.

### Phase 2 — The wrapper (thin proxy and additions)

~~One Railway service~~ **Amended 2026-10-25: a Cloudflare Worker on Edviro's
own Cloudflare account**, not Railway. Edviro's data already lives there (the
`event-hog` Artifacts repos and the `agnostic-crm` D1 database), so the
homebase goes where the data is. See event-hog's decision record,
`hubs/event-hog-mcp/context-v/decisions/2026-10-25_Three-Layers-and-an-Agnostic-CRM-for-Event-Hog.md`,
decision 5. TypeScript, streamable HTTP. The first piece, `event-hog`, is
already live this way.

- **Auth:** the wrapper is an OAuth authorization server toward Claude (DCR + PKCE)
  and an OAuth *client* of HubSpot, using an Edviro-owned HubSpot app.
  Each person signs in to HubSpot as themselves, so attribution and permissions
  stay HubSpot's. Store each user's refresh token (it rotates and is
  single-use) encrypted at rest. That custody question belongs to
  id-didi-sh. Don't invent it here. Note: the "we don't keep your data
  anywhere else" line on the landing page stays true only if the wrapper
  stores tokens and audit metadata, never CRM record bodies.
- **Tools:** pass HubSpot's remote MCP tools through unchanged (proxy to
  `mcp.hubspot.com` with the user's token), then add the gap-fillers from the
  table above. Proxy, don't re-implement.
- **Safety:** every write is logged (who, what, before/after). Bulk writes
  need a preview → confirm handshake.
- **Verification:** MCP Inspector first, then a real Claude Desktop
  custom connector, then mobile. Same ladder as Twenty's `connect-your-ai.md`.

### Phase 3 — Hand it over

Set `mcp_path` and origin on the Edviro entry in `clients.ts` so the "Connect
Claude" card lights up. Write `client-stacks/edviro/hubspot/mcp-connector.md`
in the humain-vc shape. Add an agent-facing connect doc. The current
`agent_doc_url` is Twenty-specific and wrong for Edviro until this exists.

## Open decisions (the user's)

1. **Who owns the HubSpot app:** Edviro's portal (simplest, their asset) or a
   Lossless developer account app (reusable across future HubSpot clients,
   but needs HubSpot marketplace/app review to go beyond test installs).
2. **Wrapper as standalone, or as the first real homebase:** the homebase
   spec wants one plane per client. Edviro could be where it gets proven.
3. **Whether Phase 2 happens at all** depends on how Phase 0 goes. If the
   native connector covers Edviro, the wrapper waits.

## Drift noticed (not fixed)

- `hubs/lossless-at/README.md` says the portal deploys on Railway with
  `@astrojs/node`. `package.json` and the build use `@astrojs/vercel`.
- `client-stacks/humain-vc` has no entry in `clients.ts`, so no landing page.
