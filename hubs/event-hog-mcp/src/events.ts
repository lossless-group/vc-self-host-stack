// Events as a whole: starting a new event workspace from the kit, and working
// out which event "current" means today.
//
// new_event creates the Artifacts repo, seeds it from the kit's templates/event/
// (README filled in, prep/event.md written), and records the organizer, series,
// and instance in agnostic-crm, so the next event starts the way the last one
// ended up, not from a blank page.

import git from "isomorphic-git";
import http from "isomorphic-git/http/web";
import type { Env, Handler, Person } from "./index";
import { DIR, open, read, walk, slug, people } from "./index";
import { MemoryFS } from "./memory-fs";
import { ensureOrg } from "./crm";
import { ensureLocation, linkLocationStmt, addEdge } from "./locations";

const TEMPLATE = "templates/event";
const DAY = 86_400_000;
const isDate = (s: unknown) => typeof s === "string" && /^\d{4}-\d{2}-\d{2}$/.test(s) && !isNaN(Date.parse(s));

// ---------------------------------------------------------------- current event

type Instance = { slug: string; starts_on: string | null; ends_on: string | null; time_zone: string | null; name: string };

async function instances(env: Env): Promise<Instance[]> {
  const { results } = await env.CRM.prepare(
    "SELECT slug, name, starts_on, ends_on, time_zone FROM event_instances WHERE artifacts_repo IS NOT NULL ORDER BY starts_on",
  ).all();
  return results as Instance[];
}

// Which event a call means when it doesn't name one. In order: an event on
// today; one that ended in the last 7 days (follow-ups); the next one coming
// up; the most recent past one; the deployment's DEFAULT_EVENT.
export function pickCurrent(list: Instance[], today: string, fallback: string): string {
  const t = Date.parse(today);
  const start = (i: Instance) => Date.parse(i.starts_on ?? "");
  const end = (i: Instance) => Date.parse(i.ends_on ?? i.starts_on ?? "");
  const dated = list.filter((i) => !isNaN(start(i)));
  const ongoing = dated.filter((i) => start(i) <= t && t <= end(i));
  if (ongoing.length) return ongoing[0].slug;
  const recent = dated.filter((i) => end(i) < t && t - end(i) <= 7 * DAY).sort((a, b) => end(b) - end(a));
  if (recent.length) return recent[0].slug;
  const next = dated.filter((i) => start(i) > t);
  if (next.length) return next[0].slug;
  const past = dated.filter((i) => end(i) < t).sort((a, b) => end(b) - end(a));
  return past[0]?.slug ?? fallback;
}

// A copy of env whose DEFAULT_EVENT and EVENT_TIMEZONE are today's event's.
// Falls back to the configured values if the database can't be read.
export async function withCurrentEvent(env: Env): Promise<Env> {
  try {
    const list = await instances(env);
    const current = pickCurrent(list, new Date().toISOString().slice(0, 10), env.DEFAULT_EVENT);
    const zone = list.find((i) => i.slug === current)?.time_zone;
    return { ...env, DEFAULT_EVENT: current, EVENT_TIMEZONE: zone || env.EVENT_TIMEZONE };
  } catch {
    return env;
  }
}

// A call that names an event reads times in that event's zone.
export async function forEvent(env: Env, event: unknown): Promise<Env> {
  if (!event || event === env.DEFAULT_EVENT) return env;
  try {
    const row = await env.CRM.prepare("SELECT time_zone FROM event_instances WHERE slug = ?").bind(String(event)).first();
    return row?.time_zone ? { ...env, EVENT_TIMEZONE: row.time_zone as string } : env;
  } catch {
    return env;
  }
}

export async function eventsTable(env: Env): Promise<Instance[] | null> {
  try {
    return await instances(env);
  } catch {
    return null;
  }
}

// ---------------------------------------------------------------- new_event

function validZone(zone: string): boolean {
  try {
    new Intl.DateTimeFormat("en-US", { timeZone: zone });
    return true;
  } catch {
    return false;
  }
}

