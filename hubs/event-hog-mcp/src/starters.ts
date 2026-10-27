// Content starters: things agents generate alongside the team's notes, so a
// thumb-typed "talked w/ Ari re 2N vs N+1, ask abt PPA" comes back as context
// the team can use. The first kind is flash cards (the
// parallel-content-generation-starters skill in event-hog-kit).
//
// A deck is one file per card, flash-cards/<term>.md in the event workspace,
// so two people adding cards at once never touch the same file, and a term
// that comes up again gets a "seen" line instead of a duplicate card.
//
// Post drafts (tweets, threads, LinkedIn, blog posts) live in drafts/, one
// file per draft. Agents start them before a session with [gaps] where what
// was actually said will go, then add material and new versions as notes come
// in. Nothing is ever rewritten in place, and nothing here posts anywhere.

import type { Env, Front, Handler, Workspace } from "./index";
import { DIR, open, read, walk, write, parseFront, renderFront, slug, now, csvCell } from "./index";

const DECK = "flash-cards";
const CATEGORIES = ["acronym", "vocabulary", "concept", "standard", "reference"];

const ev = (args: any, env: Env) => (args?.event ? String(args.event) : env.DEFAULT_EVENT);
const list = (v: unknown): string[] =>
  (Array.isArray(v) ? v : typeof v === "string" ? v.split(",") : []).map((s) => String(s).trim()).filter(Boolean);

type Card = { path: string; front: Front; body: string };

const DRAFTS = "drafts";
const KINDS = ["tweet", "thread", "linkedin", "blog"];
const STATUSES = ["angle", "outline", "draft", "ready", "posted", "dropped"];
// Official, long-form pieces speak for the company; short social posts speak
// for the person. A draft can override it.
const DEFAULT_VOICE: Record<string, string> = { blog: "company", linkedin: "personal", thread: "personal", tweet: "personal" };

// X counts every link as 23 characters, whatever its length.
const xLength = (t: string) => t.replace(/https?:\/\/\S+/g, "x".repeat(23)).length;
const X_LIMIT = 280;

// Number a tweetstorm 1/N … N/N and flag any post over the limit.
function renderPosts(posts: string[]): { text: string; over: number[] } {
  const n = posts.length;
  const over: number[] = [];
  const text = posts
    .map((p, i) => {
      const post = n > 1 ? `${p.trim()} ${i + 1}/${n}` : p.trim();
      const len = xLength(post);
      if (len > X_LIMIT) over.push(i + 1);
      return `**${n > 1 ? `${i + 1}/${n}` : "Post"}** (${len}/${X_LIMIT}${len > X_LIMIT ? " ⚠ over" : ""})\n\n${post}`;
    })
    .join("\n\n---\n\n");
  return { text, over };
}

// A speaker's and their organization's accounts, from the saved profile
// (augment-speakers-panelists): Social sections are the person's, Organization
// sections the organization's. Only what research found; never constructed.
type Tags = { x: string; linkedin: string; org: string; org_x: string; org_linkedin: string; profile: string };
async function speakerHandles(ws: Workspace, name: string): Promise<Tags> {
  const want = slug(name);
  const empty: Tags = { x: "", linkedin: "", org: "", org_x: "", org_linkedin: "", profile: "" };
  const file = (await walk(ws, "speakers")).find((p) => p === `speakers/${want}.md` || p.startsWith(`speakers/${want}--`));
  if (!file) return empty;
  const text = (await read(ws, file)) ?? "";
  const section = (label: string) =>
    [...text.matchAll(new RegExp(`#### ${label}\\n([\\s\\S]*?)(?=\\n#{1,4} |$)`, "g"))].map((m) => m[1]).join("\n");
  const xOf = (t: string) => t.match(/(?:x|twitter)\.com\/(?!intent|share|home|i\/|search)([A-Za-z0-9_]{1,15})\b/i)?.[1] ?? "";
  const person = section("Social");
  const org = section("Organization");
  const x = xOf(person);
  const ox = xOf(org);
  return {
    x: x ? `@${x}` : "",
    linkedin: person.match(/https?:\/\/(?:www\.)?linkedin\.com\/in\/[^\s)>\]]+/i)?.[0] ?? "",
    // Profiles open "# Name", then "Title, Organization" when either is known.
    org: /^[^#*\n][^\n]*$/.test(text.split("\n")[2] ?? "") ? (text.split("\n")[2].split(", ").pop() ?? "").trim() : "",
    org_x: ox ? `@${ox}` : "",
    org_linkedin: org.match(/https?:\/\/(?:www\.)?linkedin\.com\/(?:company|school|showcase)\/[^\s)>\]]+/i)?.[0] ?? "",
    profile: file,
  };
}

