---
name: decilehub-interface
description: Operate a VC firm's Decile Hub from Claude Desktop, claude.ai, or Claude Teams through Decile's native MCP connector — 158 tools spanning the LP/investor pipeline, deal flow, portfolio, fund admin, data room, and outbound email. Use whenever someone asks about an LP or a deal ("is Sarah in our pipeline?", "what stage is X at?", "who referred us to Y?"), wants a conversation logged ("add a note", "log that call", "here are my voice notes"), wants records created or updated ("add these people", "move them to Committed", "tag these"), wants a list or export ("who's in Fund I", "export the LP list as CSV"), wants to send something (email, newsletter, PACT, LPA), or names Decile / Decile Hub / decilehub.com. Encodes the connector setup (OAuth for team members, raw API token for operators), the People-vs-Organizations-vs-Pipelines-vs-Prospects model, where a note actually lands (the Person, not the pipeline row), the four-tier safety classification Decile does NOT ship (its 158 tools carry zero annotations, so a client cannot tell list_people from publish_newsletter), the name-matching discipline for hand-collected records that carry no email, six ordered procedures (answer / log / move a deal / intake a batch / portfolio files / send) that name the decision point at each step rather than just listing tools, and humain-vc's real stage vocabulary across 29 pipelines including the [Hold]-stages-are-waiting-states rule.
publish: true
---

# Decile Hub Interface

**Decile Hub is the system of record for a VC firm's fundraise and fund admin.**
This skill is how a person drives it from Claude — Desktop, claude.ai, or a
Claude Teams workspace — through Decile's own remote MCP connector.

> One connector URL, the person's own Hub login, and the whole fund is
> conversational: *"has Sarah signed a PACT?"*, *"log this call"*, *"who in
> Fund I hasn't been contacted in 60 days?"*

**Read the safety section before your first write.** Decile ships 158 MCP
tools with **zero tool annotations** — nothing marks a tool read-only or
destructive. `list_people` and `publish_newsletter` look identical to the
client. The tier table in [`references/tool-map.md`](references/tool-map.md)
is the missing classification, and it is the load-bearing part of this skill.

## The surface

| | |
|---|---|
| Endpoint | `https://<tenant>.decilehub.com/mcp` |
| Tools / prompts / resources | **158 / 0 / 0** (enumerated live 2026-08-18) |
| Team-member auth | OAuth — DCR + PKCE, sign in with a Hub account |
| Operator auth | Raw API token in `Authorization` (no `Bearer`) |
| REST escape hatch | `https://<tenant>.decilehub.com/api/v1/*` (operator sessions only) |
| API docs | `https://<tenant>.decilehub.com/docs/api` — live, per-tenant, server-rendered HTML. **No JSON spec endpoint**: `/docs/api.json` returns 200 with zero bytes |

Setup, the OAuth metadata, and the three ways it silently breaks:
[`references/connector-setup.md`](references/connector-setup.md).

## Ground yourself before you do anything

Two calls, every session, before reasoning about anything:

1. **`whoami`** — confirms which Hub identity you're acting as, the account,
   `account_user.roles` (what this person is allowed to touch), and
   `accessible_pipeline_ids`.
2. **`list_pipelines`** with `kind: "investor"` (or no filter for all) — the
   real pipeline names and IDs. **Never guess a pipeline.**

Then, when you need stage names, `get_pipeline` on the one you picked. Stage
vocabulary is per-pipeline and firm-authored; the names in your head are wrong.

## The data model, in the order you reason about it

Decile is three layers, and getting this right answers the recurring
"is this a person or an organization?" question:

1. **People** — individuals. Natural key **email**.
2. **Organizations** — funds, family offices, operating companies. Natural key **name**.
3. **Pipelines → PipelineProspects → Notes** — the relationship layer on top.
   - A **Pipeline** has a `kind`; `investor` is the LP-fundraising type.
   - A **PipelineProspect** is a row in one pipeline pointing at *exactly one
     of* a Person or an Organization (`prospectable_type` / `prospectable_id`).
     For an individual LP the prospect **is the Person** — their fund rides
     along as `person.organizations[]`, never as the prospect itself. Make the
     *Organization* the prospect only when the institution, not a named human,
     is the relationship.
   - The prospect carries the **pipeline-scoped** facts: `stage`, `rating`,
     `probability`, `capital_commitment`, `last_contact`, `next_contact`,
     `assigned_name`.
   - **Notes** are their own entity: `{id, body, context, created_at, author}`.

### Where a note actually lands (counter-intuitive, matters constantly)

