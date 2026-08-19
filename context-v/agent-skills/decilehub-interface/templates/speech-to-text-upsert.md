# Speech-to-text upsert — `<memo or call, YYYY-MM-DD>`

> **Use case.** A busy investment professional is on the road, back to back, and
> wants an audio memo or call transcript to end up in Decile Hub.

Sibling of [`deal-upsert.md`](deal-upsert.md) and [`lp-upsert.md`](lp-upsert.md),
but the shape is inverted. Those start from **fields** and end at a record. This
starts from **unstructured speech** and ends at *n* records — and the work is
almost entirely **segmentation and matching**, not field population.

**Default posture: this is an UPDATE.** One memo usually appends notes to records
that already exist. Creating anything is the exception and needs saying out loud.

---

## 0 · The raw transcript

Paste verbatim. **Do not clean it up before working on it** — mis-hears are
evidence about what was actually said, and you'll need them in §2.

```
<transcript>
```

**Source:** ☐ voice memo ☐ call recording ☐ dictated live
**Date spoken:** `<YYYY-MM-DD>` — *the date of the conversation, not today*
**Marker:** `[voice-memo:<YYYY-MM-DD>]` / `[call-transcript:<YYYY-MM-DD>]`

The marker is the **idempotency key**. A prospect already carrying it is skipped,
so re-pasting the same memo never double-logs.

---

## 1 · Segment — who and what is in here

One memo is rarely about one party. Split before matching.

| # | Party as heard | Person / company / both? | The lines about them |
|---|---|---|---|
| 1 | | | |
| 2 | | | |
| 3 | | | |

☐ Every substantive line is assigned to a party, or listed in §4 as unplaced

---

## 2 · Match each party — quote the evidence

**Proper nouns are what speech-to-text gets wrong most**, and they're exactly
what you match on. Expect transcription drift *stacked on* CRM spelling drift:
a dropped or doubled letter, a transposed vowel, a silent consonant, a compound
surname collapsed or split.

Search both — a name may be a person, a company, or both:

```
search_people_orgs          q: "<as heard>"
search_pipeline_prospects   q: "<as heard>"
```

| # | Heard as | Candidate in Decile | Match | Evidence (quote the line) |
|---|---|---|---|---|
| 1 | | | ☐ exact ☐ near ☐ none | |
| 2 | | | ☐ exact ☐ near ☐ none | |

- **exact** → queue it
- **near** (surname-only, or phonetically close) → **suggest, never auto-apply.**
  Show the heard form, the candidate, and the transcript line side by side
- **none / multiple** → §4. Do not force it

> **Read fuzzy hits, don't count them.** A non-empty result is not a match — an
> unrelated organization sharing the first few letters will surface.

---

## 3 · Draft the notes — one per party

**Preserve their words.** Fix obvious mis-hears; never summarize away numbers,
named people, commitments, or hedges. *"He said maybe 250 if the round fills"*
must survive intact — that clause is the entire value of the memo. A tidy
paraphrase that loses it has destroyed the thing you were capturing.

```
[voice-memo:<YYYY-MM-DD>]

<the operator's own words about this party>

<transcription uncertain: "<as heard>" — could not confirm>   ← if applicable
```

| # | Prospect | `context` (= pipeline name) | Note drafted? |
|---|---|---|---|
| 1 | | | ☐ |

☐ Checked existing `notes[]` for this marker — no duplicate
☐ Nothing merged across parties: one note per prospect

---

## 4 · Unplaced — surface, never drop

Anything you could not confidently match. **Showing it costs the operator two
seconds; discarding it loses it permanently.**

| Heard as | Line | Why unplaced |
|---|---|---|
| | | ☐ no candidate ☐ several ☐ transcription unclear |

---

## 5 · Proposed, NOT applied

From a memo alone, these are recommendations. The operator decides.

| Proposal | Party | Basis (quote) | Approved? |
|---|---|---|---|
| Stage move → `<stage>` | | | ☐ |
| `next_contact` = `<date>` | | | ☐ |
| New record (person/org) | | | ☐ |

> 🛑 **Creating from a memo is the highest duplicate risk in this skill** — a
> transcribed name is the *least* reliable string you will ever match on, and
> Decile has **no merge tool**. If §2 found no match, the default is to leave it
> in §4 unplaced, not to create. Create only when the operator confirms the
> spelling.

**Never from a memo alone:** move a stage (*"they're basically in"* is not a
stage change) · set `capital_commitment` (spoken numbers are indications) ·
`send_pact` / `send_lpa` (irreversible, outbound) · invent an email to satisfy
the natural key.

---

## 6 · Execute — only what was approved

```
per matched party:
  add_pipeline_prospect_note  { pipeline_prospect_id: "<string>",
                                context: "<pipeline name>",
                                body: "[voice-memo:<date>] <verbatim>" }

only if approved in §5:
  update_pipeline_prospect    { next_contact | stage_id }   ← ids as strings
  create_or_update_person / _organization                    ← genuinely new only
```

**Notes attach to the Person**, so a memo about an LP appears on every board
they're on. `context` is the only thing scoping it.

---

## 7 · Verify & report

```
search_pipeline_prospects   q: "<party>"    → note visible, stage unchanged?
```

Report, in this order:

1. **Logged** — party, prospect id, which pipeline
2. **Suggested but not applied** — §5, awaiting their yes
3. **Couldn't place** — §4, verbatim
4. **If they're doing this often:** forwarding transcripts to the firm's Decile
   intake address skips this conversation entirely and keeps working when Claude
   isn't open. *Say it in words — never print the address.*

---

> **Bulk or historical imports** — a folder of past memos rather than today's
> call — are an operator job with a filesystem, not a Desktop one. augment-it's
> `decile-import-voicenotes.mjs` covers it: dry-run by default, idempotent on the
> same marker, additive only, never moves stages.

> **Confidentiality.** Real LP names belong in Decile, never in a published
> document, changelog, or commit. Placeholders only outside the client's systems.
