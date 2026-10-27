// The skills plane: shared agent-skills and per-person/per-org configuration,
// served from Artifacts repos, so a skill edited in git reaches every client on
// its next call. Plus the first skill's write path: save_speaker_profile.
//
// Skills come from two places, in order:
//   1. event-hog-kit (event-hog namespace), skills/<name>/: event-hog's own,
//      CRM-agnostic package. Its copy wins when a name exists in both.
//   2. the deployment's CRM brain (hubspot-brain/agent-skills): CRM-specific.
// Per-person config lives in the kit (config/skills.json).

import type { Env, Handler, Person, Space, Workspace } from "./index";
import { DIR, open, read, walk, write, parseFront, slug, now, crmEmail } from "./index";
import { ensureInstance, ensureOrg, findOrg, findPerson } from "./crm";

const CONFIG_PATH = "config/skills.json";

// config/skills.json:
//   { "org":    { "<skill>": { ...settings } },
//     "people": { "<crm email>": { "<skill>": { ...overrides } } } }
// A person's settings win key by key over the org's.
async function loadConfig(ws: Workspace): Promise<any> {
  const text = await read(ws, CONFIG_PATH);
  if (!text) return { org: {}, people: {} };
  try {
    const c = JSON.parse(text);
    return { org: c.org ?? {}, people: c.people ?? {} };
  } catch {
    throw new Error(`${CONFIG_PATH} isn't valid JSON. Fix it in the brain repo.`);
  }
}

type Source = { space: Space; repo: string; prefix: string; label: string };
const sources = (env: Env): Source[] => [
  { space: "event", repo: env.KIT_REPO, prefix: "skills/", label: env.KIT_REPO },
  { space: "brain", repo: env.SKILLS_REPO, prefix: "", label: `${env.BRAIN_NAMESPACE}/${env.SKILLS_REPO}` },
];
const openKit = (env: Env, scope: "read" | "write") => open(env, env.KIT_REPO, scope, "event");

async function skillNames(ws: Workspace, prefix = ""): Promise<{ name: string; description: string }[]> {
  const out: { name: string; description: string }[] = [];
  for (const f of await walk(ws, prefix.replace(/\/$/, ""))) {
    const m = f.slice(prefix.length).match(/^([^/]+)\/SKILL\.md$/);
    if (!m) continue;
    const { front } = parseFront((await read(ws, f)) ?? "");
    out.push({ name: front.name || m[1], description: front.description || "" });
  }
  return out.sort((a, b) => a.name.localeCompare(b.name));
}

const ev = (args: any, env: Env) => (args?.event ? String(args.event) : env.DEFAULT_EVENT);

type Link = { url?: string; [k: string]: unknown };
const links = (v: unknown): Link[] => (Array.isArray(v) ? (v as Link[]).filter((x) => x && typeof x.url === "string" && x.url) : []);

export const SKILL_TOOLS = [
  {
    name: "list_skills",
    description: "The team's shared skills (playbooks): name and a one-line description each. Load one with get_skill before doing that kind of work.",
    inputSchema: { type: "object", properties: {} },
    annotations: { readOnlyHint: true },
  },
  {
    name: "get_skill",
    description: "Load a skill's instructions (SKILL.md), or one of its reference files. Follow them for the task at hand.",
    inputSchema: {
      type: "object",
      properties: { name: { type: "string" }, file: { type: "string", description: "Optional file inside the skill, e.g. references/tool-map.md" } },
      required: ["name"],
    },
    annotations: { readOnlyHint: true },
  },
  {
    name: "get_config",
    description: "This person's settings for a skill, merged over the organization's defaults: e.g. which research tools to use, in order, and limits.",
    inputSchema: { type: "object", properties: { skill: { type: "string" } }, required: ["skill"] },
    annotations: { readOnlyHint: true },
  },
  {
    name: "set_my_research_tools",
    description:
      "Record which web-research tools this person has, in order of preference (e.g. Firecrawl, Tavily, Origami, or the chat app's built-in web search), so research skills use them without asking again. Only what the person said they have.",
    inputSchema: {
      type: "object",
      properties: {
        tools: {
          type: "array",
          items: {
            type: "object",
            properties: { name: { type: "string" }, use_for: { type: "string" }, how: { type: "string" } },
            required: ["name"],
          },
        },
        skill: { type: "string", description: "Defaults to augment-speakers-panelists" },
      },
      required: ["tools"],
    },
  },
  {
    name: "save_speaker_profile",
    description:
      "Save a researched speaker or panelist profile (from the augment-speakers-panelists skill): speakers/<name>.md in the event workspace, plus one observation per link in agnostic-crm with the URL as its source. Saving the same person again only adds links not already there. Only include links you actually retrieved.",
    inputSchema: {
      type: "object",
      properties: {
        name: { type: "string" },
        organization: { type: "string" },
        title: { type: "string" },
        session: { type: "string", description: "Session or panel title" },
        session_time: { type: "string" },
        why: { type: "string", description: "One line: why they matter for this event" },
        identity_confidence: { type: "string", description: "high, medium, or low" },
        socials: { type: "array", items: { type: "object", properties: { platform: { type: "string" }, url: { type: "string" } }, required: ["url"] } },
        organization_socials: {
          type: "array",
          description: "The organization's own accounts (LinkedIn company page, X, YouTube…), found and confirmed, for tagging it in posts",
          items: { type: "object", properties: { platform: { type: "string" }, url: { type: "string" } }, required: ["url"] },
        },
        features: {
          type: "array",
          items: { type: "object", properties: { date: { type: "string" }, outlet: { type: "string" }, title: { type: "string" }, url: { type: "string" }, why: { type: "string" } }, required: ["url"] },
        },
        mentions: {
          type: "array",
          items: { type: "object", properties: { date: { type: "string" }, outlet: { type: "string" }, title: { type: "string" }, url: { type: "string" }, why: { type: "string" } }, required: ["url"] },
        },
        videos: {
          type: "array",
          items: { type: "object", properties: { date: { type: "string" }, title: { type: "string" }, channel: { type: "string" }, url: { type: "string" }, length: { type: "string" } }, required: ["url"] },
        },
        not_found: { type: "string", description: "What was looked for and not found" },
        event: { type: "string" },
      },
      required: ["name"],
    },
  },
];

