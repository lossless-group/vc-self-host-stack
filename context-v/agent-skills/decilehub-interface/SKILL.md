---
name: decilehub-interface
description: Operate a VC firm's Decile Hub from Claude Desktop, claude.ai, or Claude Teams via Decile's native MCP connector — 158 tools across the LP/investor pipeline, deal flow, portfolio, fund admin, data room, and outbound email. Use when someone asks about an LP or a deal ("is X in our pipeline?", "what stage?", "who referred us?"), wants a call or voice memo logged, wants records created or updated, wants a pipeline or portfolio roundup, or wants to send an email, newsletter, PACT, or LPA. Supplies the safety tiering Decile omits (its 158 tools carry zero annotations, so list_people and publish_newsletter look alike), the People-vs-Organizations-vs-Prospects model, where notes actually land, the never-create-a-duplicate rule (there is no merge tool), and the discipline of reporting only what the record supports.
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
| Endpoint | `https://<tenant>.decilehub.com/mcp` — `https://decilehub.com/mcp` also works on the token channel; the tenant resolves from the **token**, not the subdomain |
| Tools / prompts / resources | **158 / 0 / 0** (enumerated live 2026-08-18) |
| Team-member auth | OAuth — DCR + PKCE, sign in with a Hub account |
| Operator auth | Raw API token in `Authorization` (no `Bearer`) |
| REST escape hatch | `https://<tenant>.decilehub.com/api/v1/*` (operator sessions only) |
| API docs (human) | `https://<tenant>.decilehub.com/docs/api` — live, per-tenant, server-rendered HTML |
| API spec (machine) | `https://decilehub.com/api/docs/v1/swagger.yaml` — 122 paths, authoritative. *(`/docs/api.json` is a decoy: 200, zero bytes.)* |

Setup, the OAuth metadata, and the three ways it silently breaks:
[`references/connector-setup.md`](references/connector-setup.md).

## Relationship to Decile's own `decile_hub` skill

Decile publishes an official skill. **If both are installed they fire on the same
requests**, so know which is which.

Theirs is a **tool catalogue**: the MCP endpoint, ~90 of the 158 tools grouped by
domain, and short create/update recipes. Accurate, and the source of the spec URL
above. Take it as the map of what exists.

This skill is the **operating layer**, and covers what a catalogue can't:

- **Safety tiering.** Decile ships zero tool annotations, and the official skill
  lists `send_email` / `send_pact` / `send_lpa` with no flag that they are
  irreversible, outbound, and — for PACT/LPA — *stage-mutating*. The four tiers
  here are the missing guardrail.
- **This firm's stage vocabulary.** 29 pipelines, the `[Hold]` rule, and the fact
  that "pick the investor pipeline" is **always ambiguous** at humain, which has
  three, all flagged `is_primary`.
- **Search.** The official skill says to find people via `list_people` filtered by
  name. Prefer **`search_people_orgs`** — anchored + fuzzy, and it covers
  organizations. Neither search tool appears in their list.
- **Data honesty.** Coverage-first roundups, and the `updated_at` ≠ contact
  recency rule (procedure H).
- **Write gotchas.** String ids, attachment-vs-data-room, field renames.

Where they disagree on a **fact** (endpoint, URL, field), theirs and the live
spec win. Where they disagree on **what to do**, this one does.

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

### The LP workflow ends in a PACT — and that's where commitments live

Decile ships a **pre-set (but alterable) LP/investor pipeline** that terminates
in a **PACT**. Firms customise the stages, which is why one tenant's investor
boards can each carry different vocabulary — but the shape is the vendor's
default, not something the firm invented.

**A PACT — Pledge Agreement for Capital Transaction — is to LP fundraising what a
SAFE is to company fundraising.** It's the soft-commitment instrument: an LP
signs to pledge an amount, before any money moves and before the binding
paperwork exists.

That produces the LP journey the stage names describe:

```
Outreach → Materials/Meeting → PACT ─────────→ Closing → LPA ────────→ capital account
                               soft pledge               binding docs    money can move
```

Two consequences worth carrying everywhere:

1. **The PACT is the commitment record.** This is why `capital_commitment` on the
   prospect sits empty while the firm is clearly raising — the number lives on
   the PACT (`investment`), with `invest_as` and `signed_on`. **`list_pacts`
   answers "who has committed and how much."** Reading `capital_commitment` and
   reporting "no commitments" is a real and available mistake.
