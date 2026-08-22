---
title: "Aggregating Historical Calendar Items for Lossless Twenty"
lede: "Started as 'should we deploy cal.diy' and ended somewhere else entirely — cal.diy deletes the past by design, Twenty's importer already backfills everything, and the thing actually worth building is a one-time ICS backfill that never touches OAuth."
date_created: 2026-08-22
date_modified: 2026-08-22
authors:
  - Michael Staton
augmented_with:
  - Claude Code on Claude Opus 5
at_semantic_version: 0.0.1.0
tags:
  - Exploration
  - Self-Host-Stack
  - Twenty-CRM
  - Cal-DIY
  - Calendar-Sync
  - CalDAV
  - Google-OAuth
  - Interaction-Object
  - Timeline
  - Client-Privacy
status: Open
site_uuid: c5905048-90bf-450c-8429-c6c2f7912367
hex_code: hg1pn4
date_authored_initial_draft: 2026-08-22
date_authored_current_draft: 2026-08-22
publish: true
---

# Aggregating Historical Calendar Items for Lossless Twenty

## Why Care?

Two problems, one suspected shared cause.

**The operator problem.** Michael runs roughly eight email addresses and
calendars. Meetings that matter to dealflow are scattered across all of them,
and there is no surface where an agent can ask *"when did I last meet with X"*
across the whole set.

**The client problem.** Two client firms have meetings that belong in their
Twenty instance but will not connect their calendars. The resistance is not
technical. CRMs of this shape assume the adopter is a salesperson whose
calendar is entirely work — but these are entrepreneurial and lean-venture
founders, non-profit founders, for whom most contacts and meetings are
irrelevant to a pipeline and a meaningful share feel private. All-or-nothing
sync asks them to hand over the pediatrician along with the LP call.

The opening hypothesis was that **cal.diy** — self-hosted scheduling, already
on the `core/` roadmap — could be the intermediary that solves both: sync
everything into it, let agents query it.

That hypothesis is wrong, and the reasons why are worth writing down.

## What cal.diy actually does — and why it cannot be the warehouse

cal.diy is the open-source community edition of Cal.com (Cal.com went
closed-source; `calcom/cal.diy` carries the scheduling engine, app-store
framework, and booking infrastructure).

It has a per-event mirror table, `CalendarCacheEvent`, that looks like exactly
what we wanted — summary, description, location, start/end, iCalUID,
recurrence, keyed per `SelectedCalendar` across every connected account. Three
facts from the source kill it:

| Finding | Where |
|---|---|
| Deletes every event that has ended: `deleteMany({where:{end:{lte: new Date()}}})` | `CalendarCacheEventRepository.deleteStale()` |
| Never fetches history — initial sync sets `timeMin = now`, `timeMax = now + N months` | `GoogleCalendarSubscription.adapter.ts` |
| **No attendees at all** — the table has no participant field | `CalendarCacheEvent` schema |

Cal only stores attendees for bookings made *through* Cal (`Attendee` →
`Booking`). Attendee email is the join key to a CRM person, so even the
forward-looking window lacks the one field that makes a meeting CRM-relevant.
It is an availability mirror for conflict-checking, not a warehouse. It is also
gated behind two feature flags (`calendar-subscription-cache`,
`calendar-subscription-sync`) that must be hand-`INSERT`ed into `Feature` /
`UserFeatures`.

**Verdict:** cal.diy is still worth deploying, but as a *booking* layer — one
identity across N calendars, a Calendly line item deleted, and a
consented-capture path where a client volunteers a meeting at booking time
rather than surrendering their whole calendar. It is not the history layer.

## The three-layer frame

The confusion was treating one layer as another.

| Layer | Coverage | Fidelity | History | Cost |
|---|---|---|---|---|
| **1. Booking** (cal.diy) | only what's booked through the link | high — attendee email, event type, form answers | none | low, deploy-only |
| **2. Sync** (Twenty native) | everything on the calendar | tunable | full (see below) | free, already built |
| **3. Warehouse** (custom ingest) | everything, all accounts, all calendars | full, with attendees | full | needs building |

## What Twenty actually does — the correction that changed the plan

Read from the vendored source at `core/twenty-crm/`, not from memory.

**Twenty's Google importer backfills the entire calendar.** It passes no time
bounds at all:

```ts
// google-calendar-get-events.service.ts
googleCalendarClient.events.list({
  calendarId: 'primary',
  maxResults: 500,
  syncToken: syncCursor,
  showDeleted: true,
})
```