`add_pipeline_prospect_note` does **not** attach the note to the pipeline row.
Decile stores it against the prospect's **prospectable** — the Person or
Organization — falling back to the prospect only when there isn't one. Since
LP prospects are `prospectable_type: "Person"`, **the note attaches to the
person**.

Consequence: a note added via the Fund I prospect shows on that person's card
in **every** pipeline they're in. The note's **`context`** field — set it to
the pipeline name — is the only thing tying it to one pipeline. That's usually
what you want. If someone asks for per-pipeline siloed notes, Decile's model
doesn't do that; encode the pipeline into the note body and say so.

## Finding things — search before you list

Two anchored-match search tools answer most questions and should be your first
reach:

- **`search_people_orgs`** — "who is X?", "find jake kelley", "who referred us
  to Y?" Searches people *and* organizations, interleaved.
- **`search_pipeline_prospects`** — "is X in our pipeline?", "what stage is X
  at?", "find the Acme deal." Searches across every pipeline the caller can read.

Matching is **anchored**: every word of `q` must start a word in the name,
email, or company URL — case- and accent-insensitively. So `jake kel` and
`munoz` (finds *Muñoz*) hit, while a mid-word fragment like `ell` no longer
drags in *Winkelman*. Trigram fuzzy matching only backfills when the anchored
pass under-fills a page, so misspellings still land without flooding results.

`list_people` / `get_prospects` are for enumeration and filtering (by stage,
tags, contact dates, probability), not for finding a known name.

## Safety — the four tiers

Decile supplies no annotations, so **you** classify before you call. Full
per-tool table in [`references/tool-map.md`](references/tool-map.md).

| Tier | n | Rule |
|---|---|---|
| 🟢 **read** | 85 | Run freely. Reads are how you avoid guessing. |
| 🟡 **write** | 38 | Creates/updates; additive and recoverable. State what you're about to write, then write, then verify with a read. |
| 🟠 **confirm** | 22 | Deletes, tag removals, batch stage moves, GL postings, entity creation. Name the exact records and get a yes first. |
| 🔴 **outbound** | 13 | Leaves the building — email, newsletters, PACT/LPA, network-feed shares, public data-room links, tasks in other people's inboxes. **Preview, show the render, get an explicit yes, never batch.** |

Three rules that are not negotiable:

1. **Preview before every outbound send.** `preview_email` before `send_email`;
   `preview_newsletter` before `publish_newsletter`;
   `preview_pipeline_action_execution` before `execute_pipeline_action_execution`.
   Show the person the rendered subject, body, recipient(s), attachments, and
   `recipient_count`. Decile enforces this server-side too — `send_email` and
   `publish_newsletter` require `confirm: true` and return `422
   confirmation_required` without it — but the gate exists to catch a
   hallucinated call, not to substitute for showing a human the email.
2. **`publish_newsletter` is irreversible.** There is no unsend. It mails every
   calculated recipient. Read `recipient_count` aloud before you call it.
3. **Never move a stage on your own initiative.** Stage is the firm's judgment
   about a relationship, not a field to sync. Report the stage; propose a
   change; let the human say yes. Notes are additive and safe — stages are not.

**Describe deletes honestly.** `delete_pipeline_prospect` is a *recoverable
soft discard*: the prospect leaves the board, but the person, their notes, and
their history stay in the CRM, and re-adding restores it. Call it "removing
them from the pipeline", never "deleting their data." By contrast
`delete_person` / `delete_organization` remove the record itself — those are a
different conversation.

## Matching hand-collected records — the name-is-the-key problem

Voice memos, business cards, scraped lists, and conference exports carry **no
email**. Since email is Decile's natural key for People, you cannot upsert
blind. The discipline:

- **The typed name is the identity key.** Someone typed it deliberately —
  trust it as intent, but not as spelling.
- **Decile supplies the rest.** Match by name, then recover the email, stage,
  and prospect id from the matched record.
- **Normalize before comparing:** NFKD → strip diacritics → lowercase →
  collapse non-alphanumerics to single spaces. (`Coutiño` == `Coutino`,
  `HO Maycotte` == `ho maycotte`.) `search_people_orgs` already does this
  server-side — lean on it rather than re-implementing.
- **Report three outcomes, resolve none of them silently:**
  - **exact** — unique normalized hit → queue it
  - **surname-only** — unique surname, different first name → *suggest*, never auto-apply
  - **none / multiple** → hand it back to the human
- **Spelling mismatches are the norm.** In the 2026-06-11 humain-vc import, 6
  of 35 LPs were spelled differently in Decile (`Danby`→`Dabby`,
  `Shetty`→`Shetti`, `Schlecht`→`Schlect`, `Du Monceux`→`Dumonceaux`). Show
  the match report and let the human confirm before writing.