// What to show for tagging: X handles to use in posts, LinkedIn pages to open
// (LinkedIn tags by typing @Name, so the names matter as much as the links).
function tagLines(speaker: string, h: Tags): string {
  if (!h.profile) return `No speaker profile for ${speaker} yet, so no handles or LinkedIn pages on file (augment-speakers-panelists can find them). Name them in plain text; never guess a handle.`;
  const org = h.org || "their organization";
  return [
    `Tag ${speaker} (from ${h.profile}):`,
    `- X: ${h.x || "no handle on file; name them in plain text"}`,
    `- LinkedIn: ${h.linkedin || "no profile on file"}${h.linkedin ? ` (in a LinkedIn post, type @${speaker})` : ""}`,
    `Tag ${org}:`,
    `- X: ${h.org_x || "no handle on file"}`,
    `- LinkedIn: ${h.org_linkedin || "no company page on file"}${h.org_linkedin ? ` (type @${org})` : ""}`,
  ].join("\n");
}

function cleanPath(p: unknown): string {
  const path = String(p ?? "").replace(/^\/+/, "");
  if (!path.startsWith(`${DRAFTS}/`) || path.split("/").some((x) => x === ".." || x === ".git")) throw new Error(`Not a draft path: ${p}`);
  return path;
}

async function deck(ws: Workspace): Promise<Card[]> {
  const out: Card[] = [];
  for (const path of await walk(ws, DECK)) {
    if (!path.endsWith(".md")) continue;
    const { front, body } = parseFront((await read(ws, path)) ?? "");
    out.push({ path, front, body });
  }
  return out.sort((a, b) => (a.front.term ?? a.path).localeCompare(b.front.term ?? b.path));
}

// A card matches on its term, its expansion, or any alias, compared as slugs,
// so "PUE", "pue" and "Power Usage Effectiveness" are one card.
function keys(front: Front): Set<string> {
  return new Set([front.term, front.expansion, ...list(front.aliases)].map((k) => slug(k ?? "")).filter(Boolean));
}

// Appended to these tools' results, so an agent that never loaded the skill
// still gets the cue at the moment it matters.
export const STARTER_NUDGES: Record<string, string> = {
  save_speaker_profile:
    "Starters: anticipate this session now. Flash cards for its likely vocabulary (save_flash_cards), 2–3 questions to ask, and post angles with [gaps] (save_draft with speaker set, which looks up their handle). During the session, live posts per references/live-posting.md. Load parallel-content-generation-starters if you haven't, and get_config it for voices.",
  add_note:
    "Starters: if this note has jargon, add flash cards; if it feeds an open draft (drafts), add_to_draft with the note as the source. If it's from a live session with a point worth sharing, offer one live post (quote only exact words, else paraphrase; the speaker's real handle; a specific compliment) per references/live-posting.md, and queue other nuggets for a tweetstorm. Keep it to a line or two.",
  log_contact:
    "Starters: add flash cards for any unfamiliar terms in the note. Don't put a private conversation into a post draft unless the note says it's shareable.",
};

