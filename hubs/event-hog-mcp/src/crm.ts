// agnostic-crm (D1): our structured model of people, orgs, events, touchpoints.
//
// The event-hog repo is the human-readable record; this database is the
// queryable one, kept in step by log_contact after each push. HubSpot is a
// projection of it (crm_links). Every fact also lands in `observations` with a
// source pointing at the commit and file that asserted it.

import type { Env, Handler, Person } from "./index";
import { ensureLocation, linkLocationStmt } from "./locations";
import { crmEmail } from "./index";

const uuid = () => crypto.randomUUID();
const nowIso = () => new Date().toISOString();

function slug(s: string): string {
  return String(s ?? "")
    .normalize("NFKD")
    .replace(/[̀-ͯ]/g, "")
    .toLowerCase()
    .replace(/[^a-z0-9]+/g, "-")
    .replace(/^-+|-+$/g, "")
    .slice(0, 80);
}

const normEmail = (v: string) => v.trim().toLowerCase();
const normPhone = (v: string) => v.replace(/[^\d+]/g, "");
const normLinkedin = (v: string) => v.trim().toLowerCase().replace(/^https?:\/\/(www\.)?/, "").replace(/\/+$/, "");

// The instance an event-hog repo is the workspace for. Normally seeded with its
// series and organizer; created bare if a repo is used before that.
export async function ensureInstance(env: Env, eventSlug: string): Promise<string> {
  await env.CRM.prepare(
    "INSERT OR IGNORE INTO event_instances (id, slug, name, artifacts_repo, source, first_seen_at) VALUES (?, ?, ?, ?, 'event-hog', ?)",
  )
    .bind(uuid(), eventSlug, eventSlug, `${env.NAMESPACE}/${eventSlug}`, nowIso())
    .run();
  const row = await env.CRM.prepare("SELECT id FROM event_instances WHERE slug = ?").bind(eventSlug).first();
  return row.id as string;
}

// Match an existing org by slug, full name, short name, or alias before
// creating one: "7x24 Exchange" and "7x24 Exchange International" are one org.
export async function findOrg(env: Env, name: string): Promise<string | null> {
  const s = slug(name);
  const row = await env.CRM.prepare(
    `SELECT id FROM organizations
     WHERE slug = ?1 OR lower(complete_name) = lower(?2) OR lower(conventional_name) = lower(?2)
        OR EXISTS (SELECT 1 FROM json_each(organizations.aliases) WHERE lower(value) = lower(?2))
     LIMIT 1`,
  )
    .bind(s, name.trim())
    .first();
  return (row?.id as string) ?? null;
}

export async function ensureOrg(env: Env, name: string, source: string): Promise<string> {
  const found = await findOrg(env, name);
  if (found) return found;
  const s = slug(name);
  await env.CRM.prepare(
    "INSERT OR IGNORE INTO organizations (id, slug, complete_name, source, first_seen_at) VALUES (?, ?, ?, ?, ?)",
  )
    .bind(uuid(), s, name, source, nowIso())
    .run();
  const row = await env.CRM.prepare("SELECT id FROM organizations WHERE slug = ?").bind(s).first();
  return row.id as string;
}

// Same identity rules as the contact files: email, then LinkedIn, then
// name + organization. A name alone never merges two people.
export async function findPerson(env: Env, args: any, orgId: string | null): Promise<string | null> {
  const ids: [string, string][] = [];
  if (args.email) ids.push(["email", normEmail(args.email)]);
  if (args.linkedin) ids.push(["linkedin", normLinkedin(args.linkedin)]);
  for (const [kind, value] of ids) {
    const row = await env.CRM.prepare("SELECT person_id FROM person_identifiers WHERE kind = ? AND value = ?")
      .bind(kind, value)
      .first();
    if (row) return row.person_id as string;
  }
  if (orgId) {
    const row = await env.CRM.prepare(
      "SELECT p.id FROM persons p JOIN affiliations a ON a.person_id = p.id WHERE lower(p.name) = lower(?) AND a.org_id = ? LIMIT 1",
    )
      .bind(String(args.name).trim(), orgId)
      .first();
    if (row) return row.id as string;
  }
  return null;
}

