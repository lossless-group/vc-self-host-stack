# LP record upsert — `<LP Name>`

Fill in *with* the person, then execute. Sibling of
[`deal-upsert.md`](deal-upsert.md) — but the model is **different in a way that
catches people**, so don't pattern-match from it.

> ### The one structural difference
> On a **deal** board, the prospect **is the company**.
> On an **investor** board, the prospect **is the Person** — their fund or family
> office rides along in `person.organizations[]`, and is *not* the prospect.
>
> Make the **Organization** the prospect only when the institution itself is the
> relationship (an endowment writing the cheque, no named human). Rare: 3 of 132
> on CogScAI, 0 of 374 on Fund I.

| Layer | Tool | Natural key |
|---|---|---|
| Person | `create_or_update_person` | **email** |
| Board row | `upsert_pipeline_prospect` | pipeline + prospect identity |

**The upsert hazard applies here too:** these routes replace the fields you send.
Read the current record before writing, and send only what you're changing.

---

## 0 · Create or update — and the no-email problem

> 🛑 **There is no merge tool in Decile.** A duplicate is permanent — delete one
> and you lose its notes and history. Search the **distinctive token** (`acme`,
> not `Acme Bio, Inc.`), and if a record exists, **upsert against the spelling
> Decile already holds** — sending a "better" name forks the record.

```
search_people_orgs         q: "<name>"        → in the directory?
search_pipeline_prospects  q: "<name>"        → on which boards, at what stage?
list_pacts                                     → have they already signed one?
```

**Email is the natural key, and hand-collected LPs usually don't have one.**
Voice notes, conference lists, and intros arrive as a *name*. So:

- The typed name is the identity key; **Decile supplies the email** once matched.
- Normalize before comparing: NFKD → strip diacritics → lowercase → collapse
  non-alphanumerics. `search_people_orgs` does this server-side — lean on it.
- **Three outcomes, and you resolve none of them silently:** exact → queue ·
  surname-only → *suggest* · none/multiple → hand back to the human.
- Spelling drift is the norm, not the exception: in one 35-LP import, 6 were
  spelled differently in the CRM than in the source. Expect a dropped or doubled
  letter, a transposed vowel, a silent consonant added or omitted, and compound
  surnames collapsed to one word — or split into two.

> **Never write a real LP's name into this template, a note you publish, or a
> commit.** Placeholders only in anything that leaves the client's systems.

**An LP is often on more than one board.** Someone in Fund I *and* a SPV is one
Person with two prospect rows. Check before creating a second anything.

**Current state (updates only):**

| | Now | Changing to |
|---|---|---|
| Board(s) & stage | | |
| `next_contact` | | |
| PACT signed? | | *(never set by hand — `send_pact` does it)* |

---

## 1 · Vehicle — all three are `is_primary`, so the flag can't help

| Board | id | Distinctive stages (the disambiguating tell) |
|---|---|---|
| Investors - Humain Ventures Fund I, LP | `PKLV4On2` | **Event Onboarding · Pitch Meeting · Future Interest · Closing Nudge · Closed** |
| Investors - CogScAI SPV | `oNDV9o8R` | **Fund LP Outreach · Non Fund LP Outreach** |
| Fundraising - Unnatural Products SPV | `g8br3QA8` | **Send PACT** (as a stage), **Meeting** (not "Pitch Meeting") |

Shared by all three — **cannot** identify a board on their own: `Added`, `PACT`,
`Outreach`, `Materials`, `Follow-up`, `Closing`, `Unresponsive`, `Declined`.
**If the request only uses those words, ask which vehicle.**

> Unnatural Products SPV had **0 prospects** as of 2026-08-19 — the board exists,
> fundraising hasn't started. Landing someone there is a real decision, not a default.

**Chosen:** `<id>` — **because:** `<reason>`

---

## 2 · Person fields — the human, not our view of them

| Field | Value | Notes |
|---|---|---|
| `first_name` / `last_name` | | Required |
| `email` | | **The natural key.** Absent → match by name (§0), don't invent one |
| `phone`, `linkedin` | | |
| `organizations` | | `[{name, title}]` — their fund/family office. **Rides along; not the prospect** |
| `tag_list` | | Additive |
| `referred_by` | | Who introduced them — worth more than most fields here |

---

## 3 · Board fields — and what this firm actually maintains

Measured 2026-08-19. Fill what the firm keeps; don't invent the rest.

| Field | Fund I | CogScAI | Read as |
|---|---|---|---|
| `email` | 161/200 | 115/132 | Well kept |
| **`next_contact`** | **150/200** | **102/132** | **The live signal — this firm runs on follow-up dates. Set it.** |
| `last_contact` | 15/200 | 82/132 | Inconsistent between boards; don't assume |
| `probability` | 3/200 | 8/132 | Barely used |
| `rating` | 2/200 | 0/132 | Effectively unused |
| `capital_commitment` | **0/200** | 6/132 | **Not where commitments live — see §5** |
| notes | 13/200 | **0/132** | Thin. A note you add is likely the only written record |

