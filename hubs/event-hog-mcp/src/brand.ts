// Brands and slide recreation.
//
// Each brand's design system is a DESIGN.md (Google Stitch's open spec, as in
// the maintain-design-md skill) in the kit at brand/<name>/DESIGN.md. When a
// brand has none yet, extract_brand reads the company's site (HTML plus its
// stylesheets) on the server, so even a chat with no web access can draft one.
//
// Captured slides can then be recreated in a brand: a self-contained 16:9
// HTML slide, rebuilt from the slide's Layout and Content notes, always
// credited to its source. The HTML is kept in the event repo and served from
// the image host so it opens from a link.

import type { Env, Handler } from "./index";
import { DIR, open, read, walk, write, parseFront, renderFront, slug, now } from "./index";

const ev = (args: any, env: Env) => (args?.event ? String(args.event) : env.DEFAULT_EVENT);
const openKit = (env: Env, scope: "read" | "write") => open(env, env.KIT_REPO, scope, "event");
const UA = "Mozilla/5.0 (compatible; event-hog/0.1; +https://lossless.group)";

async function brandConfig(env: Env): Promise<{ default_brand?: string; brands?: Record<string, { company_url?: string }> }> {
  const ws = await openKit(env, "read");
  try {
    return JSON.parse((await read(ws, "config/skills.json")) ?? "{}")?.org?.["maintain-design-system"] ?? {};
  } catch {
    return {};
  }
}

const brandPath = (name: string) => `brand/${slug(name)}/DESIGN.md`;

// ---------------------------------------------------------------- extraction

type Count = Map<string, number>;
const bump = (m: Count, k: string, n = 1) => m.set(k, (m.get(k) ?? 0) + n);
const top = (m: Count, n: number) => [...m].sort((a, b) => b[1] - a[1]).slice(0, n);

