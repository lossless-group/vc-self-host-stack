// Content starters: things agents generate alongside the team's notes, so a
// thumb-typed "talked w/ Ari re 2N vs N+1, ask abt PPA" comes back as context
// the team can use. The first kind is flash cards (the
// parallel-content-generation-starters skill in event-hog-kit).
//
// A deck is one file per card, flash-cards/<term>.md in the event workspace,
// so two people adding cards at once never touch the same file, and a term
// that comes up again gets a "seen" line instead of a duplicate card.

import type { Env, Front, Handler, Workspace } from "./index";
import { DIR, open, read, walk, write, parseFront, renderFront, slug, now, csvCell } from "./index";

const DECK = "flash-cards";
const CATEGORIES = ["acronym", "vocabulary", "concept", "standard", "reference"];

const ev = (args: any, env: Env) => (args?.event ? String(args.event) : env.DEFAULT_EVENT);
const list = (v: unknown): string[] =>
  (Array.isArray(v) ? v : typeof v === "string" ? v.split(",") : []).map((s) => String(s).trim()).filter(Boolean);

type Card = { path: string; front: Front; body: string };

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

export const STARTER_TOOLS = [
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

export const STARTER_HANDLERS: Record<string, Handler> = {
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
    name: "flash-cards",
    description: "Turn today's notes, sessions, and conversations into flash cards.",
    text: "Use event-hog: load the parallel-content-generation-starters skill with get_skill and follow its flash-cards section. Read today's notes, contacts, and speaker profiles (recent_activity, then read_file), pull out the acronyms, vocabulary, concepts, and market standards a newcomer to this industry would need, check flash_cards so you don't repeat the deck, and save new cards with save_flash_cards. Then quiz me on five of them, one at a time.",
  },
];
