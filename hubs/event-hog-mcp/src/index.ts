// event-hog: a remote MCP server over Cloudflare Artifacts.
//
// One Artifacts repo per event (namespace `event-hog`). Everyone on the team adds
// the same server to Claude as a custom connector, each with their own key in the
// URL, so every write is a git commit authored by the person who made it.
//
// Reads and writes both go through git: the Artifacts binding manages repos and
// mints tokens, but can't write files, so each request clones the repo into an
// in-memory filesystem with isomorphic-git, works on it, and (for writes) commits
// and pushes. A push rejected because a teammate pushed first is retried from a
// fresh clone. Writes add files or append to them, so a retry just re-applies.

import git from "isomorphic-git";
import http from "isomorphic-git/http/web";
import { MemoryFS } from "./memory-fs";
import { CRM_TOOLS, CRM_HANDLERS, recordContact, recordCrmLink } from "./crm";
import { LOCATION_TOOLS, LOCATION_HANDLERS } from "./locations";
import { SKILL_TOOLS, SKILL_HANDLERS, SKILL_PROMPTS } from "./skills";

export interface Env {
  ARTIFACTS: any;
  BRAIN: any;
  BRAIN_NAMESPACE: string;
  SKILLS_REPO: string;
  CRM: any;
  PEOPLE: string;
  ACCOUNT_ID?: string;
  DEFAULT_EVENT: string;
  NAMESPACE: string;
  EVENT_TIMEZONE: string;
}

export interface Person {
  name: string;
  /** Primary address: what commits are authored as. */
  email: string;
  /** Every other address that is this person (work, personal, aliases). */
  emails?: string[];
  /** The address their CRM (HubSpot) knows them by: owners and "created by" match on it. */
  crm_email?: string;
}

/** The address to use anywhere a CRM attributes work to this person. */
export function crmEmail(p: Person): string {
  return (p.crm_email ?? p.email).trim().toLowerCase();
}

/** All of a person's addresses, primary first, lowercased and de-duplicated. */
export function identities(p: Person): string[] {
  return [...new Set([p.email, ...(p.emails ?? []), p.crm_email ?? ""].filter(Boolean).map((e) => e.trim().toLowerCase()))];
}

export const DIR = "/repo";
const SERVER = { name: "event-hog", version: "0.1.0" };
const PROTOCOLS = ["2025-11-25", "2025-06-18", "2025-03-26", "2024-11-05"];

const INSTRUCTIONS = `event-hog is a shared workspace for a team working an event together: prep before, contacts and notes during, follow-ups after. Every write is a git commit attributed to the person using this connector.

How to use it:
- Skills: list_skills shows the team's playbooks; get_skill loads one before doing that kind of work (e.g. augment-speakers-panelists when someone shares a speaker card or asks who a speaker is). get_config returns this person's and the organization's settings for a skill, such as which research tools to use.
- Start with event_brief to see the event, the team, the prep docs, and what's been logged.
- Before logging a contact, search for them: log_contact appends to an existing contact (matched by email, then name) instead of making a duplicate, but a quick search shows what teammates already know.
- log_contact takes whatever the person gives you: a typed note, a badge or business-card photo you've read, or a voice memo transcript. Never invent fields. Leave unknown ones out.
- add_note is for anything that isn't one person: a session takeaway, a theme from the floor, an idea.
- recent_activity shows what teammates logged and when.
- Locations are human-defined and nested (define_location); a person or org can have many (link_location), and who_is_in finds everyone inside a place, nested places included.
- query_crm answers structured questions (who at an org have we met, which orgs relate to which, open follow-ups) from the agnostic-crm database, which log_contact keeps in step with the files.
- CRM: contacts start as hubspot_status pending. If the user has a HubSpot connector, crm_queue lists what's pending. Each pending contact shows who logged it and their HubSpot email: make that HubSpot user the contact owner (find them with search_owners by that email). Propose the HubSpot records, create them only after the user approves, then call mark_crm_synced with the HubSpot ID. Never mark something synced that wasn't created.
- If the HubSpot connection isn't working (no HubSpot connector, sign-in fails, or HubSpot calls error), don't keep retrying and don't stop logging. log_contact is the raw record: it saves every contact to the shared files and the agnostic-crm database whether or not HubSpot works. At each stopping point (end of a conversation, a break, end of the day) run export_hubspot_csv: it writes everyone still pending into a HubSpot-ready import file, committed under exports/, for a bulk import later. Tell the user that's what happened.`;