export async function recordContact(
  env: Env,
  person: Person,
  eventSlug: string,
  args: any,
  path: string,
  oid: string,
): Promise<string> {
  const at = nowIso();
  const source = `event-hog:${eventSlug}@${oid.slice(0, 12)}:${path}`;
  const instanceId = await ensureInstance(env, eventSlug);
  const orgId = args.company ? await ensureOrg(env, String(args.company), source) : null;

  let personId = await findPerson(env, args, orgId);
  const isNew = !personId;
  if (!personId) {
    personId = uuid();
    await env.CRM.prepare(
      "INSERT INTO persons (id, name, headline, linkedin_url, source, first_seen_at, last_seen_at, first_touched_by, last_touched_by) VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?)",
    )
      .bind(personId, String(args.name).trim(), args.title ?? null, args.linkedin ?? null, source, at, at, person.name, person.name)
      .run();
  }

  const stmts: any[] = [
    // Fill blanks, never overwrite: same rule as the contact file.
    env.CRM.prepare(
      "UPDATE persons SET headline = COALESCE(headline, ?), linkedin_url = COALESCE(linkedin_url, ?), last_seen_at = ?, last_touched_by = ? WHERE id = ?",
    ).bind(args.title ?? null, args.linkedin ?? null, at, person.name, personId),
  ];

  const identifiers: [string, string][] = [];
  if (args.email) identifiers.push(["email", normEmail(args.email)]);
  if (args.phone) identifiers.push(["phone", normPhone(args.phone)]);
  if (args.linkedin) identifiers.push(["linkedin", normLinkedin(args.linkedin)]);
  for (const [kind, value] of identifiers) {
    stmts.push(
      env.CRM.prepare("INSERT OR IGNORE INTO person_identifiers (person_id, kind, value, added_at) VALUES (?, ?, ?, ?)").bind(
        personId,
        kind,
        value,
        at,
      ),
    );
  }

  if (orgId) {
    stmts.push(
      env.CRM.prepare(
        "INSERT OR IGNORE INTO affiliations (id, person_id, org_id, kind, added_at, source) VALUES (?, ?, ?, ?, ?, ?)",
      ).bind(uuid(), personId, orgId, args.title ?? "", at, source),
      env.CRM.prepare(
        "INSERT INTO observations (id, subject_type, subject_id, predicate, object, source, observed_at, observed_by, event_instance_id) VALUES (?, 'organization', ?, 'met_at', ?, ?, ?, ?, ?)",
      ).bind(uuid(), orgId, eventSlug, source, at, person.name, instanceId),
    );
  }

  const interactionId = uuid();
  stmts.push(
    env.CRM.prepare(
      "INSERT INTO interactions (id, event_instance_id, occurred_at, logged_by, logged_by_email, where_met, notes, follow_up, follow_up_owner, artifact_path, artifact_commit) VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?)",
    ).bind(
      interactionId,
      instanceId,
      at,
      person.name,
      crmEmail(person),
      args.where_met ?? null,
      args.notes ?? null,
      args.follow_up ?? null,
      args.follow_up ? person.name : null,
      path,
      oid,
    ),
    env.CRM.prepare("INSERT INTO interaction_participants (interaction_id, person_id, role) VALUES (?, ?, 'contact')").bind(
      interactionId,
      personId,
    ),
  );

  const facts: [string, string | null][] = [
    ["has_name", String(args.name).trim()],
    ["met_at", eventSlug],
  ];
  if (args.title) facts.push(["has_title", String(args.title)]);
  if (args.company) facts.push(["affiliated_with", slug(String(args.company))]);
  if (args.priority) facts.push(["has_priority", String(args.priority)]);
  for (const [predicate, object] of facts) {
    stmts.push(
      env.CRM.prepare(
        "INSERT INTO observations (id, subject_type, subject_id, predicate, object, source, observed_at, observed_by, event_instance_id) VALUES (?, 'person', ?, ?, ?, ?, ?, ?, ?)",
      ).bind(uuid(), personId, predicate, object, source, at, person.name, instanceId),
    );
  }

  if (args.based_in) {
    const locId = await ensureLocation(env, String(args.based_in), person, source);
    stmts.push(linkLocationStmt(env, locId, "person", personId, "based_in", source, person));
  }

  await env.CRM.batch(stmts);
  return `agnostic-crm: ${isNew ? "new person" : "matched existing person"}${orgId ? `, linked to ${args.company}` : ""}, touchpoint recorded.`;
}

export async function recordCrmLink(
  env: Env,
  person: Person,
  path: string,
  externalId: string,
  url: string | null,
): Promise<string> {
  const row = await env.CRM.prepare(
    "SELECT ip.person_id FROM interactions i JOIN interaction_participants ip ON ip.interaction_id = i.id WHERE i.artifact_path = ? AND ip.role = 'contact' ORDER BY i.occurred_at DESC LIMIT 1",
  )
    .bind(path)
    .first();
  if (!row) return "agnostic-crm: no person is linked to that file yet, so only the file was updated.";
  await env.CRM.prepare(
    "INSERT INTO crm_links (entity_type, entity_id, system, external_id, url, synced_at, synced_by) VALUES ('person', ?, 'hubspot', ?, ?, ?, ?) ON CONFLICT (entity_type, entity_id, system) DO UPDATE SET external_id = excluded.external_id, url = excluded.url, synced_at = excluded.synced_at, synced_by = excluded.synced_by",
  )
    .bind(row.person_id, externalId, url, nowIso(), person.name)
    .run();
  return "agnostic-crm: HubSpot link recorded.";
}

// ---------------------------------------------------------------- tools

