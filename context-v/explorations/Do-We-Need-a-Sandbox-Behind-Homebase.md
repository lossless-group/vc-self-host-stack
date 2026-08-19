---
title: "Do we need a sandbox behind homebase?"
lede: "Homebase federates tools but stores nothing and runs nothing. The missing piece turns out to be two pieces — storage, which is already funded, and compute, which can wait."
date_created: 2026-08-18
date_modified: 2026-08-19
authors:
  - Michael Staton
augmented_with:
  - Claude Code on Claude Opus 5
at_semantic_version: 0.0.1.0
tags:
  - Exploration
  - Homebase
  - MCP
  - Sandbox
  - Object-Storage
  - Cloudflare-R2
  - Papermark
  - Managed-Agents
  - Self-Host-Stack
  - AI-Agent-Infrastructure
status: Open
site_uuid: 7ccba464-3ec2-4bb7-acb8-4a78d1c7aa93
hex_code: 1lt6do
date_authored_initial_draft: 2026-08-18
date_authored_current_draft: 2026-08-19
publish: true
---

# Do we need a sandbox behind homebase?

## Why Care?

The pitch is that a client asks Claude Desktop for an outcome and it happens —
no terminal, no second tool, no remembered procedure
([[Goal-is-to-Enable-Multi-Tool-Functionality-from-One-MCP-Server]]). Most of
the outcomes we've promised are API calls, and homebase covers those.

But the ones that would actually impress — *"rename these twelve decks to our
convention and file them"*, *"pull the numbers out of these eight portfolio
updates and give me one table"*, *"turn this folder of PDFs into a dashboard"* —
are not API calls. They are **file work**: something has to hold the bytes, run
code over them, and put the result somewhere. Nothing in the current
architecture does that.

The question was posed honestly as *"we may or may not need a VM with its own
OS, command line, and filesystem — I don't know, never done this."* This
document is the option space, not a decision.

## First: three different things get called "a VM"

Worth separating, because the risk profile differs enormously and only one of
them is new to us.

| | What it is | Do we already do this? |
|---|---|---|
| **A VM** | A whole virtual machine you patch, harden, and own | No — and this is the one to avoid |
| **A container** | An isolated OS + filesystem from an image, orchestrated by someone else | **Yes.** Every Railway service is one |
| **A sandbox** | A container with a shell, deliberately given to a model to run code in | Not yet — this is the actual question |

`client-stacks/` already runs containers with their own filesystems: Twenty,
Outline, Postiz, Plane. So the honest framing is not *"can we do this"* — it's
*"where should the model's shell live, and who operates it."*

## The gap this exposes in the homebase spec

[[Homebase-MCP-One-Connector-Per-Client]] describes three planes: **tools**
(federated to Twenty / Outline / Postiz / Papermark / BYO), **resources**
(`context-v/` docs), and **prompts** (agent-skills). All three are *routing* —
homebase takes a call, forwards it, shapes the response.

**There is no fourth plane where code runs.** That's not an oversight in the
spec; it's correct for v1. But it means the file-work use cases have nowhere to
land, and they're the ones the portfolio-dashboard stretch goal depends on.

## The decision rule

Not every task needs a sandbox. The test:

> **Does the task need to produce or transform files, or run code the model
> writes?**
> **No** → API calls behind the connector. Nothing to build.
> **Yes** → it needs a sandbox. Rent one before running one.

Against humain's actual worklist:

| Job | Needs a sandbox? |
|---|---|
| "Is Sarah in our pipeline?" / "log this call" / "move this deal" | No — Decile MCP |
| "Export the LP list as CSV to the data room" | No — Decile's `save_csv_to_folder` does it server-side |
| "Upload this deck and attach it to the prospect" | No — Decile's `upload_file` takes base64 |
| "Rename these files to our convention, then upload" | **Yes** |
| "Extract the metrics from these 8 PDF updates into one table" | **Yes** |
| "Reconcile the schedule of investments against the GL" | **Yes** |
| "Build the portfolio dashboard" | **Yes** — and it's downstream of the two above |

