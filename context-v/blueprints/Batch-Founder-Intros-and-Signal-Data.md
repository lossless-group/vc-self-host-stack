---
title: "Blueprint: Batch Founder Intros and Signal Data"
lede: "Founders keep asking for intros to long investor lists. Send a small batch fast, and let the repeat names become signal."
summary: "Working pattern for handling founder target-investor lists: one sheet shape, a reach check, a capped batch of drafted intros, and CRM entry only for rows acted on. Read before ingesting a founder's list. Unproven: run it on one real list, then revise."
publish: false
date_created: 2026-11-05
date_modified: 2026-11-06
date_authored_initial_draft: 2026-11-05
date_authored_current_draft: 2026-11-05
date_authored_final_draft:
authors:
  - Michael Staton
augmented_with:
  - Claude Code on Claude Opus 5.5
at_semantic_version: 0.0.0.2
status: Draft
tags:
  - Blueprint
  - Founder-Introductions
  - Fundraising
  - Twenty-CRM
  - Relationship-Data
site_uuid: c20f6419-5fa9-4d7f-8ca6-08dd4398a4b1
hex_code: 99777j
type: Blueprints
---

# Blueprint: Batch Founder Intros and Signal Data

> **Draft ahead of proof.** Blueprints here normally get written after a pattern has been nailed. This one starts earlier, and it should be rewritten after the first real run. See [Prove it on one list](#prove-it-on-one-list).

## Why Care?

A pattern keeps showing up: founders send a list of the investors they want to meet and ask for introductions. No single list is mission critical, but the requests keep coming. Each one currently takes enough effort that the intros often don't get made well, or at all.

If I'm going to do this, I want two things from it:

1. **Speed.** A list should turn into sent intros in one short sitting.
2. **A data set.** Every list records which firms founders want, and every intro records how those firms respond. One list says little. Many lists over time show which firms keep coming up, which ones I can reach, and which ones actually take the meeting.

So far, most of the effort has gone into the wrong step. Loading a whole list into the CRM is slow, and it comes before any intro gets sent.

## The pattern

**The intro is the unit of work, not the list.** Keep every row in a spreadsheet, where it's cheap. Enter a row into Twenty only when I act on it.

```
Founder's list
   → save the raw file untouched
   → copy into the standard sheet
   → mark reach against the CRM
   → pick a capped batch
   → draft, review, send
   → log the send and the response
   → enter acted-on rows into Twenty
```

Done is a small batch sent, not a list fully processed. Rows I never act on stay in the sheet, where they still count as data.

## How it works

### 1. Intake

Ask the founder for two things besides the list:

- A short forwardable blurb, written by them: what the company does, the raise, and why now.
- A deck or one-pager link.

Without the blurb, the request waits. That keeps the drafting fast, and it's a fair thing to ask in exchange for the intro.

Save the raw file as received, named like `<Company>__Target-Investors__YYYY-MM-DD.csv`. Lists have ranged from about 60 rows to nearly 400, and every founder's columns differ.

### 2. The standard sheet

One shape for every list, so the sheets can be combined later.

| Column | Filled | Notes |
|---|---|---|
| `requesting_company` | At intake | The founder's company |
| `date_received` | At intake | When the list arrived, so firms can be counted over time |
| `firm_name` | At intake | Blank for an angel |
| `firm_domain` | At intake | The join key across lists, because names vary |
| `contact_name` | At intake | Person at the firm, or the angel |
| `contact_linkedin` | At intake | The join key for people |
| `contact_email` | At intake | If provided |
| `reach` | Reach check | See below |
| `selected` | Picking | In this batch or not |
| `date_sent` | Sending | Only when I actually sent it |
| `response` | Follow-up | `NO_REPLY`, `DECLINED`, `ACCEPTED` |
| `outcome` | Follow-up | Free text for now, e.g. met or invested |
| `twenty_id` | CRM entry | Set once the row is in Twenty |

To fill blank `contact_linkedin` cells, run `scripts/context-dev_fetch-person-data.py <sheet> --apply`. It looks up each named contact on Context.dev and only fills a cell when the person's work history includes the sheet's firm. Full responses go to a `__Context-Dev-Raw.jsonl` file beside the sheet. Firm domains are only suggested, because they're rarely returned and `firm_domain` is the join key. In the first trial it matched 14 of 31 named contacts.

Founders' own ratings, statuses and notes stay in the raw file. They aren't carried forward, and they don't become CRM fields.

### 3. Reach check

For each row, an agent looks up the person and firm in Twenty and records the strongest path:

| `reach` | Meaning |
|---|---|
| `KNOW_WELL` | Recent real interaction, and they'd reply to me |
| `KNOW` | A real prior relationship, even if it's quiet |
| `LINKEDIN_1ST` | Connected, but no real relationship |
| `HAVE_CONTACT` | Contact details only |
| `NO_PATH` | Nothing yet |

The agent can suggest a value from CRM history and connection data. Only I can confirm `KNOW_WELL`, since a saved email address doesn't mean they know me.

An earlier two-list pass showed why this step comes first. Of 362 unique people, 161 had an email, a phone number or a first-degree connection, and 201 didn't. Most of a list can be set aside before any effort goes into it, and the true warm set is smaller than 161, since that count includes contact details alone.

### 4. Pick a capped batch

Sort by reach and choose up to about 10 per founder in one sitting. The cap is what makes this finishable. A later batch can follow if the founder is getting traction.

### 5. Draft, review, send

An agent writes one draft per selected row from the template and the founder's blurb, with a line of personal context where the CRM has some. I review and send. **Agents draft and never send.**

The default is a double opt-in: ask the investor first, and make the connection only on a yes. It protects my relationships, and it creates a clear response to record.

### 6. Log and enter into Twenty

Record `date_sent` in the sheet when the intro goes out, then enter the row into Twenty as a Deal Prospect:

| Deal Prospect field | Value |
|---|---|
| `Company` | The requesting company |
| `Prospect For (Firm)` | The investor firm, deduped first |
| `Route To (Person)` | The contact |
| `Date Flagged` | `date_received` |
| `Date Sent` | `date_sent` |
| `Status` | `SENT`, then updated from the response |
| `My Role` | `INFORMAL` unless a formal arrangement exists |
| `Fit Score` | Blank, or my own judgment only |

Angels have no firm. Leave `Prospect For (Firm)` empty and set `Route To (Person)`. The field already allows this, but no angel intro has been entered this way yet.

Create firm and person records only for these rows. A reply worth keeping becomes an Interaction with its companion timeline row, so routine sends don't add logging work.

## The signal

Early on, the data set is simply the pile of standard sheets, combined on `firm_domain`. Twenty holds the subset I acted on.

| Question | Source |
|---|---|
| Which firms do founders ask for most? | Count distinct `requesting_company` per firm |
| Is a firm rising or fading? | The same count over `date_received` |
| Which sought-after firms can't I reach? | High demand and `NO_PATH` |
| Who actually responds to my intros? | `response` per firm and contact |
| Who follows through? | `outcome` per firm |

The third question has the most immediate use: it's a ready list of relationships worth building, chosen by founder demand rather than my guesses.

Raw counts will favor famous brands, because everyone lists them. The more interesting signals are likely to be a less obvious firm that keeps appearing, or a firm whose acceptance rate stands out. Overlap may also be thin at first: only 5 of those 362 people appeared on both lists. Firm-level overlap hasn't been measured, and it should be higher.

## Anti-patterns

- **Loading a whole list into the CRM before sending anything.** This is the current bottleneck.
- **Putting founder ratings in `Fit Score`.** The field then looks like my judgment when it isn't.
- **Using `SENT` for anything I didn't send.** A founder's own meeting status isn't my intro, and `Date Sent` should always be filled alongside it.
- **Sharing one founder's list with anyone else.** These lists show who a company is raising from. Share nothing beyond aggregates, and don't commit raw files or sheets to a repo.
- **Letting an agent send intros.** My name is the asset being spent.

## Open questions

- [ ] Where should the sheets live: a gitignored folder, or a shared spreadsheet?
- [ ] Do intro rows need an `Origin` field on Deal Prospect, to separate them from deals I chose to route to a firm? Otherwise the two get mixed when counting.
- [ ] How does `ACCEPTED` map to Deal Prospect status? `IN_DILIGENCE` overstates an accepted meeting.
- [ ] Should drafts land in Gmail, or in a page I copy from?
- [ ] When does a follow-up go out, if ever? No nudge by default keeps this light.
- [ ] Should each batch end with a short note back to the founder on who was contacted?
- [ ] Should the existing list-derived records be folded into the signal data, and at what cost?

## Prove it on one list

Take the next list that arrives and run the whole flow. Record:

- Minutes from receiving the list to the batch being sent, the number this pattern exists to reduce
- Intros sent, and how many got a reply within two weeks
- Which step dragged, and which columns went unused

Then revise this document, or demote it to an exploration if the shape was wrong. Promote it to `Active` after it has worked on real lists, and turn the repeatable steps into an agent skill.

## Related

- `lossless-crm-interface-guidelines` skill: dedupe, Deal Prospect, Interaction and timeline rules
- `scripts/context-dev_fetch-person-data.py`: fills contact LinkedIn URLs from Context.dev People Enrich (key `CONTEXT_DEV_API_KEY` in `~/.secrets`)
