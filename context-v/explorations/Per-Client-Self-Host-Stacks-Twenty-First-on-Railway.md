---
title: "Per-Client Self-Host Stacks, Twenty-First, on Railway"
lede: "One playbook, three tiers: managed client stacks on Railway, a hub page clients actually use, and a per-client remote MCP server that could grow into a full context plane."
date_created: 2026-07-24
date_modified: 2026-07-24
authors:
  - mpstaton
augmented_with:
  - Claude Code on Claude Fable 5
semantic_version: 0.0.0.5
tags:
  - Exploration
  - Self-Host-Stack
  - Railway
  - Twenty-CRM
  - Secrets-Management
  - MCP
  - Client-Operations
  - FullStackVC
status: Open
---

# Per-Client Self-Host Stacks, Twenty-First, on Railway

## The question

Two clients are ready for their own self-host stacks, each starting with a single app: [Twenty CRM](../../core/twenty-crm). Deployment target is Railway. What we need to figure out is not "how do we deploy Twenty twice" — that's a weekend — but **what the repeatable per-client shape is**, because everything about this repo's premise says there will be a third client, a tenth, and a hundred-and-fortieth:

1. **Railway topology** — how a client maps onto Railway primitives, and who owns what. *(Largely decided; recorded below.)*
2. **Secrets** — where per-client secrets canonically live, how they reach Railway, and how they reach a client's Claude Desktop / GPT Desktop **without git ever being involved on the client's machine**.
3. **The client hub** — the page a client bookmarks to reach their apps, given that we won't always control DNS for their domains.
4. **MCP access** — Claude and GPT Desktop talking to client databases: operator-first (me), fast-followed by something clients drive themselves, with **both Claude Desktop and GPT Desktop supported from day one**.
5. **Managed ops** — backups, upgrades, monitoring: what "managed" means per client, sequenced easy-win → hard slog.

## Why Care?

Because the delivery model is three tiers, not one:

| Tier | Who | What they get |
|---|---|---|
| **Managed** | Paying clients (first two: one existing client in astro-knots, one new — `palmer-ai`) | We deploy, we hold the secrets, we run backups/upgrades/monitoring, they get a hub page and eventually direct AI access to their own data |
| **Advised** | Existing/friendly clients in the Lossless orbit | Same shapes, looser SLAs, possibly their own Railway billing |
| **Self-serve** | The **FullStackVC** community — ~140 VC professionals at ~140 firms | Public setup guidelines + Railway templates so they can *take what we have and go*, paying nothing, asking nothing |

Every design decision below gets graded against all three tiers. A pattern that only works when Lossless holds the keys fails the FullStackVC test; a pattern with no managed-tier leverage fails the business test. The README already carved out `client-stacks/` (gitignored, operational) as the home for the managed tier — this exploration decides what actually goes in it.

## Decided already (context, not options)

- **Railway topology: one Lossless-owned workspace, one Railway project per client.** Each client project contains their services (Twenty server, worker, Postgres, Redis — and later Papermark, Plunk, etc. as siblings). Clean blast-radius isolation, one billing surface, and the Railway MCP server already wired into Claude Code sessions can operate all of it (`create_project`, `deploy_template`, `set_variables`, `create_tcp_proxy`, `get_logs`, metrics). The environment-per-client shape was considered and rejected: weak isolation, env-var sprawl, and one project's mistake becomes every client's incident.
- **First app: Twenty only, for both clients.** Prove the full pattern (deploy → secrets → hub → MCP → ops) on one app before multi-app stacks. The design must not *assume* single-app, but nothing ships beyond Twenty until the pattern holds.
- **Domains are mixed per client.** One client may hand us DNS (apps at `crm.client.com`), another lives on `*.up.railway.app` generated domains indefinitely. This is exactly why the hub page is a first-class deliverable and not a nice-to-have: when we can't mint memorable URLs, the hub *is* the memorable URL.
- **GPT Desktop parity is a day-one requirement.** Whatever MCP shape we pick must work as a remote connector from both Claude Desktop and ChatGPT's desktop app before a client onboards. This immediately biases toward remote MCP over streamable HTTP with an auth story both support, and against anything that requires a local process on the client's machine.