## Recurring jobs — the ordered procedures

Stage names below are humain's real vocabulary; the full per-pipeline lists,
the `[Hold]` rule, and the disambiguating tells are in
[`references/pipeline-vocabulary.md`](references/pipeline-vocabulary.md).

### A. Answer a question about a person

1. `search_people_orgs` with the name — resolves who they are and their org.
2. `search_pipeline_prospects` with the same query — finds every pipeline they
   sit in, with stage. Someone can be an LP in Fund I *and* a connector *and* an
   event RSVP; report all of it, not the first hit.
3. Read `notes[]` off the prospect row (it comes back inline — no extra call).
4. Answer with: the pipeline, the stage **in plain language**, who owns them, the
   last contact date, and the most recent note. If the stage is a `[Hold]`, say
   what it's waiting on rather than reading the label back.

### B. Log a conversation

1. Find the prospect (procedure A, steps 1–2).
2. **Check `notes[]` for the same conversation first.** Re-logging is the most
   common duplicate.
3. `add_pipeline_prospect_note` — `body` is the substance, `context` is the
   pipeline name. Remember it attaches to the **Person**, so it shows everywhere
   they appear.
4. Read it back and quote what landed.
5. **Stop there.** A conversation may imply a stage change; proposing one is step
   6, and it is a proposal, not an action.

### C. Move a deal forward — the sequenced version

Never open with the move. The order exists so the human is deciding, not ratifying.

1. **Identify the vehicle.** Fund I (`gNrMpmK1`) runs a 33-stage micro-stepped
   board; the two SPVs run a 13-stage funnel. The boards are not interchangeable
   and a stage name from one is often absent in the other.
2. **`get_pipeline`** on that id — read today's stages, don't trust memory.
3. **`get_prospects`** filtered to the current stage, or
   `search_pipeline_prospects` for a named company.
4. **Read before recommending:** the prospect's `notes[]`, `last_contact`,
   `next_contact`, `rating`, `probability`. For a deal in or past
   `Develop Deal Memo [Hold]`, also `list_deal_memos` / `get_deal_memo`, and
   `list_prospect_attachments` for the deck and cap table.
5. **Name the decision point.** Which action stage is next, what evidence
   supports it, and what's missing. `Start Due Diligence` and
   `Approve Investment` are different asks with different evidence bars.
6. **Propose, with the exit stages on the table.** Fund I distinguishes
   `Failed Review`, `Failed Due Diligence`, `Declined by GP`, and
   `Declined by Company` — *who* ended it and *how deep*. Collapsing them to
   "declined" destroys the firm's own record of why deals die.
7. **On an explicit yes:** `update_pipeline_prospect` with the `stage_id`, then
   `add_pipeline_prospect_note` recording the reasoning. The note is what makes
   the move auditable six months later.
8. **Verify** with a read and report the new state.

Never move a stage on your own initiative, never batch stage moves across
several prospects from one approval, and never propose a move **to** a `[Hold]`.

### D. Intake a batch of records

1. Normalize to one row per person or company, with source and date.
2. `bulk_create_prospects` (≤100/call) — dedupe runs before every write, so
   re-sending is safe.
3. **Read the per-entry outcomes.** `created` with `reused_existing_record: true`
   means an existing contact was reused: say so and name the pipelines they were
   already in. Reporting those as new contacts is the single most misleading
   thing this workflow can do.
4. Report `skipped_duplicate` counts and every `error` row — never a bare
   success count.
5. Notes and stages are separate passes (B and C). Intake places records; it
   does not judge them.

### E. Portfolio data and files — the intake path

The portfolio dashboard is downstream of this being frictionless.

1. `list_portfolio_companies` — every row is one fund's stake in one company.
2. Per company: `list_portfolio_company_investments` (tranches) and
   `list_portfolio_company_valuations` (mark history with provenance).
3. Reporting-cycle questions ("who owes an update?") resolve on the
   **`portfolio` pipeline** (`yKvEOo8x`) at the `Secure Update` stage — not on
   the deal board.
4. Files in: `list_folders` → `create_folder` if needed → `upload_file` (base64 +
   original filename), or `upload_prospect_attachment` to hang it on the company.
5. Structured data out: `save_csv_to_folder` with `csv.headers` + `csv.rows`
   (≤5,000 cells including the header; split larger). Never pre-quote cells,
   never send file bytes.
6. `create_personalized_link` mints a **no-login** data-room link. That is
   outbound — preview the target, name the recipient, get an explicit yes.