The only downstream filter (`filter-events.util.ts`) drops blocklisted and
cancelled events — nothing date-based. So a first sync with no syncToken pulls
the whole history, paginated. **This is the opposite of cal.diy**, and it means
the "historical warehouse" is already built for any single Google account.

**The privacy knob is not the one we assumed.** `CalendarChannelVisibility` is
`METADATA` vs `SHARE_EVERYTHING`, defaulting to `SHARE_EVERYTHING`. But
`METADATA` hides *titles and descriptions* while still ingesting participants —
which is exactly what mints the pediatrician as a contact. The worst pairing:
lose the useful part, keep the polluting part.

The real control is `contactAutoCreationPolicy`
(`AS_PARTICIPANT_AND_ORGANIZER` / `AS_PARTICIPANT` / `AS_ORGANIZER` / `NONE`).
In `calendar-event-participant.service.ts`, contact *creation* is gated behind
`isContactAutoCreationEnabled` (line 155) but `matchParticipants` runs
unconditionally (line 167).

> **`SHARE_EVERYTHING` + auto-creation `NONE`** = full event content,
> participants linked to people who already exist, and **no new contacts ever
> minted**. This is the configuration to put in front of the resistant clients.
> It is very likely not what they pictured when they said no.

**Two structural limits that a custom pipeline would not have:**

1. `calendarId: 'primary'` only. One connected account syncs its primary
   calendar and nothing else. Secondary calendars inside an account are never
   fetched.
2. Twenty's filter is a blocklist, not a judgment call.

## Dead end: hand-writing `calendarEvent`

Recorded so nobody tries it again. `CalendarEventCleanerService` deletes every
`calendarEvent` with no `calendarChannelEventAssociation`, and runs at the end
of *every* calendar import, on connected-account destroy, and on blocklist
changes. MCP exposes no `create_one_calendar_event`, and `calendarChannel` is
not exposed at all.

The trap is that it *looks* like it works: with zero channels connected the
import never runs, so orphan rows sit there happily — and get swept the day you
connect a calendar. Now documented in §8 of the
`lossless-crm-interface-guidelines` skill.

## What got built along the way

The curated alternative — the "sweep" — turned out to already exist as the
**`Interaction`** custom object, and it now works end to end:

- One `Interaction` per touchpoint, with `Verbatim` for evidence and full
  content. No calendar connection required.
- Twenty only fans `linked-<object>.created` timeline rows out to parent
  records for `noteTarget` and `taskTarget` (hardcoded two-entry map in
  `timeline-activity.service.ts`). Custom objects never propagate. **Write the
  companion row yourself** — recipe and four gotchas now in §5 of the skill.
- Proven live on the 2026-08-21 Mike OSS product demo: one Interaction, three
  timeline rows (Will Chen, Amal Muthukumaran, Mike OSS), all confirmed
  rendering.

**Known gap:** `Interaction.Person` is MANY_TO_ONE, so a multi-party meeting
cannot hold all its attendees. A second participant appears on the timeline but
is not queryable. Proposed fix: an **Interaction Participation** join object
mirroring Event Participation. Not yet built.

## The split — and why the cheap half is the half we want

The original ask ("take my auth info and pull all my historical events") is
really two problems with very different costs.

**Historical backfill is nearly free.** Google Takeout exports every calendar on
an account as `.ics`. No Cloud Console, no OAuth client, no consent screen, no
tokens. Same for iCloud and Fastmail. Eight accounts is an afternoon of
clicking plus a parser.

**Ongoing sync is where all the cost lives, and it is auth administration, not
code.** A Google Cloud project with an **External** consent screen in
**Testing** status issues refresh tokens that **expire after 7 days** — eight
accounts re-authorized weekly, forever. The escapes are publishing to
**Production** (Google verification, weeks, demo video and privacy policy,
because `calendar.events` is a sensitive scope) or **Internal** user type (no
expiry, but only covers accounts inside one Workspace org — not personal Gmail
or iCloud).

## Related finding: why the connect screen asks for IMAP/SMTP/CalDAV

The Lossless instance has `CALENDAR_PROVIDER_GOOGLE_ENABLED` unset (defaults
`false`) and `IS_IMAP_SMTP_CALDAV_ENABLED` on, so Twenty offers the only
provider it has. `docs/twenty/setup.md` has no mention of Google, calendar, or
messaging — this was never configured.

