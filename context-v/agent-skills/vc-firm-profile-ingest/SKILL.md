---
name: vc-firm-profile-ingest
description: Research a VC firm from the open web and land it in BOTH systems in one pass — a Twenty CRM company record with a research note attached, and a cross-linked Outline wiki page in the Venture Firms collection following the house profile template. Use whenever the operator says "create a VC profile", "add <firm> to the CRM and the wiki", "profile <firm>", "research this fund and write it up", "who are they and should we care", or names this skill. Encodes the dedupe-first discipline (98+ companies already exist — never create a second record), the two-call note attachment Twenty requires, the composite link-field shapes that silently fail as plain strings, the Twenty↔Outline join (the wiki page header carries the CRM record UUID), the house page template with its open-questions checklist, and the sourcing hierarchy that keeps contaminated aggregator data out of the record. Client-scoped: collection and workspace IDs below are Palmer AI's.
---

# VC Firm Profile Ingest

> One instruction — *"create a profile for Kalos Ventures"* — produces a CRM
> record, an attached research note, and a wiki page that cross-references the
> CRM record, with no copy-paste between systems.

This is the two-system sibling of [[crawl-fetch-ingest]]. That skill ingests to
**files** for decks and slides. This one ingests to **live systems** a client
team actually works in.

## Prerequisites

Two connectors in the operator's Claude Desktop (or claude.ai):

| Connector | Reaches | Used for |
|---|---|---|
| **Palmer AI Twenty** | the CRM | company record + research note |
| **Palmer AI Outline docs** | the wiki | the profile page |

Both exist today. When homebase ships
([[Homebase-MCP-One-Connector-Per-Client]]) this collapses to one connector and
this skill becomes an MCP prompt — the procedure below does not change.

## Client constants (Palmer AI)

| Thing | Value |
|---|---|
| Outline collection — **write firm profiles here** | `Venture Firms` → `34e7591c-1f10-42ca-a913-bd108b148764` |
| Outline collection — people | `People` → `70218cb0-d90a-4d11-b518-6ef2e30539d5` |
| Twenty object | `companies` (flat — VC firms and operating companies share it) |

> ⚠️ **Collection ambiguity — confirm before writing.** A third collection,
> `Firms` (`0022c7e6-87f5-45f0-b644-25c62ee21ece`), also exists and has a better
> description, but holds **one** page (Colossus) while `Venture Firms` holds the
> five real profiles with revision histories. This skill writes to **Venture
> Firms**. If the operator consolidates, update this table — do not guess per
> run, and do not split profiles across both.

## The target state — what "done" means

Three artifacts and one join:

```
Twenty: company record ──────┐
Twenty: note ──(note_target)─┘   attached to the company
Outline: page in Venture Firms, header carries the Twenty record UUID
```

The **join is the point**. A profile that exists in only one system, or in both
without the cross-reference, is not done.

## Procedure

### Step 0 — Dedupe. Always. Both systems.

There are already **98 companies** in Twenty and profiles in Outline. Creating a
second record for a firm that exists is the most likely failure of this skill and
the most annoying to clean up.

```
find_many_companies  select:["id","name","domainName","description"]
                     name:{ilike:"%<firm>%"}
```

Also try the distinctive word alone — *"Owl"* not *"Owl Ventures"* — and the
domain, since a record may exist under a variant name (`Andreessen Horowitz
(a16z)`).

Then search Outline: `list_documents` with the firm name, and
`list_documents` filtered to the Venture Firms collection.

**Branch:**
- **Neither exists** → full create, all steps.
- **Twenty record exists, no page** → skip Step 3's create; reuse that UUID.
- **Both exist** → this is an *update*, not an ingest. Report what's already
  there and ask what to refresh. Never create a parallel page.

### Step 1 — Research, in source order

Collect from the open web, preferring sources in this order:

1. **The firm's own site** — `/team`, `/portfolio`, `/about`, `/for-entrepreneurs`.
   Authoritative for people, titles, stated thesis, screening criteria.
2. **LinkedIn company page** — headcount sanity check, recent announcements.
3. **Named primary sources** — a partner's own fund-announcement post, an SEC
   filing, the firm's impact report.
4. **Reputable press** — for fund size and vintage when the firm doesn't publish it.

**Do not source from VC aggregator profiles** (VCSheet and similar). A real
example, recorded on the New Markets page: its VCSheet profile is contaminated
with an unrelated fund's content and names the wrong founder. If an aggregator is
the only source for a fact, either omit the fact or record it as an open question.

**Collect:** stage focus, sector focus, thesis in the firm's own framing, stated
screening criteria, team (name / role / LinkedIn / email if published), advisors
and network affiliations, notable portfolio, HQ, fund size and vintage, and
anything that would change how a partner approaches them.

### Step 2 — Stage to a scratch file first

Write findings to a scratch file **before** touching either system:

```
<scratchpad>/vc-profile-<firm-slug>.md
```

Why this is not optional: research is the slow, failure-prone half. If a write
fails midway you re-run the writes, not the research. It also gives the operator
one artifact to correct before anything reaches a client's live CRM.

Show the operator the staged file and get a go-ahead before Step 3 **when the
firm is new**. For refreshes of an existing record, proceed.

### Step 3 — Create the Twenty company record

```
create_one_company
  position: "first"                      ← REQUIRED, and easy to forget
  name: "New Markets Venture Partners"
  description: "<dense prose — see conventions below>"
  domainName: { primaryLinkLabel: "newmarketsvp.com",
                primaryLinkUrl:   "https://www.newmarketsvp.com",
                secondaryLinks:   [{url: "...", label: "Portfolio"}] }
  linkedinLink: { primaryLinkLabel: "new-markets-venture-partners",
                  primaryLinkUrl: "https://www.linkedin.com/company/..." }
  address: { addressCity: "Baltimore", addressState: "MD",
             addressCountry: "United States" }
```