## Axis 1 — Secrets

**The binding constraint:** clients' Claude Desktop and GPT Desktop will never be set up to use git. Any scheme whose distribution step is "pull the repo" works for me and dies at the client boundary. I'm not worried about me; anticipating them is the real problem.

### Option A — Gitignored `.env` per client in `client-stacks/` + password-manager recovery copy

The shape the repo already implies: `client-stacks/<slug>/.env` holds the real values, a script (or the Railway MCP `set_variables`) syncs them into the client's Railway project, and a password manager (1Password et al.) holds the recovery copy per the monorepo's own relocation-safety doctrine.

**Pros:** zero new infrastructure; matches existing repo shape; the Railway MCP makes sync a one-liner; recovery story is the same one the pseudomonorepos skill already enforces.
**Cons:** flat files rot silently; no rotation story; no audit trail; **does nothing for client-side distribution** — it's an operator-tier answer only.

### Option B — Encrypted-in-git (SOPS + age)

Secrets live *in* `client-stacks/`, encrypted, so git is the source of truth and history.

**Pros:** versioned, diffable, survives laptop loss by design.
**Cons:** key ceremony for every collaborator; still git-shaped, so still nothing for clients; adds friction to the tier (me, solo, moving fast) that needs it least. Probably over-engineering at two clients.

### Option C — [OpenBao](https://openbao.org/) as the canonical store

Self-hosted Vault fork, itself deployable as a Railway service. Secrets get paths (`clients/palmer-ai/twenty/APP_SECRET`), leases, rotation, audit logs, and — critically — **an API**, which means the per-client remote MCP server (Axis 3) can fetch what it needs at runtime without any human distributing anything.

**Pros:** real rotation/audit; API-first, so it composes with the MCP context-plane idea instead of fighting it; itself a `core/`-worthy self-hostable tool (eat own dogfood, and FullStackVC members could run their own).
**Cons:** now we run a secrets service with an unseal ceremony; a new single point of failure; heavyweight for two clients if adopted *first* rather than *grown into*.

### Option D — [secretspec](https://github.com/cachix/secretspec) as the declaration layer

Not a store — a manifest. Each client stack (and each `core/` app wrapper) declares *which* secrets it needs in a `secretspec.toml`; providers (env file, keychain, OpenBao later) satisfy the manifest. This directly attacks the failure mode the monorepo has already been burned by: `.env.example` lying about what the app actually reads.

**Pros:** provider-agnostic, so it doesn't force the store decision; the manifest doubles as documentation and as the checklist the self-serve tier follows; composes with A now and C later.
**Cons:** young tool; another convention to maintain; doesn't itself solve storage or distribution.

### Option E — [Phase](https://phase.dev/) as the canonical store

Open-source, self-hostable secrets platform aimed at the same slot as OpenBao but with a much more application-shaped surface: per-app/per-environment secrets, a console UI, CLI + SDKs, secret referencing, and native sync integrations. Self-hostable via Docker, so it could also live as a service in our Railway workspace — and like OpenBao it's API-first, so the Layer-3 MCP context plane could source credentials from it at runtime.

**Pros:** friendlier operator ergonomics than OpenBao (console, environments, per-app model maps 1:1 onto client stacks); API + service tokens fit the MCP-fetches-at-runtime pattern; open source and self-hostable, so it passes the FullStackVC dogfood test; hosted tier exists as a zero-ops on-ramp before self-hosting it.
**Cons:** younger and less battle-hardened than the Vault lineage; another product bet; same "we now run the secrets service" weight as OpenBao if self-hosted. Head-to-head with Option C is a real evaluation, not a coin flip.

### Option F — Railway as source of truth

Set variables in Railway, export occasionally.

**Pros:** least work. **Cons:** weakest recovery story; violates the "what if the Railway project vanished" test; disqualified as *canonical*, fine as *runtime*.

### The reframe worth stating

