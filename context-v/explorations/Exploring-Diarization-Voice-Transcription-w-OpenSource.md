---
title: "Replacing Granola with an Open-Source Transcription Stack"
lede: "Transcription is solved and free. Knowing who was speaking is neither — and it's the half that makes a meeting-notes product feel good."
site_uuid: 4ea0d56d-9438-489b-a7b9-d65619658079
hex_code: fq0n5t
date_created: 2026-08-17
date_modified: 2026-08-17
date_authored_initial_draft: 2026-08-17
date_authored_current_draft: 2026-08-17
authors:
  - mpstaton
augmented_with:
  - Claude Code on Opus 5 (1M context)
at_semantic_version: 0.0.0.1
publish: true
tags:
  - Exploration
  - Self-Host-Stack
  - Speech-to-Text
  - Diarization
  - Transcription
  - Meeting-Notes
  - Granola
  - Confidentiality
status: Open
---

# Replacing Granola with an Open-Source Transcription Stack

## The question

Most people in this network pay for [Granola](https://www.granola.ai/) or an equivalent to turn meetings into notes. The open-weight speech models are now genuinely good and genuinely free. So: can this stack replace that subscription, and — separately — *should* it?

The two questions come apart faster than expected, and the interesting answer is to the second one.

## Why we don't already know

Three things obscure it:

**"A transcription model" sounds like one thing.** It isn't. A meeting-notes product is a five-stage pipeline, and the stages have wildly different maturity. Evaluating "the best open ASR model" answers roughly one fifth of the question.

**The marketed number is the wrong number.** Every ASR release leads with Word Error Rate, and WER is essentially solved. The number that decides whether a transcript is *useful* is Diarization Error Rate — who was speaking — and nobody markets it because it's much worse.

**Capability and confidentiality are separate axes.** Even a stack that loses on capability can win on the question an LP might eventually ask. That reframing turned out to be the whole conclusion.

## The five stages

| Stage | What it does | Open-source state |
|---|---|---|
| **1. VAD** | Find the speech in the audio | Solved, unglamorous |
| **2. ASR** | Speech → words | **Solved.** ~5.4% WER, permissive licenses |
| **3. Diarization** | Words → *who said them* | **Not solved.** ~11–19% DER |
| **4. Alignment** | Stitch 2 and 3 into one attributed transcript | No model to download — this is engineering |
| **5. Summarisation** | Transcript → notes someone will read | Model-easy, product-hard |

Stages 2 and 3 are the ones with leaderboards. **Stages 4 and 5 are the ones that make the product feel good**, and neither is a download.

## Options

### Stage 2 — ASR (any of these is good enough)

- **Cohere Transcribe** — 2B, **Apache 2.0**, 5.42% average WER across eight English test sets, 14 languages. Took the top of the HuggingFace Open ASR Leaderboard. The most permissive license among the leaders, which matters more here than the decimal places.
- **NVIDIA Canary-Qwen 2.5B** — currently #1 on that leaderboard at 5.63% WER.
- **Nemotron 3.5 ASR** *(4 Jun 2026)* — 600M **streaming** model, 40 language-locales, automatic language detection, OpenMDW license. The candidate if we want live rather than batch.
- **Parakeet TDT / Canary 1B** — sub-3% WER on Common Voice English, if English-only is acceptable.
- **Qwen3-ASR** — 52 languages with timestamp prediction; the multilingual pick.

### Stage 3 — Diarization (where the actual work is)

- **pyannote** — the default. **4.0 community-1 superseded 3.1** in most self-hosted pipelines this year. Best balance of accuracy, ease, and community support.
- **NVIDIA NeMo Sortformer** — end-to-end 18-layer transformer treating diarization as one problem rather than cluster-then-assign. **Sortformer v2-streaming** benchmarks best overall alongside **DiariZen** in the June 2026 sweep across DIHARD III, AMI, VoxConverse and CallHome.

### Stages 4–5

No shortlist, because there is nothing to shortlist. This is where a build would actually spend its time.

## Findings

**1. The gap between the two headline numbers is the whole story.**

| | Metric | State of the art |
|---|---|---|
| Transcription | WER | ~5.4% |
| Diarization | DER | ~11–19% |

**2. DER's components are not equally bad.** It decomposes into false alarm (speech reported that wasn't there), missed speech, and **speaker confusion** — speech attributed to the wrong person. The third is the one that hurts, because it produces a transcript that reads fluently, sounds confident, and is wrong about who committed to what. At 15% DER roughly one speech segment in seven is misattributed, and nothing looks broken.

**3. That failure mode is unusually costly in our context.** "Who said we'd be at $2M ARR by Q3" is a diarization question. So is every attribution that might end up quoted in an investment memo or a board summary.

**4. Audio is the worst modality for structured extraction, by a distance.** The Structured Output Benchmark found value accuracy of 83.0% on text, 67.2% on images, and **23.7% on audio** — while schema compliance stayed near-perfect throughout. Audio → structured records currently produces well-formed JSON that is wrong three times in four. Anything downstream of a transcript needs verification, not trust.

**5. Enrolment is the cheap win.** Diarization natively yields "Speaker 1 / Speaker 2". A short enrolment sample per regular attendee converts those to names and materially cuts the speaker-confusion component. For recurring internal meetings that's one-time setup with an outsized payoff — and it's available regardless of which diarization model wins.

## Tentative direction

**Keep paying for Granola — but the reason matters.** Not because the open models can't do it; they can. Because what we'd be rebuilding is a five-stage pipeline (VAD → ASR → diarization → alignment → summarisation) where the two stages that make it *feel* good aren't a model download.

**The case for building it is confidentiality, not cost.** A recorded partner meeting is exactly the material where "where does this audio go, and who trains on it" has an answer we may owe an LP. That is the same shape as the argument about page content in the agent-native-browsers orientation over in `fullstack-vc` — the local option is less capable, and sometimes that is precisely the point.

So: not a cost-saving project. A **compliance-triggered** one, sitting on the shelf until something asks for it.

## What would change the answer

Worth re-opening this if any of these lands:

- **Streaming DER drops meaningfully.** The gap between stage 2 and stage 3 is the entire argument; close it and the build gets much more attractive.
- **A single model does joint ASR + diarization well.** Sortformer's end-to-end framing points this way. One model instead of a stitched pipeline removes stage 4 — the unglamorous stage where builds die.
- **A confidentiality requirement arrives first.** An LP question, a portfolio company's counsel, or an NDA that names recording explicitly. Then this stops being optional and the capability gap becomes something to work around rather than a reason not to start.
- **A client of the self-host stack asks for it.** Meeting intelligence is a plausible per-client hub feature, and the economics look different when it's billable rather than a subscription we're avoiding.

## Outcome

**Open.** No spec, deliberately — the conclusion is "don't build this yet, and here is the trigger that would change that." Revisit when one of the four conditions above fires.

## Related

- [[Watchlist-Interesting-Tools]] — where the individual models above should land if any get trialled
- [[Per-Client-Self-Host-Stacks-Twenty-First-on-Railway]] — the per-client hub shape this would slot into if it ever becomes billable
- `fullstack-vc/src/content/guides/open-models-by-job/index.md` — the public-facing version of this research, covering the other four jobs (coding, ETL, analysis, imagery)
- `fullstack-vc/src/content/guides/agent-native-browsers/index.md` — the same confidentiality-versus-capability trade, applied to page content instead of audio
