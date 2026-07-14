---
title: "Sharing One Hermes Agent Instance Across a 3-Person Client Team"
lede: "Hermes Agent has no shipped multi-user mode — the gap is real, catalogued, and still open upstream."
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
  - Multi-User
  - WhatsApp
status: Open
---

# Sharing One Hermes Agent Instance Across a 3-Person Client Team

## The question

Every prior Hermes Agent deployment has been single-user (the consultant, personally, with channels like WhatsApp wired up for individual use). A client team of exactly **three** people now needs to share **one** self-hosted Hermes Agent deployment. How does multi-user access to a shared agent instance actually work in practice — does Hermes have any native concept of separate users/sessions/tenants, how would three people's conversations and memory stay isolated, how does a shared WhatsApp connection handle three distinct senders, and what access-control pattern keeps User A from seeing User B's conversation or misusing tool access?

## Why we don't already know

This is genuinely uncharted territory **for Hermes Agent specifically** — it's a newer, niche product, and nothing in its docs or repo addresses serving multiple humans from one instance. The general pattern (team-shared self-hosted AI chat/agent access) is well-trodden in comparable projects, but analogy is not confirmation, and conflating "well-trodden in the ecosystem" with "documented for Hermes" would be a mistake.

## Options

### Option A — One shared instance, no changes, hope memory naturally separates by sender

Point all three people at the same running Hermes Agent instance/WhatsApp number and see what happens.

**Pros:**
- Zero setup work.