Note how much falls on the "no" side. **A meaningful share of the promise ships
without any of this** — worth knowing before spending on compute.

## Storage is not compute — and it's the nearer need (2026-08-19)

The first real request that *looked* like it needed the sandbox turned out not
to, and the distinction it exposed is worth making structural.

**The case.** Decile's organization card has a `Deck url` custom data point. It
wants a **URL** — not a file upload. We had a portfolio company's deck on a local
disk and needed it addressable. The instinct was "this is the sandbox problem, or
we need a Google Drive connector."

It is neither. Run the decision rule: *does the task need to produce or transform
files, or run code the model writes?* **No.** It needs somewhere to put bytes and
get an address back. That is **storage**, and storage is a different plane from
compute:

| Plane | Answers | Needed for |
|---|---|---|
| **Storage** | "where do the bytes live, and what's the URL?" | Deck urls, generated exports, anything with a link |
| **Compute** | "where does code run over the bytes?" | Renaming batches, parsing PDFs, building the dashboard |

Homebase's missing fourth plane is really **two** planes, and they have different
urgency and completely different risk. Storage is boring, cheap, and needed now.
Compute is the one with a model holding a shell, and it can wait.

**The storage answer is already decided elsewhere.** Per-client **Cloudflare blob
storage (R2)** is already planned for system backups. That means the storage
plane needs no new architectural decision — it needs a second use case pointed at
infrastructure the backup work is standing up anyway. S3-compatible, so the
existing bucket muscle memory applies, and it supports **presigned expiring URLs**
— which matters, because a portfolio company's pre-seed deck should not sit at a
guessable public address.

**Why not the alternatives considered in the moment:**

- **A Google Drive MCP connector** — a new connector, new auth, and client files
  living in a second place, to solve a problem that is one `PUT` and a URL. This
  is precisely the divergence the parent reminder warns about: every connector
  added is another thing that can be half-working, and Drive's sharing model is
  either "anyone with the link" (same exposure, less control) or account-gated
  (breaks for anyone outside the workspace).
- **A sandbox** — nothing here runs code. Reaching for compute to solve a storage
  problem is how the expensive plane gets built first for no reason.

### Papermark is not an alternative to R2 — it's a layer on it

Raised as an option: install Papermark for humain and take the URL from there.
Worth separating, because they are not competing choices:

```
Papermark            ← a product: link + view analytics + access gates
   └── S3-compatible object storage   ← R2. Papermark needs this either way.
```

Standing up Papermark does not avoid the storage decision; it *consumes* it. If
R2 lands for backups, Papermark later sits on the same bucket.

**But not for this case, and three facts say so:**

1. **`Deck url` is empty on every organization checked** (Heartio, Percept
   Biosciences, Somite, Tactogen). It is not a convention the firm maintains.
   Building infrastructure to populate a field nobody populates is backwards —
   and the observed practice is different anyway: Heartio's *website* field holds
   `pitch.heartio.ai/b?y=…`, a DocSend-style link the **company** sent. The field
   wants the company's own hosted deck, not our copy of it.
2. **Papermark's value is outbound.** Link analytics — who opened, how long per
   page — is the DocSend replacement. An inbound deck held for internal
   reference is never shared, so the tracking is dead weight.
3. **It would be a first deployment, not an install.** `core/papermark/` is
   vendored source, but `docs/` — what we have actually stood up — has no
   papermark runbook. And the client in question runs **zero** self-hosted
   services by design.

**When Papermark *is* right:** when the firm needs to send **its own** fund deck
to LPs with view tracking. That is a real need for any fundraising firm, it is
the job Papermark exists for, and it is the moment the service earns its
maintenance. Not before.

**The generalizable rule:** when a field is empty across every existing record,
that is evidence about the workflow, not a gap to engineer around. Read the
neighbours before building.