2. **`send_pact` and `send_lpa` are different weights.** A PACT collects a
   pledge; an LPA is the binding document, and `send_lpa` also **creates the
   LP's capital account on the fund**. Both are irreversible and outbound —
   but confusing them is confusing a soft yes with a signed subscription.

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

## Never create a duplicate — there is no merge tool

**Decile ships no merge, dedupe, or combine tool.** Not one of the 158. Once two
records exist for the same company or person, your only options are to delete one
— losing its notes, attachments, and history — or live with the split forever.
**Prevention is the entire control.** Treat "might this already exist?" as a
🟠 confirm-tier question even though creating looks additive.

### How duplicates actually happen: the natural key is exact

`create_or_update_organization` matches on **name**, `create_or_update_person` on
**email** — as *exact* matches. Any variation makes a second record, silently,
and the response looks like a perfectly successful create:

```
Acme Bio        vs   Acme Bio, Inc.        ← suffix
Acme Bio        vs   AcmeBio               ← spacing
Acme Bio Inc.   vs   Acme Bio Inc          ← punctuation
AcmeDX          vs   Acmedx                ← capitalisation
```

Real collisions of exactly these shapes already exist in this tenant. **Nobody
created them on purpose** — each was one upsert with a slightly different string.

### A name collision is a *candidate*, not a verdict — verify before merging

**Normalizing names to find duplicates also destroys the distinction between
legal entities**, and fund structures are built out of near-identical names:

```
Acme Ventures            ← operating/holding record
Acme Ventures Fund I, LP ← the fund
Acme Ventures, LLC       ← the management company
Acme Ventures GP I, LLC  ← the general partner
```

Strip the suffixes and those collapse into one name. **They are four different
legal entities**, each correctly separate, and merging any two would be a real
error — they hold different notes, sign different documents, and appear
separately in fund admin.

**Before treating a collision as a duplicate, require positive evidence of
sameness**, not merely a similar name:

- **Same website / domain** — the strongest single signal
- Same people attached, or overlapping contacts
- Descriptions of the same business, not of related businesses
- Nothing that implies a deliberate distinction: `LP`, `LLC`, `GP`, `Inc.`,
  `Management`, `Holdings`, roman numerals, fund numbers

**When two records differ only by a legal suffix, the default is that they are
different entities.** Ask; don't merge.

#### If it genuinely is a duplicate

1. **Pick the survivor by what can't be recreated** — pipeline history,
   attachments, notes, oldest creation date. A better description is trivially
   re-typed; a prospect row with its stage history is not.
2. **Copy every unique field into the survivor first** — description, notes,
   people, data points, tags.
3. **Record the merge in a note on the survivor**: what was merged, from which
   id, and why that record won.
4. **Delete last, and only with a human's explicit go.** There is no merge tool
   and no undo. Copying is reversible; deleting is not — so a half-done merge
   should always be the additive half.

### The rule

1. **Search before every create.** `search_people_orgs` for the company or
   person, `search_pipeline_prospects` for the board.
2. **Search the distinctive token, not the full legal name.** Query `acme`, not
   `Acme Bio, Inc.` — the anchored matcher needs word-starts, and the suffix you
   type is exactly the part likely to differ from what's stored.
3. **Read the hits; don't count them.** Fuzzy matching returns unrelated
   organizations that merely start the same way. A non-empty result is not a
   match, and an empty one after a *narrow* query is not proof of absence.
4. **Reuse the stored spelling.** When a record exists, upsert against the name
   **as Decile holds it**, not as your source wrote it. Sending the "better"
   spelling forks the record.
5. **Prefer the singular upsert routes** (`create_or_update_*`). The bulk
   `create_people` / `create_organizations` routes *dedupe* rather than upsert —
   exact matches are skipped, but every near-variant becomes a new row.
6. **On a suspected duplicate, stop and report it.** Never create "just in case",
   and never delete the other one to tidy up — deletion is how the notes and
   attachments on the older record disappear. Surface both and let a human decide.

## Matching hand-collected records — the name-is-the-key problem

Voice memos, business cards, scraped lists, and conference exports carry **no
email**. Since email is Decile's natural key for People, you cannot upsert
blind. The discipline:

- **The typed name is the identity key.** Someone typed it deliberately —
  trust it as intent, but not as spelling.
- **Decile supplies the rest.** Match by name, then recover the email, stage,
  and prospect id from the matched record.
- **Normalize before comparing:** NFKD → strip diacritics → lowercase →
  collapse non-alphanumerics to single spaces — so an accented surname matches
  its unaccented spelling, and initials match regardless of case.
  `search_people_orgs` already does this
  server-side — lean on it rather than re-implementing.
