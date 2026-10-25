// Locations: human-defined, nested (a graph with include/exclude edges), and
// many per entity, each with a role. See migrations/0003_locations.sql.

import type { Env, Handler, Person } from "./index";
import { findOrg } from "./crm";

function slug(s: string): string {
  return String(s ?? "")
    .normalize("NFKD")
    .replace(/[̀-ͯ]/g, "")
    .toLowerCase()
    .replace(/[^a-z0-9]+/g, "-")
    .replace(/^-+|-+$/g, "")
    .slice(0, 80);
}

export async function findLocation(env: Env, name: string): Promise<string | null> {
  const row = await env.CRM.prepare(
    `SELECT id FROM locations
     WHERE slug = ?1 OR lower(name) = lower(?2)
        OR EXISTS (SELECT 1 FROM json_each(locations.aliases) WHERE lower(value) = lower(?2))
     LIMIT 1`,
  )
    .bind(slug(name), String(name).trim())
    .first();
  return (row?.id as string) ?? null;
}

export async function ensureLocation(env: Env, name: string, person: Person, source: string, kind?: string): Promise<string> {
  const found = await findLocation(env, name);
  if (found) return found;
  const id = crypto.randomUUID();
  await env.CRM.prepare(
    "INSERT OR IGNORE INTO locations (id, slug, name, kind, source, created_at, created_by) VALUES (?, ?, ?, ?, ?, ?, ?)",
  )
    .bind(id, slug(name), String(name).trim(), kind ?? null, source, new Date().toISOString(), person.name)
    .run();
  return (await findLocation(env, name)) as string;
}

export function linkLocationStmt(
  env: Env,
  locationId: string,
  subjectType: string,
  subjectId: string,
  role: string,
  source: string,
  person: Person,
) {
  return env.CRM.prepare(
    "INSERT OR IGNORE INTO location_links (location_id, subject_type, subject_id, role, source, added_at, added_by) VALUES (?, ?, ?, ?, ?, ?, ?)",
  ).bind(locationId, subjectType, subjectId, role, source, new Date().toISOString(), person.name);
}

// Is `maybeAncestor` already above `node`? Adding node -> maybeAncestor would make a cycle.
async function isAncestor(env: Env, maybeAncestor: string, node: string): Promise<boolean> {
  const row = await env.CRM.prepare(
    `WITH RECURSIVE up(id) AS (
       SELECT parent_id FROM location_edges WHERE child_id = ?1
       UNION SELECT e.parent_id FROM location_edges e JOIN up ON e.child_id = up.id)
     SELECT 1 AS hit FROM up WHERE id = ?2 LIMIT 1`,
  )
    .bind(node, maybeAncestor)
    .first();
  return Boolean(row);
}

async function addEdge(env: Env, parent: string, child: string, mode: "include" | "exclude", person: Person) {
  if (parent === child) throw new Error("A location can't contain itself.");
  if (await isAncestor(env, child, parent)) throw new Error("That would make a loop: the child already contains the parent.");
  await env.CRM.prepare(
    "INSERT INTO location_edges (parent_id, child_id, mode, added_at, added_by) VALUES (?, ?, ?, ?, ?) ON CONFLICT (parent_id, child_id) DO UPDATE SET mode = excluded.mode",
  )
    .bind(parent, child, mode, new Date().toISOString(), person.name)
    .run();
}

// Every location inside `root`. Walk include edges down; each path carries the
// exclusions declared by the locations it passed through, so "Central Texas
// excludes San Antonio" prunes San Antonio only on paths through Central Texas.
// A query for Texas still finds San Antonio if Texas reaches it another way.
const EXCL = (node: string) =>
  `COALESCE((SELECT group_concat(x.child_id, ',') FROM location_edges x WHERE x.parent_id = ${node} AND x.mode = 'exclude'), '')`;
const SCOPE_CTE = `
  walk(id, excl) AS (
    SELECT ?1, ',' || ${EXCL("?1")} || ','
    UNION
    SELECT e.child_id, walk.excl || ${EXCL("e.child_id")} || ','
    FROM location_edges e JOIN walk ON e.parent_id = walk.id
    WHERE e.mode = 'include' AND instr(walk.excl, ',' || e.child_id || ',') = 0),
  scope(id) AS (SELECT DISTINCT id FROM walk)`;

async function resolveSubject(env: Env, type: string, ref: string): Promise<string> {
  const r = String(ref).trim();
  if (type === "organization") {
    const id = await findOrg(env, r);
    if (!id) throw new Error(`No organization matches "${r}".`);
    return id;
  }
  if (type === "event_instance") {
    const row = await env.CRM.prepare("SELECT id FROM event_instances WHERE slug = ? OR lower(name) = lower(?)").bind(r, r).first();
    if (!row) throw new Error(`No event instance matches "${r}".`);
    return row.id as string;
  }
  if (type === "person") {
    if (r.includes("@")) {
      const row = await env.CRM.prepare("SELECT person_id FROM person_identifiers WHERE kind = 'email' AND value = ?")
        .bind(r.toLowerCase())
        .first();
      if (row) return row.person_id as string;
    }
    const { results } = await env.CRM.prepare("SELECT id FROM persons WHERE lower(name) = lower(?)").bind(r).all();
    if (results.length === 1) return results[0].id as string;
    if (results.length > 1) throw new Error(`${results.length} people are named "${r}". Use their email.`);
    throw new Error(`No person matches "${r}".`);
  }
  throw new Error(`Unknown subject type: ${type}`);
}

