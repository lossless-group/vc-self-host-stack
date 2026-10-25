-- Locations: human-defined, nested, many per entity.
--
-- CRMs give each record one address. Real people and orgs have several (based
-- in Austin, office in Dallas, covers "Central Texas"), and the useful
-- groupings are ones a person names ("Central Texas", "Texas Triangle"), not a
-- postal hierarchy. So:
--   * a location is any string someone defines, with optional aliases;
--   * nesting is a graph: a location can have several parents, and a parent can
--     EXCLUDE a child's whole subtree ("Central Texas, but not San Antonio");
--   * any entity links to any number of locations, each with a role.

CREATE TABLE locations (
  id         TEXT PRIMARY KEY,
  slug       TEXT NOT NULL UNIQUE,
  name       TEXT NOT NULL,
  kind       TEXT,                                -- region, metro, city, state, country, venue, custom...
  aliases    TEXT NOT NULL DEFAULT '[]',          -- JSON array: "ATX", "Austin, TX"
  latitude   REAL,
  longitude  REAL,
  notes      TEXT,
  source     TEXT NOT NULL,
  created_at TEXT NOT NULL,
  created_by TEXT
);

-- parent -> child. mode = include (child is part of parent) or
-- exclude (carve the child's subtree out of the parent).
CREATE TABLE location_edges (
  parent_id TEXT NOT NULL REFERENCES locations(id) ON DELETE CASCADE,
  child_id  TEXT NOT NULL REFERENCES locations(id) ON DELETE CASCADE,
  mode      TEXT NOT NULL DEFAULT 'include' CHECK (mode IN ('include', 'exclude')),
  added_at  TEXT NOT NULL,
  added_by  TEXT,
  PRIMARY KEY (parent_id, child_id),
  CHECK (parent_id <> child_id)
);
CREATE INDEX location_edges_child ON location_edges(child_id);

-- Any entity, any number of locations, each with a role:
-- based_in, office, hq, works_from, covers (a territory), venue, from (hometown)...
CREATE TABLE location_links (
  location_id  TEXT NOT NULL REFERENCES locations(id) ON DELETE CASCADE,
  subject_type TEXT NOT NULL CHECK (subject_type IN ('person', 'organization', 'event_instance', 'event_series')),
  subject_id   TEXT NOT NULL,
  role         TEXT NOT NULL DEFAULT 'based_in',
  source       TEXT NOT NULL,
  added_at     TEXT NOT NULL,
  added_by     TEXT,
  ended_at     TEXT,
  PRIMARY KEY (location_id, subject_type, subject_id, role)
);
CREATE INDEX location_links_subject ON location_links(subject_type, subject_id);
