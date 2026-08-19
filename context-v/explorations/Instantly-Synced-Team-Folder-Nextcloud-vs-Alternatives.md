---
title: "An Instantly-Synced Shared Folder for a 3-Person Team"
lede: "Nextcloud was the first name that came to mind — but the actual ask is pure instant file sync, and that's a different tool's specialty."
date_created: 2026-07-08
date_modified: 2026-07-08
authors:
  - mpstaton
augmented_with:
  - Claude Sonnet 5
semantic_version: 0.0.0.1
tags:
  - Exploration
  - File-Sync
  - Self-Host-Stack
  - Nextcloud
  - Syncthing
  - Team-Collaboration
status: Open
site_uuid: 9cca8c1b-2353-42cb-ad3f-37204e402daf
hex_code: 2jtxtp
date_authored_initial_draft: 2026-07-08
date_authored_current_draft: 2026-07-08
publish: true
---

# An Instantly-Synced Shared Folder for a 3-Person Team

## The question

A recurring need: a shared, instantly-synced directory across a small team (the consultant, on a Linux machine and a Mac; two colleagues, each on a Mac) for research materials (PDFs), corpora, and agent-skills — content everyone should have local, live access to. Dropbox works but is "muddied with too much going on, too much history" and is overkill for this. [Nextcloud](https://nextcloud.com/install/) was the first candidate that came to mind, as a self-hosted alternative. Is it the right fit?

## Why we don't already know

Several self-hosted options look similar at a glance (Nextcloud, Syncthing, Seafile, ownCloud) but solve genuinely different problems, and the stated requirement — "instantly synced directory," nothing more — doesn't automatically point at the most feature-rich option. It's also not yet clear how technical the two colleagues are, which matters: some of these tools have zero web UI, requiring a native client on every machine, while others give a full browser-based file manager a non-technical person could use without installing anything. Finally, this stack already runs [Papermark](../../core/papermark) for dataroom-style external sharing — so it's worth checking whether "Nextcloud for datarooms too" would just be duplicating something this repo already ships, versus this being a genuinely separate need (an internal team's live-synced working folder, not an external-facing permissioned dataroom).

## Options

### Option A — Nextcloud