**That form cannot connect to Google.** Google's CalDAV API requires OAuth 2.0
and returns 401 for Basic auth; since 2025-03-14 Google cut basic auth for
third-party CalDAV/IMAP/SMTP/POP entirely. Twenty's CalDAV client uses
`getBasicAuthHeaders` from `tsdav` — Basic auth only. The form works for
iCloud, Fastmail, Nextcloud, Radicale with app-specific passwords.

To enable Google on a Twenty instance:

```
AUTH_GOOGLE_ENABLED=true                 # note: also enables Google SSO for login
AUTH_GOOGLE_CLIENT_ID=<console>
AUTH_GOOGLE_CLIENT_SECRET=<console>
AUTH_GOOGLE_CALLBACK_URL=https://<host>/auth/google/redirect
AUTH_GOOGLE_APIS_CALLBACK_URL=https://<host>/auth/google-apis/get-access-token
CALENDAR_PROVIDER_GOOGLE_ENABLED=true
```

**Scopes are hardcoded** in `get-google-apis-oauth-scopes.ts`: `email`,
`profile`, `profile.emails.read`, `gmail.readonly`, `gmail.send`,
`calendar.events`. You cannot request calendar-only. The consent screen says
*read your Gmail and send mail as you* even with
`MESSAGING_PROVIDER_GMAIL_ENABLED=false`. For the resistant clients, that
screen is where the conversation gets harder — know it before walking them
into it.

Also note: the CalDAV driver is date-bounded where the Google one is not —
`PAST_DAYS_WINDOW = 365 * 5`, `FUTURE_DAYS_WINDOW = 365`. Five years back is
close enough for most purposes.

## Decision: build the warehouse, but only for the reasons Twenty cannot cover

A custom pipeline earns its keep on exactly three counts, all of which apply
here:

1. **Eight accounts**, each its own OAuth grant in Twenty.
2. **`calendarId: 'primary'` only** — secondary calendars are structurally
   invisible to Twenty.
3. **Classification before landing** — a judgment call per event, upstream of
   the CRM, which is also what makes the same pipeline sellable to a client who
   never wants raw calendar data in their instance.

If none of those applied, the answer would be *connect the account and build
nothing*.

### Shape

```
Takeout / .ics export  →  parse  →  normalize  →  dedup on iCalUID
      →  local store (DuckDB or SurrealDB canonical layer)
      →  classifier pass (business vs personal)
      →  ranked shortlist for human approval
      →  approved → Interaction record + companion timeline rows
```

The write side already exists and is proven. Nothing new is needed there.

### Effort

| Piece | Estimate |
|---|---|
| Backfill + normalize + dedup across 8 calendars | half a day – 1 day |
| Classifier + shortlist proposal | ~1 day, mostly prompt iteration |
| Ongoing Google sync with real OAuth | 1 day code + verification tail in calendar time |
| iCloud CalDAV / Microsoft Graph adapters | ~half a day each |

### Hard parts that are not auth

- **Dedup across calendars.** The same meeting on three of eight calendars.
  `iCalUID` is the join key; cross-account invites and forwards get messy.
- **Recurrence.** Request `singleEvents=true` and let the provider expand the
  series — more rows, no RRULE math.
- **Classification.** The genuinely novel part. Prompt work, not engineering.

## Next step

**Build the Takeout backfill only** — read-only, into a local store, nothing
touching the CRM, no OAuth, no Cloud Console.

That answers the question actually worth answering — *can an agent find the
relevant meetings across all eight calendars?* — for a day's work. If the
shortlist quality is good, the auth project is justified. If it is not, we spent
a day instead of three weeks waiting on Google verification.

## Open questions

- Which providers are the eight calendars? Google Workspace, personal Gmail,
  iCloud, Fastmail? The mix determines how much of this is OAuth work at all.
- How many are *secondary* calendars inside one account? Those are the ones
  Twenty can never see, and they are the strongest argument for the custom
  pipeline.
- Do we re-approach the two clients with `SHARE_EVERYTHING` +
  auto-creation `NONE` before building anything for them? That is a
  conversation, not code, and it may close the gap for free.
- Does the warehouse write into Twenty's `calendarEvents`, or stay in a
  canonical layer that Twenty reads from? The second is more work but survives
  a client who never wants raw calendar data in their CRM.
- Build the **Interaction Participation** join object so multi-party meetings
  are queryable per attendee?

## See also

- [[Per-Client-Self-Host-Stacks-Twenty-First-on-Railway]]
- `context-v/skills/lossless-crm-interface-guidelines/SKILL.md` — §5 Interaction
  + companion timeline row recipe; §8 the `calendarEvent` trap
- `docs/twenty/setup.md` — deploy runbook, currently silent on Google/calendar