**Revision to this document's recommendation:** Option 0 ("ship connector-only")
should be read as *connector + per-client object storage*. A meaningful share of
what sounds like "the agent needs a computer" is really "we need a place to put a
file and hand back a link" — and answering that well may shrink the compute case
further before we ever have to decide it.

## Four places the compute could live

### Option 0 — Nowhere (connector-only)

Decile already covers more file surface than expected: `upload_file`,
`download_file`, `create_folder`, `save_csv_to_folder` (server-side CSV
serialization, ≤5,000 cells), `upload_prospect_attachment`,
`create_personalized_link`. Twenty and Outline have their own file APIs.

**Ship this first regardless.** It is the cheapest way to find out which jobs
genuinely need more, rather than assuming.

### Option 1 — Claude's own code execution, in the client's session

The Desktop/Teams apps can already run code and produce files inside a
conversation. For "reshape this CSV", "make a chart", "do this arithmetic
correctly", the compute the client needs may already be sitting in the product
they're paying for.

**Costs us nothing and requires no infrastructure.** The limits are that it's
scoped to one conversation, isn't reachable from a scheduled job, and can't hold
credentials — so it does the middle of a workflow, not the ends.

### Option 2 — Our own worker service on Railway

The path of least novelty: a container in the client's existing project,
exposing job-shaped MCP tools (`rename_and_file`, `extract_updates`) that
homebase forwards to.

- **For:** we already operate this shape; total control; the client's data never
  leaves their project.
- **Against:** *we* write every job. This is the option where "the model does
  the work" quietly becomes "we hand-code each capability," which is the
  associate we were trying to replace. Also an always-on container per client
  — the cost question the homebase spec already flags as OQ#5.

### Option 3 — Anthropic's Managed Agents sandbox

Anthropic runs the agent loop *and* provisions a container per session where the
model's tools execute. Worth taking seriously because the feature list maps
uncomfortably well onto things the homebase spec has as open questions:

| Managed Agents gives | Homebase equivalent |
|---|---|
| Per-session container with `bash`, `read`, `write`, `edit`, `glob`, `grep`, `web_fetch`, `web_search` | *(nothing — the missing plane)* |
| MCP servers declared on the agent | The federation plane, inverted |
| Skills attached to the agent (plus prebuilt `xlsx`/`docx`/`pptx`/`pdf`) | The prompts plane — spec OQ#4 asks how skills reach a running homebase |
| Vaults: credentials substituted **at egress**, never visible inside the sandbox | The credential split H2 describes |
| Memory stores, mounted as a filesystem, versioned with redaction | *(nothing — would answer the graph-DB-for-memory idea)* |
| Scheduled deployments (cron) firing sessions autonomously | *(nothing)* |
| Per-tool `always_ask` permission policies | The D5 write-safety requirement |
| Hard per-session dollar budgets | *(nothing)* |

The credential property is the one I'd underline. Secrets in a vault are
**never placed in the sandbox** — an Anthropic-side proxy injects them into
outbound requests after they leave, scoped to an allow-list of hosts. Code
running in the container, *including code the model wrote*, cannot read them.
That is a stronger boundary than anything we'd build ourselves on a first
attempt, and it's the single scariest part of handing a model a shell.

### Option 3b — Managed Agents with a self-hosted sandbox

Same control plane, but tool execution moves into a container **we** run: an
outbound-polling worker claims work; Anthropic never dials into our network.
The escape hatch if a client's data can't sit in someone else's container.

Real costs, not footnotes: vault environment-variable credentials are **not**
supported there (the egress-substitution property above is exactly what you
lose), memory stores aren't either, and mounting files and repos becomes our
job again.

### Option 4 — A VM we administer

**This is the one to rule out.** It means owning patching, hardening, and egress
control on a box that runs model-authored shell commands against client data.
Every other option gets the same capability with someone else operating the
dangerous part. The only thing a VM adds over a container is administrative
burden.