**Set `next_contact`.** It is the one field this firm genuinely maintains on LP
boards, and it's what makes "who's due this week" answerable — unlike the deal
board, where every date field is empty.

---

## 4 · Stage — and the honesty rule

**If no stage honestly describes how this LP arrived, use `Added` and write a
note.** Fund I has `Event Onboarding`; the SPVs don't. Forcing a plausible
neighbour manufactures provenance nothing downstream can distinguish from fact.

**Never target a `[Hold]`.** **Never move to `Declined` from silence** — that's
what `Unresponsive` is for; `Declined` is a decision someone made, and Fund I's
`Future Interest` is the "no, but later" that keeps a relationship alive.

**Chosen:** `<name>` / `<"id" as string>` · **honest?** ☐ yes ☐ no → note: `<...>`

---

## 5 · PACT and LPA — 🔴 stop and read

**Decile ships a pre-set (alterable) LP pipeline that ends in a PACT.** A PACT —
Pledge Agreement for Capital Transaction — is the soft-commitment instrument,
**what a SAFE is to company fundraising**: the LP pledges an amount before money
moves and before binding paperwork. The LPA that follows is the binding document.

```
Outreach → Materials → PACT ──────→ Closing → LPA ──────→ capital account
                       soft pledge            binding      money can move
```

**Soft commitments do not live in `capital_commitment`** — that field is
effectively unused. They live in **PACTs**, each carrying `investment`,
`invest_as`, `signed_on`, `person_id`, `pipeline_id`. **`list_pacts` is how you
answer "who has committed, and how much."**

| | What it *actually* does |
|---|---|
| `send_pact` | Moves the person onto the **Send PACT** stage of the investor pipeline, resolves the template, and **emails the agreement** |
| `send_lpa` | Moves them to **Closing**, **creates their capital account on the fund**, seats them on the closing pipeline's onboarding stage, and emails the LPA |

**These are fundraise state changes wearing an email's clothes.** Both are
irreversible and outbound.

☐ Named the exact person and pipeline back to the human
☐ Explicit yes for **this** send — not carried over from an earlier approval
☐ One at a time. **Never batch.**
☐ Confirmed the right vehicle — an LPA on the wrong fund creates a capital
  account on the wrong fund

Never send either to "see what happens."

---

## 5b · Filing LP documents

Signed PACTs, LPAs, subscription docs, and wire confirmations attach the same way
as a deck (`upload_prospect_attachment`) — and need the same naming discipline:

```
<date>_<PersonName>--<Doc>-<Vehicle>.pdf

20260819_JaneSmith--PACT-FundI.pdf
20261104_JaneSmith--PACT-CogScAI.pdf     ← same LP, different vehicle
20260902_JaneSmith--LPA-FundI.pdf
```

**The vehicle belongs in the descriptor.** The same LP signs for Fund I and later
for a SPV; same name, same document type, different fund. Confusing the two is a
capital-account error, not a filing error.

Date is **when they signed** — `list_pacts` carries `signed_on`, so for a PACT
you have the exact day and should use `YYYYMMDD`. Full rule: *Naming files and
artifacts* in `SKILL.md`.

## 6 · Execute

```
1. create_or_update_person     { first_name, last_name, email, organizations, tag_list }
      → changes:  "id": [null, N] = created   ·   [N, N] = updated (check for clobber)

2. upsert_pipeline_prospect    { pipeline_id, stage_id: "<string>",
                                 prospect: { person: { email | first_name+last_name } } }

3. add_pipeline_prospect_note  { pipeline_prospect_id: "<string>",
                                 context: "<pipeline name>", body: <provenance + substance> }

4. update_pipeline_prospect    { next_contact: "<YYYY-MM-DD>" }     ← don't skip

5. (only on explicit yes)      send_pact / send_lpa
```

**All ids are strings on writes.** Reads return integers.

> **Notes attach to the Person, not the row.** An LP in Fund I and a SPV sees the
> note on both cards. `context` is the only thing scoping it — set it to the
> pipeline name, and never promise per-pipeline privacy.

---

## 7 · Verify

```
search_pipeline_prospects  q: "<name>"    → stage, and every board they're on
list_pacts                                → if a PACT was sent, has it landed?
```

## 8 · Report

Created or updated (from `changes`) · ids · stage in plain language · `next_contact`
you set · what the note records · **whether anything outbound was sent, to whom** ·
and what's still blank that a human must decide.