**Cons:**
- **Refuted directly.** Hermes's memory/session architecture is per-installation, not per-conversation. The repo's own issue tracker documents this gap across 12+ open issues, catalogued in [issue #34352, "Solving the Multi-Tenant Hermes Problem"](https://github.com/NousResearch/hermes-agent/issues/34352) (filed by an operator running an 8-agent fork): *"Every Hermes deployment beyond personal use hits the same wall: one agent = one tenant. Memory is global, sessions don't scope by tenant, and there is no isolation between groups, channels, or users,"* with *"No PRs addressing any of these issues have been merged or are currently open."*
- Three people's conversations, chat history, and long-term memory would mix by default.

### Option B — Three separate lightweight Hermes instances (one per person), pointed at a shared tool-access layer

Give each of the three team members their own Hermes **profile** (Hermes's own docs describe profiles as "multiple independent Hermes agents on the same machine," each with its own config/keys/memory/sessions/skills/gateway state) and, ideally, their own WhatsApp-connected session — all wired to the same shared backend systems (TwentyCRM etc., per the companion colocation exploration).

**Pros:**
- Uses an actual *existing*, documented Hermes mechanism (profiles) rather than waiting on unshipped multi-tenancy.
- Each person gets genuinely isolated memory, config, and (if desired) their own WhatsApp connection — no cross-contamination risk.
- Matches the pattern used elsewhere in this ecosystem: Evolution API (a comparable WhatsApp bot framework) explicitly solves "multi-user" the same way — "one tenant = one instance," each instance/phone-number pairing having its own auth token and DB rows.

**Cons:**
- Three separate lightweight processes to run/maintain instead of one.
- **No documented real-world case study found** of anyone actually doing this with Hermes profiles specifically — this is a plausible extrapolation from adjacent evidence (profiles docs + Evolution API's pattern), not a verified recipe.
- Hermes's root-mode "shared-machine" install mode is a red herring here — it's about multiple *unix accounts* sharing one system-wide binary install, not per-conversation isolation for concurrent chat users. Confirmed against the installation docs; several claims conflating these two meanings were explicitly refuted during adversarial verification.

### Option C — Use a multi-user-native harness (e.g., LibreChat) as the team-facing surface, keep Hermes for solo power-user work

**Pros:**
- LibreChat ships genuine multi-user architecture out of the box: OAuth2/LDAP/email auth, per-user database isolation (MongoDB collections scoped per user), and a bundled Admin Panel for role/group management. A maintainer has stated directly: *"Cross-user conversation visibility isn't architecturally possible in LibreChat, our codebase has strict user isolation that is integral to every request."*
- Removes the "wait for Hermes to ship multi-tenancy" dependency entirely.

**Cons:**
- Loses whatever is specifically valuable about Hermes (its skill system, MCP integration depth, gateway channels) for the team-facing surface — would need its own separate tool/MCP wiring.
- A real architectural fork: this abandons "one agent product for everyone" in favor of two different tools for two different usage shapes.

### Option D — File the gap upstream, defer team-wide rollout, keep Hermes single-user for now

**Pros:**
- No risk of memory bleed between team members.

**Cons:**
- Doesn't solve the client's actual near-term need.

## Findings

**No native multi-tenancy in Hermes Agent.** Confirmed from two independent primary-source angles: an open, unimplemented, low-priority (P3) community feature request ([issue #9514](https://github.com/NousResearch/hermes-agent/issues/9514), explicitly modeled on a *different* project's — OpenClaw's — architecture, not existing Hermes functionality) and the broader catalog in issue #34352 listing 12+ separate open issues describing the identical gap, with no merged fix. This is accurate as-of-now (2026-07-08), not a permanent architectural verdict — treat it as "not yet," not "never."

**Two different meanings of "multi-user" got tangled in initial research and had to be pulled apart:** Hermes's "profiles" mechanism and its shared-machine root-mode install both operate at the *installation/OS-user* level (multiple independent agent installs, or multiple unix accounts sharing one binary), not the *per-conversation* level. Several claims that conflated these were explicitly refuted on adversarial verification. Three people sharing one running instance, one WhatsApp thread, would by default share memory/history unless a workaround is layered on.

**The broader ecosystem has solved this — just not Hermes specifically.** LibreChat ships native multi-user architecture (OAuth2/LDAP/email, per-user DB isolation, bundled Admin Panel) as a first-class design goal, not a bolt-on. This proves the *pattern* is well-trodden; it does not transfer automatically to Hermes.

**WhatsApp identity is available at the channel layer, but routing/isolation is always an application-layer construct — never a channel-native feature.** The WhatsApp Cloud API webhook includes the sender's phone number/WhatsApp ID (`from` field / `wa_id`) on every inbound message by default (confirmed against Meta's own developer docs). A newer privacy layer (Business-Scoped User IDs, ~April 2026) can substitute an opaque ID, but real phone numbers still leak through under common conditions (recent 30-day contact, saved contact-book entry, no adopted username). Regardless — **nothing in the WhatsApp API itself routes multiple senders to separate conversation threads or agent-tool permissions.** Comparable shared-inbox platforms (Chatwoot, wasenderapi.com-style setups) build that routing/assignment logic themselves on top of the API. Evolution API instead sidesteps the problem entirely: its documented pattern is "one tenant = one instance" — one phone number per instance, not multiple humans sharing one number/instance.

**Access control for real tool access (CRM/email/calendar) has a converging 2025–2026 industry consensus, independent of Hermes:** shared API keys are a named anti-pattern because they erase per-user accountability; centralize role-to-tool-permission mapping in an auditable policy file enforced by a gateway/proxy (each agent call carries a role-identifying credential, e.g. JWT) rather than relying on system-prompt-based restrictions (a peer-reviewed-track arXiv preprint found prompt-based tool allowlists fail 4–37% of the time depending on model, never reaching zero); default every tool integration to low-privilege/read-only, requiring explicit audited elevation for writes. Several supporting sources are vendor blogs (Oso, TrueFoundry, Auth0) promoting their own authorization products — the architectural claims independently corroborate across multiple vendors, but specific product recommendations in those posts should be read with more skepticism than the general pattern.

**No documented real-world "3-person team sharing one Hermes Agent instance" case study exists anywhere in the sources found.** Everything here is either an open GitHub feature request or an inference from adjacent, non-Hermes projects.

## Tentative direction

**Option B** — three separate Hermes profiles/gateway instances, each with its own WhatsApp session, pointed at a shared external tool-access layer (per the companion colocation exploration's Option B/D) — is the most evidence-adjacent path, since it uses an actual existing Hermes mechanism (profiles) rather than waiting on unshipped multi-tenancy, and matches how a comparable project (Evolution API) solves the same shape of problem. But this is explicitly flagged as **unverified extrapolation, not a documented recipe** — nobody found doing this with Hermes specifically. Before committing, worth prototyping small and watching for the failure modes the upstream issues describe (global memory bleed, no per-tenant session scoping).

Option C (swap to LibreChat for the team-facing surface) is the fallback if Option B's profile-per-person approach turns out to fight the harness more than it should in practice.

## Outcome

Open. No prototype attempted yet.

## Open questions carried forward

- Has Nous Research (maintainers, not community) committed to any roadmap for multi-tenancy (issue #9514 / #34352), or is this purely community wishlist with no timeline?
- Is there a safe way for three users to share one Hermes memory/skills namespace via an externally-injected per-message context (one refuted-but-suggestive issue proposed this) without leaking one user's private conversation into another's context window?
- The anomalous GitHub star/issue-count figures found during research (flagged in the companion colocation exploration) should be independently spot-checked before using them to judge this project's maturity or community scale.

## Related

- [[Hermes-Agent-Colocation-and-Hackability]] — companion exploration on the tool-access/CRM-integration layer this multi-user setup would sit on top of
- `self-host-stack/README.md` — the stack this agent layer would sit alongside