// ---------------------------------------------------------------- entry point

export default {
  async fetch(request: Request, env: Env): Promise<Response> {
    const url = new URL(request.url);
    const match = url.pathname.match(/^\/mcp\/([A-Za-z0-9_-]{16,})\/?$/);

    if (url.pathname === "/" && request.method === "GET") {
      return new Response("event-hog MCP server. Add <this host>/mcp/<your key> to Claude as a custom connector.\n", {
        headers: { "content-type": "text/plain; charset=utf-8" },
      });
    }
    if (!match) return new Response("Not found", { status: 404 });

    const person = people(env)[match[1]];
    if (!person) return new Response("Unknown connector key", { status: 401 });

    if (request.method !== "POST") {
      return new Response("Method not allowed", { status: 405, headers: { allow: "POST" } });
    }

    let body: any;
    try {
      body = await request.json();
    } catch {
      return rpcResponse({ jsonrpc: "2.0", id: null, error: { code: -32700, message: "Parse error" } });
    }

    if (Array.isArray(body)) {
      const out = (await Promise.all(body.map((m) => handle(m, env, person)))).filter(Boolean);
      return out.length ? rpcResponse(out) : new Response(null, { status: 202 });
    }
    const out = await handle(body, env, person);
    return out ? rpcResponse(out) : new Response(null, { status: 202 });
  },
};

function rpcResponse(payload: unknown): Response {
  return new Response(JSON.stringify(payload), { headers: { "content-type": "application/json" } });
}

function people(env: Env): Record<string, Person> {
  try {
    return JSON.parse(env.PEOPLE || "{}");
  } catch {
    return {};
  }
}

// ---------------------------------------------------------------- JSON-RPC

async function handle(msg: any, env: Env, person: Person): Promise<any | null> {
  const { id, method, params } = msg ?? {};
  const isNotification = id === undefined || id === null;
  const reply = (result: unknown) => ({ jsonrpc: "2.0", id, result });
  const fail = (code: number, message: string) => ({ jsonrpc: "2.0", id, error: { code, message } });

  try {
    switch (method) {
      case "initialize": {
        const requested = params?.protocolVersion;
        return reply({
          protocolVersion: PROTOCOLS.includes(requested) ? requested : PROTOCOLS[0],
          capabilities: { tools: {}, prompts: {} },
          serverInfo: SERVER,
          instructions: INSTRUCTIONS,
        });
      }
      case "ping":
        return reply({});
      case "tools/list":
        return reply({ tools: TOOLS });
      case "tools/call": {
        const tool = HANDLERS[params?.name];
        if (!tool) return fail(-32602, `Unknown tool: ${params?.name}`);
        try {
          const text = await tool(params?.arguments ?? {}, env, person);
          return reply({ content: [{ type: "text", text }] });
        } catch (err: any) {
          return reply({ content: [{ type: "text", text: `Error: ${err?.message ?? String(err)}` }], isError: true });
        }
      }
      case "prompts/list":
        return reply({ prompts: PROMPTS.map(({ text, ...p }) => p) });
      case "prompts/get": {
        const p = PROMPTS.find((x) => x.name === params?.name);
        if (!p) return fail(-32602, `Unknown prompt: ${params?.name}`);
        return reply({ description: p.description, messages: [{ role: "user", content: { type: "text", text: p.text } }] });
      }
      case "resources/list":
        return reply({ resources: [] });
      case "resources/templates/list":
        return reply({ resourceTemplates: [] });
      default:
        if (isNotification) return null;
        return fail(-32601, `Method not found: ${method}`);
    }
  } catch (err: any) {
    return isNotification ? null : fail(-32603, err?.message ?? String(err));
  }
}

// ---------------------------------------------------------------- git workspace

export interface Workspace {
  fs: MemoryFS;
  remote: string;
  onAuth: () => { username: string; password: string };
}

// "event" repos live in the event-hog namespace (one per event instance);
// "brain" repos in hubspot-brain (shared skills and configuration).
export type Space = "event" | "brain";