- **Report three outcomes, resolve none of them silently:**
  - **exact** — unique normalized hit → queue it
  - **surname-only** — unique surname, different first name → *suggest*, never auto-apply
  - **none / multiple** → hand it back to the human
- **Spelling mismatches are the norm.** In the 2026-06-11 humain-vc import, 6
  of 35 LPs were spelled differently in the CRM than in the source. The four
  shapes to expect: **a dropped or doubled letter**, **a transposed vowel**, **a
  silent consonant** written or omitted, and **a compound surname** collapsed to
  one word (or split into two). Show
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

### G. Add a new company to the deal pipeline — proven end-to-end 2026-08-19

The full single-record intake. Every step below was run live against humain.

1. **Dedupe first — and *read* the hits, don't count them.** `search_people_orgs`
   falls back to fuzzy matching, so a query returns near-misses that are not
   matches. Searching `impulse` surfaced a real, entirely unrelated
   organization whose name merely begins with the same letters. A non-empty
   result is not a duplicate; read the name before concluding anything.
2. **Get something worth storing.** A record holding only a name and a URL is
   barely better than nothing. Read the company's site and write a description
   in *their* words, then mark explicitly what is unverified — website claims are
   not diligence, and the record should never blur the two.
3. **`create_or_update_organization`** — `name` is the natural key. The response
   carries a `changes` diff; `"id": [null, 2340526]` (old value `null`) means
   **created**, a non-null old value means **updated**. That diff is how you tell
   the user which one happened without guessing.
4. **`upsert_pipeline_prospect`** — `pipeline_id`, `stage_id`, and
   `prospect: {organization: {name}}`. Ids go as **strings** (see Gotchas).
5. **Note the provenance immediately**, while you still know it —
   `add_pipeline_prospect_note` with `context` set to the pipeline name.
6. **Attach the deck** with `upload_prospect_attachment` (base64 + `file_name`
   with extension; optional `name` sets the display label). **Name it to the
   convention below before uploading** — the filename is the only thing that
   will distinguish this deck from the same company's next one.
7. **Verify with reads**: `search_pipeline_prospects` for stage placement,
   `list_prospect_attachments` for the file. Report ids and byte counts, not
   "done."

#### The three file surfaces — check the right one before uploading anything

| Surface | Tool | Lands in | Data-room copy? |
|---|---|---|---|
| **Prospect / CRM attachment** | `upload_prospect_attachment` | The org or person — UI *Files → Organization Attachments* | **No** |
| **Data room** | `upload_file` (+ folder) | A data-room folder | Yes |
| **Questionnaire upload** | *(read-only)* | Arrives via the deal-intake form | n/a |

**`list_prospect_attachments` merges two sources, and the second one matters
more than it looks.** Each entry carries `source`:

- **`direct`** — what you or the Hub UI attached. Carries a `name`. Deletable.
- **`questionnaire`** — **what the founder uploaded through the deal-intake form**
  (*Submit Your Company*): pitch deck, cap table, supporting docs. Carries an
  `item_id`. **Not yours to delete** — it's their submission.

**So check for a `questionnaire` entry before asking a company to send a deck, or
uploading your own copy.** A company that pitched through the intake form has
already delivered it. Uploading a duplicate makes two files of unknown vintage
where there was one of known provenance.

Contract details that bite: `investment`-type pipelines only (**403** on a
closing or investor prospect); needs pipeline *edit* access, not just read;
downloads go by **`signed_id`, not `id`**; and there is **no file-type
allow-list** on this route, so nothing stops you attaching the wrong thing.

**When no intake stage tells the truth, land neutral and write a note.** Fund I's
deal board offers Cold Lead / Inbound Lead / Introduction. A company met at an
event is none of those. Forcing the closest-sounding stage manufactures a
provenance nobody can later distinguish from a real one — so land at `Added`,
put what actually happened in the note, and say plainly that the board has no
stage for it. A gap in the board is worth surfacing; a plausible lie is not.

### H. Roundups — measure first, and know which fields are real

**A populated field is not the same as data.** This is the trap that will make a
roundup look authoritative and be worthless, so check it before reporting
anything.

#### The distribution check — run it on every field you intend to report

A field can be 75% populated and still carry no information. The tells, all
verified on humain 2026-08-19:

| Tell | What it means | Seen here |
|---|---|---|
| Values sharing an **exact second** | A batch wrote them | 18 of 82 CogScAI `last_contact` |
| A handful of **distinct dates** covering many rows | One import or campaign | 82 values across **8** dates; 42 on one day |
| **100% of dates in the past** | Nobody maintains it | 252 of 252 `next_contact` overdue |
| Values **1–2 years stale** while the board is active | Residue | Sept 2024 / July 2025 stamps |

Contrast with a field humans actually maintain: dates spread across many
distinct days, some of them recent, values varying row to row. **Spread,
recency, and variation mean a person entered it.** Run the check; don't assume
either way.

> **Never build a "who's overdue" list on a field that fails this check.**
> Reporting *"252 LPs overdue"* from bulk-write residue is worse than reporting
> nothing: it's confident, false, and the reader can't tell.

#### What each board actually supports

**Deal boards** (`gNrMpmK1` and the two SPV boards)

- `last_contact` **0/115** · `next_contact` **0/115** · notes **37/115**
- **No time signal at all.** "Who have we not spoken to" has no answer here.
- Deliver: stage distribution, the 37 records with notes (quote the latest with
  its date), `rating` where set — and the coverage gap, stated first.

**Investor / LP boards** (`PKLV4On2`, `oNDV9o8R`, `g8br3QA8`)

- `next_contact` looks well-kept (150/200, 102/132) and **is bulk-write
  residue** — 100% overdue, second-apart timestamps. **Do not build a follow-up
  list from it.**
- `last_contact` likewise (8 distinct dates across 82 values).
- notes **13/200** and **0/132**.
- **Commitments live in `list_pacts`, not in `capital_commitment`** (which is
  effectively unused). Each PACT carries `investment`, `invest_as`, and
  `signed_on` — so "who has committed, how much, and when" is answerable, and it
  passes the distribution check.
- Deliver: the commitment picture from `list_pacts`, stage distribution, and
  notes where they exist. Say plainly that the two date fields are stale imports.

**Portfolio** (`yKvEOo8x`) — 5 companies. `Secure Update` is who owes an update;
2 of 5 carry notes.

#### The forbidden inferences

- **`updated_at` is not contact recency.** It's populated on every row and means
  *the record was touched* — by anyone, including an API sync.
- **`next_contact` is a plan, not a record.** Even when maintained, "due for
  follow-up" is not "we haven't spoken."
- **Write "no contact recorded", never "no recent contact."** The first is a fact
  about the CRM; the second is a claim about a relationship. Only the first is
  supportable.
- **Never compare boards on a field one keeps and the other doesn't.**

#### Then close the gap — with them, not at them

> Here's what the record supports, and what it doesn't. On the deal side, <n> of
> <total> have any written history and there are no contact dates at all. On the
> LP side the commitment picture is solid — <n> signed PACTs — but the contact
> dates are a stale import from <date>, so I can't tell you who's due.
>
> Do you keep this somewhere else — email threads, call notes, a shared doc? Two
> ways in: **forward or CC it to your Decile dealflow address** (it's in your
> Hub) and it files itself against the pipeline; or paste anything here and I'll
> log it to the right records now.

Say the forwarding path **in words** — never print the address; it's an
unauthenticated write path. Two tags are confirmed — **`+deals`** for the deal
board and **`+fundraising`** for the LP/investor boards — so both sides of the
house have a path. Any other tag is unverified; **don't guess one.**

**Never pad a roundup to look thorough.** If the honest version is three
paragraphs and a list of unknowns, that is the deliverable.

### I. Capture from the road — voice memos and call transcripts

> **The situation.** A partner is between meetings, has just come out of a call,
> and the substance is in their head or in a recording. There is no time to open
> the CRM. If it isn't captured in the next few minutes it is gone.

**This is why the record is thin** — 37 of 115 deal prospects and 13 of 200 Fund
I LPs have any note. Not carelessness: friction. Every design choice below trades
agent effort for operator effort, deliberately.

#### Three channels, least friction first

1. **Forward the transcript or recording** to the firm's Decile intake address.
   Zero interaction, files itself against the pipeline, works when Claude isn't
   open. **Say it in words; never print the address** — it's an unauthenticated
   write path.
2. **Paste it into the chat** — *"here's my memo from the Acme call"* — and this
   procedure runs.
3. **Dictate straight into Claude Desktop** and let the transcript land here.

#### The hard part is matching, and transcription makes it worse

A memo says a **name**, not an email — and email is the natural key. Worse:
**proper nouns are the tokens speech-to-text gets wrong most often**, and they're
exactly the tokens you match on. Expect transcription drift stacked on top of the
CRM spelling drift already described in procedure G.

