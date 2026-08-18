---
title: "lossless.at path-based homebases + /<client>/<service>/api gateway"
date_created: 2026-08-02
status: Open
tags: [Decision, lossless.at, Homebase, Gateway, MCP, Portal]
site_uuid: 41823721-6ed5-4e74-ad59-67a42c55d210
hex_code: hbsw0t
date_authored_initial_draft: 2026-08-02
date_authored_current_draft: 2026-08-02
---

# lossless.at path-based homebases + `/<client>/<service>/api`

## Context

Moving away from per-tool `didi.sh` subdomains (happenstance). Michael owns
`lossless.at` and wants client-dedicated homebases at `lossless.at/<client>`
that improve over time. Later refined to: `lossless.at/<client-handle>/<service-handle>/api`.

## Decided

- **Homebase page** = a path route `lossless.at/<client>` (portal). DONE in
  code (`hub/` refactored to `/[client]`, verified locally, uncommitted).
- **DNS** = move `lossless.at` off iwantmyname to a provider supporting the
  apex. Cloudflare rejected `.at` (Registrar TLD limit). **Recommended: Vercel
  DNS** (already runs `didi.sh`, supports apex ALIAS + `.at`). Fallback:
  `www.lossless.at` + apex redirect.
- **Per-client isolation** = every tool is its own service in the client's own
  Railway project. No shared/multi-tenant deploys, ever. (Includes Papermark.)

## Open — the `/<client>/<service>/api` gateway

Two surfaces behave differently:

1. **API / MCP / connector endpoints** — CAN live under the path via a reverse
   proxy/gateway. This IS the Phase 2 "homebase-MCP" layer (see
   `ai-labs/id-didi-sh` parent spec, D7). Payoff: clean connector URLs like
   `lossless.at/the-water-foundation/twenty/mcp`. Hard bit: MCP OAuth advertises
   absolute URLs from Twenty's `SERVER_URL`; the proxy + `SERVER_URL` must be set
   to the proxied address. Prototype on Twenty first to de-risk subpath-OAuth.
2. **Human web UIs** (Twenty/Postiz/Outline dashboards) — resist living under a
   subpath (assume host root; Postiz especially). Default: they open on their own
   host, linked from the homebase page. Serving them under the path = separate,
   larger investigation.

**Unresolved:** whether Michael wants (1) only, or also (2). Proceeding on the
assumption of (1) — gateway for API/connector surface, links-out for dashboards —
and folding it into the homebase-MCP spec. Revisit if he wants dashboards under
the path too.

## Update 2026-08-06 — the two surfaces swapped difficulty

Reality inverted the assumption above.

- **(2) Human dashboards — DONE, and it was the easy half.** They don't need to
  *serve* under a subpath, only to be *addressed* by one. A 307 from
  `lossless.at/<client>/<handle>` to the tool's own host gives the legible URL
  without touching how the app is hosted. Shipped for crm/wiki/dataroom.
- **(1) API/MCP — blocked on the thing that looked easy.** A redirect cannot
  carry a bearer token across origins (measured; see
  [[Normalize-Paths-Everywhere]]), so the connector surface needs a real proxy.
  Redirects buy nothing here.

Also decided: handles are **role-based** (`crm`, `wiki`, `social`, `dataroom`)
rather than tool-based, so the address outlives the vendor; the tool name
(`/twenty`, `/outline`) survives as a per-client alias that redirects to the
canonical role path.

## Related

- `ai-labs/id-didi-sh` — homebase-as-capability-plane parent spec (D7, JWKS identity)
- `context-v/specs/Per-Client-Stack-Deployment-Spec-Twenty-First.md`
- Portal code: `self-host-stack/hub/`