// "Sun Oct 25 – Wed Oct 28, 2026 (Central Time)"
function whenLine(starts: string, ends: string | undefined, zone: string): string {
  const day = (d: string) => {
    const p = Object.fromEntries(
      new Intl.DateTimeFormat("en-US", { timeZone: "UTC", weekday: "short", month: "short", day: "numeric" })
        .formatToParts(new Date(d))
        .map((x) => [x.type, x.value]),
    );
    return `${p.weekday} ${p.month} ${p.day}`;
  };
  const year = starts.slice(0, 4);
  const zoneName =
    new Intl.DateTimeFormat("en-US", { timeZone: zone, timeZoneName: "longGeneric" })
      .formatToParts(new Date(starts))
      .find((p) => p.type === "timeZoneName")?.value ?? zone;
  const range = ends && ends !== starts ? `${day(starts)} – ${day(ends)}` : day(starts);
  return `${range}, ${year} (${zoneName})`;
}

// Repo names: "2026-10-7x24-exchange-fall". The year and month lead, so the
// list sorts by date; years inside the name are dropped as redundant.
export function eventSlug(starts: string, label: string): string {
  const words = slug(label.replace(/\b(19|20)\d{2}\b/g, " ")).slice(0, 48).replace(/-+$/, "");
  return `${starts.slice(0, 7)}-${words}`;
}

function eventDoc(a: any, person: Person, date: string): string {
  const lines = [
    "---",
    `title: ${JSON.stringify(a.name)}`,
    ...(a.website ? [`url: ${a.website}`] : []),
    ...(a.organizer ? [`organizer: ${JSON.stringify(a.organizer)}`] : []),
    ...(a.series ? [`series: ${JSON.stringify(a.series)}`] : []),
    `starts_on: ${a.starts_on}`,
    ...(a.ends_on ? [`ends_on: ${a.ends_on}`] : []),
    `time_zone: ${a.time_zone}`,
    `date_created: ${date}`,
    `date_modified: ${date}`,
    `created_by: ${person.name}`,
    "publish: false",
    "tags:",
    "  - Event-Instance",
    "---",
    `# ${a.name}`,
    "",
    `**Official name:** ${a.name}`,
    `**Dates:** ${whenLine(a.starts_on, a.ends_on, a.time_zone)}`,
    ...(a.venue || a.city ? [`**Venue:** ${[a.venue, a.city].filter(Boolean).join(", ")}`] : []),
    ...(a.organizer ? [`**Organizer:** ${a.organizer}`] : []),
    ...(a.series ? [`**Series:** ${a.series}${a.cadence ? ` (${a.cadence})` : ""}`] : []),
    ...(a.website ? [`**Website:** ${a.website}`] : []),
    "",
    ...(a.why ? ["## Why we're going", "", a.why, ""] : []),
    "## Still to research",
    "",
    "Run the event-prep skill to fill this in from the event's own pages:",
    "",
    "- Who is in the room (attendee mix, size)",
    "- Agenda, day by day, with the sessions that matter to us marked",
    "- Speakers, sponsors and exhibitors worth meeting (→ `prep/prep-map.md`)",
    "- How the team splits the room",
    "- Sources (→ `prep/sources.md`)",
    "",
  ];
  return lines.join("\n");
}

export const EVENT_TOOLS = [
  {
    name: "new_event",
    description:
      "Start a new event workspace: creates the event's shared repo from the team's kit template (folders, README, Contacts__Met.csv), writes prep/event.md, and records the organizer, series, and dates in the agnostic-crm database. Confirm the official name, dates, city, and time zone with the person before calling; never guess dates. Afterwards, offer to run the event-prep skill to research the event. Tools default to whichever event is on today (or just ended, or is next), so pass `event` to work on another.",
    inputSchema: {
      type: "object",
      properties: {
        name: { type: "string", description: 'Official name of this occurrence, e.g. "7x24 Exchange Conferences 2026 Fall Conference"' },
        short_name: { type: "string", description: 'Short name for the workspace slug, e.g. "7x24 Exchange Fall". Defaults to the name.' },
        starts_on: { type: "string", description: "YYYY-MM-DD" },
        ends_on: { type: "string", description: "YYYY-MM-DD" },
        time_zone: { type: "string", description: 'IANA time zone where the event is, e.g. "America/Chicago"' },
        city: { type: "string", description: 'e.g. "San Antonio, TX"' },
        venue: { type: "string" },
        website: { type: "string" },
        organizer: { type: "string", description: "The organization that runs it (the Event Organizer)" },
        series: { type: "string", description: 'The recurring series it belongs to, e.g. "7x24 Exchange Conferences"' },
        cadence: { type: "string", description: "annual, semiannual (Spring and Fall), one-off…" },
        team: { type: "string", description: 'Who is going and for whom, e.g. "Michael Staton (The Lossless Group) · Tanuj and Hursh (Edviro Energy)". Defaults to everyone on the connector.' },
        why: { type: "string", description: "Why we're going, in a sentence or two" },
        slug: { type: "string", description: "Override the workspace name (lowercase, hyphens). Normally derived: YYYY-MM-short-name." },
      },
      required: ["name", "starts_on", "time_zone"],
    },
  },
];

