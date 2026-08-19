---
title: "The goal is multi-tool functionality from one MCP server"
lede: "Clients live in Claude Desktop, not a terminal. Everything we build has to arrive as one connector they never have to think about again."
date_created: 2026-08-18
date_modified: 2026-08-18
authors:
  - Michael Staton
augmented_with:
  - Claude Code on Claude Opus 5
at_semantic_version: 0.0.0.1
status: Draft
tags:
  - Reminder
  - Homebase
  - MCP
  - Agent-Skills
  - Self-Host-Stack
  - Client-Experience
site_uuid: ab7b37c4-6113-45e4-9fd5-9ae4b56ac175
hex_code: hs3569
date_authored_initial_draft: 2026-08-18
date_authored_current_draft: 2026-08-18
publish: false
---

# The goal is multi-tool functionality from one MCP server

**Don't** design any client-facing capability that assumes a terminal, a config
file, a repo checkout, a remembered procedure, or a second connector.

**Do** assume the client is in **Claude Desktop on a Pro / Max / Team plan**,
has one connector installed, and will ask for an outcome in plain language —
today, next week, and six months from now, without being retrained.

## Why

**Most clients do not want to open a terminal.** When you teach one, they feel
great for a day and have forgotten it a week later. That isn't a client failing;
it's the correct response to a tool that isn't part of their job.

What they actually have:

- **Claude Desktop**, usually Pro, Max, or Team.
- **Advanced features they under-use.** Agent-skills and connectors exist but
  aren't near peak use, and when a team does adopt them, **practices diverge
  person to person** — each member ends up with a different setup and a
  different idea of what's possible.
- **MCP connectors of uneven stability.** A connector that half-works has
  varying utility, and the client can't tell a flaky connector from a missing
  capability. They just conclude "it doesn't do that."

So the target is: **one server or container image, loaded with everything that
client needs**, such that asking Claude Desktop covers the operations,
procedures, and tasks that used to need an associate, an assistant, or an hour
of clicking through four different UIs.

## What "everything they need" means

The bundle behind the single connector is:

1. **The client's actual tool stack.** We reuse preferred tools across clients
   to stay consistent — but when a client is already on something they like,
   **we integrate it rather than migrate them.** Consistency is our convenience;
   their existing tool is their reality.
2. **Context files, including agent-skills** — served to the model, not filed in
   a repo the client will never open.
3. **Memory** — a graph DB or similar, so context persists across chats instead
   of being re-explained.
4. **Whatever else that client needs**, added behind the same address.

## The part agents keep getting wrong

**Documenting the tool is not the deliverable.** An API reference, an endpoint
list, or a tool inventory tells the model *what it can call* and leaves it to
guess *what to do*. What Claude Desktop needs from us is:

- what the tool is, **and**
- the **functions and processes we use** on top of it, **and**
- the **likely order** those run in to accomplish a real workflow or task.

Write the procedure, in sequence, with the decision points named. A skill that
lists 158 tools without saying which three to run first, and in what order, has
moved the problem rather than solved it.

## Worked example — Decile Hub (humain-vc)

Decile Hub is the **CRM**, and to a degree the **data room**. By default it
should hold the email communications and the attached documents.

- **Near-term use case:** streamline the **deal pipeline** so decisions get made
  thoughtfully instead of getting made by whoever last opened the board.
- **Stretch goal:** portfolio-company data aggregated, tidied, parsed for
  meaningful insight, and rolled into a **portfolio dashboard** — which is only
  reachable if data entry, file renaming, and uploading are as easy as *asking
  Claude Desktop*. The dashboard is downstream of the drudgery being gone.

Both use cases are the same shape: the client asks for an outcome, and the
connector already holds the tools, the procedure, and the memory.

## Triggers

Load this reminder when:

- Scaffolding or extending a client stack under `client-stacks/`
- Writing or reviewing an agent-skill meant for Claude Desktop or Claude Teams
- Choosing between "add another connector" and "put it behind the existing one"
- Tempted to hand a client a CLI command, a script, or a config file to edit
- Deciding what goes in a skill — reach for procedure and ordering, not just a
  tool inventory
- Evaluating a new tool for the stack: ask whether it can be reached from the
  one connector, and whether the client would ever have to leave Claude Desktop

## Related

- [[Homebase-MCP-One-Connector-Per-Client]] — the spec for the single-connector
  capability plane this reminder is the *why* for
- [[lossless-at-path-based-homebase]] — the addressing decision
  (`lossless.at/<client>/<service>/api`)
- [[Per-Client-Stack-Deployment-Spec-Twenty-First]] — how a client stack gets
  stood up
- `context-v/agent-skills/decilehub-interface/` — the Decile Hub skill written
  against this goal; its tiering + procedure sections are the pattern to copy
