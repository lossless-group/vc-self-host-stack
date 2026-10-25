-- Restructure events into the three roles they actually play:
--   organizer (an organization) -> series (the recurring thing) -> instance (one dated occurrence)
-- and fold event participation into observations, where augment-it keeps it
-- (speaker_at, sponsor_of, exhibitor_at, attended, met_at are predicates, not a table).
-- Safe as a drop-and-recreate: these tables were empty when this ran.

DROP TABLE event_ties;
DROP TABLE interaction_participants;
DROP TABLE interactions;
DROP TABLE events;

-- The recurring event: "7x24 Exchange Fall Conference". Outlives every instance.
CREATE TABLE event_series (
  id               TEXT PRIMARY KEY,
  slug             TEXT NOT NULL UNIQUE,
  name             TEXT NOT NULL,
  organizer_org_id TEXT REFERENCES organizations(id),  -- the Event Organizer: an organization in its organizer role
  cadence          TEXT,                               -- annual, semiannual, one-off
  website          TEXT,
  source           TEXT NOT NULL,
  first_seen_at    TEXT NOT NULL
);

-- One dated occurrence: "7x24 Exchange 2026 Fall Conference, San Antonio".
-- What an event-hog repo is the workspace for.
CREATE TABLE event_instances (
  id             TEXT PRIMARY KEY,
  series_id      TEXT REFERENCES event_series(id),
  slug           TEXT NOT NULL UNIQUE,                 -- matches the event-hog repo name
  name           TEXT NOT NULL,
  starts_on      TEXT,
  ends_on        TEXT,
  venue          TEXT,
  city           TEXT,
  website        TEXT,
  artifacts_repo TEXT,
  source         TEXT NOT NULL,
  first_seen_at  TEXT NOT NULL
);

-- A touchpoint between our side and theirs. Optionally at an instance.
CREATE TABLE interactions (
  id                TEXT PRIMARY KEY,
  event_instance_id TEXT REFERENCES event_instances(id),
  occurred_at       TEXT NOT NULL,
  logged_by         TEXT NOT NULL,
  channel           TEXT NOT NULL DEFAULT 'in_person',
  where_met         TEXT,
  notes             TEXT,
  follow_up         TEXT,
  follow_up_owner   TEXT,
  follow_up_done_at TEXT,
  artifact_path     TEXT,
  artifact_commit   TEXT
);
CREATE INDEX interactions_instance ON interactions(event_instance_id, occurred_at);

CREATE TABLE interaction_participants (
  interaction_id TEXT NOT NULL REFERENCES interactions(id) ON DELETE CASCADE,
  person_id      TEXT NOT NULL REFERENCES persons(id) ON DELETE CASCADE,
  role           TEXT NOT NULL DEFAULT 'contact',
  PRIMARY KEY (interaction_id, person_id)
);

-- Observations can now be scoped to an instance: "speaker_at, in the context
-- of Fall 2026" or "priority A, for Fall 2026".
ALTER TABLE observations ADD COLUMN event_instance_id TEXT REFERENCES event_instances(id);
CREATE INDEX observations_instance ON observations(event_instance_id, predicate);