export const EVENT_HANDLERS: Record<string, Handler> = {
  async new_event(args, env, person) {
    const a = { ...args, name: String(args.name ?? "").trim() };
    if (!a.name) throw new Error("Give the event's official name.");
    if (!isDate(a.starts_on)) throw new Error("starts_on must be a date like 2026-10-25.");
    if (a.ends_on && !isDate(a.ends_on)) throw new Error("ends_on must be a date like 2026-10-28.");
    if (a.ends_on && a.ends_on < a.starts_on) throw new Error("ends_on is before starts_on.");
    if (!validZone(String(a.time_zone))) throw new Error(`"${a.time_zone}" isn't a time zone. Use an IANA name like America/Chicago.`);

    const name = a.slug ? String(a.slug) : eventSlug(a.starts_on, a.short_name || a.name);
    if (!/^[a-z0-9][a-z0-9-]{2,62}$/.test(name)) throw new Error(`"${name}" can't be a workspace name: lowercase letters, digits, and hyphens only.`);
    if (name === env.KIT_REPO) throw new Error(`"${name}" is the kit's name.`);
    let exists = false;
    try {
      const repo = await env.ARTIFACTS.get(name);
      repo?.[Symbol.dispose]?.();
      exists = true;
    } catch {}
    if (exists) throw new Error(`There's already a workspace called ${name}. Use it (event: "${name}"), or pass a different slug.`);

    // The kit's template, as it is today.
    const kit = await open(env, env.KIT_REPO, "read");
    const paths = (await walk(kit, TEMPLATE)).filter((p) => p !== `${TEMPLATE}/prep/event.md`);
    if (!paths.length) throw new Error(`The kit has no ${TEMPLATE}/. Nothing to start from.`);
    const team = a.team || Object.values(people(env)).map((p) => p.name).join(" · ");
    const fill: Record<string, string> = {
      "Event name": a.name,
      City: a.city || a.venue || "location TBD",
      "who's attending, and for whom": team,
      dates: whenLine(a.starts_on, a.ends_on, a.time_zone).replace(/ \([^)]*\)$/, ""),
      "time zone": whenLine(a.starts_on, a.ends_on, a.time_zone).match(/\(([^)]*)\)$/)?.[1] ?? a.time_zone,
    };
    const date = new Intl.DateTimeFormat("en-CA", { timeZone: a.time_zone }).format(new Date());
    const files: Record<string, string> = {};
    for (const p of paths) {
      let text = (await read(kit, p)) ?? "";
      if (p === `${TEMPLATE}/README.md`) text = text.replace(/\{\{([^}]+)\}\}/g, (m, key) => fill[key.trim()] ?? m);
      files[p.slice(TEMPLATE.length + 1)] = text;
    }
    files["prep/event.md"] = eventDoc(a, person, date);
    delete files["prep/.gitkeep"];

    // Create the repo and push the first commit.
    const created = await env.ARTIFACTS.create(name, { description: a.name, setDefaultBranch: "main" });
    let commit = "";
    try {
      const fs = new MemoryFS();
      await git.init({ fs, dir: DIR, defaultBranch: "main" });
      for (const [p, text] of Object.entries(files)) {
        await fs.promises.writeFile(`${DIR}/${p}`, text);
        await git.add({ fs, dir: DIR, filepath: p });
      }
      const oid = await git.commit({
        fs,
        dir: DIR,
        message: `new event: ${a.name}\n\nStarted from ${env.KIT_REPO}/${TEMPLATE}.`,
        author: { name: person.name, email: person.email },
      });
      const secret = String(created.token).split("?expires=")[0];
      const pushed: any = await git.push({
        fs,
        http,
        dir: DIR,
        url: created.remote,
        ref: "main",
        onAuth: () => ({ username: "x", password: secret }),
      });
      if (pushed?.ok === false) throw new Error(pushed?.error ?? "push rejected");
      commit = oid.slice(0, 8);
    } catch (err: any) {
      // Don't leave an empty workspace behind for the next try to trip on.
      await env.ARTIFACTS.delete(name).catch(() => {});
      throw new Error(`Couldn't set up the workspace: ${err?.message ?? err}`);
    }

    // The database: organizer, series, instance, and where it is.
    const db: string[] = [];
    try {
      const at = new Date().toISOString();
      const orgId = a.organizer ? await ensureOrg(env, a.organizer, "event-hog") : null;
      let seriesId: string | null = null;
      if (a.series) {
        await env.CRM.prepare(
          "INSERT OR IGNORE INTO event_series (id, slug, name, organizer_org_id, cadence, source, first_seen_at) VALUES (?, ?, ?, ?, ?, 'event-hog', ?)",
        )
          .bind(crypto.randomUUID(), slug(a.series), a.series, orgId, a.cadence ?? null, at)
          .run();
        seriesId = (await env.CRM.prepare("SELECT id FROM event_series WHERE slug = ?").bind(slug(a.series)).first())?.id ?? null;
      }
      await env.CRM.prepare(
        `INSERT INTO event_instances (id, series_id, slug, name, starts_on, ends_on, venue, city, website, artifacts_repo, time_zone, source, first_seen_at)
         VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, 'event-hog', ?)
         ON CONFLICT (slug) DO UPDATE SET series_id = excluded.series_id, name = excluded.name, starts_on = excluded.starts_on,
           ends_on = excluded.ends_on, venue = excluded.venue, city = excluded.city, website = excluded.website,
           artifacts_repo = excluded.artifacts_repo, time_zone = excluded.time_zone`,
      )
        .bind(crypto.randomUUID(), seriesId, name, a.name, a.starts_on, a.ends_on ?? null, a.venue ?? null, a.city ?? null, a.website ?? null, `${env.NAMESPACE}/${name}`, a.time_zone, at)
        .run();
      const instanceId = (await env.CRM.prepare("SELECT id FROM event_instances WHERE slug = ?").bind(name).first())?.id as string;
      db.push(`instance${a.series ? `, series "${a.series}"` : ""}${a.organizer ? `, organizer "${a.organizer}"` : ""}`);

      // The venue sits inside the city, so who_is_in on the city finds the event.
      const cityId = a.city ? await ensureLocation(env, a.city, person, "event-hog", "city") : null;
      const venueId = a.venue ? await ensureLocation(env, a.venue, person, "event-hog", "venue") : null;
      if (cityId && venueId) await addEdge(env, cityId, venueId, "include", person);
      const where = venueId ?? cityId;
      if (where) {
        await linkLocationStmt(env, where, "event_instance", instanceId, "venue", "event-hog", person).run();
        db.push(`location ${[a.venue, a.city].filter(Boolean).join(" in ")}`);
      }
    } catch (err: any) {
      db.push(`(the database didn't take all of it: ${err?.message ?? err}; the workspace is fine)`);
    }

    const current = pickCurrent(
      [...((await eventsTable(env)) ?? [])],
      new Date().toISOString().slice(0, 10),
      env.DEFAULT_EVENT,
    );
    return [
      `Started ${name}: "${a.name}", ${whenLine(a.starts_on, a.ends_on, a.time_zone)}.`,
      `Workspace files: ${Object.keys(files).sort().join(", ")}.`,
      `Database: ${db.join("; ")}.`,
      `Saved as commit ${commit} by ${person.name}.`,
      "",
      current === name
        ? "It's now the current event: tools use it when no event is named."
        : `The current event is still ${current} (tools default to the event on today, then one that just ended, then the next one). Pass event: "${name}" to work on this one.`,
      "Next: offer to run the event-prep skill to research the event and fill prep/.",
    ].join("\n");
  },
};