const SCHEMA_NOTE = `Tables: persons(id, name, headline, linkedin_url, first_seen_at, last_seen_at, first_touched_by, last_touched_by); person_identifiers(person_id, kind email|phone|linkedin, value); organizations(id, slug, complete_name, conventional_name, aliases JSON, domains JSON); affiliations(person_id, org_id, kind = title, relevance 0-5, ended_at); org_relations(child_org_id, parent_org_id, rel child_of|peer, kind e.g. partners_with|customer_of|funder_of, description); event_series(id, slug, name, organizer_org_id -> organizations, cadence, website); event_instances(id, series_id, slug = event-hog repo name, name, starts_on, ends_on, venue, city); interactions(id, event_instance_id, occurred_at, logged_by, logged_by_email = their HubSpot address, where_met, notes, follow_up, follow_up_owner, follow_up_done_at, artifact_path); interaction_participants(interaction_id, person_id, role); observations(subject_type person|organization, subject_id, predicate, object, source, observed_at, observed_by, event_instance_id): the provenance log, and where event participation lives (predicates speaker_at, sponsor_of, exhibitor_at, attended, met_at, target, has_priority, has_title, affiliated_with); tags(subject_type, subject_id, tag); crm_links(entity_type, entity_id, system hubspot, external_id, url, synced_at); locations(id, slug, name, kind, aliases JSON); location_edges(parent_id, child_id, mode include|exclude): a graph, use who_is_in for nested lookups; location_links(location_id, subject_type, subject_id, role based_in|office|hq|works_from|covers|venue|from, ended_at).`;

export const CRM_TOOLS = [
  {
    name: "query_crm",
    description: `Read-only SQL (SQLite) over the agnostic-crm database: one SELECT or WITH statement, at most 200 rows. Use it for structured questions the files can't answer quickly: who at an organization the team has met, open follow-ups by owner, which organizations relate to which, who hasn't been synced to HubSpot. ${SCHEMA_NOTE}`,
    inputSchema: { type: "object", properties: { sql: { type: "string" } }, required: ["sql"] },
    annotations: { readOnlyHint: true },
  },
  {
    name: "relate_orgs",
    description:
      "Record how two organizations relate: the kind of relationship HubSpot's default objects can't hold. Peer is the normal shape (partners_with, customer_of, funder_of, competes_with); child_of is for real hierarchy (a subsidiary, a fund of a firm). Only record what the user said or a source shows.",
    inputSchema: {
      type: "object",
      properties: {
        org: { type: "string", description: "First organization (the child, for child_of)" },
        other_org: { type: "string", description: "Second organization (the parent, for child_of)" },
        rel: { type: "string", description: "peer (default) or child_of" },
        kind: { type: "string", description: "e.g. partners_with, customer_of, funder_of, competes_with, subsidiary_of" },
        description: { type: "string" },
        source: { type: "string", description: "Where this comes from: a conversation, a URL" },
      },
      required: ["org", "other_org", "kind"],
    },
  },
];

const WRITE_WORDS = /\b(insert|update|delete|drop|alter|create|replace|attach|detach|pragma|vacuum|reindex|begin|commit|rollback)\b/i;

export const CRM_HANDLERS: Record<string, Handler> = {
  async query_crm(args, env) {
    const sql = String(args.sql ?? "").trim().replace(/;\s*$/, "");
    if (!/^(select|with)\b/i.test(sql) || sql.includes(";") || WRITE_WORDS.test(sql)) {
      throw new Error("query_crm runs one read-only SELECT (or WITH) statement.");
    }
    const { results } = await env.CRM.prepare(`SELECT * FROM (${sql}) LIMIT 200`).all();
    if (!results?.length) return "No rows.";
    return `${results.length} row(s):\n${JSON.stringify(results, null, 1)}`;
  },

  async relate_orgs(args, env, person) {
    const rel = args.rel === "child_of" ? "child_of" : "peer";
    const source = args.source ? `told:${person.name}:${String(args.source)}` : `told:${person.name}`;
    const a = await ensureOrg(env, String(args.org), source);
    const b = await ensureOrg(env, String(args.other_org), source);
    if (a === b) throw new Error("Those are the same organization.");
    // One edge per pair. For peers, store the pair in a stable order.
    const [child, parent] = rel === "peer" && a > b ? [b, a] : [a, b];
    const existing = await env.CRM.prepare(
      "SELECT id, rel, kind FROM org_relations WHERE (child_org_id = ? AND parent_org_id = ?) OR (child_org_id = ? AND parent_org_id = ?)",
    )
      .bind(child, parent, parent, child)
      .first();
    if (existing) {
      return `These two already have a relationship on record (${existing.rel}, ${existing.kind ?? "no kind"}). Nothing changed; say if it should be replaced.`;
    }
    const at = new Date().toISOString();
    await env.CRM.batch([
      env.CRM.prepare(
        "INSERT INTO org_relations (id, child_org_id, parent_org_id, rel, kind, description, added_at, source) VALUES (?, ?, ?, ?, ?, ?, ?, ?)",
      ).bind(crypto.randomUUID(), child, parent, rel, String(args.kind), args.description ?? null, at, source),
      env.CRM.prepare(
        "INSERT INTO observations (id, subject_type, subject_id, predicate, object, source, observed_at, observed_by) VALUES (?, 'organization', ?, 'related_to', ?, ?, ?, ?)",
      ).bind(crypto.randomUUID(), a, `${String(args.kind)}:${slug(String(args.other_org))}`, source, at, person.name),
    ]);
    return `Recorded: ${args.org} ${args.kind} ${args.other_org} (${rel}).`;
  },
};