The client-distribution problem may not be a secrets-distribution problem at all. If the client-facing surface is a **remote MCP server that holds the secrets server-side and exposes pre-authenticated *capabilities*** ("query your CRM"), the client's desktop app never receives a database password — it receives a connector URL and an auth token. The secret that reaches the client shrinks to one revocable credential. That's a materially better security posture than any scheme that ships `.env` contents to a client laptop, and it means Axes 2-of-secrets and 3-of-MCP are actually one design.

## Axis 2 — The client hub

Given mixed domain control, every client needs one bookmarkable page listing their apps with live links (and, eventually, status). Options surfaced:

### Option A — One multi-tenant hub app

A single Lossless-built portal: each client logs in, sees their app tiles, their generated-or-custom URLs, maybe docs and support links. One thing to build, one thing to maintain, and the natural place to later mount per-client onboarding docs and the MCP connector setup guide.

### Option B — Roll it into `ai-labs/dididecks-ai`

dididecks-ai already has per-client surfaces (client-sites) and per-client design/context discipline. A `hub` surface per client there reuses existing auth patterns, deploy patterns, and the existing client relationship plumbing rather than inventing a parallel portal.

### Option C — Off-the-shelf start page per stack (Homepage / Homarr / Glance)

One more service inside each client's Railway project, config-file driven, zero custom code. Worth naming because it's the only option the **self-serve tier** can also use — a FullStackVC firm following our guide can `deploy_template` a start page next to their Twenty and get the same experience with no Lossless involvement.

**Tension to resolve:** A and B are the same investment wearing different clothes — the real question is whether the hub is a *dididecks-ai feature* or a *self-host-stack product*. C is a stopgap that never becomes an asset, but ships this week and serves tier three forever.

## Axis 3 — MCP access to client data

Sequencing is settled: **operator-first** (me, from my machines, for admin/migration/support), **fast-followed** by client-direct access. The design must be built so the fast-follow is a permissioning change, not a rebuild. All three shapes are in play, and they layer rather than compete:

### Layer 1 — Twenty's native MCP surface

Twenty ships AI/MCP support natively (it's literally in our README pitch). Per-client API keys, app-level permissions respected, zero custom code. This is the floor: it should be wired for both clients' workspaces immediately, and it's the only layer the self-serve tier gets for free.

**Limits:** only Twenty, only what Twenty's API exposes, per-app rather than per-stack — a client with three apps would juggle three connectors.

### Layer 2 — Direct Postgres access: the *channel* is operator-only, the *capability* is not

Railway TCP proxy (or `railway connect`) plus a Postgres MCP server on *my* machine. Full-power schema-level access for migrations, audits, and support surgery.

An earlier draft marked database access "operator-only, read-first" as if that were a client ceiling. **Corrected 2026-07-24: it isn't, and shouldn't be.** The client stakeholder's actual workflow is write-shaped — "add this person," "add this organization," "check my email and attach all the relevant threads" — and AI models, agents, and especially Claude are inherently almost-perfect at SQL and scripting. There is no reason to design as if that weren't true. What stays operator-only is this layer's **unmediated channel** (raw TCP from a trusted laptop, no audit trail, no plane in between) — client read *and write* database access is a first-class capability, delivered through Layer 3 where every statement is attributable and reversible.

### Layer 3 — The per-client remote MCP server ("context plane") — the aspirational centerpiece

One custom MCP service deployed **inside each client's Railway project**, speaking streamable HTTP, added as a remote connector in both Claude Desktop and GPT Desktop. What makes it more than a database proxy is what it serves:

- **Capabilities over the client's stack** — query the CRM, pull a report, check app status — with secrets held server-side (see the Axis 1 reframe). The client's desktop AI holds one revocable token, never a connection string.
- **The client's context-v files** — served as MCP resources, so the client's own AI sessions load the same specs, blueprints, and reminders our sessions do. Context vigilance, delivered over the wire.
- **The client's agent-skills** — served as MCP prompts/resources, so a skill authored once in the client's stack reaches every AI surface the client uses, Claude or GPT, without any file distribution.

This is a genuinely distinctive product shape: *the client's institutional context, versioned by us, mounted into whatever AI the client prefers.* Nothing in the managed-CRM market does this.

Three consequences of deploying the plane *inside* the client's Railway project, surfaced 2026-07-24:

- **Private-network database access, read *and write*.** The plane reaches the client's Postgres over Railway's private network — no public TCP proxy, no internet-reachable DB. Client stakeholders get full read-write through it: `query` for reads, `execute` for writes, `run_report`/`save_report` for custom reporting. A strong *preference* to route writes through the app's own API where one exists (Twenty's API preserves invariants its metadata-driven schema cares about) — but direct SQL writes are a supported client capability, not an operator privilege, because the agents doing the writing are near-perfect at SQL. Safety comes from engineering, not denial: everything in a transaction, every statement audited to the person's `didi_id`, pre-write snapshots so any session is revertible, and a confirm step for bulk or destructive statements only. Where a central plane would need tunnels or public DB exposure, colocation gets all of this free.
- **Management from the native AI apps.** The plane holds a scoped Railway token and exposes runbook-shaped ops tools (`check_status`, `view_recent_logs`, `restart_app`, `upgrade_app`, `backup_now`) gated by role — so a client manages their stack from Claude/GPT on desktop *or phone*, and the operator tier (Claude Code + Railway MCP) stays a superset of the same verbs.
- **The plane is the address book.** A `my_apps` tool plus a line in the server `instructions` means "open my CRM" always resolves to the current URL — solving the no-DNS-on-their-domain problem from the agent side, while custom subdomains under *our* domains (`crm.<client>.didi.sh`) solve it for humans without touching client DNS.