export async function open(env: Env, event: string, scope: "read" | "write", space: Space = "event"): Promise<Workspace> {
  const ns = space === "brain" ? env.BRAIN_NAMESPACE : env.NAMESPACE;
  const repo = await (space === "brain" ? env.BRAIN : env.ARTIFACTS).get(event);
  try {
    const info = await repo.info();
    const remote: string =
      info?.remote ?? `https://${env.ACCOUNT_ID}.artifacts.cloudflare.net/git/${ns}/${event}.git`;
    const token = await repo.createToken(scope, 600);
    const secret = String(token.plaintext).split("?expires=")[0];
    const onAuth = () => ({ username: "x", password: secret });
    const fs = new MemoryFS();
    await git.clone({ fs, http, dir: DIR, url: remote, ref: "main", singleBranch: true, onAuth });
    return { fs, remote, onAuth };
  } finally {
    repo?.[Symbol.dispose]?.();
  }
}

export async function read(ws: Workspace, path: string): Promise<string | null> {
  try {
    return (await ws.fs.promises.readFile(`${DIR}/${clean(path)}`, "utf8")) as string;
  } catch {
    return null;
  }
}

export async function walk(ws: Workspace, dir = ""): Promise<string[]> {
  const base = dir ? `${DIR}/${dir}` : DIR;
  let names: string[];
  try {
    names = await ws.fs.promises.readdir(base);
  } catch {
    return [];
  }
  const out: string[] = [];
  for (const name of names) {
    if (name === ".git") continue;
    const rel = dir ? `${dir}/${name}` : name;
    const stat = await ws.fs.promises.stat(`${DIR}/${rel}`);
    if (stat.isDirectory()) out.push(...(await walk(ws, rel)));
    else out.push(rel);
  }
  return out;
}

// Clone, apply `change`, commit as `person`, push. Retries from a fresh clone when
// a teammate's push lands first. `change` writes files and returns the paths it
// touched plus a summary for the caller.
export async function write(
  env: Env,
  event: string,
  person: Person,
  message: string,
  change: (ws: Workspace) => Promise<{ paths: string[]; summary: string }>,
  // Runs only after the push lands, so git stays the record; a failure here is
  // reported, not retried, and never undoes the commit.
  after?: (oid: string) => Promise<string>,
  space: Space = "event",
): Promise<string> {
  let lastError: unknown;
  for (let attempt = 0; attempt < 5; attempt++) {
    const ws = await open(env, event, "write", space);
    const { paths, summary } = await change(ws);
    for (const filepath of paths) await git.add({ fs: ws.fs, dir: DIR, filepath });
    const oid = await git.commit({
      fs: ws.fs,
      dir: DIR,
      message,
      author: { name: person.name, email: person.email },
    });
    try {
      const result: any = await git.push({ fs: ws.fs, http, dir: DIR, url: ws.remote, ref: "main", onAuth: ws.onAuth });
      if (result?.ok === false) throw new Error(result?.error ?? "push rejected");
      const saved = `${summary}\n\nSaved as commit ${oid.slice(0, 8)} by ${person.name}.`;
      if (!after) return saved;
      try {
        return `${saved}\n${await after(oid)}`;
      } catch (err: any) {
        return `${saved}\nThe agnostic-crm database didn't take it (${err?.message ?? err}). The git record is safe.`;
      }
    } catch (err) {
      lastError = err;
      await new Promise((r) => setTimeout(r, 150 * (attempt + 1) + Math.random() * 200));
    }
  }
  throw new Error(`Couldn't save after several tries (a teammate may be writing at the same moment): ${String(lastError)}`);
}

// ---------------------------------------------------------------- helpers

function clean(path: string): string {
  const p = String(path ?? "").replace(/^\/+/, "");
  if (!p || p.split("/").some((s) => s === ".." || s === ".git")) throw new Error(`Invalid path: ${path}`);
  return p;
}

