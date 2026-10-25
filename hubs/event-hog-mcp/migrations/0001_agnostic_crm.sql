-- agnostic-crm: our model of customer data, independent of any vendor CRM.
--
-- Ported from augment-it's canonical layer (persons / organizations /
-- affiliations / observations / events; see the surrealdb-canonical-layer
-- skill). One database per client, so there is no client_access column:
-- the tenancy boundary is the Cloudflare account.
--
-- HubSpot (or any CRM) is a projection: crm_links records what was pushed
-- where. The event-hog Artifacts repo is the human-readable log: interactions
-- point back at the file and commit that recorded them.

CREATE TABLE persons (
  id               TEXT PRIMARY KEY,               -- uuid
  name             TEXT NOT NULL,
  headline         TEXT,                           -- title as they'd say it
  linkedin_url     TEXT,
  source           TEXT NOT NULL,                  -- where we first learned of them
  first_seen_at    TEXT NOT NULL,
  last_seen_at     TEXT NOT NULL,
  first_touched_by TEXT,
  last_touched_by  TEXT
);

-- Natural keys live here, not on persons: one person, many emails and phones.
-- UNIQUE(kind, value) is what makes "never create a duplicate" enforceable.
CREATE TABLE person_identifiers (
  person_id TEXT NOT NULL REFERENCES persons(id) ON DELETE CASCADE,
  kind      TEXT NOT NULL CHECK (kind IN ('email', 'phone', 'linkedin')),
  value     TEXT NOT NULL,                         -- normalized: lowercase email, digits-only phone
  added_at  TEXT NOT NULL,
  PRIMARY KEY (kind, value)
);
CREATE INDEX person_identifiers_person ON person_identifiers(person_id);

CREATE TABLE organizations (
  id                TEXT PRIMARY KEY,              -- uuid
  slug              TEXT NOT NULL UNIQUE,          -- the cross-system identity
  complete_name     TEXT NOT NULL,
  conventional_name TEXT,
  aliases           TEXT NOT NULL DEFAULT '[]',    -- JSON array
  domains           TEXT NOT NULL DEFAULT '[]',    -- JSON array
  source            TEXT NOT NULL,
  first_seen_at     TEXT NOT NULL
);

-- person -> org. Many per person, and they end rather than get deleted.
CREATE TABLE affiliations (
  id        TEXT PRIMARY KEY,
  person_id TEXT NOT NULL REFERENCES persons(id) ON DELETE CASCADE,
  org_id    TEXT NOT NULL REFERENCES organizations(id) ON DELETE CASCADE,
  kind      TEXT,                                  -- role or title string
  relevance INTEGER,                               -- 0-5, forced choice, no neutral
  added_at  TEXT NOT NULL,
  ended_at  TEXT,
  source    TEXT NOT NULL,
  UNIQUE (person_id, org_id, kind)
);

-- org <-> org. Peer is the normal shape; hierarchy is the special case.
-- One edge per pair: child_org_id is the child for child_of, either side for peer.
CREATE TABLE org_relations (
  id           TEXT PRIMARY KEY,
  child_org_id TEXT NOT NULL REFERENCES organizations(id) ON DELETE CASCADE,
  parent_org_id TEXT NOT NULL REFERENCES organizations(id) ON DELETE CASCADE,
  rel          TEXT NOT NULL CHECK (rel IN ('child_of', 'peer')),
  kind         TEXT,                               -- open vocabulary: funder_of, partners_with, customer_of, ...
  description  TEXT,
  added_at     TEXT NOT NULL,
  source       TEXT NOT NULL,
  UNIQUE (child_org_id, parent_org_id)
);

CREATE TABLE events (
  id             TEXT PRIMARY KEY,
  slug           TEXT NOT NULL UNIQUE,
  name           TEXT NOT NULL,
  starts_on      TEXT,
  ends_on        TEXT,
  venue          TEXT,
  artifacts_repo TEXT,                             -- event-hog namespace/repo
  source         TEXT NOT NULL
);

-- How a person or org relates to an event: speaker_at, sponsor_of,
-- exhibitor_at, attended, target (from the prep map), met_at.
CREATE TABLE event_ties (
  id           TEXT PRIMARY KEY,
  event_id     TEXT NOT NULL REFERENCES events(id) ON DELETE CASCADE,
  subject_type TEXT NOT NULL CHECK (subject_type IN ('person', 'organization')),
  subject_id   TEXT NOT NULL,
  role         TEXT NOT NULL,
  priority     TEXT,                               -- A / B / C for targets
  detail       TEXT,
  source       TEXT NOT NULL,
  added_at     TEXT NOT NULL,
  UNIQUE (event_id, subject_type, subject_id, role)
);

-- One touchpoint. Points back at the Artifacts file and commit that logged it.
CREATE TABLE interactions (
  id              TEXT PRIMARY KEY,
  event_id        TEXT REFERENCES events(id),
  occurred_at     TEXT NOT NULL,
  logged_by       TEXT NOT NULL,
  channel         TEXT NOT NULL DEFAULT 'in_person',
  where_met       TEXT,
  notes           TEXT,
  follow_up       TEXT,
  follow_up_owner TEXT,
  follow_up_done_at TEXT,
  artifact_path   TEXT,
  artifact_commit TEXT
);
CREATE INDEX interactions_event ON interactions(event_id, occurred_at);

CREATE TABLE interaction_participants (
  interaction_id TEXT NOT NULL REFERENCES interactions(id) ON DELETE CASCADE,
  person_id      TEXT NOT NULL REFERENCES persons(id) ON DELETE CASCADE,
  role           TEXT NOT NULL DEFAULT 'contact',  -- contact | teammate
  PRIMARY KEY (interaction_id, person_id)
);

-- Append-only provenance log: every fact, who asserted it, from where.
-- Predicates grow freely (has_name, has_title, affiliated_with, met_at, ...).
CREATE TABLE observations (
  id           TEXT PRIMARY KEY,
  subject_type TEXT NOT NULL,
  subject_id   TEXT NOT NULL,
  predicate    TEXT NOT NULL,
  object       TEXT,
  source       TEXT NOT NULL,                      -- e.g. event-hog:<repo>@<commit>:<path>
  observed_at  TEXT NOT NULL,
  observed_by  TEXT
);
CREATE INDEX observations_subject ON observations(subject_type, subject_id);

-- Per-client vocabulary, never a column on the shared row.
CREATE TABLE tags (
  subject_type TEXT NOT NULL,
  subject_id   TEXT NOT NULL,
  tag          TEXT NOT NULL,
  added_at     TEXT NOT NULL,
  added_by     TEXT,
  PRIMARY KEY (subject_type, subject_id, tag)
);

-- Where an entity has been projected into an external CRM.
CREATE TABLE crm_links (
  entity_type TEXT NOT NULL,                       -- person | organization | interaction
  entity_id   TEXT NOT NULL,
  system      TEXT NOT NULL,                       -- hubspot
  external_id TEXT NOT NULL,
  url         TEXT,
  synced_at   TEXT NOT NULL,
  synced_by   TEXT,
  PRIMARY KEY (entity_type, entity_id, system)
);