const list = (v: unknown): string[] => (Array.isArray(v) ? v.map(String) : v ? [String(v)] : []);

export const LOCATION_TOOLS = [
  {
    name: "define_location",
    description:
      'Create or extend a location. Locations are whatever people call places ("Central Texas", "Texas Triangle", "Austin"), nested as a graph: part_of adds parents, includes adds children, excludes carves a child\'s whole subtree out (e.g. Central Texas excludes San Antonio). A place can have several parents. Missing locations named here are created.',
    inputSchema: {
      type: "object",
      properties: {
        name: { type: "string" },
        kind: { type: "string", description: "region, metro, city, state, country, venue, custom" },
        aliases: { type: "array", items: { type: "string" } },
        part_of: { type: "array", items: { type: "string" }, description: "Parent locations" },
        includes: { type: "array", items: { type: "string" }, description: "Child locations" },
        excludes: { type: "array", items: { type: "string" }, description: "Children to carve out" },
        notes: { type: "string" },
      },
      required: ["name"],
    },
  },
  {
    name: "link_location",
    description:
      "Tie a person, organization, or event to a location with a role: based_in, office, hq, works_from, covers (a territory), venue, from. Entities can have any number of these.",
    inputSchema: {
      type: "object",
      properties: {
        subject_type: { type: "string", description: "person, organization, or event_instance" },
        subject: { type: "string", description: "Email or name (person), name (organization), slug (event)" },
        location: { type: "string" },
        role: { type: "string" },
      },
      required: ["subject_type", "subject", "location"],
    },
  },
  {
    name: "who_is_in",
    description:
      "Everyone and every organization tied to a location or anything nested inside it (exclusions applied), with the role and the specific place. Optionally filter by subject type or role.",
    inputSchema: {
      type: "object",
      properties: {
        location: { type: "string" },
        subject_type: { type: "string", description: "person or organization" },
        role: { type: "string" },
      },
      required: ["location"],
    },
    annotations: { readOnlyHint: true },
  },
];

export const LOCATION_HANDLERS: Record<string, Handler> = {
  async define_location(args, env, person) {
    const source = `told:${person.name}`;
    const id = await ensureLocation(env, String(args.name), person, source, args.kind);
    const done: string[] = [];
    if (args.kind || args.notes || args.aliases) {
      await env.CRM.prepare(
        `UPDATE locations SET kind = COALESCE(?, kind), notes = COALESCE(?, notes),
           aliases = (SELECT json_group_array(DISTINCT value) FROM (SELECT value FROM json_each(locations.aliases) UNION SELECT value FROM json_each(?)))
         WHERE id = ?`,
      )
        .bind(args.kind ?? null, args.notes ?? null, JSON.stringify(list(args.aliases)), id)
        .run();
    }
    for (const p of list(args.part_of)) {
      await addEdge(env, await ensureLocation(env, p, person, source), id, "include", person);
      done.push(`inside ${p}`);
    }
    for (const c of list(args.includes)) {
      await addEdge(env, id, await ensureLocation(env, c, person, source), "include", person);
      done.push(`contains ${c}`);
    }
    for (const c of list(args.excludes)) {
      await addEdge(env, id, await ensureLocation(env, c, person, source), "exclude", person);
      done.push(`excludes ${c}`);
    }
    return `Location "${args.name}" saved${done.length ? `: ${done.join(", ")}` : ""}.`;
  },

  async link_location(args, env, person) {
    const type = String(args.subject_type);
    const subjectId = await resolveSubject(env, type, String(args.subject));
    const locationId = await ensureLocation(env, String(args.location), person, `told:${person.name}`);
    const role = String(args.role || "based_in");
    await linkLocationStmt(env, locationId, type, subjectId, role, `told:${person.name}`, person).run();
    return `${args.subject} → ${role} → ${args.location}.`;
  },

  async who_is_in(args, env) {
    const root = await findLocation(env, String(args.location));
    if (!root) return `No location called "${args.location}" yet. define_location creates it.`;
    const { results } = await env.CRM.prepare(
      `WITH RECURSIVE ${SCOPE_CTE}
       SELECT ll.subject_type, ll.role, l.name AS place,
              COALESCE(p.name, o.complete_name, ei.name) AS who,
              (SELECT group_concat(o2.complete_name, '; ') FROM affiliations a JOIN organizations o2 ON o2.id = a.org_id
                 WHERE a.person_id = p.id AND a.ended_at IS NULL) AS orgs
       FROM location_links ll
       JOIN scope s ON s.id = ll.location_id
       JOIN locations l ON l.id = ll.location_id
       LEFT JOIN persons p ON ll.subject_type = 'person' AND p.id = ll.subject_id
       LEFT JOIN organizations o ON ll.subject_type = 'organization' AND o.id = ll.subject_id
       LEFT JOIN event_instances ei ON ll.subject_type = 'event_instance' AND ei.id = ll.subject_id
       WHERE ll.ended_at IS NULL AND (?2 IS NULL OR ll.subject_type = ?2) AND (?3 IS NULL OR ll.role = ?3)
       ORDER BY ll.subject_type, who`,
    )
      .bind(root, args.subject_type ?? null, args.role ?? null)
      .all();
    if (!results.length) return `Nobody is tied to ${args.location} or anywhere inside it yet.`;
    return results
      .map((r: any) => `- ${r.who}${r.orgs ? ` (${r.orgs})` : ""} · ${r.subject_type} · ${r.role} · ${r.place}`)
      .join("\n");
  },
};