## The catch that decides the shape

**Managed Agents is an API product. Claude Desktop connects to MCP servers.**
A client cannot "add Managed Agents" the way they add a connector.

So CMA is not an alternative to homebase — it's a candidate for **what homebase
calls when a job needs a shell**:

```
Claude Desktop  ──one connector──▶  homebase (MCP, Railway)
                                      │
                                      ├── tools ──▶ Twenty / Outline / Decile / BYO
                                      ├── resources ──▶ context-v docs
                                      ├── prompts ──▶ agent-skills
                                      └── run_job ──▶ ??? ──▶ a sandbox
                                                              (Option 2 or 3)
```

The client-facing surface doesn't change. `run_job` is one more tool. What sits
behind it is the open question — and it can change later without the client
noticing, which is the argument for shipping Option 0 now and deciding this
under real load.

## What none of the options solve

- **Who pays.** The client's Claude seat covers their Desktop usage. A sandbox
  we drive is billed to *us* — API tokens, or an always-on container, per
  client. This is a pricing question wearing an architecture costume, and it
  interacts with homebase OQ#5.
- **Attribution.** Decile's audit trail is a headline feature of the OAuth
  connector path — every action attributed to the person who asked. Work that
  runs in a sandbox under *our* credentials shows up as us. For a fund, that
  matters.
- **Beta risk.** Managed Agents is beta. Building the compute plane on it is a
  bet on an interface that can still move.
- **The failure mode nobody plans for.** A model with a shell and a data room
  can delete things. Permission policies and confirmations help; a restore path
  is what actually saves you.

## Where this lands (for now)

1. **Ship Option 0.** Do the connector-only work and let real requests show
   which jobs actually need a shell. We are guessing at the list right now.
2. **Rule out Option 4** permanently — record it as decided.
3. **Cheapest real test:** take *one* job we already know needs files — renaming
   a batch of decks and filing them into Decile's data room — and build it twice:
   once as a Railway worker tool (Option 2), once as a Managed Agents session
   with the Decile MCP attached (Option 3). Compare on effort to build, cost per
   run, and whether the second one generalizes to the next job without new code.
   That last property is the whole question: **Option 2 costs us a build per
   capability; Option 3 might not.**
4. **Revisit when the portfolio dashboard becomes real.** It's the use case that
   forces the answer, and it isn't close yet.

## Open questions

1. Which jobs on the "needs a sandbox" list are actually asked for, versus
   assumed by us? (Answered only by shipping Option 0.)
2. Can homebase call Managed Agents synchronously enough for a Desktop
   conversation, or does the shell path have to be async — job accepted now,
   result delivered later?
3. Does the attribution loss (work runs as us, not as the person) disqualify the
   sandbox path for fund clients, or is a note in the record enough?
4. What does a sandbox job cost per run, and how does that compare to an
   always-on Railway worker across N clients? Feeds homebase OQ#5.
5. If a self-hosted sandbox is required for a client, does losing egress-side
   credential substitution push us back to Option 2 anyway?
6. Where does a company's deck actually belong — R2 with a presigned link,
   Decile's own data room, or both? Decile is the system of record but
   `create_personalized_link` mints **per-recipient** links, which is a sharing
   primitive, not a stable internal address.
7. Does the memory-store primitive replace the "graph DB for context memory"
   idea in the reminder, or are they different needs?

## Related

- [[Homebase-MCP-One-Connector-Per-Client]] — the three planes; this proposes a possible fourth
- [[Goal-is-to-Enable-Multi-Tool-Functionality-from-One-MCP-Server]] — the why
- [[lossless-at-path-based-homebase]] — the addressing decision
- [[Per-Client-Self-Host-Stacks-Twenty-First-on-Railway]] — the container shape we already run
- `context-v/agent-skills/decilehub-interface/` — the worked example; its data-room tools are the Option 0 surface