export const STARTER_TOOLS: any[] = [
  {
    name: "save_flash_cards",
    description:
      "Add flash cards to the event's shared deck (flash-cards/, one file per term), from the parallel-content-generation-starters skill: acronyms, vocabulary, concepts, market standards, reference items that came up in notes, sessions, or conversations. A term already in the deck (matched on term, expansion, or alias) gets a 'seen again' line and any new sources; its definition is never overwritten. Mark each card sourced (you retrieved a source) or general-knowledge (from the model, to verify).",
    inputSchema: {
      type: "object",
      properties: {
        cards: {
          type: "array",
          items: {
            type: "object",
            properties: {
              term: { type: "string", description: "The front: the term as people say it (\"PUE\", \"2N redundancy\")" },
              expansion: { type: "string", description: "What an acronym stands for" },
              definition: { type: "string", description: "The back: one or two plain sentences" },
              category: { type: "string", description: CATEGORIES.join(", ") },
              why: { type: "string", description: "Why it came up here: the note, session, or person, in one line" },
              aliases: { type: "array", items: { type: "string" } },
              related: { type: "array", items: { type: "string" }, description: "Other terms worth a card" },
              sources: { type: "array", items: { type: "string" }, description: "URLs actually retrieved" },
              confidence: { type: "string", description: "sourced or general-knowledge" },
              from: { type: "string", description: "Workspace file that prompted it, e.g. notes/… or contacts/…" },
            },
            required: ["term", "definition"],
          },
        },
        event: { type: "string" },
      },
      required: ["cards"],
    },
  },
  {
    name: "flash_cards",
    description:
      "Read the event's flash-card deck: every card, or those matching a category or a search. format 'cards' (default) for reading or quizzing in chat; 'csv' for a Front,Back file to import into Anki, Quizlet, or similar.",
    inputSchema: {
      type: "object",
      properties: {
        category: { type: "string" },
        query: { type: "string", description: "Matches term, expansion, definition, tags, or why it came up" },
        format: { type: "string", description: "cards or csv" },
        event: { type: "string" },
      },
    },
    annotations: { readOnlyHint: true },
  },
];

STARTER_TOOLS.push(
  {
    name: "save_draft",
    description:
      "Start a post draft from the parallel-content-generation-starters skill: a tweet, thread, LinkedIn post, or blog post, written in the voice the kind calls for (get_config for the voices). Anticipated drafts leave [gaps] for what will actually be said; never invent quotes or numbers. Saves drafts/<date>_<kind>_<title>.md. Nothing is posted.",
    inputSchema: {
      type: "object",
      properties: {
        kind: { type: "string", description: KINDS.join(", ") },
        title: { type: "string", description: "Working title or hook" },
        body: { type: "string", description: "The draft, outline, or angle, with [gaps] for unknowns. For tweets and threads you can send posts instead." },
        posts: {
          type: "array",
          items: { type: "string" },
          description: "For a tweet or thread: one string per post, without numbering. The server numbers a tweetstorm 1/N … N/N and counts characters (X: 280, links count as 23).",
        },
        voice: { type: "string", description: "company or personal. Defaults by kind: blog → company, others → personal" },
        status: { type: "string", description: "angle, outline, or draft (default angle)" },
        platform: { type: "string", description: "e.g. X, LinkedIn, company blog" },
        session: { type: "string", description: "The session or panel it anticipates or comes from" },
        speaker: { type: "string" },
        from: { type: "array", items: { type: "string" }, description: "Workspace files it draws on (notes/…, speakers/…)" },
        event: { type: "string" },
      },
      required: ["kind", "title"],
    },
  },
  {
    name: "add_to_draft",
    description:
      "Add to an existing draft without rewriting it. mode 'material' (default) adds a sourced snippet under a section (a quote or number from a note, an idea); mode 'version' adds a complete new version, e.g. the post with its [gaps] filled from notes. Can also move its status (angle → outline → draft → ready, or dropped). Mark it posted only with the live link the person gives you (posted_url).",
    inputSchema: {
      type: "object",
      properties: {
        path: { type: "string", description: "drafts/… as listed by drafts" },
        text: { type: "string" },
        posts: { type: "array", items: { type: "string" }, description: "With mode version, for a tweet or thread: the posts, unnumbered; the server numbers and counts them" },
        mode: { type: "string", description: "material or version" },
        section: { type: "string", description: "For material: which section it belongs under" },
        from: { type: "string", description: "The note or file it came from" },
        status: { type: "string", description: STATUSES.join(", ") },
        posted_url: { type: "string", description: "Required to mark posted: the link to the live post the person shared" },
        event: { type: "string" },
      },
      required: ["path"],
    },
  },
  {
    name: "drafts",
    description: "List post drafts in the event workspace with kind, voice, status, and how many versions and pieces of material each has. Filter by status, kind, or voice.",
    inputSchema: {
      type: "object",
      properties: { status: { type: "string" }, kind: { type: "string" }, voice: { type: "string" }, event: { type: "string" } },
    },
    annotations: { readOnlyHint: true },
  },
);