export function csvCell(v: unknown): string {
  const s = v == null ? "" : String(v);
  return /[",\n\r]/.test(s) ? `"${s.replace(/"/g, '""')}"` : s;
}

export function slug(s: string): string {
  return String(s ?? "")
    .normalize("NFKD")
    .replace(/[̀-ͯ]/g, "")
    .toLowerCase()
    .replace(/[^a-z0-9]+/g, "-")
    .replace(/^-+|-+$/g, "")
    .slice(0, 60);
}

export function now(env: Env): { stamp: string; date: string; iso: string; zone: string } {
  const d = new Date();
  const parts = Object.fromEntries(
    new Intl.DateTimeFormat("en-US", {
      timeZone: env.EVENT_TIMEZONE,
      year: "numeric",
      month: "2-digit",
      day: "2-digit",
      hour: "2-digit",
      minute: "2-digit",
      hourCycle: "h23",
      timeZoneName: "short",
    })
      .formatToParts(d)
      .map((p) => [p.type, p.value]),
  );
  const date = `${parts.year}-${parts.month}-${parts.day}`;
  return { date, stamp: `${date} ${parts.hour}:${parts.minute} ${parts.timeZoneName}`, iso: d.toISOString(), zone: parts.timeZoneName };
}

export type Front = Record<string, string>;

export function parseFront(text: string): { front: Front; order: string[]; body: string } {
  const m = text.match(/^---\n([\s\S]*?)\n---\n?/);
  if (!m) return { front: {}, order: [], body: text };
  const front: Front = {};
  const order: string[] = [];
  for (const line of m[1].split("\n")) {
    const kv = line.match(/^([A-Za-z0-9_]+):\s?(.*)$/);
    if (!kv) continue;
    let v = kv[2].trim();
    if (v.startsWith('"')) {
      try {
        v = JSON.parse(v);
      } catch {}
    }
    front[kv[1]] = v;
    order.push(kv[1]);
  }
  return { front, order, body: text.slice(m[0].length) };
}

export function renderFront(front: Front, order: string[]): string {
  const keys = [...order, ...Object.keys(front).filter((k) => !order.includes(k))];
  const lines = keys.map((k) => `${k}: ${front[k] ? JSON.stringify(front[k]) : ""}`);
  return `---\n${lines.join("\n")}\n---\n`;
}

const CONTACT_FIELDS = ["name", "company", "title", "email", "phone", "linkedin", "priority"] as const;

// ---------------------------------------------------------------- tools

const eventArg = {
  event: { type: "string", description: "Event repo name. Omit for the current event." },
};

const BASE_TOOLS = [
  {
    name: "whoami",
    description: "Who this connector writes as, and which event is current.",
    inputSchema: { type: "object", properties: {} },
    annotations: { readOnlyHint: true },
  },
  {
    name: "list_events",
    description: "List every event workspace in event-hog.",
    inputSchema: { type: "object", properties: {} },
    annotations: { readOnlyHint: true },
  },
  {
    name: "event_brief",
    description:
      "Start here. The event's README, the team, the prep docs available, and counts of contacts and notes logged so far.",
    inputSchema: { type: "object", properties: { ...eventArg } },
    annotations: { readOnlyHint: true },
  },
  {
    name: "list_files",
    description: "List files in the event workspace, optionally under one folder (e.g. contacts, notes, prep).",
    inputSchema: { type: "object", properties: { dir: { type: "string" }, ...eventArg } },
    annotations: { readOnlyHint: true },
  },
  {
    name: "read_file",
    description: "Read one file from the event workspace, e.g. prep/prep-map.md or contacts/jane-doe--acme.md.",
    inputSchema: { type: "object", properties: { path: { type: "string" }, ...eventArg }, required: ["path"] },
    annotations: { readOnlyHint: true },
  },
  {
    name: "search",
    description:
      "Case-insensitive text search across every file in the event workspace. Use it before logging a contact, or to answer 'who has met someone from X?'.",
    inputSchema: { type: "object", properties: { query: { type: "string" }, ...eventArg }, required: ["query"] },
    annotations: { readOnlyHint: true },
  },
  {
    name: "recent_activity",
    description: "The latest commits: who logged what, and when.",
    inputSchema: { type: "object", properties: { limit: { type: "number" }, ...eventArg } },
    annotations: { readOnlyHint: true },
  },
  {
    name: "log_contact",
    description:
      "Log a person met at the event, plus this touchpoint. If the contact already exists (same email, else same name and company), the touchpoint is appended and blank fields are filled in; nothing is overwritten. Only include fields the user actually gave you.",
    inputSchema: {
      type: "object",
      properties: {
        name: { type: "string" },
        company: { type: "string" },
        title: { type: "string" },
        email: { type: "string" },
        phone: { type: "string" },
        linkedin: { type: "string" },
        priority: { type: "string", description: "A (pursue now), B (follow up), or C (nice to know)" },
        where_met: { type: "string", description: "Booth, session, dinner, hallway..." },
        notes: { type: "string", description: "What was said, what they care about" },
        follow_up: { type: "string", description: "The next step and who owns it" },
        based_in: { type: "string", description: "Where they're based, in whatever words they used (\"Austin\", \"Central Texas\")" },
        ...eventArg,
      },
      required: ["name", "notes"],
    },
  },
  {
    name: "add_note",
    description: "Add a note that isn't about one person: a session takeaway, a theme from the floor, an idea, a to-do.",
    inputSchema: {
      type: "object",
      properties: {
        title: { type: "string" },
        body: { type: "string" },
        kind: { type: "string", description: "session, theme, idea, todo, or general" },
        ...eventArg,
      },
      required: ["title", "body"],
    },
  },
  {
    name: "append_to_file",
    description:
      "Append a dated, attributed line or paragraph to an existing shared file, e.g. mark a prep-map target as met. Appends only; never rewrites.",
    inputSchema: {
      type: "object",
      properties: { path: { type: "string" }, text: { type: "string" }, ...eventArg },
      required: ["path", "text"],
    },
  },
  {
    name: "export_hubspot_csv",
    description:
      "Write every contact still pending for HubSpot into a CSV with HubSpot's import column names (Contact owner is the logger's HubSpot email), commit it under exports/, and return it. Use at stopping points when the HubSpot connection isn't working, so the team can bulk-import later. Contacts stay pending until mark_crm_synced.",
    inputSchema: {
      type: "object",
      properties: {
        include_synced: { type: "boolean", description: "Include contacts already in HubSpot (default false)" },
        ...eventArg,
      },
    },
  },
  {
    name: "crm_queue",
    description: "Contacts not yet in HubSpot (hubspot_status pending), with their fields, ready to propose as HubSpot records.",
    inputSchema: { type: "object", properties: { ...eventArg } },
    annotations: { readOnlyHint: true },
  },
  {
    name: "mark_crm_synced",
    description: "Record that a contact now exists in HubSpot. Call only after the HubSpot record was actually created or found.",
    inputSchema: {
      type: "object",
      properties: {
        path: { type: "string", description: "The contact file, e.g. contacts/jane-doe--acme.md" },
        hubspot_id: { type: "string" },
        hubspot_url: { type: "string" },
        ...eventArg,
      },
      required: ["path", "hubspot_id"],
    },
  },
];

const TOOLS = [...BASE_TOOLS, ...CRM_TOOLS, ...LOCATION_TOOLS, ...SKILL_TOOLS];

export type Handler = (args: any, env: Env, person: Person) => Promise<string>;

const ev = (args: any, env: Env) => (args?.event ? String(args.event) : env.DEFAULT_EVENT);

const HANDLERS: Record<string, Handler> = {
  ...CRM_HANDLERS,
  ...LOCATION_HANDLERS,
  ...SKILL_HANDLERS,
  async whoami(_args, env, person) {
    const [primary, ...others] = identities(person);
    const also = others.length ? ` Also known as: ${others.join(", ")}.` : "";
    return `You are ${person.name} <${primary}> (commits are authored as this address).${also} HubSpot knows you as ${crmEmail(person)}. Current event: ${env.DEFAULT_EVENT}.`;
  },

  async list_events(_args, env) {
    const page = await env.ARTIFACTS.list({ limit: 100 });
    const names = (page?.repos ?? []).map((r: any) => r.name);
    return names.length ? names.map((n: string) => `- ${n}${n === env.DEFAULT_EVENT ? " (current)" : ""}`).join("\n") : "No events yet.";
  },

  async event_brief(args, env, person) {
    const ws = await open(env, ev(args, env), "read");
    const files = await walk(ws);
    const readme = (await read(ws, "README.md")) ?? "(no README.md)";
    const count = (dir: string) => files.filter((f) => f.startsWith(`${dir}/`) && f.endsWith(".md")).length;
    const docs = files.filter((f) => !f.startsWith("contacts/") && !f.startsWith("notes/") && f !== "README.md");
    return [
      readme.trim(),
      "",
      "---",
      `Contacts logged: ${count("contacts")} · Notes: ${count("notes")}`,
      `Other docs:\n${docs.map((d) => `- ${d}`).join("\n") || "- (none)"}`,
      `You're writing as ${person.name}.`,
    ].join("\n");
  },

  async list_files(args, env) {
    const ws = await open(env, ev(args, env), "read");
    const dir = args?.dir ? clean(args.dir).replace(/\/+$/, "") : "";
    const files = await walk(ws, dir);
    return files.length ? files.map((f) => `- ${f}`).join("\n") : "No files there.";
  },

  async read_file(args, env) {
    const ws = await open(env, ev(args, env), "read");
    const text = await read(ws, args.path);
    if (text === null) throw new Error(`No file at ${args.path}. Try list_files.`);
    return text;
  },

  async search(args, env) {
    const q = String(args.query ?? "").toLowerCase().trim();
    if (!q) throw new Error("Give a search query.");
    const ws = await open(env, ev(args, env), "read");
    const hits: string[] = [];
    for (const f of await walk(ws)) {
      const text = (await read(ws, f)) ?? "";
      text.split("\n").forEach((line, i) => {
        if (hits.length < 60 && line.toLowerCase().includes(q)) hits.push(`${f}:${i + 1}: ${line.trim().slice(0, 200)}`);
      });
    }
    return hits.length ? hits.join("\n") : `Nothing matches "${args.query}".`;
  },

  async recent_activity(args, env) {
    const ws = await open(env, ev(args, env), "read");
    const limit = Math.min(Math.max(Number(args?.limit) || 15, 1), 50);
    const log = await git.log({ fs: ws.fs, dir: DIR, depth: limit });
    const fmt = new Intl.DateTimeFormat("en-US", {
      timeZone: env.EVENT_TIMEZONE,
      weekday: "short",
      hour: "numeric",
      minute: "2-digit",
    });
    return log
      .map((c: any) => `- ${fmt.format(new Date(c.commit.author.timestamp * 1000))} · ${c.commit.author.name} · ${c.commit.message.trim().split("\n")[0]}`)
      .join("\n");
  },

  async log_contact(args, env, person) {
    if (!args?.name || !args?.notes) throw new Error("A contact needs at least a name and notes.");
    const email = String(args.email ?? "").trim().toLowerCase();
    const teammate = email ? Object.values(people(env)).find((p) => identities(p).includes(email)) : undefined;
    if (teammate) throw new Error(`${email} is ${teammate.name}, a teammate on this workspace, not a contact. Use add_note for team notes.`);
    const event = ev(args, env);
    const nameSlug = slug(args.name);
    if (!nameSlug) throw new Error("That name has no letters or digits to file it under.");
    const fileName = args.company ? `${nameSlug}--${slug(args.company)}` : nameSlug;
    let created = false;
    let path = "";

    return write(env, event, person, `contact: ${args.name}${args.company ? ` (${args.company})` : ""}`, async (ws) => {
      const t = now(env);
      const existing = await findContact(ws, args, nameSlug, fileName);
      path = existing ?? `contacts/${fileName}.md`;
      created = !existing;

      const touch = [
        `### ${t.stamp} · ${person.name}`,
        args.where_met ? `- **Where:** ${args.where_met}` : null,
        `- **Notes:** ${args.notes}`,
        args.follow_up ? `- **Follow-up:** ${args.follow_up}` : null,
        "",
      ]
        .filter((l) => l !== null)
        .join("\n");

      let text: string;
      if (existing) {
        const parsed = parseFront((await read(ws, existing)) ?? "");
        for (const k of CONTACT_FIELDS) if (args[k] && !parsed.front[k]) parsed.front[k] = String(args[k]);
        text = renderFront(parsed.front, parsed.order) + parsed.body.replace(/\s*$/, "\n\n") + touch;
      } else {
        const front: Front = {};
        for (const k of CONTACT_FIELDS) front[k] = args[k] ? String(args[k]) : "";
        Object.assign(front, {
          event,
          first_logged_by: person.name,
          first_logged_by_email: crmEmail(person),
          first_logged_at: t.iso,
          hubspot_status: "pending",
          hubspot_id: "",
          hubspot_url: "",
        });
        const heading = `# ${args.name}${args.company ? ` · ${args.company}` : ""}${args.title ? `\n\n${args.title}` : ""}`;
        text = `${renderFront(front, Object.keys(front))}\n${heading}\n\n## Touchpoints\n\n${touch}`;
      }
      await ws.fs.promises.writeFile(`${DIR}/${path}`, text);
      return {
        paths: [path],
        summary: `${created ? "New contact" : "Added a touchpoint to existing contact"}: ${path}${created ? "" : " (found by email or name; nothing was overwritten)"}. HubSpot status: pending.`,
      };
    }, (oid) => recordContact(env, person, event, args, path, oid));
  },

  async add_note(args, env, person) {
    if (!args?.title || !args?.body) throw new Error("A note needs a title and a body.");
    const kind = slug(args.kind || "general") || "general";
    return write(env, ev(args, env), person, `note (${kind}): ${args.title}`, async (ws) => {
      const t = now(env);
      const path = `notes/${t.date}_${slug(person.name)}_${slug(args.title) || "note"}-${t.iso.slice(11, 19).replace(/:/g, "")}.md`;
      const front: Front = { title: String(args.title), kind, author: person.name, created_at: t.iso };
      await ws.fs.promises.writeFile(`${DIR}/${path}`, `${renderFront(front, Object.keys(front))}\n# ${args.title}\n\n${String(args.body).trim()}\n`);
      return { paths: [path], summary: `Note saved: ${path}` };
    });
  },

  async append_to_file(args, env, person) {
    const path = clean(args.path);
    return write(env, ev(args, env), person, `update: ${path}`, async (ws) => {
      const current = await read(ws, path);
      if (current === null) throw new Error(`No file at ${path}. append_to_file only adds to existing files.`);
      const t = now(env);
      await ws.fs.promises.writeFile(`${DIR}/${path}`, `${current.replace(/\s*$/, "\n\n")}> ${t.stamp} · ${person.name}: ${String(args.text).trim()}\n`);
      return { paths: [path], summary: `Appended to ${path}.` };
    });
  },

  async export_hubspot_csv(args, env, person) {
    const event = ev(args, env);
    let rows = 0;
    let preview = "";
    return write(env, event, person, "export: HubSpot import CSV", async (ws) => {
      const cols = [
        "Email",
        "First Name",
        "Last Name",
        "Company Name",
        "Job Title",
        "Phone Number",
        "LinkedIn URL",
        "Contact owner",
        "Event",
        "Priority",
        "Event-hog file",
      ];
      const lines = [cols.map(csvCell).join(",")];
      for (const f of (await walk(ws, "contacts")).filter((x) => x.endsWith(".md"))) {
        const { front } = parseFront((await read(ws, f)) ?? "");
        if (!args?.include_synced && (front.hubspot_status || "pending") !== "pending") continue;
        // HubSpot imports want first and last name apart. Split on the first
        // space so particles stay with the surname ("Pablo" / "De Luynes");
        // single names go in First Name. Check odd names before importing.
        const name = String(front.name ?? "").trim();
        const cut = name.indexOf(" ");
        const first = cut > 0 ? name.slice(0, cut) : name;
        const last = cut > 0 ? name.slice(cut + 1) : "";
        lines.push(
          [front.email, first, last, front.company, front.title, front.phone, front.linkedin, front.first_logged_by_email, front.event, front.priority, f]
            .map(csvCell)
            .join(","),
        );
        rows++;
      }
      if (!rows) throw new Error("Nothing pending for HubSpot, so there's nothing to export.");
      const t = now(env);
      const path = `exports/hubspot-contacts_${t.date}_${t.iso.slice(11, 16).replace(":", "")}.csv`;
      const csv = lines.join("\n") + "\n";
      preview = lines.slice(0, 6).join("\n");
      await ws.fs.promises.writeFile(`${DIR}/${path}`, csv);
      return {
        paths: [path],
        summary: `Wrote ${rows} contact(s) to ${path} for a HubSpot import (Contacts object; map "Contact owner" by email, and leave Event, Priority and Event-hog file unmapped or as custom properties). They stay pending until imported and marked synced.\n\n${preview}${rows > 5 ? "\n…" : ""}`,
      };
    });
  },

  async crm_queue(args, env) {
    const ws = await open(env, ev(args, env), "read");
    const rows: string[] = [];
    for (const f of (await walk(ws, "contacts")).filter((x) => x.endsWith(".md"))) {
      const { front } = parseFront((await read(ws, f)) ?? "");
      if ((front.hubspot_status || "pending") !== "pending") continue;
      const fields = CONTACT_FIELDS.filter((k) => front[k]).map((k) => `${k}: ${front[k]}`).join(" · ");
      const by = front.first_logged_by_email ? `${front.first_logged_by} <${front.first_logged_by_email}>` : front.first_logged_by || "?";
      rows.push(`- ${f} — ${fields} · first logged by ${by} (HubSpot owner: the HubSpot user with that email)`);
    }
    return rows.length ? `${rows.length} contact(s) pending for HubSpot:\n${rows.join("\n")}` : "Nothing pending for HubSpot.";
  },

  async mark_crm_synced(args, env, person) {
    const path = clean(args.path);
    if (!path.startsWith("contacts/")) throw new Error("mark_crm_synced only applies to files under contacts/.");
    return write(env, ev(args, env), person, `crm: ${path} -> HubSpot ${args.hubspot_id}`, async (ws) => {
      const text = await read(ws, path);
      if (text === null) throw new Error(`No contact at ${path}.`);
      const parsed = parseFront(text);
      parsed.front.hubspot_status = "synced";
      parsed.front.hubspot_id = String(args.hubspot_id);
      if (args.hubspot_url) parsed.front.hubspot_url = String(args.hubspot_url);
      parsed.front.hubspot_synced_by = person.name;
      await ws.fs.promises.writeFile(`${DIR}/${path}`, renderFront(parsed.front, parsed.order) + parsed.body);
      return { paths: [path], summary: `${path} marked as in HubSpot (${args.hubspot_id}).` };
    }, () => recordCrmLink(env, person, path, String(args.hubspot_id), args.hubspot_url ? String(args.hubspot_url) : null));
  },
};

async function findContact(ws: Workspace, args: any, nameSlug: string, fileName: string): Promise<string | null> {
  const files = (await walk(ws, "contacts")).filter((f) => f.endsWith(".md"));
  const email = String(args.email ?? "").trim().toLowerCase();
  if (email) {
    for (const f of files) {
      const { front } = parseFront((await read(ws, f)) ?? "");
      if (String(front.email ?? "").toLowerCase() === email) return f;
    }
  }
  if (files.includes(`contacts/${fileName}.md`)) return `contacts/${fileName}.md`;
  if (!args.company) {
    const sameName = files.filter((f) => f === `contacts/${nameSlug}.md` || f.startsWith(`contacts/${nameSlug}--`));
    if (sameName.length === 1) return sameName[0];
  }
  return null;
}

// ---------------------------------------------------------------- prompts

const BASE_PROMPTS = [
  {
    name: "log-from-badge",
    description: "Log a contact from a badge or business-card photo.",
    text: "I'm attaching a photo of a badge or business card from someone I just met. Read the name, company, title, and any email, phone, or LinkedIn from it. Search event-hog for them first. Then ask me for one or two lines on what we talked about and any follow-up, and log the contact with log_contact. Don't guess any field the photo doesn't show.",
  },
  {
    name: "daily-brief",
    description: "What the team did today and who to find next.",
    text: "Use event-hog: run event_brief and recent_activity, then read the prep map. Tell me in a short, phone-friendly list: who the team met today and by whom, which A-priority targets from the prep map nobody has met yet, and the follow-ups that are still open.",
  },
  {
    name: "crm-sync",
    description: "Move pending event contacts into HubSpot, with review.",
    text: "Run crm_queue in event-hog. For each pending contact, check HubSpot for an existing contact (by email, then name and company). Set each contact's owner to the HubSpot user whose email is shown as who logged it (use search_owners). Show me one table of what you'd create or update in HubSpot, including the owner. After I approve, create them, then call mark_crm_synced for each with the HubSpot ID. If HubSpot isn't connected or its calls fail, run export_hubspot_csv instead and tell me where the file is.",
  },
];

const PROMPTS = [...BASE_PROMPTS, ...SKILL_PROMPTS];
