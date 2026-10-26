---
type: Decisions
title: "Decision: Three Layers, and an Agnostic CRM Model, for Event Hog"
lede: "Event work lives in three places at once: a git repo the team writes to together, a database shaped the way we think about customers, and HubSpot as one place that data gets pushed. Our model, not HubSpot's, decides what a contact is."
publish: false
date_created: 2026-10-25
date_modified: 2026-10-26
date_authored_initial_draft: 2026-10-25
date_authored_current_draft: 2026-10-25
date_authored_final_draft:
authors:
  - Michael P. Staton
augmented_with:
  - Claude Code on Claude Opus 5.5 (1M context)
at_semantic_version: 0.0.0.1
status: Signed-Off
decided_by:
  - Michael P. Staton
date_decided: 2026-10-25
tags:
  - Decision
  - Event-Hog
  - Cloudflare-Artifacts
  - Cloudflare-D1
  - HubSpot
  - Data-Model
  - Edviro
related:
  - "[[Homebase-MCP-One-Connector-Per-Client]]"
  - "[[Edviro-HubSpot-Interface-and-MCP-Wrapper]]"
  - "[[Do-We-Need-a-Sandbox-Behind-Homebase]]"
  - "[[cloudflare-artifacts-interface]]"
  - "[[hubspot-interface]]"
  - "[[event-prep]]"
  - "[[surrealdb-canonical-layer]]"
site_uuid: dd360691-2dba-4dcf-87b4-93ed00a968d3
hex_code: i2ehec
summary: >-
  Records two decisions made on 2026-10-25 while standing up event-hog for
  the 7x24 Exchange Fall Conference with Edviro. First, event data lives in
  three layers: a Cloudflare Artifacts repo per event instance (the shared,
  human-readable, git-history record), a Cloudflare D1 database called
  agnostic-crm (our structured model), and HubSpot (a projection, synced
  with review). Second, agnostic-crm's model is ours, not a vendor's:
  organizations that act as event organizers, event series, event
  instances, observations, interactions, affiliations, and nested
  human-defined locations. It also records that Edviro's homebase runs on
  Cloudflare in Edviro's own account, unlike the Railway homebases planned
  for other clients. Read this before changing event-hog's schema,
  adding a CRM sync, or reusing event-hog as a template for another event
  or client.
---

# Decision: Three Layers, and an Agnostic CRM Model, for Event Hog

> Experimental folder. `decisions/` is in the context-vigilance experimental
> tier; its shape isn't enforced yet.

## The decision

**1. Event work lives in three layers, each with one job.**

| Layer | What it is | Its job |
|---|---|---|
| **Artifacts** | One Cloudflare Artifacts repo per event instance, in namespace `event-hog` | The shared, human-readable record. Prep, contacts, notes. Every write is a commit by the person who made it, so it's multiplayer with history and undo for free |
| **agnostic-crm** | Cloudflare D1 (SQLite), bound to the event-hog Worker as `CRM` | Our structured model of customer data, queryable across events |
| **HubSpot** | The client's own CRM | A projection. Contacts are pushed with review; `crm_links` records what went where |

**2. Our model decides what customer data looks like, not HubSpot's.**
HubSpot's default objects can't hold it, and making them hold it means a
large plan upgrade plus Custom Objects. So the model lives in agnostic-crm,
and HubSpot gets the subset it can take.

**3. The model's entities and their roles** (as stated by Michael, with
Organizations and People as the nouns everything else points at):

| Entity | Role |
|---|---|
| **Organization** as **Event Organizer** | Not its own kind of thing: a role an organization plays when it owns a series. The same organization can sponsor or exhibit at other events. *7x24 Exchange* is an Organization that is an Event Organizer |
| **Event Series** | The brand that recurs and outlives any one occurrence. Patterns across years attach here. *7x24 Exchange Conferences* (semiannual, Spring and Fall) |
| **Event Instance** | One dated, located occurrence. Where interactions happen and what observations are scoped to. Each event-hog repo is the workspace for one instance. *7x24 Exchange Conferences 2026 Fall Conference* |
| **Observations** | Claims with a source: who asserted what, when, from where. Append-only, so conflicting claims sit side by side. Event participation lives here as predicates (`speaker_at`, `sponsor_of`, `exhibitor_at`, `attended`, `met_at`), not in a separate table |
| **Interactions** | Actual contact between our side and theirs. Distinct from observations: "Ari is speaking Tuesday" is an observation from the website; "Hursh talked to Ari at the reception" is an interaction, which then produces observations |
| **Affiliations** | The relationship graph: a person's roles at organizations (many, ended rather than deleted), plus organization-to-organization relations (peer by default, `child_of` only for real hierarchy) |
| **Locations** | Human-defined and nested (below) |

**4. Locations are human-defined, nested, and many per entity.** CRMs assume
one address per record. That's never true, and it makes grouping and
querying by place nearly impossible. So:

