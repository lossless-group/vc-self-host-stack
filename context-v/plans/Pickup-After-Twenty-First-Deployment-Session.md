---
title: "Pickup — After the Twenty-First Deployment Session (Phases 0–5)"
lede: "Where the next session starts: two clients live and gated through Phase 5, Phase 4 waiting on one watched stakeholder run, Phase 6 spike ready to go. Every open thread, credential state, and exact next command."
date_created: 2026-07-25
date_modified: 2026-07-25
authors:
  - Michael Staton
augmented_with:
  - Claude Code on Claude Fable 5
semantic_version: 0.0.0.1
status: Active
tags:
  - Plan
  - Handoff
  - Self-Host-Stack
  - Twenty-CRM
  - Railway
---

# Pickup — After the Twenty-First Deployment Session

**Executed:** overnight 2026-07-24 → 25, one session, spec =
[[../specs/Per-Client-Stack-Deployment-Spec-Twenty-First]].
**Session opener for the next agent:** read this file, then the spec's
Phase 4 + 6 sections. Skills: `use-railway`, `context-vigilance`,
`pseudomonorepos`, `changelog-conventions`, `git-conventions`. Playwright
MCP is in `.mcp.json` and loads with the session.

## Scoreboard

| Phase | State |
|---|---|
| 0 Preflight | ✅ gated |
| 1 reach-edu Twenty | ✅ gated (changelog 2026-07-24_01) |
| 2 palmer-ai Twenty | ✅ gated (_02) |
| 3 Backups + restore drill | ✅ gated (_03) |
| 4 Native MCP | 🟡 operator pilot PASSED (2026-07-25_01); stakeholder run pending |
| 5 Hub | ✅ gated (2026-07-25_02) — `palmer-ai.didi.sh` live, mobile-verified |
| 6 Homebase spike | ⬜ not started |

## What's running (all IDs in `client-stacks/<client>/stack.md`)

- **reach-edu** (Railway `4208a111…`): twenty-server/worker/postgres/redis
  + bucket, `https://twenty-server-production-7c98.up.railway.app`, hub at
  `https://hub-production-943c.up.railway.app`, weekly pg_dump →
  R2 bucket `reach-edu` (Fri 00:00 EST), restore DRILLED.
- **palmer-ai** (Railway `18a1c8bb…`): identical stack,
  `https://twenty-server-production-4b1e.up.railway.app`, hub at
  **`https://palmer-ai.didi.sh`** (custom domain, cert live; DNS in
  Vercel's didi.sh zone), weekly pg_dump → R2 bucket `palmer-ai`.
  4 real companies: Reach Capital, New Markets VP, Kalos, Juvo.
- Image pinned `twentycrm/twenty:v2.24.1` both. `TRUST_PROXY=1` and
  `PORT=3000` are load-bearing (see `docs/twenty/setup.md`).
- Michael's Claude Desktop is OAuth-connected to palmer-ai's `/mcp` —
  read AND write verified as his user.

## Next session, in order

1. **Jason/Janae onboarding (closes GATE 4).** Michael copies the invite
   link from palmer-ai Twenty (Settings → Members → copy invite link) and
   sends: `palmer-ai.didi.sh` + invite link. The run is WATCHED: desktop,
   then phone, one real workflow; log friction verbatim into the ai-labs
   exploration's Findings (pattern: see the 2026-07-25 entry there).
   Do NOT rescue prematurely.
2. **Phase 6 spike (no stakeholder needed, ~half day).** Stub
   streamable-HTTP MCP server, disposable, deployed into the reach-edu
   project; test the remaining matrix cells — Claude MOBILE, GPT Desktop,
   GPT mobile — recording auth flows accepted + whether tools/resources/
   prompts surface per app. Results → ai-labs exploration Findings →
   surface that the id-didi-sh spec amendment is unblocked. STOP there
   (spec anti-goal: do not build homebase).
3. **Operator crumbs:** reach-edu connector in Michael's Claude; Claude
   mobile glance (cell #2, may fall out of step 1); fill the ChatGPT
   section of `docs/twenty/connect-your-ai.md` + hub after the spike.

## Loose threads (small, non-blocking)

- **Real Twenty API keys**: both `client-stacks/<c>/twenty/.env` still
  hold EXPIRED playground JWTs under `TWENTY_MCP_API_KEY`. Mint from
  Settings → APIs (long expiry), replace. Verify with the decode probe in
  `docs/twenty/setup.md` (type must be API_KEY, not PLAYGROUND).
- **reach-edu custom domain** (`reach-edu.didi.sh`?) not minted — the
  `custom-domain-cutover` agent skill has the full recipe.
- **`lossless-clients` R2 bucket** exists, unused — keep as ops bucket or
  delete; Michael's call.
- **Hub → lossless.group port** is Michael's stated eventual home for the
  landing pages; `hub/` was built portable for it.
- **GATE 2 Twenty seed data** (Airbnb/Anthropic/etc. demo companies) still
  in both workspaces; delete when clients start doing real work.
- **Phase 1 delta:** browser-drive verification was waived by Michael
  (Playwright reserved for solo loops); API-level verification was done
  instead. Recorded here so the retro sees it.

## Where knowledge lives now

- `docs/twenty/setup.md` — the deploy runbook (every gotcha encoded)
- `docs/twenty/connect-your-ai.md` — agent-facing client setup (stable URL
  = raw.githubusercontent.com/lossless-group/vc-self-host-stack/main/docs/twenty/connect-your-ai.md)
- `client-stacks/<c>/` — stack.md (IDs/URLs), .env (SECRETS + recovery),
  restore-runbook.md, mcp-connector.md, context-v/agent-skills/twenty-interface/
- `context-v/agent-skills/custom-domain-cutover/` — DNS cutover playbook
- ai-labs exploration `Secrets-for-Collaborators…` §Findings — connector
  matrix cell #1 (Claude Desktop OAuth = PASS, with the TRUST_PROXY story)
- Six changelog entries, 2026-07-24_01 → 2026-07-25_02

## Standing decisions made mid-session (don't relitigate)

- Backups: WEEKLY Fri 00:00 EST + user-prompted + agent-offered after
  ~10+ record creations (encoded in each client's twenty-interface skill).
- Per-client R2 buckets named `<client>`, bucket-scoped tokens.
- Hub: one Astro codebase, `CLIENT` env per deployment, no passcode gate
  (nothing secret on it; deviation from spec's gate note, accepted).
- didi-account teaser card ships on BOTH clients' hubs.
