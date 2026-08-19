# humain-vc — pipeline and stage vocabulary

Pulled live from `https://humain.decilehub.com/mcp` on **2026-08-18**:
`list_pipelines` → **29 pipelines across 9 kinds**, then `get_pipeline` per
pipeline for its stages. Client-specific — re-pull for any other tenant, and
re-pull for humain whenever the firm edits a board.

## The `[Hold]` rule — read this before proposing any stage move

Several stage names end in `[Hold]` or `[HOLD]`. **These are waiting states, not
destinations.** A record lands in a `[Hold]` stage as the *result* of a completed
action — the pipeline's automation parks it there until the next human action.
The un-suffixed stages are the *actions*.

Read the Fund I deal pipeline as alternating pairs and it becomes obvious:

```
Set Up Call → Call Scheduled [Hold] → Collect Materials → Materials Collected [Hold] →
Set Up Meeting → Meeting Scheduled [Hold] → Review Opportunity [Hold] → …
```

**Never propose moving a record *to* a `[Hold]` stage.** Propose the action stage;
the hold is where it ends up. When reporting current state, a record sitting in a
`[Hold]` stage means *"waiting on the counterparty or on us to do the next
action"* — say which, don't just read the label back.

## Kinds present on this tenant

| Kind | Count | What it's for |
|---|---|---|
| `event_attendance` | 12 | One pipeline per event; RSVP tracking |
| `investor` | 3 | LP fundraising — one per vehicle |
| `investment` | 3 | Deal flow — one per vehicle |
| `closing` | 3 | LPA / subscription execution |
| `capital_call` | 3 | Capital call tracking |
| `portfolio` | 1 | Post-investment company management |
| `recruiting` | 1 | Hiring |
| `connector` | 1 | Intro-brokering / network cultivation |
| `newsletter` | 1 | `Summer '25 Update` |

**All three `investor` pipelines are `is_primary: true`** — the flag cannot
disambiguate them. Use the vocabulary table below.

---

## `investor` — LP fundraising

The three vehicles use **three different vocabularies**. Match the words in the
request to the pipeline that actually has them.

| Pipeline | id | entity | Stages |
|---|---|---|---|
| **Investors - Humain Ventures Fund I, LP** | `PKLV4On2` | 7104 | Added · Previously Added · **Event Onboarding** · Outreach · **Pitch Meeting** · PACT · Materials · Follow-up · Closing · Unresponsive · Declined · **Future Interest** · **Closed** · **Closing Nudge** |
| **Investors - CogScAI SPV** | `oNDV9o8R` | 9475 | Added · **Fund LP Outreach** · **Non Fund LP Outreach** · PACT · Follow-up · Closing · Unresponsive · Declined |
| **Fundraising - Unnatural Products SPV** | `g8br3QA8` | 47290 | Added · Outreach · **Meeting** · Materials · Follow-up · **Send PACT** · Closing · Unresponsive · Declined |

**Disambiguating tells** (a stage name that exists in exactly one pipeline):

| If the request says… | It's this pipeline |
|---|---|
| Event Onboarding, Pitch Meeting, Future Interest, Closing Nudge, Closed | Fund I |
| Fund LP Outreach, Non Fund LP Outreach | CogScAI SPV |
| Send PACT (as a stage), Meeting (not "Pitch Meeting") | Unnatural Products SPV |

Ambiguous on their own — present in all three: Added, PACT, Follow-up, Closing,
Unresponsive, Declined, Outreach, Materials. **A request using only these words
does not identify a pipeline — ask which vehicle.**

Fund I is the default only when the request says "the LP pipeline" with no other
signal, and even then say which one you picked.

> **`Declined` and `Future Interest` are terminal-ish, not deletions.** Moving an
> LP to `Declined` is a judgment about the relationship. Never propose it from a
> non-reply — that's what `Unresponsive` is for.

---

## `investment` — deal flow

**Two completely different shapes.** Fund I runs a 33-stage micro-stepped board
with explicit `[Hold]` pairs; the two SPVs run a 13-stage funnel.

### Deals - Humain Ventures Fund I, LP — `gNrMpmK1` (entity 7104)

Intake: Added · Added by Investment Inquiries Form · Reach Out to Cold Lead ·
Reach Out to Inbound Lead · Reach Out from an Introduction

Then action → hold, in order:

| Action stage | Resulting hold |
|---|---|
| *(intake)* | Company Review [Hold] |
| Set Up Call | Call Scheduled [Hold] |
| Collect Materials | Materials Collected [Hold] |
| Set Up Meeting | Meeting Scheduled [Hold] |
| *(review)* | Review Opportunity [Hold] |
| Indicate Interest in Investing | Develop Deal Memo [Hold] |
| Start Due Diligence | Due Diligence Collected [Hold] |
| Set Up Negotiation Call | Negotiation Call Scheduled [Hold] |
| Approve Investment | Investment Review [Hold] |
| Sign Investment Documents | Investment Documents Signed [Hold] |
| Send Wire | Investment Closed [Hold] |
| Request Update | Update Received [Hold] |