And a scope correction from the ai-labs side: **every client is a mixed stack** — self-hosted-by-us apps *plus* proprietary SaaS they already pay for (a Streak instance here, hosted Decile there). The plane fronts the whole roster: the client fetch-and-pastes each SaaS key once into the didi.sh admin UI, we ship an MCP-served skill per service, and "talk to Claude" reaches both halves of their stack through one connector. The per-client stack definition is the full roster of credentialed services, not just what we deployed.

**What has to be verified before believing in it** (the actual exploration work):

1. **GPT Desktop's remote-connector reality** — which auth flows ChatGPT desktop accepts for custom remote MCP servers (OAuth? bearer? developer-mode gating?) and whether resources/prompts (not just tools) surface in its UI. Claude Desktop's remote connector support is the easy half; day-one parity means the GPT half gates the design.
2. **Auth shape** — one bearer token per client seat vs. a real OAuth flow; what token rotation looks like when a client offboards an employee.
3. **Serving context-v/skills over MCP** — resource-listing UX in both desktop apps is immature; it may be that skills-as-prompts works and resources get ignored, which changes what we promise.
4. **Framework pick** — FastMCP (TypeScript or Python) vs. hand-rolled; whichever, it must deploy as a plain Railway service with no state beyond its config and its OpenBao/env-sourced credentials.

## Axis 4 — Managed ops, easy-win → hard slog

All three are in scope for the managed tier; the ordering is the commitment sequence:

1. **Backups off-Railway (easy win, do first).** Scheduled `pg_dump` per client to storage we control (Railway bucket or R2), plus Railway's own snapshots. A cron service inside each client project; restore procedure written down in `client-stacks/<slug>/` *before* it's ever needed.
2. **Version upgrades on a cadence (medium).** Twenty ships fast. Per-client upgrade loop: read upstream release notes → upgrade the *staging* environment in the client project → smoke-test (browser-drive per the monorepo's verification blueprint) → promote. The dependency-upgrade-loop skill is the sibling pattern; a `context-v/loops/` doc should codify the client-stack variant once we've run it twice.
3. **Monitoring & alerts (hard slog, last).** Railway health checks + a ping service; the bar is "we know before the client does." Defer any real observability stack until app count per client justifies it.

## Findings

*(To be filled as the verification work in Axis 3 runs: GPT Desktop connector auth findings, Twenty native-MCP scope in current release, OpenBao-on-Railway feasibility, hub option spike notes.)*

## Tentative direction

Recommendations per axis, held loosely:

1. **Secrets — staged: A + D now, C-vs-E bake-off when Layer-3 MCP ships.** Today: `client-stacks/<slug>/.env` (gitignored) + password-manager recovery + Railway MCP sync, with a `secretspec.toml` per stack as the honest manifest of what each app actually reads. When the per-client remote MCP server becomes real, evaluate OpenBao vs. Phase head-to-head as its backing store (Phase's per-app/per-environment model and console likely win on ergonomics; OpenBao wins on lineage) and migrate the canonical copies to the winner. Skip SOPS entirely. **Never ship raw secrets to client machines — the remote MCP capability model makes that unnecessary.**
2. **Hub — decide "product or feature" before building; C as this-week stopgap.** Deploy an off-the-shelf start page in each client's Railway project now so both clients have a bookmark on day one. In parallel, resolve whether the real hub is a dididecks-ai surface (B) or a standalone multi-tenant product (A); lean B if these clients already touch dididecks-ai, because it reuses auth and deploy patterns that exist.
3. **MCP — all three layers, in order.** Twenty native MCP wired for both clients immediately (also becomes the self-serve tier's documented path). Direct-Postgres stays operator-only. The Layer-3 context plane is the flagship — spike the GPT Desktop connector question *first*, because it's the binding constraint, and let the spike graduate this section into its own spec.
4. **Ops — commit in the stated order**: backups this sprint, upgrade loop after the first upstream Twenty release we ride through, monitoring when there's something worth waking up for.
5. **The self-serve tier gets its own artifact — authored for agents, not just humans**: a public "take it and go" guide (Railway template + secretspec manifest + Twenty-native-MCP setup) published where FullStackVC can find it. Critically, it ships in two renditions of one source: human docs (screenshots, short paths) and a **`setup` agent-context doc at a stable, fetchable URL** — because the persona won't finish reading developer docs, but *will* make it if they hand the link to Claude or GPT Desktop and say "Help me set this up." The moment an instruction says "open a terminal," they're gone. It is a forcing function: anything in the managed pattern that can't be written down publicly — and executed by a stranger's agent — is a smell. The full persona and the `setup`-skill pattern live in `ai-labs/context-v/explorations/Secrets-for-Collaborators-Who-Will-Never-Open-a-Terminal.md`.

**Proposed `client-stacks/<slug>/` shape** (managed tier, gitignored):

```
client-stacks/
  palmer-ai/
    .env                    ← real values (recovery copy in password manager)
    secretspec.toml         ← what the stack actually reads
    stack.md                ← Railway project ID, service list, URLs, domain status
    restore-runbook.md      ← written before it's needed
    context-v/              ← the client's own context, future MCP-served
```

## Outcome

**First fork landed 2026-07-24:** the deployment work is now specced in [[../specs/Per-Client-Stack-Deployment-Spec-Twenty-First]] — the phase-gated PM-to-lead-engineer handoff (Phases 0–6: preflight → reach-edu → palmer-ai → backups → native MCP → hub stopgap → homebase connector spike). Still expected to fork: the capability-plane ("homebase") contract amendment to the id-didi-sh spec, and the public self-serve guide for the FullStackVC tier. This exploration stays Open as the rationale layer behind the spec.

## Related

- [[Watchlist-Interesting-Tools]] — running candidate list for `core/`
- [[Hermes-Agent-Multi-User-Team-Access]] — sibling exploration on multi-user access to a shared self-hosted agent, same client-boundary problems
- `README.md` at repo root — the three-directory shape (`core/` / `studies/` / `client-stacks/`) this builds on
- `use-railway` skill + Railway MCP server — the operating tools for everything above
- `context-v/skills/context-vigilance` — the discipline the Layer-3 context plane would deliver over the wire
- `ai-labs/context-v/explorations/Secrets-for-Collaborators-Who-Will-Never-Open-a-Terminal.md` — the canonical rabbit-hole doc this exploration's secrets axis forked into: the terminal-poor persona, key-ownership economics, the `setup` skill, and the capability plane (implementation notes in `ai-labs/id-didi-sh/context-v/explorations/`)
