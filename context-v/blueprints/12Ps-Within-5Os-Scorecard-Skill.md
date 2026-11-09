---
title: "Blueprint: 12Ps Within 5Os Scorecard Skill"
lede: "A deal scorecard that records how an investor's view changes, and never tells anyone whether to invest."
summary: "Concise summary of the 12ps-5os-scorecard agent skill: the framework, workflow, snapshot model and output. Read for orientation. To run or change the skill, use its SKILL.md and rubric, which win over this doc."
publish: false
date_created: 2026-11-05
date_modified: 2026-11-05
date_authored_initial_draft: 2026-11-05
date_authored_current_draft: 2026-11-05
date_authored_final_draft:
authors:
  - Michael Staton
augmented_with:
  - Claude Code on Claude Opus 5.5
at_semantic_version: 0.0.0.2
status: Reference
tags:
  - Blueprint
  - Agent-Skills
  - Deal-Scoring
  - Decision-Science
  - Investment-Committee
site_uuid: 1c603de7-e919-4e84-88ab-45cf06ac49ae
hex_code: l3hjmy
type: Blueprints
---

# Blueprint: 12Ps Within 5Os Scorecard Skill

## Why Care?

Investment decisions usually leave behind a final score, or just a memory of a discussion. Nobody can trace later what each person first believed, what changed their mind, or whether that change was justified.

Our [12 "P"s and 5 "O"s](../skills/12ps-within-5os-scorecard-skill/SKILL.md) skill runs a guided dialogue that scores one early-stage deal and records how each evaluator's judgment changes over time. It protects each person's independent view from being anchored by the AI or the group. If a firm uses it consistently, it builds a data set linking what was believed at decision time to how the investment performed.

**It never gives an invest or pass verdict, or a confidence level.** Investors decide, and the AI's read is one view to argue with.

## The framework

Five Os, scored 1 to 5, informed by twelve Ps:

| O | Question | Ps |
|---|---|---|
| **Origins** | Why would anyone care about you? | Persona, Pain, Proposition |
| **Opening** | How big is the problem, and how can they compete? | Problem, Possibility, Positioning |
| **Organization** | Who is this company? | People, Process, Product |
| **Offering** | How well do the promise, the positioning and the product line up? | Borrows Proposition, Positioning, Product |
| **Opportunity** | Is this worth our investment? | Potential, Progress, Plan |

The bar shifts with the round. Earlier stages are scored on evidence of insight and potential, later ones on proof. A pre-seed 5 on Opportunity looks nothing like a Series A 5.

### The twelve Ps

| # | P | O | What it asks |
|---|---|---|---|
| 1 | **Persona** | Origins | Who is the target customer, who are the surrounding stakeholders, and what is their current condition that the offering could change? |
| 2 | **Pain** | Origins | What is the problem from the customer's point of view, in their own language, and how much of a priority is it for them? |
| 3 | **Proposition** | Origins | What is being promised to the customer and stakeholders, and how is the solution framed? |
| 4 | **Problem** | Opening | How many of these target customers exist, and how is the wider market experiencing the same Persona and Pain? |
| 5 | **Possibility** | Opening | How big are the total, serviceable and obtainable markets (TAM, SAM and SOM)? |
| 6 | **Positioning** | Opening | How does the company frame its offering to find a "Blue Ocean," grow faster than the competition, and build moats? |
| 7 | **People** | Organization | Who are the founders, and why are they credible: talented outsiders, or people who have already proven they can do this? |
| 8 | **Process** | Organization | What best practices, technology and growth engine are they applying, and how are they building the business and culture? |
| 9 | **Product** | Organization | What exactly are they offering, does it fulfill the brand promise, and why do customers value it? |
| 10 | **Potential** | Opportunity | If today's numbers are projected forward, how big does this get, and how quickly? |
| 11 | **Progress** | Opportunity | What hard traction is indisputable, and how far along are they, measured by their OKRs and KPIs? |
| 12 | **Plan** | Opportunity | How will the capital be used, what milestones come before the next raise, and what would it take to reach breakeven? |

Offering has no Ps of its own. It's a read on how well Proposition, Positioning and Product fit together.

## How a session runs

1. **Orient.** First-time users get a short intro and must explicitly agree to the premise.
2. **Set the stage.** Pre-seed, seed or Series A. Nothing gets scored without it.
3. **Choose a workflow.** This decides how much the AI can anchor the person, so it comes before any scoring.
4. **Choose granularity.** Score the five Os by default, or score each P in precision mode. Offering is always scored as a whole.
5. **Confirm weights.** Each factor defaults to 1, and the five O weights must always sum to 5, so partners stay comparable. Any change records why, because that's where an investor's implicit thesis becomes explicit.
6. **Capture the snapshot.** Either a new independent Prior, or a new snapshot after an event.
7. **Roll up.** `sum(O score × O weight) / 5`, plus a short narrative. The number is a summary, not a recommendation.
8. **Ask where it goes.** Files, CRM, or both.

### The three workflows

| Workflow | How it works | Use when |
|---|---|---|
| **Anchored** | The AI shows its scores first | Time is short, and the person accepts the anchoring knowingly |
| **Co-deliberation** (best practice) | The AI scores blind and withholds its read, guides the person with questions, and reveals only after they commit | The deal deserves rigor; this is deliberately slower |
| **Elicitation** | The person states their views and the AI structures them | They've already formed a view |

The blindness in co-deliberation comes from the order of steps within one session. It isn't a cryptographic guarantee.

## The snapshot model

Each evaluator has their own append-only journey: `00-Prior`, then a new snapshot after each influencing event, such as an LLM dialogue, management meeting, expert call or IC discussion. Firms can add event types.

- **Snapshots are immutable.** New events add new snapshots, because an edited Prior is no longer independent.
- **New information comes first.** Each event logs what was learned, with its source, even if no score moved.
- **Every change gets a reason.** The agent walks each moved score and asks what influenced it. Moves are labeled `evidence` or `judgment`, and a gut update is never dressed up as evidence.
- **The AI is its own evaluator.** It scores only at the Prior and in conversations it actually joined. Re-scoring a meeting from someone's summary would just echo their framing.
- **Disagreement is preserved.** Views are never blended, because the differences are the most useful part for IC.

## Output

- **Snapshots:** `12ps_score--<Evaluator>_<NN-Event>.json`, with an optional `.md`
- **Deal aggregate:** `YYYYMMDD_<DealName>--12ps5os-Scorecard.json`, recomputed from the snapshots
- **CSV rollup:** one row per evaluator, event and item
- **CRM handoff:** a record-ready payload for the firm's CRM skill, since this skill never writes to a CRM itself

## What it leaves to others

- **Firm-level synthesis:** turning all the snapshots into an IC discussion agenda and diligence checklist is planned as a separate skill that isn't built yet.
- **CRM writes:** these belong to the firm's CRM skill.
- **Memo writing:** this is out of scope.

## Adapting it to another firm

`references/firm-metadata.md` is the one file to edit: firm name, default weights, event types and optional IC roster. It's currently set to HumainVC. The stage bars in `references/stage-lens.md` are a starting calibration meant to be tuned.

## Related

- `12ps-5os-scorecard` skill: `SKILL.md` for the workflow, and `references/12ps-5os-rubric.yaml` as the source of truth for definitions
- `ai-labs/memopop-ai/apps/memopop-orchestrator`: a separate memo pipeline with its own 12Ps scorecard agent