Full self-hosted groupware suite: file sync + web UI + sharing links + calendar/contacts/talk/office collaboration. Official current self-hosted deployment path is **Nextcloud All-in-One (AIO)** — a single master-container Docker image that provisions the whole stack (app, DB, Redis, HTTPS, backups) rather than hand-assembling separate containers ([github.com/nextcloud/all-in-one](https://github.com/nextcloud/all-in-one)). Desktop sync clients exist for macOS, Linux, and Windows.

**Pros:**
- Full browser-based file manager — colleagues can access files with zero client install.
- Native sharing links (useful if this ever needs to hand a PDF to someone outside the team).
- Mature, well-documented, decade-plus track record; fits this repo's existing self-hosting pattern (same VPS, same Docker Compose discipline as TwentyCRM/Papermark).
- One account/permission system if the team grows.

**Cons:**
- **Sync is not truly instant.** Multiple independent 2026 sources converge on this: a Reddit r/selfhosted thread states plainly *"if you're only using nextcloud for the sync, syncthing does it much faster and is very lightweight"* ([reddit.com/r/selfhosted](https://www.reddit.com/r/selfhosted/comments/1ry3x2s/syncthing_vs_nextcloud_files_sync_only/)); a comparison guide frames it as *"Seafile handles the heavy lifting of file sync efficiently and reliably, while Nextcloud handles calendar, contacts, and collaboration"* ([stackademic.com](https://blog.stackademic.com/syncthing-vs-seafile-vs-nextcloud-the-family-proof-decision-guide-0153556ef1e7)) — i.e., even in the self-hosted world, Nextcloud is not generally recommended as the fast/lightweight choice specifically for pure sync.
- Architecturally centralized (client ↔ your server ↔ client) rather than peer-to-peer, per a Level1Techs forum thread explaining the core distinction from Syncthing ([forum.level1techs.com](https://forum.level1techs.com/t/what-is-the-difference-between-nextcloud-syncthing/166926)) — every sync round-trips through your VPS.
- Brings a large surface area (calendar, contacts, Talk, Office) that isn't part of the stated need at all — the "too much going on" complaint about Dropbox could reappear in a self-hosted form.
- Meaningful setup/maintenance burden even with AIO — updates, backups, and occasional troubleshooting are real ongoing costs, echoed across the sources above.
- Overlaps with Papermark's job in this stack for anything dataroom-shaped (external, permissioned, link-based sharing) — worth not duplicating.

### Option B — Syncthing

Continuous, peer-to-peer, real-time folder sync. No server, no account system, no central authority — devices connect directly (or relayed) and sync in the background. Open source (MPL 2.0), clients for macOS, Linux, Windows, mobile.

**Pros:**
- **This is the closest match to the literal ask** ("instantly synced directory," nothing more). One tutorial comparing the two directly in 2026 summarizes it as: *"Syncthing is effortless after setup... files sync in the background without you thinking about it... If your goal is pure, fast, private file syncing between your own devices, Syncthing is almost unbeatable."*
- Handles the multi-device shape here trivially — the consultant's Linux machine and Mac are just two more device entries in the same setup as the two colleagues' Macs. No server to provision or maintain at all.
- Nothing to host on the shared VPS — reduces load and attack surface on the same box running TwentyCRM/Papermark/Plunk/Postiz.
- Lightweight and fast, per every source found.

**Cons:**
- No web UI for browsing files without a client installed on that machine — a colleague who wants quick browser access from an untrusted device has no path.
- No shareable public links — if this ever needs to hand a file to someone outside the three-person team, Syncthing has no answer (Papermark already covers that need in this stack, though, for anything dataroom-shaped).
- No built-in permission/role model — it's folder-level trust between named devices, not user accounts.

### Option C — Seafile

A dedicated file-sync-and-share engine (not a full groupware suite): block-level deduplication for efficient sync, a web UI, sharing links, and a "virtual drive" mode for on-demand sync without a full local copy.

**Pros:**
- Positioned in the research as the direct answer to "I just want fast, reliable sync — not the whole cloud suite": *"Seafile is a focused and efficient option for file syncing and sharing. Nextcloud offers a broader range of features including collaboration..."* ([ssdnodes.com comparison](https://www.ssdnodes.com/blog/nextcloud-vs-seafile-dropbox-alternative/)).
- Does have a browser UI and sharing links (things Syncthing lacks), while staying lighter than Nextcloud.

**Cons:**
- Still a server-mediated, self-hosted service to provision and maintain (on the shared VPS or its own).
- Smaller ecosystem/community than Nextcloud; less "if something breaks, there's a forum thread" coverage.
- No source found benchmarking it as faster than Syncthing specifically for this team's shape (2–4 devices) — its efficiency case is strongest at larger scale/file counts.

### Option D — Combine a pure-sync tool with Nextcloud/Papermark for the surfaces each is actually good at

Run Syncthing (or Seafile) for the actual instant-sync need, and lean on this stack's existing Papermark for anything that needs a permissioned external share link — rather than asking one tool (Nextcloud) to do both.

**Pros:**
- Matches tool to job instead of picking the single most feature-complete option and accepting its overhead everywhere.
- This is a pattern the research itself surfaces organically — multiple comparison pieces frame "Seafile/Syncthing for sync + Nextcloud for collaboration" as a common combination for people who've tried to make one tool do everything and found it didn't fit well.

**Cons:**
- Two systems instead of one, conceptually — though in practice this repo already runs Papermark, so it's "reuse what's already here" rather than "add a second new system."

## Findings

- **Nextcloud's sync model is client-server, not true real-time P2P** — multiple 2026 sources independently agree Syncthing is faster/lighter for pure sync, and that Nextcloud's actual strength is the surrounding groupware suite (calendar, contacts, sharing links, web UI), not sync speed itself.
- **The official current Nextcloud self-hosting path is the All-in-One (AIO) Docker image**, not a hand-rolled docker-compose of separate app/DB/Redis containers — this simplifies the "if we go this route" setup story considerably versus older guides.
- **Syncthing is the tool most directly aimed at the stated need** — instant, lightweight, peer-to-peer sync, no server required, well-suited to a handful of named devices.
- **Seafile sits in between** — dedicated sync engine with a lighter footprint than Nextcloud but still server-based, with a web UI and sharing links Syncthing lacks.
- **This stack already has an answer for dataroom-shaped sharing (Papermark)** — so the actual gap here is narrower than "we need a Dropbox replacement"; it's specifically "we need a live-synced internal working folder," which points away from standing up a second full VDR-adjacent system.

### A pitfall worth flagging explicitly (relevant because "agent-skills" is one of the sync targets)

Continuously syncing a live `.git` working tree with any file-sync tool (Dropbox, Nextcloud, Syncthing, Seafile alike) is a well-known way to corrupt a git repository — simultaneous writes from multiple machines mid-commit can race with git's own internal object writes. If the shared "agent-skills" content is the same git-tracked `context-v/skills/` material this monorepo already manages via the skills-sync symlink habit (see root `CLAUDE.md`), the synced folder should hold a **plain copy or export** of that content (or genuinely different non-git-tracked corpora/PDFs), not a live clone of a git working directory that multiple people also `git pull`/`git push` independently.

## Tentative direction

Leaning toward **Syncthing (Option B)** as the direct fit for the literal need — instant sync, minimal setup, nothing new to host on the shared VPS — with **Papermark (already in this stack)** covering anything that later needs a permissioned external share link. Nextcloud becomes the right call instead if, once actually discussed with the two colleagues, browser-only access (no client install) or public share links turn out to matter more than raw sync speed/simplicity.

Not yet decided: still open pending a quick check with the two colleagues on how technical they are and whether browser-only access matters to them.

## Outcome

Open. No tool installed yet.

## Related

- `self-host-stack/core/papermark` — already covers permissioned external sharing in this stack
- [[Hermes-Agent-Colocation-and-Hackability]] — separate exploration, but shares the "what does self-hosting actually buy us vs. a managed alternative" framing