**Field conventions observed in the existing 98 records:**

- `domainName.primaryLinkLabel` is the **bare domain** (`a16z.com`), the URL is full.
- `linkedinLink.primaryLinkLabel` is the **LinkedIn slug** (`south-park-commons`).
- `secondaryLinks` carry notable sub-pages — an accelerator programme, a press
  page, a specific fund-announcement post. Use them; they are how a16z and South
  Park Commons stay legible.
- `address` is usually city/state/country only; street is typically empty.
- `description` is a **dense paragraph, not a tagline** — thesis, fund history,
  named partners, portfolio highlights. The best existing records run 100+ words.

> **Gotcha — link fields are composite objects.** Passing `domainName: "a16z.com"`
> as a plain string does not error usefully; it just fails to populate. Same for
> `linkedinLink`.
>
> **Gotcha — `position` is required** on `create_one_company`, `create_one_note`,
> and `create_one_note_target`. Use `"first"`.

### Step 4 — Attach a research note (two calls, not one)

Twenty does **not** let you attach a note to a company in one call. Notes are
free-floating until a `note_target` links them.

```
1. create_one_note        position:"first"
                          title: "Research — <firm> (<YYYY-MM-DD>)"
                          bodyV2: { markdown: "<the findings>" }
   → returns noteId

2. create_one_note_target position:"first"
                          noteId: <from step 1>
                          targetCompanyId: <the company id>
```

**Skipping call 2 is the classic failure** — the note exists, looks fine in a
tool response, and is invisible on the company record.

The note carries the *research narrative and its sources*; the company
`description` carries the durable summary. Put source URLs in the note.

### Step 5 — Create the Outline page

`create_document` with `collectionId` = **Venture Firms**, `title` = the firm's
name exactly as in Twenty, `publish: true`, and `text` = the template below.

### Step 6 — Write the join

The page's first line carries the Twenty record UUID. This is what makes the two
systems one system:

```markdown
**Website:** https://www.newmarketsvp.com **Twenty CRM record:** `0c757f61-…` **Last reviewed:** 2026-07-27 (sourced from firm website)
```

### Step 7 — Verify, don't assume

- `find_many_companies` by id → the record has description and links populated
- The note appears **on the company**, not just in the notes list
- `fetch` the new document → the Twenty UUID is present and correct
- Report the Outline URL and the Twenty record id to the operator

## The page template

Reproduce this structure. It is the house shape, derived from the five existing
profiles — not an invention.

```markdown
**Website:** <url> **Twenty CRM record:** `<uuid>` **Last reviewed:** <YYYY-MM-DD> (sourced from <source>)

## Snapshot

|     |     |
|-----|-----|
| Stage focus | |
| Sector focus | |
| Framing | |
| Track record | |
| Reported reach | |
| Team size | |

## Thesis

<Prose: what they believe and why, in their own framing. Then the firm's stated
investment beliefs as bullets.>

**Sourcing edge.** <Where their deal flow actually comes from, and whether it is
genuinely differentiated.>

### What they screen for

<Published criteria — useful as a comparison point for our own scorecard work.>

## Key people

| Name | Role | LinkedIn | Email |
|------|------|----------|-------|

## Notable portfolio

## Portfolio overlap

*HumainVC-specific — to fill in.*

## Relationship history

| Date | What happened | Who |
|------|---------------|-----|
|      |               |     |

## Working notes

<Anything an operator should know before a meeting. Include data-hygiene warnings
here — e.g. "the VCSheet profile is contaminated, do not source from it".>

## Open questions

- [ ] Current fund size and vintage
- [ ] Check size range, and whether they lead
- [ ] Confirm HQ location
- [ ] Primary point of contact for HumainVC
```

**The open-questions checklist is load-bearing.** Every existing profile carries
4–5 unchecked boxes, and Outline surfaces them as task counts. An honest profile
names what it does not know. **Never** fabricate a fund size to empty the list.

## Voice

Match the existing pages: analytical, skeptical, useful to a partner walking into
a meeting. They read like a competent associate's memo, not marketing copy.

- Say what is *claimed* vs. what is *verified* — "reported reach 75M+ learners"
- Flag contradictions rather than smoothing them — "reconcile 'early and growth
  stage' vs. newer growth-stage site language: has the mandate moved later?"
- Note what is unusual and why it matters — "the site publishes direct email for
  every team member, in `<first-initial><lastname>@` form. Unusually open."

## Anti-patterns

- **Creating a duplicate** because Step 0 was skipped or matched too narrowly.
- **Note without a note_target** — invisible on the record.
- **Plain strings in `domainName` / `linkedinLink`** — silently unpopulated.
- **Writing to `Firms` instead of `Venture Firms`** — see the ambiguity warning.
- **A page with no Twenty UUID** — two disconnected systems, which is the problem
  this skill exists to solve.
- **Filling every field to look complete.** Unknowns belong in Open questions.
- **Sourcing from aggregator profiles** without a primary-source check.
- **Writing to a client's live CRM before the operator has seen the staged file**
  on a first-time ingest.

## Extending to other clients

Only the *constants* are Palmer-specific. To use this for another client, swap
the collection IDs and the Twenty connector, and confirm the target collection's
page template — a client with a different profile shape needs its own template
block, not this one bent to fit.

## Related

- [[crawl-fetch-ingest]] — the file-based sibling for decks and slides
- [[Homebase-MCP-One-Connector-Per-Client]] — where this becomes one connector and an MCP prompt
- `client-stacks/palmer-ai/stack.md` — the Palmer AI stack of record