- A location is any string someone defines ("Central Texas", "Texas
  Triangle", "Austin"), with aliases.
- Nesting is a graph, not a tree: a location can have several parents, and a
  parent can **exclude** a child's whole subtree.
- An exclusion applies only to paths through the location that declares it.
  "Central Texas excludes San Antonio" doesn't stop a search of Texas from
  finding San Antonio by another path.
- Any person, organization, or event links to any number of locations, each
  with a role: `based_in`, `office`, `hq`, `works_from`, `covers`, `venue`, `from`.

**5. Edviro's homebase runs on Cloudflare, not Railway.** Every other
client's homebase is planned as a Railway service inside that client's
Railway project. Edviro's runs as Cloudflare Workers in Edviro's own
Cloudflare account. event-hog is its first piece; the HubSpot wrapper and the
skills plane join it there.

**6. event-hog is a product, with its own kit.** *(Added 2026-10-26.)*
event-hog is meant to be an MCP server plus a package others can adopt and
iterate on, not an Edviro-specific build. Its CRM-agnostic skills, the event
workspace template, and per-deployment skill settings live in an Artifacts
repo of their own, `event-hog/event-hog-kit` (`skills/`, `templates/event/`,
`config/skills.json`), next to the event repos. CRM-specific skills stay with
the client's CRM deployment (`hubspot-brain/agent-skills` for Edviro). The
server reads skills from the kit first, then the brain; the kit's copy wins
when a name exists in both. Skill text still originates in the public
`lossless-agent-skills` repo on GitHub.

## Why

- **Homebase goes where the client's data is.** The homebase spec's
  colocation rule (D7) places the plane next to the client's data. For other
  clients that's a Railway project; for Edviro it's Artifacts and D1 on
  Cloudflare, so a Railway homebase would add a second cloud for nothing.
  Per-client isolation (D1/D2) still holds: it's Edviro's account, not ours.
- **Claude-native, multiplayer, no terminal.** Edviro's team (and most
  clients) use Claude Desktop and mobile only. Artifacts gives a git-backed
  shared workspace that a remote MCP server can front, with per-person
  attribution, and none of git's complexity reaches the user.
- **Git is the right record for a team working a room.** Everything is
  attributed and reversible, and syncing a live `.git` through a file-sync
  tool corrupts it (see the synced-team-folder exploration). Artifacts makes
  git the sync protocol itself.
- **The model is where the value is.** Organizer/series/instance,
  observations with provenance, many affiliations and nested locations are
  what make questions like "who in Central Texas have we met at any 7x24
  event?" answerable. No vendor CRM answers that out of the box.
- **HubSpot stays the client's system of record for their sales process.**
  We don't fight it; we feed it what fits.
- **Prior art.** The model ports augment-it's canonical layer (persons,
  organizations, affiliations, observations, events; see
  `surrealdb-canonical-layer`) from SurrealDB to SQLite.

## What was decided, in detail

These are implementation choices made in session on 2026-10-25. They follow
from the decision above but haven't been reviewed on their own.

- **Write order: git first, then D1.** `log_contact` commits and pushes the
  contact file, then fills in D1. If D1 fails, the git record stands and the
  tool says so. Git is the record; D1 is rebuildable from it.
- **Provenance on every fact.** Observations carry
  `source = event-hog:<instance>@<commit>:<path>`, so each structured fact
  traces back to the file and commit that asserted it.
- **Identity.** People match on email, then LinkedIn, then name plus
  organization. A name alone never merges two people. Natural keys live in
  `person_identifiers`, one person to many. Organizations match on slug, full
  name, short name, or alias, so "7x24 Exchange" and "7x24 Exchange
  International" are one.
- **One database per client.** No `client_access` column: the tenancy
  boundary is the client's Cloudflare account (consistent with D1/D2 in the
  per-client stack spec).
- **Fill blanks, never overwrite.** Both in contact files and in D1.
- **Writes add or append**, so a push rejected by a teammate's concurrent
  write retries from a fresh clone without clobbering anything.
- **HubSpot sync is propose-then-write**, through each person's own HubSpot
  connector, then `mark_crm_synced` records the link. Nothing reaches HubSpot
  without approval.
- **Schema**: `migrations/0001`–`0003` in this repo.

## Alternatives passed over

- **HubSpot as the only store.** It can't hold the model without Custom
  Objects and a plan upgrade, and even then locations and org-to-org
  relations would be awkward.
- **D1 only, no git layer.** It loses the human-readable shared record,
  per-person history, and a workspace teammates can read like documents.
- **Git only, no database.** Fine for one event, but cross-event questions
  ("everyone we've met in Central Texas") would mean parsing every repo.
- **A Railway homebase for Edviro, like the other clients.** It would put
  the plane in a different cloud from the data it fronts, and on Railway the
  Worker's Artifacts and D1 bindings would become API calls with stored
  credentials.
- **One `events` table plus an `event_ties` table** (the first schema, and
  the one migration 0002 replaced). It flattened organizer, series, and
  instance into one row, and kept participation apart from observations.
- **A single address per record**, the CRM default, for the reasons above.
- **Global exclusions** in location expansion. The first implementation
  applied them everywhere, which would have dropped San Antonio from a search
  of all Texas. Replaced with path-scoped exclusions before any data went in.

## Consequences

- event-hog can become a shared template: new event = new Artifacts repo,
  plus organizer/series/instance rows.
- Every new client that wants this needs its own D1 and Artifacts namespace,
  on its own Cloudflare account.
- A rebuild-from-git job (replay contact files into D1) is now worth having,
  since D1 is meant to be derivable.
- Connector auth is a per-person secret URL for now. Real sign-in (didi.sh,
  per the homebase spec) replaces it before this goes beyond one event.

## Follow-ups

- Load the prep map's speakers and sponsors as observations on the 2026 Fall
  instance, with A/B/C priorities, so "which A targets has nobody met?" works
  from a phone.
- A rebuild-from-git command for D1.
- Real OAuth sign-in for the connector.
- Decide whether `event-hog` gets its own repo, and whether this folder moves
  with it.

## References

- Code and migrations: `self-host-stack/hubs/event-hog-mcp/`
- Edviro's stack record: `self-host-stack/client-stacks/edviro/stack.md` (gitignored)
- Skills: `cloudflare-artifacts-interface`, `hubspot-interface`, `event-prep`, `surrealdb-canonical-layer`
- Spec: `self-host-stack/context-v/specs/Homebase-MCP-One-Connector-Per-Client.md`
