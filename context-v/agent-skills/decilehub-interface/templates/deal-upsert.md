# Deal record upsert — `<Company Name>`

Fill this in *with* the person, then execute it. **Upsert = update-or-insert:**
Decile matches on a natural key and updates if found, creates if not. Which one
happened is not a guess — the `changes` diff tells you.

| Layer | Tool | Natural key | Creates or updates |
|---|---|---|---|
| Company | `create_or_update_organization` | **name** | Either |
| Board row | `upsert_pipeline_prospect` | pipeline + prospect identity | Either |

> ⚠️ **The upsert hazard.** These routes *replace* the fields you send. On an
> existing record, sending a field you haven't checked will overwrite whatever a
> human curated there. **Read before you write, and send only what you're
> actually changing.** Silence is how you preserve someone else's work.

---

## 0 · Is this a create or an update?

> 🛑 **There is no merge tool in Decile.** A duplicate is permanent — delete one
> and you lose its notes and history. Search the **distinctive token** (`acme`,
> not `Acme Bio, Inc.`), and if a record exists, **upsert against the spelling
> Decile already holds** — sending a "better" name forks the record.

```
search_people_orgs           q: "<company name>"        → org already there?
search_pipeline_prospects    q: "<company name>"        → already on a board?
```

- **Read the hits, don't count them.** Fuzzy matching returns near-misses that
  are not matches — searching `impulse` returned a real, unrelated organization
  whose name merely starts the same way.
- **Already on a board?** → this is an **update**. Capture current state below
  before changing anything.
- **Nowhere?** → **create**. Skip to §2.

**Current state (updates only — fill before writing):**

| | Now | Changing to | Why |
|---|---|---|---|
| Stage | | | |
| Rating | | | |
| Probability | | | |
| Notes on file | *n =* | *(append only — never edit)* | |

---

## 1 · Vehicle — decide before anything else

| Board | id | Shape |
|---|---|---|
| Deals - Humain Ventures Fund I, LP | `gNrMpmK1` | 33 stages, action→`[Hold]` pairs |
| Deals - CogScAI SPV | `BKVZL0K3` | 13-stage funnel |
| Deals - Unnatural Products SPV | `l8yEmAD8` | 13-stage funnel |

**Chosen:** `<id>` — **because:** `<reason>`

The SPV boards are named for specific holdings; an unrelated inbound company
belongs on Fund I. Confirm rather than assume when the request names an SPV.

---

## 2 · Company fields — true regardless of which board

These live on the **organization**. They describe the company, not our view of it.

| Field | Value | Notes |
|---|---|---|
| `name` | | The natural key. Exact — this is what future upserts match on. |
| `website` | | Stored as `company_url` |
| `description` | | Stored as `short_description`. **Their words, then what's unverified.** |
| `tag_list` | | Comma-separated string, additive |

**Description discipline:** quote the company for claims, then mark provenance —
`Website only, <date> — team, stage, and traction unverified.` A CRM that blurs
"they claim" and "we verified" is worse than an empty one.

---

## 3 · Board fields — this vehicle's view of the company

Pipeline-scoped. The same company on two boards can carry different values here.

| Field | Value | Decision or derived? |
|---|---|---|
| `stage_id` | | **Decision** — see §4. Send as a **string**. |
| `rating` | | Decision |
| `probability` | | Decision |
| `assigned_name` | | Decision — who owns it |
| `tag_list` | | Additive |

---

## 4 · Stage — and the honesty rule

**Fund I intake:** `Added` · `Added by Investment Inquiries Form` ·
`Reach Out to Cold Lead` · `Reach Out to Inbound Lead` ·
`Reach Out from an Introduction`

**If none of those honestly describes how this arrived — use `Added` (`"177800"`)
and put the truth in a note.** Met at an event, met through a portfolio founder,
inbound via someone's DM: the board has no stage for these, and forcing the
closest-sounding one manufactures a provenance nothing downstream can tell from
a real one.

**Never target a `[Hold]` stage.** Those are where records land *after* an
action completes. Target the action.

**Chosen stage:** `<name>` / `<"id" as string>` — **honest?** ☐ yes ☐ no → note says: `<...>`

---

## 5 · Materials

**Deck filename:** `<date>_<CompanyName>--<Round>.pdf` — e.g.
`202608_ImpulseLabs--Pre-Seed.pdf`. `YYYYMMDD` if the send date is known,
`YYYYMM` if only the month; never invent a day. Descriptor is **the round it's
raising for** — that's what distinguishes this deck from their next one.
Full rule: *Naming files and artifacts* in `SKILL.md`.

**Before uploading, check `list_prospect_attachments`.** A `source: "questionnaire"`
entry means the founder already delivered their deck through the intake form —
upload a second copy and you've created two files of unknown vintage where there
was one of known provenance.

☐ Checked for questionnaire entry ☐ Filename to convention ☐ Round confirmed

---

## 6 · Execute, in this order

```
1. create_or_update_organization   { name, website, description, tag_list }
      → read `changes`:  "id": [null, N]  = created
                         "id": [N, N]     = updated  ← check nothing was clobbered

2. upsert_pipeline_prospect        { pipeline_id, stage_id: "<string>",
                                     prospect: { organization: { name } } }

3. add_pipeline_prospect_note      { pipeline_prospect_id: "<string>",
                                     context: "<pipeline name>", body: <provenance + summary> }

4. upload_prospect_attachment      { pipeline_prospect_id: "<string>",
                                     file_name: "<convention>.pdf", file_data_base64, name }
```

**Every id is a string on writes** — reads hand them back as integers.

---

## 7 · Verify — reads, not assumptions

```
search_pipeline_prospects   q: "<company>"     → stage landed where intended?
list_prospect_attachments   prospect id        → file there, right byte count?
```

## 8 · Report

State: **created or updated** (from `changes`), the ids, the stage *in plain
language*, what the note records, the attachment and its size — and anything
left blank that a human still needs to decide.

---

<details>
<summary>Worked example — Impulse Labs, 2026-08-19</summary>

- **Dedupe:** no match. The one fuzzy hit was an unrelated organization sharing
  the first few letters. → **create**
- **Vehicle:** `gNrMpmK1` (Fund I) — unrelated inbound, not SPV-specific
- **Org:** `Impulse Labs` / `https://www.impulselabs.ai/` / autonomous ML
  engineering platform, their copy + *"website only — unverified"*
  → created, **2340526**
- **Stage:** `Added` (`"177800"`) — arrived via an event; board has no
  event-provenance stage, so neutral + note rather than a plausible lie
- **Prospect:** **5094988**, position 61
- **Note:** 1632680 — provenance + company summary
- **Deck:** `202608_ImpulseLabs--Pre-Seed.pdf` → attachment **636945**, 1,373,765 b
- **Left open:** no contacts on the org; which event; whether Traction figures
  were verified

</details>