function hex(c: string): string | null {
  c = c.trim().toLowerCase();
  let m = c.match(/^#([0-9a-f]{3})$/);
  if (m) return `#${[...m[1]].map((x) => x + x).join("")}`;
  if ((m = c.match(/^#([0-9a-f]{6})(?:[0-9a-f]{2})?$/))) return `#${m[1]}`;
  if ((m = c.match(/^rgba?\(\s*(\d+)[,\s]+(\d+)[,\s]+(\d+)/))) return `#${[m[1], m[2], m[3]].map((v) => Number(v).toString(16).padStart(2, "0")).join("")}`;
  return null;
}

async function fetchText(url: string, limit = 600_000): Promise<string> {
  const res = await fetch(url, { headers: { "user-agent": UA, accept: "text/html,text/css,*/*" }, redirect: "follow" });
  if (!res.ok) throw new Error(`${url} answered ${res.status}`);
  return (await res.text()).slice(0, limit);
}

async function extract(url: string) {
  const html = await fetchText(url);
  const abs = (u: string) => {
    try {
      return new URL(u, url).toString();
    } catch {
      return "";
    }
  };
  const attr = (tag: string, name: string) => tag.match(new RegExp(`${name}\\s*=\\s*["']([^"']+)["']`, "i"))?.[1] ?? "";

  const sheets = [...html.matchAll(/<link\b[^>]*rel=["'][^"']*stylesheet[^"']*["'][^>]*>/gi)].map((m) => abs(attr(m[0], "href"))).filter(Boolean);
  const fontLinks = sheets.filter((s) => /fonts\.(googleapis|bunny)|typekit|use\.fontawesome/i.test(s));
  let css = [...html.matchAll(/<style[^>]*>([\s\S]*?)<\/style>/gi)].map((m) => m[1]).join("\n");
  css += "\n" + [...html.matchAll(/style=["']([^"']+)["']/gi)].map((m) => m[1]).join(";\n");
  const fetched: string[] = [];
  for (const s of sheets.filter((s) => !fontLinks.includes(s)).slice(0, 6)) {
    try {
      css += "\n" + (await fetchText(s, 400_000));
      fetched.push(s);
    } catch {}
  }

  const vars: Record<string, string> = {};
  for (const m of css.matchAll(/(--[a-z0-9-_]+)\s*:\s*([^;}{]+)[;}]/gi)) {
    const [k, v] = [m[1], m[2].trim()];
    if (!(k in vars) && v.length < 120) vars[k] = v;
  }
  const colorVars = Object.fromEntries(Object.entries(vars).filter(([, v]) => hex(v) || /^(#|rgb|hsl|oklch)/i.test(v)).slice(0, 60));

  const colors: Count = new Map();
  for (const m of css.matchAll(/#[0-9a-f]{3,8}\b|rgba?\([^)]+\)/gi)) {
    const h = hex(m[0]);
    if (h) bump(colors, h);
  }
  const fonts: Count = new Map();
  for (const m of css.matchAll(/font-family\s*:\s*([^;}{]+)/gi)) {
    const first = m[1].split(",")[0].replace(/["']/g, "").trim();
    if (first && !first.startsWith("var(") && !/^(inherit|initial|unset)$/i.test(first)) bump(fonts, first);
  }
  for (const m of css.matchAll(/@font-face\s*{[^}]*font-family\s*:\s*["']?([^;"'}]+)/gi)) bump(fonts, m[1].trim(), 5);
  for (const l of fontLinks) for (const m of l.matchAll(/family=([^&:]+)/g)) bump(fonts, decodeURIComponent(m[1]).replace(/\+/g, " "), 10);

  const logos = new Set<string>();
  for (const m of html.matchAll(/<img\b[^>]*>/gi)) {
    const tag = m[0];
    if (/logo|brand|wordmark/i.test(tag)) logos.add(abs(attr(tag, "src")));
  }
  for (const m of html.matchAll(/<link\b[^>]*rel=["'](?:icon|apple-touch-icon|mask-icon)[^"']*["'][^>]*>/gi)) logos.add(abs(attr(m[0], "href")));
  const meta = (p: string) => html.match(new RegExp(`<meta[^>]+(?:property|name)=["']${p}["'][^>]+content=["']([^"']+)`, "i"))?.[1] ?? "";
  const ogImage = meta("og:image");
  const inlineSvgLogo = /<svg\b[^>]*(?:logo|brand)/i.test(html);

  return {
    url,
    title: html.match(/<title[^>]*>([^<]*)/i)?.[1]?.trim() ?? "",
    description: meta("description") || meta("og:description"),
    theme_color: meta("theme-color"),
    stylesheets_read: fetched,
    font_stylesheets: fontLinks,
    css_variables_with_colors: colorVars,
    colors_by_frequency: top(colors, 24).map(([c, n]) => `${c} ×${n}`),
    fonts_by_weight: top(fonts, 10).map(([f, n]) => `${f} ×${n}`),
    logo_candidates: [...logos].filter(Boolean).slice(0, 10),
    og_image: ogImage ? abs(ogImage) : "",
    inline_svg_logo: inlineSvgLogo,
  };
}

// ---------------------------------------------------------------- tools

export const BRAND_TOOLS: any[] = [
  {
    name: "get_design_system",
    description:
      "A brand's design system (DESIGN.md: colors, typography, spacing, components, logo, do's and don'ts), for recreating slides or anything else in that brand. Omit brand for the organization's default. If there's none yet, it says so and gives the company URL to run extract_brand on.",
    inputSchema: { type: "object", properties: { brand: { type: "string" } } },
    annotations: { readOnlyHint: true },
  },
  {
    name: "extract_brand",
    description:
      "Read a company's website on the server (HTML plus its stylesheets) and return the raw brand evidence: CSS color variables, colors by frequency, fonts, font stylesheets, logo candidates, theme color, og:image. Use it to draft a DESIGN.md when a brand has none (maintain-design-system skill). Works even when the chat has no web access.",
    inputSchema: { type: "object", properties: { url: { type: "string" } }, required: ["url"] },
    annotations: { readOnlyHint: true },
  },
  {
    name: "save_design_system",
    description:
      "Save a brand's DESIGN.md to the kit (brand/<name>/DESIGN.md), following Google Stitch's spec: YAML frontmatter with at least name and colors.primary, then sections in order (Overview, Colors, Typography, Layout, Elevation & Depth, Shapes, Components, Do's and Don'ts). Replaces the previous version; git keeps the history.",
    inputSchema: {
      type: "object",
      properties: {
        brand: { type: "string", description: "Short name, e.g. edviro" },
        markdown: { type: "string", description: "The full DESIGN.md" },
        why: { type: "string", description: "One line for the commit: drafted from site, refined, etc." },
      },
      required: ["brand", "markdown"],
    },
  },
  {
    name: "save_recreated_slide",
    description:
      "Save a captured slide recreated in a brand (recreate-slides-in-brand skill): one self-contained 16:9 HTML file, inline CSS from the brand's DESIGN.md, with a visible source credit (speaker, session, event, link to the original photo). Stores it next to the slide, publishes it to a link, and records it in the slide's notes.",
    inputSchema: {
      type: "object",
      properties: {
        path: { type: "string", description: "The captured slide, slides/<session>/NN.md" },
        brand: { type: "string" },
        html: { type: "string", description: "Complete HTML document, 1920×1080 canvas, no scripts" },
        variant: { type: "string", description: "faithful (same structure, our brand) or integrated (reworked for our narrative). Default faithful" },
        changes: { type: "string", description: "One or two lines: what changed from the original besides the brand" },
        event: { type: "string" },
      },
      required: ["path", "brand", "html"],
    },
  },
];

export const BRAND_HANDLERS: Record<string, Handler> = {
  async get_design_system(args, env) {
    const cfg = await brandConfig(env);
    const name = slug(args?.brand || cfg.default_brand || "");
    if (!name) return "No brand named and no default_brand in the kit's config. Ask which company's brand to use.";
    const ws = await openKit(env, "read");
    const text = await read(ws, brandPath(name));
    if (text) return text;
    const url = cfg.brands?.[name]?.company_url;
    return `No DESIGN.md for ${name} yet (${brandPath(name)} in the kit).${url ? ` Its site is ${url}: run extract_brand on it, draft a DESIGN.md per the maintain-design-system skill, show the person, then save_design_system.` : " Ask for the company's website, then run extract_brand on it."}`;
  },

  async extract_brand(args) {
    let url = String(args?.url ?? "").trim();
    if (!/^https?:\/\//.test(url)) url = `https://${url}`;
    return JSON.stringify(await extract(url), null, 2);
  },

  async save_design_system(args, env, person) {
    const name = slug(args?.brand ?? "");
    const md = String(args?.markdown ?? "");
    if (!name) throw new Error("Name the brand.");
    const { front } = parseFront(md);
    if (!md.startsWith("---") || !/^name:/m.test(md) || !/^\s+primary:/m.test(md)) throw new Error("A DESIGN.md needs YAML frontmatter with at least name and colors.primary.");
    void front;
    return write(
      env,
      env.KIT_REPO,
      person,
      `brand: ${name} DESIGN.md${args.why ? ` (${args.why})` : ""}`,
      async (ws) => {
        await ws.fs.promises.mkdir(`${DIR}/brand/${name}`, { recursive: true } as any).catch(() => {});
        await ws.fs.promises.writeFile(`${DIR}/${brandPath(name)}`, md.replace(/\s*$/, "\n"));
        return { paths: [brandPath(name)], summary: `Saved ${brandPath(name)} in the kit.` };
      },
      undefined,
      "event",
    );
  },

  async save_recreated_slide(args, env, person) {
    const md = String(args?.path ?? "").replace(/^\/+/, "").replace(/\.(jpg|md)$/, "") + ".md";
    if (!md.startsWith("slides/") || md.includes("..")) throw new Error(`Not a slide path: ${args?.path}`);
    const html = String(args?.html ?? "");
    if (!/<html[\s>]/i.test(html)) throw new Error("Send a complete HTML document.");
    if (/<script\b/i.test(html)) throw new Error("No scripts in a recreated slide: inline CSS only (Google Fonts links are fine).");
    if (!/(source|adapted from|via)\s*:?/i.test(html.replace(/<[^>]+>/g, " "))) throw new Error("The slide must credit its source on the slide itself (e.g. \"Adapted from: <speaker>, <session>, <event>\").");
    const brand = slug(args.brand);
    const variant = args.variant === "integrated" ? "integrated" : "faithful";
    const event = ev(args, env);

    return write(env, event, person, `recreate: ${md} in ${brand} (${variant})`, async (ws) => {
      const current = await read(ws, md);
      if (current === null) throw new Error(`No slide at ${md}.`);
      const t = now(env);
      const { front, order, body } = parseFront(current);
      const base = md.slice(0, -3);
      const file = `${base}.${brand}${variant === "integrated" ? ".integrated" : ""}.html`;
      const key = `${event}/${base}-${brand}-${variant}-${crypto.randomUUID().slice(0, 12)}.html`;
      await env.MEDIA.put(key, html, { httpMetadata: { contentType: "text/html; charset=utf-8" }, customMetadata: { recreated_by: person.name, event } });
      const url = `${env.PUBLIC_URL}/media/${key}`;
      await ws.fs.promises.writeFile(`${DIR}/${file}`, html);

      front[`recreated_${brand}${variant === "integrated" ? "_integrated" : ""}`] = url;
      const line = `- ${t.stamp} · ${person.name} · ${brand}, ${variant}: [open](${url}) · source \`${file.split("/").pop()}\`${args.changes ? `\n  ${String(args.changes).trim()}` : ""}`;
      const next = body.includes("\n## Recreated in brand\n")
        ? body.replace(/\s*$/, "\n") + line + "\n"
        : `${body.replace(/\s*$/, "\n\n")}## Recreated in brand\n\n${line}\n`;
      await ws.fs.promises.writeFile(`${DIR}/${md}`, `${renderFront(front, order)}${next}`);
      return { paths: [file, md], summary: `Recreated ${md} in ${brand} (${variant}): ${url}` };
    });
  },
};

// After a write-up, whether this session still has slides waiting for notes.
export async function pendingIn(ws: any, folder: string): Promise<number> {
  let n = 0;
  for (const p of await walk(ws, folder)) {
    if (!/\/\d+\.md$/.test(p)) continue;
    if (parseFront((await read(ws, p)) ?? "").front.status === "needs-notes") n++;
  }
  return n;
}

export const BRAND_PROMPTS = [
  {
    name: "recreate-slides",
    description: "Pick captured slides worth recreating in our brand, and rebuild them with a source credit.",
    text: "Use event-hog: load the recreate-slides-in-brand skill with get_skill and follow it. Get our design system with get_design_system (if there isn't one, follow maintain-design-system to draft it first). List the session's slides, suggest the 2–3 most worth recreating and why, and recreate the ones I pick with save_recreated_slide.",
  },
];