### F. Send something

Preview → show the render → explicit yes → send with `confirm: true`.
`send_pact` and `send_lpa` additionally move the person's stage, and `send_lpa`
also creates their capital account on the fund and seats them on the closing
pipeline. Treat those two as fundraise state changes, not emails.

## Gotchas

- **`[Hold]` stages are waiting states, not destinations.** A record lands in one
  as the *result* of a completed action. Never propose moving a record **to** a
  `[Hold]`; propose the action stage before it.
- **Two kinds of pipeline id.** `whoami` returns integer
  `accessible_pipeline_ids`; `list_pipelines` returns opaque string ids
  (`PKLV4On2`) plus an integer `entity_id`. Tools take the opaque id. Don't
  cross the two.
- **`is_primary` is not unique.** All three of humain's investor pipelines are
  primary. Pick by stage vocabulary — `Event Onboarding` means Fund I,
  `Fund LP Outreach` means CogScAI, `Send PACT` means Unnatural Products. A
  request using only the shared words (Added, PACT, Follow-up, Closing,
  Declined) does **not** identify a pipeline: ask which vehicle.
- **`upsert_pipeline_prospect` preserves stage on update** unless
  `apply_stage_id_to_existing: true`. That default is correct; leave it alone.
- **`whoami` roles gate everything.** A `403` usually means the person's Hub
  role is missing (`capital_call`, `data_room`, `portfolio`, …), not that the
  connector is broken. Read `account_user.roles` before blaming the wiring.
- **Legacy API keys 403.** Mint a fresh one at `/settings/api`.
- **Four env-var spellings of one key** are in circulation (`DECILEHUB_API_KEY`,
  `DECILE_HUB_API_KEY`, `DECILE_API_KEY`, plus `DECILE_API_BASE_URL` for the
  URL). A consumer reading a name the `.env` doesn't set gets an empty string
  and a bare 401, not a missing-variable error. Table in
  [`references/connector-setup.md`](references/connector-setup.md).
- **Tool count drifts.** Decile ships tools continuously. Re-enumerate and
  re-tier after a release — see the recipe at the bottom of
  [`references/tool-map.md`](references/tool-map.md).

## Client constants — humain-vc

> **Everything in this section is client-specific.** Re-point it for the next
> tenant; nothing above this line changes.

| Thing | Value |
|---|---|
| Tenant | Humain Ventures — subdomain `humain`, account `WnWy7LKE` |
| Connector URL | `https://humain.decilehub.com/mcp` |
| REST base | `https://humain.decilehub.com` (routes under `/api/v1/`) |
| API docs | `https://humain.decilehub.com/docs/api` |
| Operator credentials | `client-stacks/humain-vc/decilehub/.env` (bundle) and `client-stacks/humain-vc/.env` (client roll-up), both gitignored; operator's copy in `~/.secrets` as `DECILEHUB_API_KEY`. Never printed, never pasted into a doc |

Investor pipelines (2026-08-18) — all three flagged `is_primary: true`:

| Pipeline | id | entity_id |
|---|---|---|
| Investors - Humain Ventures Fund I, LP | `PKLV4On2` | 7104 |
| Investors - CogScAI SPV | `oNDV9o8R` | 9475 |
| Fundraising - Humain Ventures Unnatural Products SPV, a Series of Decile SPV, LLC | `g8br3QA8` | 47290 |

Plus 3 deal-flow, 3 closing, 3 capital-call, 12 event, and one each of
portfolio, connector, recruiting, and newsletter — **29 pipelines across 9
kinds**. Every stage name, the `[Hold]` rule, and the disambiguating tells:
[`references/pipeline-vocabulary.md`](references/pipeline-vocabulary.md).

Fund I is the default only when a request says "the LP pipeline" with no other
signal — and say which one you picked.

## See also

- [`references/pipeline-vocabulary.md`](references/pipeline-vocabulary.md) — humain's 29 pipelines, every stage, the `[Hold]` rule
- [`references/tool-map.md`](references/tool-map.md) — all 158 tools, grouped and tiered
- [`references/connector-setup.md`](references/connector-setup.md) — OAuth vs token, setup, breakage modes
- `https://<tenant>.decilehub.com/docs/api` — Decile's own live API reference.
  Server-rendered and greppable (~260k chars, 247 schemas); fetch and grep it
  rather than loading it into context.
- `decile-hub-connector` — the REST API contract underneath (auth, the three
  pagination patterns, upsert-by-natural-key, error shapes). Operator sessions only.
- `client-stacks/humain-vc/` — this client's stack of record, credentials, and connector doc
