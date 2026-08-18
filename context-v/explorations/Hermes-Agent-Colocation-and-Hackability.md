---
title: "Should Hermes Agent Co-Locate on the Same Host as TwentyCRM?"
lede: "Colocation feels like it should mean 'automatic access' — the evidence says it doesn't, and the real value is elsewhere."
date_created: 2026-07-08
date_modified: 2026-07-08
authors:
  - mpstaton
augmented_with:
  - Claude Sonnet 5
semantic_version: 0.0.0.1
tags:
  - Exploration
  - Hermes-Agent
  - Self-Host-Stack
  - AI-Agent-Infrastructure
  - MCP
status: Open
site_uuid: fda45c94-60f2-41d4-a5d8-f9f00d75b5d7
hex_code: tcah86
date_authored_initial_draft: 2026-07-08
date_authored_current_draft: 2026-07-08
---

# Should Hermes Agent Co-Locate on the Same Host as TwentyCRM?

## The question

For VC-firm clients running this repo's self-hosted stack (TwentyCRM, Papermark, Plunk, Postiz — all Docker/VPS-deployed), is it better to run [Nous Research's Hermes Agent](https://hermes-agent.nousresearch.com/) co-located on the *same* VM/Docker host as that stack, versus renting an isolated VPS from a dedicated agent-hosting service (Agent37, Hostinger)? And specifically: does colocation actually reduce integration overhead (MCP servers, per-tool API tokens), or is that theory wrong?

A second, related question: how hackable is Hermes Agent's harness — can we directly edit its skill files, system prompt, and tool config the way we can with Claude Code's skills/agents directories — or is it a more closed product than that?

## Why we don't already know

Hermes Agent is young (repo created 2025-07-22) and its documentation is scattered — the marketing homepage doesn't link the actual Docker self-hosting guide, which lives one click away in a `/docs` subsite. There's no prior art in our own stack for agent-to-CRM colocation. And the project's public signals are noisy enough to make "substance vs. hype" a real question: GitHub star/fork/issue counts (~211k stars, ~38.8k forks, ~26.9k open issues) look implausible for a ~1-year-old niche project, and a live plagiarism dispute exists (a Chinese team, EvoMap/Evolver, accuses Hermes's self-evolving-skill architecture of being a renamed 1:1 port; Nous Research's response is reported as dismissive). None of that invalidates the technical findings below — which were independently verified against primary docs and the actual repo file tree — but it means traction/popularity claims about this project should not be trusted at face value.

## Options

### Option A — Colocate and hope for automatic access (the theory being tested)

Run Hermes Agent's process on the same Docker host as TwentyCRM, on the theory that shared network/filesystem proximity grants the agent implicit access to CRM data/APIs without per-tool credential wiring.

**Pros:**
- Would eliminate the "API token hell" the consultant is trying to avoid, if true.

**Cons:**
- **Directly refuted by Hermes's own docs.** MCP config is "entirely explicit — no automatic or proximity-based discovery" (`hermes-agent.nousresearch.com/docs/user-guide/features/mcp`). Every MCP server needs a manual `mcp_servers:` entry in `~/.hermes/config.yaml` plus its own token/OAuth credential.
- The "Docker" terminal backend (one of Hermes's six execution backends) is a *sandbox for the agent's own shell commands* — its docs explicitly state it is "Not integrated with external Docker networks or services." It does not join an existing docker-compose network to reach sibling containers.
- Real prior art agrees: Twenty CRM's own maintainers chose to build and ship an official MCP server (GA as of Twenty 2.0, April 2026) as the sanctioned integration path — a community member floated a colocation-style shortcut in [twentyhq/twenty#12953](https://github.com/twentyhq/twenty/issues/12953) and the maintainer declined it in favor of the MCP surface.

### Option B — Colocate on the existing Docker host, wire each tool explicitly via MCP

Deploy Hermes Agent (documented Docker Compose / gateway-mode path exists at `hermes-agent.nousresearch.com/docs/user-guide/docker`) on the same host as the rest of the self-host-stack, but treat each integration (TwentyCRM, Papermark, etc.) as its own explicit `mcp_servers:` entry with its own scoped credential.

**Pros:**
- This is genuinely supported, documented, self-hosting — not a hack.
- Colocation still buys real things: private-network latency, no public port exposure for the CRM's DB/API (reach it over the internal Docker network instead of a public URL), one shared reverse proxy, one VPS bill.
- Twenty CRM's official MCP server is now GA (since Twenty 2.0, April 2026) — a real, maintained integration point to wire into.

**Cons:**
- Does not eliminate per-tool credential management — every MCP server still needs config + a token, same as it would from a remote host.
- A real practitioner writeup (flowtivity.ai, April 2026, using OpenClaw not Hermes) hit Twenty's GraphQL rate limit (100 tokens/60s) and had to fall back to direct Postgres edits for pipeline features the API doesn't expose — a reminder that "API access" and "DB access" are separate capabilities requiring separate wiring regardless of host topology.

### Option C — Run Hermes Agent on a dedicated agent-hosting service (Agent37 / Hostinger) instead

**Pros:**
- Zero manual VPS/Docker/TLS setup.

**Cons:**
- **Agent37** is actually branded and built around **OpenClaw**, not Hermes/Nous Research. Its own blog admits raw DIY VPS ($4–6/mo) offers similar/better specs than its $3.99/mo tier — the value-add is pure convenience, not capability. A separate "Agent37 Cloud" product targets per-customer multi-tenant SaaS builders (gVisor isolation, from $3.44/mo/instance) — not this use case.
- **"Hostinger AI Agents"** is not VPS-plus-agent-runtime at all — it's a closed, separate SaaS subscription bundling 7 fixed proprietary chatbots, reading only from the user's own Hostinger account, with zero file-level customization. Hostinger's actual VPS plans are just generic VPS + an "AI setup assistant."
- Neither gives anything a competent self-managed VPS (which the client already has, running TwentyCRM) doesn't already provide.

### Option D — Shared self-hosted connector/credential gateway (Nango / Open-Connector) as one integration point

Stand up one shared connector gateway per client firm (e.g., [Nango](https://nango.dev/), Elastic License 2.0, self-hostable; or [Open-Connector](https://github.com/oomol-lab/open-connector), Apache 2.0) exposing a single MCP endpoint (`/mcp`) that Hermes (or any MCP-capable agent) talks to, instead of wiring each tool bespoke inside the agent itself.

**Pros:**
- Centralizes token/credential management in one auditable place per firm, rather than duplicating config across every agent deployment.
- Both projects exist specifically because agent-to-SaaS auth is a distinct, unsolved problem that persists regardless of network topology — this is the pattern that actually reduces "token hell," not host proximity.
- Nango keeps credential custody local (tokens live in the client's own Postgres, encrypted with a key Nango itself never holds).

**Cons:**
- Extra moving part / another service to deploy and maintain per firm.
- No Hermes-Agent-specific integration guide found for either gateway — this would be new wiring work, not a documented recipe.

## Findings

**Hermes Agent is real and self-hostable, but noisy.** MIT-licensed, `github.com/NousResearch/hermes-agent`, ~82% Python / 14% TypeScript, documented Docker Compose deployment (not on the homepage, but at `/docs/user-guide/docker`), CLI + desktop apps + a persistent "gateway" mode with Telegram/Discord/Slack/WhatsApp/Signal/email channels. Flag: GitHub star/fork counts look anomalous for the repo's age (multiple independent verify passes couldn't rule out manipulation); a live, unresolved plagiarism dispute exists over its self-evolving-skill architecture (Hacker News, 36kr.com coverage); marketing copy ("v0.18.2") doesn't match the actual calendar-versioned release tags.

**Colocation does not grant automatic access — confirmed from multiple independent angles:**
- Hermes's own MCP docs: explicit config only, no proximity-based discovery.
- Hermes's own Docker-backend docs: sandbox for the agent's own commands, explicitly not integrated with external Docker networks/services.
- Twenty CRM's own architecture choice: official MCP server (GA since Twenty 2.0, April 2026), not a colocation shortcut — confirmed via maintainer statements in `twentyhq/twenty#12953`.
- Every Twenty CRM MCP implementation found (official and two unofficial ones — IgorWarzocha/twenty-mcp-server, mhenry3164/twenty-crm-mcp-server) requires an explicit API key + base URL, same-host or not.
- Dedicated self-hosted connector-gateway projects (Nango, Open-Connector) exist precisely because this problem persists even in fully self-hosted, same-VPS setups.

**What colocation legitimately buys**: private-network latency, no public port exposure for internal service-to-service calls, one shared reverse proxy/VPS bill. Not automatic credential-free access.

**Agent37 and Hostinger add no differentiated capability** for this use case — see Option C.

**Hackability is genuinely strong**, closely analogous to Claude Code's skills/agents model:
- `~/.hermes/` is a plain, editable directory tree: `config.yaml` (settings), `.env` (secrets), `SOUL.md` (system-prompt/identity — docs explicitly recommend editing this file for persona changes rather than touching core Python), `skills/` (SKILL.md files), plus a separate `plugins/` directory for deeper code-level integrations.
- Skills are markdown + YAML frontmatter, no compilation step, explicitly declared compatible with the open [agentskills.io](https://agentskills.io) standard (the same standard family Claude Code's own skill format participates in — though this compatibility is Nous Research's self-declaration, not independently third-party-tested).
- Bundled skills are user-editable too; a content-hash manifest ensures `hermes update` never clobbers local edits.
- The agent can self-modify skills via a `skill_manage` tool, optionally gated behind human-approval staging (`skills.write_approval: true`, reviewable via `/skills diff <id>` / `/skills approve <id>`) — a more sophisticated review layer than Claude Code currently ships.

## Tentative direction

**Option B, with Option D as the pattern to scale across the 4–5 client firms.** Deploy Hermes via its documented Docker Compose/gateway path on the same host as each firm's TwentyCRM stack (legitimate self-hosting, not a hack), and wire the official Twenty CRM MCP server explicitly. If repeated per-firm token-wiring becomes real friction across firms, evaluate standing up one shared Nango-style connector gateway per firm rather than chasing network-proximity shortcuts that the evidence says don't exist. Skip Agent37/Hostinger.

This is still open — no build has been attempted yet, and the Nango/Open-Connector + Hermes integration specifically has no documented prior art to lean on.

## Outcome

Open. No spec written yet — would graduate to one if/when we commit to building the Option B (or D) architecture for a real client firm.

## Related

- [[Hermes-Agent-Multi-User-Team-Access]] — companion exploration on giving 3 team members shared access to one instance
- `self-host-stack/README.md` — the stack this agent layer would sit alongside