- Run every candidate through `search_people_orgs` **and**
  `search_pipeline_prospects` — a name may be a person, a company, or both.
- **A memo usually mentions several parties.** Segment first, then match each.
  Do not dump one note onto the first match you find.
- **Report the three outcomes, resolve none silently:** exact → queue ·
  surname-only or phonetically-near → *suggest with the transcript line quoted* ·
  none/multiple → hand back.
- When a name is unrecoverable, **say which line you couldn't place** rather than
  dropping it. An unmatched fragment shown to the operator takes them two seconds
  to resolve; a silently discarded one is lost.

#### Writing the note

- **Preserve their words.** Fix obvious mis-hears; never summarize away numbers,
  named people, commitments, or hedges. *"He said maybe 250 if the round fills"*
  must survive intact — that sentence is the entire value of the memo.
- **Mark the source.** Open the body with a stable marker:
  `[voice-memo:<YYYY-MM-DD>]` or `[call-transcript:<YYYY-MM-DD>]`. It makes
  spoken notes distinguishable from typed ones, and it is the idempotency key —
  a prospect already carrying that marker is skipped, so re-pasting the same memo
  never duplicates.
- **`context` = the pipeline name.** Notes attach to the **Person**, so a memo
  about an LP surfaces on every board they're on.
- **One note per party**, each on its own prospect.

#### Never, from a memo alone

- **Never move a stage.** A memo saying *"they're basically in"* is not a stage
  change; propose it and let the human decide.
- **Never set `capital_commitment` or send a PACT.** Spoken numbers are
  indications, not commitments — and PACT/LPA are irreversible outbound.
- **Never invent an email** to satisfy the natural key.

#### Then close the loop

Report: what was logged and where, what you suggested but didn't apply, what you
couldn't match, and — if the operator is doing this repeatedly — that forwarding
to the intake address skips this conversation entirely.

> **Bulk and historical imports** (a folder of past memos rather than today's
> call) are an operator job with a filesystem, not a Desktop one. augment-it's
> `decile-import-voicenotes.mjs` exists for that: dry-run by default, idempotent
> on the same marker, additive only, never moves stages.

## Naming files and artifacts — `<date>_<Entity>--<Descriptor>.<ext>`

**Applies to everything you attach or export**, not just decks: PACTs, LPAs,
subscription docs, wire confirmations, cap tables, memos, portfolio updates, CSV
exports.

```
202608_ImpulseLabs--Pre-Seed.pdf        deck, month known
20260819_ImpulseLabs--Pre-Seed.pdf      deck, send date known
20280312_ImpulseLabs--Series-A.pdf      same company, next raise
20260819_JaneSmith--PACT-FundI.pdf      LP doc — vehicle in the descriptor
202609_Somite--Q3-Update.pdf            portfolio update
202608_ImpulseLabs--Cap-Table.xlsx      diligence artifact
```

**The principle: the same entity produces the same kind of artifact repeatedly.**
A company pitches at Pre-Seed and again at Series A. An LP signs a PACT for Fund
I and another for a SPV. A portfolio company sends an update every quarter. Two
files called `impulse-labs.pdf` or `pact.pdf` are indistinguishable, and the one
you open is a coin flip — at exactly the moment comparing them *is* the work.

| Token | Rule |
|---|---|
| `<date>` | `YYYYMMDD` when the real date is known — when *they* sent it, signed it, or the period closed. `YYYYMM` when only the month is. **Never invent a day.** |
| `<Entity>` | Spaces removed, capitalisation kept: `Impulse Labs` → `ImpulseLabs`, `Jane Smith` → `JaneSmith`. Internal hyphens survive — `--` is the delimiter, so `Acme-Bio--Seed.pdf` parses cleanly. |
| `<Descriptor>` | What distinguishes *this* instance from the next one of its kind. Hyphenate multi-word. |
| `<ext>` | Real extension, always. |

**Descriptor vocabulary** — extend it, but stay consistent within a firm:

| Artifact | Descriptor |
|---|---|
| Pitch deck | `Pre-Seed` · `Seed` · `Series-A` · `Bridge` — **the round it's raising for** |
| LP agreements | `PACT-<Vehicle>` · `LPA-<Vehicle>` · `Sub-Docs-<Vehicle>` |
| Diligence | `Cap-Table` · `Financials` · `Deal-Memo` · `Reference-Notes` |
| Portfolio | `Q1-Update` · `Q3-Update` · `Board-Deck` · `Annual-Report` |
| Exports | `LP-List` · `Pipeline-Roundup` |