export const STARTER_HANDLERS: Record<string, Handler> = {
  async save_draft(args, env, person) {
    const kind = slug(args?.kind ?? "");
    if (!KINDS.includes(kind)) throw new Error(`kind must be one of ${KINDS.join(", ")}.`);
    const posts = Array.isArray(args?.posts) ? args.posts.map(String).filter((p: string) => p.trim()) : [];
    if (!args?.title || (!args?.body && !posts.length)) throw new Error("A draft needs a title and a body (or posts).");
    const voice = ["company", "personal"].includes(args.voice) ? args.voice : DEFAULT_VOICE[kind];
    const status = ["angle", "outline", "draft"].includes(args.status) ? args.status : "angle";
    return write(env, ev(args, env), person, `draft (${kind}, ${voice}): ${args.title}`, async (ws) => {
      const t = now(env);
      const path = `${DRAFTS}/${t.date}_${kind}_${slug(args.title) || "draft"}-${t.iso.slice(11, 19).replace(/:/g, "")}.md`;
      const front: Front = {
        title: String(args.title),
        kind,
        voice,
        status,
        platform: args.platform ? String(args.platform) : "",
        session: args.session ? String(args.session) : "",
        speaker: args.speaker ? String(args.speaker) : "",
        sources: list(args.from).join(", "),
        started_by: person.name,
        voice_of: voice === "personal" ? person.name : "",
        created_at: t.iso,
      };
      const handles = args.speaker ? await speakerHandles(ws, String(args.speaker)) : null;
      if (handles)
        Object.assign(front, {
          mention_x: handles.x,
          mention_linkedin: handles.linkedin,
          org_mention_x: handles.org_x,
          org_linkedin: handles.org_linkedin,
        });
      const rendered = posts.length ? renderPosts(posts) : null;
      const content = [args.body ? String(args.body).trim() : "", rendered?.text ?? ""].filter(Boolean).join("\n\n");
      const body = `# ${args.title}\n\n## Version 1 · ${t.stamp} · ${person.name}\n\n${content}\n\n## Material\n`;
      await ws.fs.promises.writeFile(`${DIR}/${path}`, `${renderFront(front, Object.keys(front))}\n${body}`);
      const notes = [
        rendered ? `${posts.length} post(s)${rendered.over.length ? `; over ${X_LIMIT} characters: ${rendered.over.join(", ")}. Tighten those` : ", all within X's limit"}.` : "",
        handles ? tagLines(String(args.speaker), handles) : "",
      ].filter(Boolean);
      const show = rendered ? `\n\nThe posts, ready for the person's artifact or markdown view:\n\n${rendered.text}` : "";
      return { paths: [path], summary: `Draft started (${kind}, ${voice} voice, ${status}): ${path}. Nothing is posted.${notes.length ? `\n${notes.join("\n")}` : ""}${show}` };
    });
  },

  async add_to_draft(args, env, person) {
    const path = cleanPath(args?.path);
    const status = args?.status ? slug(args.status) : "";
    if (status && !STATUSES.includes(status)) throw new Error(`status must be one of ${STATUSES.join(", ")}.`);
    if (status === "posted" && !args?.posted_url) throw new Error("A draft is marked posted only after the person has posted it themselves. Ask them for the link and pass it as posted_url.");
    const posts = Array.isArray(args?.posts) ? args.posts.map(String).filter((p: string) => p.trim()) : [];
    const rendered = posts.length ? renderPosts(posts) : null;
    if (rendered) {
      args = { ...args, mode: "version", text: [args.text ? String(args.text).trim() : "", rendered.text].filter(Boolean).join("\n\n") };
    }
    if (!args?.text && !status) throw new Error("Give text to add, a status, or both.");
    return write(env, ev(args, env), person, `draft: ${path}${status ? ` → ${status}` : ""}`, async (ws) => {
      const current = await read(ws, path);
      if (current === null) throw new Error(`No draft at ${path}. Start one with save_draft.`);
      const t = now(env);
      const { front, order, body } = parseFront(current);
      let next = body.replace(/\s*$/, "\n");
      if (args.text) {
        const text = String(args.text).trim();
        const src = args.from ? ` (from ${args.from})` : "";
        if (args.mode === "version") {
          const n = (next.match(/^## Version \d+/gm) ?? []).length + 1;
          const block = `## Version ${n} · ${t.stamp} · ${person.name}${src}\n\n${text}\n\n`;
          next = next.includes("\n## Material\n") ? next.replace("\n## Material\n", `\n${block}## Material\n`) : `${next}\n${block}`;
        } else {
          const line = `- ${args.section ? `**${args.section}:** ` : ""}${text} · ${t.stamp}, ${person.name}${src}`;
          next = next.includes("\n## Material\n") ? `${next}${line}\n` : `${next}\n## Material\n${line}\n`;
        }
        if (args.from && !list(front.sources).includes(String(args.from))) front.sources = [...list(front.sources), String(args.from)].join(", ");
      }
      if (status) front.status = status;
      if (status === "posted") front.posted_url = String(args.posted_url);
      await ws.fs.promises.writeFile(`${DIR}/${path}`, `${renderFront(front, order)}${next.startsWith("\n") ? "" : "\n"}${next}`);
      const show = rendered
        ? `\n${rendered.over.length ? `Over ${X_LIMIT} characters: post(s) ${rendered.over.join(", ")}. Tighten them.` : "All posts within X's limit."}\n\nThe posts, ready for the person's artifact or markdown view:\n\n${rendered.text}`
        : "";
      return { paths: [path], summary: `Draft updated: ${path}${status ? ` (now ${status})` : ""}.${show}` };
    });
  },

  async drafts(args, env) {
    const ws = await open(env, ev(args, env), "read");
    const rows: string[] = [];
    for (const path of await walk(ws, DRAFTS)) {
      if (!path.endsWith(".md")) continue;
      const text = (await read(ws, path)) ?? "";
      const { front } = parseFront(text);
      if (args?.status && front.status !== args.status) continue;
      if (args?.kind && front.kind !== args.kind) continue;
      if (args?.voice && front.voice !== args.voice) continue;
      const versions = (text.match(/^## Version \d+/gm) ?? []).length;
      const material = (text.split("\n## Material\n")[1] ?? "").split("\n").filter((l) => l.startsWith("- ")).length;
      const gaps = (text.split(/^## Version \d+.*$/m).pop() ?? "").match(/\[[^\]\n]{2,80}\]/g)?.length ?? 0;
      rows.push(
        `- ${front.status ?? "?"} · ${front.kind} · ${front.voice}${front.voice_of ? ` (${front.voice_of})` : ""} · **${front.title}** · ${versions} version(s), ${material} material, ${gaps} gap(s) open\n  ${path}`,
      );
    }
    return rows.length ? `${rows.length} draft(s):\n${rows.sort().join("\n")}` : "No drafts match.";
  },

  async save_flash_cards(args, env, person) {
    const cards = (Array.isArray(args?.cards) ? args.cards : []).filter((c: any) => c?.term && c?.definition);
    if (!cards.length) throw new Error("Each flash card needs a term and a definition.");
    const added: string[] = [];
    const seen: string[] = [];

    return write(env, ev(args, env), person, `flash cards: ${cards.map((c: any) => c.term).join(", ").slice(0, 80)}`, async (ws) => {
      const t = now(env);
      const existing = await deck(ws);
      const paths: string[] = [];

      for (const c of cards) {
        const term = String(c.term).trim();
        const category = CATEGORIES.includes(slug(c.category ?? "")) ? slug(c.category) : "concept";
        const confidence = c.confidence === "sourced" && list(c.sources).length ? "sourced" : "general-knowledge";
        const want = keys({ term, expansion: c.expansion ?? "", aliases: list(c.aliases).join(", ") });
        const match = existing.find((e) => [...keys(e.front)].some((k) => want.has(k)));
        const seenLine = `- ${t.stamp} · ${person.name}${c.why ? `: ${String(c.why).trim()}` : ""}${c.from ? ` (${c.from})` : ""}`;

        if (match) {
          const text = (await read(ws, match.path)) ?? "";
          const known = new Set(text.match(/https?:\/\/[^\s)>\]]+/g) ?? []);
          const fresh = list(c.sources).filter((u) => !known.has(u));
          const sameDef = slug(c.definition) === slug(match.body.match(/\*\*Back:\*\* (.*)/)?.[1] ?? "");
          let next = text.replace(/\s*$/, "\n");
          next = next.replace(/## Seen\n/, `## Seen\n${seenLine}\n`);
          if (fresh.length) next = next.replace(/## Sources\n/, `## Sources\n${fresh.map((u) => `- ${u}`).join("\n")}\n`);
          if (!sameDef) next += `\n> Another take (${person.name}, ${t.date}, ${confidence}): ${String(c.definition).trim()}\n`;
          await ws.fs.promises.writeFile(`${DIR}/${match.path}`, next);
          paths.push(match.path);
          seen.push(match.front.term || term);
          continue;
        }

        const path = `${DECK}/${slug(term) || "card"}.md`;
        const front: Front = {
          term,
          expansion: c.expansion ? String(c.expansion) : "",
          category,
          aliases: list(c.aliases).join(", "),
          related: list(c.related).join(", "),
          confidence,
          added_by: person.name,
          added_at: t.iso,
        };
        const sources = list(c.sources);
        const body = [
          `# ${term}${c.expansion ? ` (${c.expansion})` : ""}`,
          `**Back:** ${String(c.definition).trim()}`,
          confidence === "general-knowledge" ? "_From the model's general knowledge, not a retrieved source. Verify before relying on it._" : null,
          `## Sources\n${sources.length ? sources.map((u) => `- ${u}`).join("\n") : "- none yet"}`,
          `## Seen\n${seenLine}`,
        ]
          .filter(Boolean)
          .join("\n\n");
        await ws.fs.promises.writeFile(`${DIR}/${path}`, `${renderFront(front, Object.keys(front))}\n${body}\n`);
        existing.push({ path, front, body });
        paths.push(path);
        added.push(term);
      }

      const parts = [
        added.length ? `New card(s): ${added.join(", ")}.` : null,
        seen.length ? `Already in the deck, marked seen again: ${seen.join(", ")}.` : null,
      ];
      return { paths: [...new Set(paths)], summary: parts.filter(Boolean).join(" ") };
    });
  },

  async flash_cards(args, env) {
    const ws = await open(env, ev(args, env), "read");
    const q = String(args?.query ?? "").toLowerCase();
    const cat = args?.category ? slug(args.category) : "";
    const cards = (await deck(ws)).filter(
      (c) => (!cat || c.front.category === cat) && (!q || `${JSON.stringify(c.front)} ${c.body}`.toLowerCase().includes(q)),
    );
    if (!cards.length) return q || cat ? "No flash cards match." : "The deck is empty so far.";
    const back = (c: Card) => (c.body.match(/\*\*Back:\*\* (.*)/)?.[1] ?? "").trim();

    if (args?.format === "csv") {
      const rows = cards.map((c) => [c.front.term + (c.front.expansion ? ` (${c.front.expansion})` : ""), back(c), c.front.category].map(csvCell).join(","));
      return `Front,Back,Category\n${rows.join("\n")}`;
    }
    return `${cards.length} card(s):\n${cards
      .map((c) => {
        const flag = c.front.confidence === "sourced" ? "" : " ⚠ verify";
        const seen = (c.body.match(/^- \d{4}-/gm) ?? []).length;
        return `- **${c.front.term}**${c.front.expansion ? ` (${c.front.expansion})` : ""} · ${c.front.category}${flag}${seen > 1 ? ` · came up ${seen}×` : ""}\n  ${back(c)}`;
      })
      .join("\n")}`;
  },
};

export const STARTER_PROMPTS = [
  {
    name: "post-starters",
    description: "Draft tweet, LinkedIn, and blog angles for a session or the day so far, in the right voice.",
    text: "Use event-hog: load the parallel-content-generation-starters skill and follow its posts section. get_config it for the company and personal voices. If I've shared a session or speaker, anticipate: draft post angles with [gaps] for what will be said. Otherwise check drafts and today's notes, and fill open gaps with add_to_draft (mode version), citing the note each line came from. Show me what's ready to review.",
  },
  {
    name: "flash-cards",
    description: "Turn today's notes, sessions, and conversations into flash cards.",
    text: "Use event-hog: load the parallel-content-generation-starters skill with get_skill and follow its flash-cards section. Read today's notes, contacts, and speaker profiles (recent_activity, then read_file), pull out the acronyms, vocabulary, concepts, and market standards a newcomer to this industry would need, check flash_cards so you don't repeat the deck, and save new cards with save_flash_cards. Then quiz me on five of them, one at a time.",
  },
];