Exits: No Response · Unresponsive · Failed Review · Failed Due Diligence ·
Declined by GP · Declined by Company

**The exit stages are the sharpest instrument on this board.** `Failed Review` vs
`Failed Due Diligence` vs `Declined by GP` vs `Declined by Company` record *who
ended it and at what depth*. Never collapse them to "declined" — pick the one the
evidence supports, or ask.

### Deals - CogScAI SPV — `BKVZL0K3` (9475) · Deals - Unnatural Products SPV — `l8yEmAD8` (47290)

Identical vocabulary:

Added · Added by Investment Inquiries Form · Prospecting · Engagement · Screen ·
Review · Diligence · Decision · Execute Deal · Tracking · Update Received ·
In Portfolio · Declined

---

## `closing` — LPA execution

| Pipeline | id | Stages |
|---|---|---|
| **LP Click To Close (Fund I)** | `L8Z75WmK` | Added [HOLD] · Send LPA · LPA Sent, Awaiting Signature · LPA Sent, Viewed · Manual Follow-Up Required · LPA Signed, Investor Verification Pending · Closing Queue · Closed · Closed - Need Tax Information · Closed - Tax Information Received · Declined by Fund · Declined by LP · Extended Review (1+ week) |
| **LP Closing (Unnatural Products SPV)** | `3N9xrzAK` | Added [HOLD] · Send questionnaire · Sign LPA · Send Countersigned LPA · Closed [HOLD] · Manual Follow-Up Required · Send Accounting update questionnaire · Received Accounting update questionnaire · Decile Pro - Send Account Invite · Decile Pro - Account Confirmed Created · Engaging in Follow-up [HOLD] · Tax Notification · Declined by Fund · Declined by LP · Signed LPA [HOLD] |
| Closing (CogScAI SPV) | `w8o51pNq` | not pulled — pull before use |

**This is the pipeline `send_lpa` writes into.** Calling `send_lpa` moves the
person onto the investor pipeline's `Closing` stage, seats them on the closing
pipeline's onboarding-send stage, **and creates their capital account on the
fund**. It is a fundraise state change wearing an email's clothes — never batch
it, never fire it to "see what happens."

`Manual Follow-Up Required` is the board's own escalation flag: a record there is
asking for a human, and is the highest-value thing to surface unprompted in a
closing-status question.

---

## `portfolio` — `yKvEOo8x` (entity 7104)

In Portfolio · Active Engagement · Secure Update · New Funding Round ·
Follow-On Investment · Exiting · Closed Companies [Hold] · Exited Companies [Hold]

`Secure Update` is the stage that drives the reporting cycle — portfolio-data
questions ("who owes us an update?") resolve here, not in the deal pipeline.
Note both `Closed Companies` and `Exited Companies` are holds, and they mean
opposite outcomes: shut down vs. exited. Don't conflate them.

## `connector` — `y8m2GeKW`

Added · Reach out to Contact · Reach Out to Introduction · Interested [Hold] ·
Set Up Call · Call Scheduled [Hold] · Send Materials · Materials Viewed [Hold] ·
Request Introduction · Introduction Made [Hold] · Request More Introductions ·
More Introductions Made [Hold] · Newsletter · No Response · Unresponsive

This is the "who can introduce us to whom" board. `search_people_orgs` answers
*"who referred us to X?"*; this pipeline is where that relationship is *worked*.

## `recruiting` — `g8brbPy8`

Applied · Interviewing · Hired · Rejected

---

## Re-pulling this file

```bash
python3 - <<'PY'
import json, subprocess
key = [l.split('=',1)[1].strip() for l in
       open('client-stacks/humain-vc/decilehub/.env')
       if l.startswith('DECILEHUB_API_KEY=')][0]
def call(name, args):
    body = json.dumps({"jsonrpc":"2.0","id":1,"method":"tools/call",
                       "params":{"name":name,"arguments":args}})
    out = subprocess.check_output(["curl","-s","-X","POST",
        "https://humain.decilehub.com/mcp",
        "-H","Content-Type: application/json",
        "-H","Accept: application/json, text/event-stream",
        "-H",f"Authorization: {key}","-d",body], text=True)
    return json.loads(json.loads(out)['result']['content'][0]['text'])
for p in call("list_pipelines", {}):
    full = call("get_pipeline", {"id": p["id"]})
    stages = " · ".join(s["name"] for s in (full.get("stages") or []))
    print(f'[{p["type"]}] {p["name"]} ({p["id"]})\n    {stages}\n')
PY
```

Firms edit their boards. A stage this file names that no longer exists will make
a confident agent propose an impossible move — re-pull rather than trusting age.