**LP documents need the vehicle in the descriptor.** The same person signs a PACT
for Fund I and later for an SPV — same name, same doc type, different fund, and
getting them confused is a capital-account error, not a filing error.

**Getting the date right — it's theirs, not yours.** The date the company sent
it, the LP signed it, or the quarter closed — never the date you filed it. Look,
in order: the email or message that carried it; `uploaded_at` on a
`questionnaire` attachment; the file's own metadata; a date printed on the cover
or signature page. Only if none exist do you fall back to the current month, and
then **month-only**. A day you made up is worse than no day, for the same reason
a manufactured intake stage is worse than `Added`: nothing downstream can tell
your guess from a fact.

## Gotchas

- **The email intake address is a credential — never print it.** Decile's
  `pipeline-<tenant>+<pipeline>@reply.decilehubmail.com` capture addresses have
  no authentication: possession is authorization, exactly like a webhook URL.
  Refer to it ("your dealflow address, it's in your Hub"); never echo the string
  into chat, a document, a ticket, or a commit. If one leaks, Decile rotates it.
- **Batch ceilings and image fetching.** `update_people` / `update_organizations`
  / `create_people` / `create_organizations` cap at **100 items** — beyond that
  the request is rejected *before processing*, not truncated. Remote image URLs
  in a batch are fetched **sequentially**, making image-heavy batches slow and
  timeout-prone: omit images from large batches, or split them.
- **Ids are strings on writes, integers on reads.** `get_pipeline` returns
  `stage.id` as an integer (`177800`); `upsert_pipeline_prospect` rejects it with
  `value at /stage_id is not a string`. Same for `pipeline_prospect_id` on note
  and attachment writes. **Cast every id to a string before writing** — the read
  that gave it to you did not.
- **`upload_prospect_attachment` does NOT create a data-room copy.** It hangs the
  file off the prospect's underlying organization/person (`source: "direct"`) and
  shows on the prospect page — that's all. The data room is `upload_file` with a
  folder, a separate call. Don't promise one and deliver the other. It also 403s
  on prospects outside `investment`-type pipelines.
- **Organization fields are renamed on write.** `description` is stored as
  `short_description`, `website` as `company_url`. The `changes` diff shows the
  stored names, so a write can look wrong when it succeeded.
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
| Fund thesis (from `get_account`) | Austin-based $10M pre-seed–to–A fund investing in **Tech Bio**; track record founding 23andMe, incubating/advising companies to $15B+ market value. Use it to triage whether an inbound deal is even in scope. |
| Email intake — deal pipeline | **Exists and is live.** Decile issues a per-tenant capture address shaped `pipeline-<tenant>+<pipeline>@reply.decilehubmail.com`; forwarding or CC'ing mail there files it against that pipeline. **The literal address is a secret and is not in this file** — it's an unauthenticated write path, so the address *is* the credential. Operators: `DECILE_DEALFLOW_INTAKE_EMAIL` in the client stack's `.env`. Client-side: it's already in their Hub. Only the `+deals` tag is confirmed; **do not guess other tags.** |
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

- [`templates/deal-upsert.md`](templates/deal-upsert.md) — fill-in form for creating **or updating** a deal record (prospect = the **company**), with the upsert-overwrite hazard and a worked example
- [`templates/lp-upsert.md`](templates/lp-upsert.md) — the LP sibling (prospect = the **Person**), with the no-email matching problem, per-board field coverage, and the PACT/LPA gate
- [`templates/speech-to-text-upsert.md`](templates/speech-to-text-upsert.md) — **on the road**: a voice memo or call transcript → *n* records. Segmentation, match-with-evidence, unplaced-surfaced, and the proposed-not-applied gate
- [`references/pipeline-vocabulary.md`](references/pipeline-vocabulary.md) — humain's 29 pipelines, every stage, the `[Hold]` rule
- [`references/tool-map.md`](references/tool-map.md) — all 158 tools, grouped and tiered
- [`references/connector-setup.md`](references/connector-setup.md) — OAuth vs token, setup, breakage modes
- `https://<tenant>.decilehub.com/docs/api` — Decile's own live API reference.
  Server-rendered and greppable (~260k chars, 247 schemas); fetch and grep it
  rather than loading it into context.
- `decile-hub-connector` — the REST API contract underneath (auth, the three
  pagination patterns, upsert-by-natural-key, error shapes). Operator sessions only.
- `client-stacks/humain-vc/` — this client's stack of record, credentials, and connector doc