export const SKILL_HANDLERS: Record<string, Handler> = {
  async list_skills(_args, env) {
    const seen = new Set<string>();
    const lines: string[] = [];
    for (const src of sources(env)) {
      const ws = await open(env, src.repo, "read", src.space);
      for (const s of await skillNames(ws, src.prefix)) {
        if (seen.has(s.name)) continue;
        seen.add(s.name);
        lines.push(`- ${s.name} (${src.label}): ${s.description.split(". ")[0].slice(0, 220)}`);
      }
    }
    return lines.length ? lines.join("\n") : "No skills published yet.";
  },

  async get_skill(args, env) {
    const name = slug(String(args.name ?? ""));
    const file = args.file ? String(args.file).replace(/^\/+/, "") : "SKILL.md";
    if (file.split("/").some((p) => p === ".." || p === ".git")) throw new Error("Invalid file path.");
    const names: string[] = [];
    for (const src of sources(env)) {
      const ws = await open(env, src.repo, "read", src.space);
      const text = await read(ws, `${src.prefix}${name}/${file}`);
      if (text !== null) return text;
      names.push(...(await skillNames(ws, src.prefix)).map((s) => s.name));
    }
    throw new Error(`No ${file} for skill "${args.name}". Available skills: ${[...new Set(names)].join(", ") || "none"}.`);
  },

  async get_config(args, env, person) {
    const skill = String(args.skill ?? "");
    const ws = await openKit(env, "read");
    const c = await loadConfig(ws);
    const org = c.org[skill] ?? {};
    const mine = c.people[crmEmail(person)]?.[skill] ?? {};
    const merged = { ...org, ...mine, limits: { ...(org.limits ?? {}), ...(mine.limits ?? {}) } };
    const note = Object.keys(mine).length
      ? `Includes ${person.name}'s own settings.`
      : `No settings of ${person.name}'s own yet: these are the organization's defaults. If the research tools are wrong, ask which they have and call set_my_research_tools.`;
    return `${JSON.stringify(merged, null, 2)}\n\n${note}`;
  },

  async set_my_research_tools(args, env, person) {
    const tools = Array.isArray(args.tools) ? args.tools.filter((t: any) => t?.name) : [];
    if (!tools.length) throw new Error("Name at least one research tool.");
    const skill = String(args.skill || "augment-speakers-panelists");
    return write(
      env,
      env.KIT_REPO,
      person,
      `config: ${person.name}'s research tools for ${skill}`,
      async (ws) => {
        const c = await loadConfig(ws);
        const key = crmEmail(person);
        c.people[key] = c.people[key] ?? {};
        c.people[key][skill] = { ...(c.people[key][skill] ?? {}), research_tools: tools };
        await ws.fs.promises.writeFile(`${DIR}/${CONFIG_PATH}`, JSON.stringify(c, null, 2) + "\n");
        return { paths: [CONFIG_PATH], summary: `Saved ${person.name}'s research tools for ${skill}: ${tools.map((t: any) => t.name).join(", ")}.` };
      },
      undefined,
      "event",
    );
  },

  async save_speaker_profile(args, env, person) {
    if (!args?.name) throw new Error("A speaker profile needs a name.");
    const event = ev(args, env);
    const nameSlug = slug(args.name);
    const path = `speakers/${args.organization ? `${nameSlug}--${slug(args.organization)}` : nameSlug}.md`;
    const groups: [string, string, Link[]][] = [
      ["Social", "has_social", links(args.socials)],
      ["Organization", "org_has_social", links(args.organization_socials)],
      ["Features", "featured_in", links(args.features)],
      ["Mentions", "mentioned_in", links(args.mentions)],
      ["Video", "has_video", links(args.videos)],
    ];
    let added: [string, Link][] = [];

    return write(
      env,
      event,
      person,
      `speaker: ${args.name}${args.organization ? ` (${args.organization})` : ""}`,
      async (ws) => {
        const t = now(env);
        const existing = await read(ws, path);
        const known = new Set((existing?.match(/https?:\/\/[^\s)>\]]+/g) ?? []).map((u) => u.replace(/[.,]+$/, "")));
        const fresh = groups.map(([label, pred, items]) => [label, pred, items.filter((i) => !known.has(String(i.url)))] as const);
        added = fresh.flatMap(([, pred, items]) => items.map((i) => [pred, i] as [string, Link]));

        const line = (label: string, i: Link) =>
          label === "Social" || label === "Organization"
            ? `- ${i.platform ?? "link"}: ${i.url}`
            : label === "Video"
              ? `- ${i.date ?? "(undated)"} · ${i.title ?? ""} · ${i.channel ?? ""}${i.length ? ` · ${i.length}` : ""} · ${i.url}`
              : `- ${i.date ?? "(undated)"} · ${i.outlet ?? ""} · ${i.title ?? ""} · ${i.url}${i.why ? `\n  ${i.why}` : ""}`;
        const sections = fresh
          .filter(([, , items]) => items.length)
          .map(([label, , items]) => `#### ${label}\n${items.map((i) => line(label, i)).join("\n")}`)
          .join("\n\n");
        const block = [
          `### ${t.stamp} · researched by ${person.name}`,
          args.identity_confidence ? `Identity confidence: ${args.identity_confidence}` : null,
          sections || "No new links this time.",
          args.not_found ? `\nNot found / not confirmed: ${args.not_found}` : null,
          "",
        ]
          .filter((l) => l !== null)
          .join("\n");

        let text: string;
        if (existing) {
          text = `${existing.replace(/\s*$/, "\n\n")}${block}`;
        } else {
          const head = [
            `# ${args.name}`,
            [args.title, args.organization].filter(Boolean).join(", "),
            args.session ? `**Session:** ${args.session}${args.session_time ? ` (${args.session_time})` : ""}` : null,
            args.why ? `**Why they matter here:** ${args.why}` : null,
          ]
            .filter(Boolean)
            .join("\n\n");
          text = `${head}\n\n## Research\n\n${block}`;
        }
        await ws.fs.promises.writeFile(`${DIR}/${path}`, text);
        return { paths: [path], summary: `Speaker profile saved: ${path} (${added.length} new link(s)).` };
      },
      async (oid) => {
        const at = new Date().toISOString();
        const instanceId = await ensureInstance(env, event);
        const orgId = args.organization ? await ensureOrg(env, String(args.organization), `event-hog:${event}@${oid.slice(0, 12)}:${path}`) : null;
        let personId = await findPerson(env, { name: args.name }, orgId);
        if (!personId) {
          personId = crypto.randomUUID();
          await env.CRM.prepare(
            "INSERT INTO persons (id, name, headline, source, first_seen_at, last_seen_at, first_touched_by, last_touched_by) VALUES (?, ?, ?, ?, ?, ?, ?, ?)",
          )
            .bind(personId, String(args.name).trim(), args.title ?? null, `event-hog:${event}@${oid.slice(0, 12)}:${path}`, at, at, person.name, person.name)
            .run();
          if (orgId) {
            await env.CRM.prepare("INSERT OR IGNORE INTO affiliations (id, person_id, org_id, kind, added_at, source) VALUES (?, ?, ?, ?, ?, ?)")
              .bind(crypto.randomUUID(), personId, orgId, args.title ?? "", at, `event-hog:${event}:${path}`)
              .run();
          }
        }
        const obs = (predicate: string, object: string, source: string) =>
          env.CRM.prepare(
            "INSERT INTO observations (id, subject_type, subject_id, predicate, object, source, observed_at, observed_by, event_instance_id) VALUES (?, 'person', ?, ?, ?, ?, ?, ?, ?)",
          ).bind(crypto.randomUUID(), personId, predicate, object, source, at, person.name, instanceId);
        const orgObs = (object: string) =>
          env.CRM.prepare(
            "INSERT INTO observations (id, subject_type, subject_id, predicate, object, source, observed_at, observed_by, event_instance_id) VALUES (?, 'organization', ?, 'has_social', ?, ?, ?, ?, ?)",
          ).bind(crypto.randomUUID(), orgId, object, object, at, person.name, instanceId);
        const stmts = added
          .filter(([pred]) => pred !== "org_has_social" || orgId)
          .map(([pred, i]) => (pred === "org_has_social" ? orgObs(String(i.url)) : obs(pred, String(i.url), String(i.url))));
        if (args.session) stmts.push(obs("speaker_at", String(args.session), `event-hog:${event}@${oid.slice(0, 12)}:${path}`));
        if (stmts.length) await env.CRM.batch(stmts);
        return `agnostic-crm: ${stmts.length} observation(s) recorded for ${args.name}.`;
      },
    );
  },
};

export const SKILL_PROMPTS = [
  {
    name: "augment-speaker",
    description: "Look up a speaker or panelist from a screenshot or bio: socials, features, mentions, video.",
    text: "Use event-hog: load the augment-speakers-panelists skill with get_skill and follow it, starting with get_config for my research tools. The speaker is in the screenshot or text I'm sharing. When done, save the profile with save_speaker_profile.",
  },
];
