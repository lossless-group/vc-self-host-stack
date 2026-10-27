// Slide capture: photos of presentation slides, saved small but legible, each
// with its own transcript and narrative.
//
// Claude can see a photo attached in chat but can't pass its bytes to a tool
// (tool arguments are text the model writes). So photos arrive another way: a
// per-person capture page (/capture/<token>) that opens the phone camera,
// shrinks each photo in the browser, and commits it to the event workspace.
// The agent then looks at the slide with view_slide and writes its notes with
// save_slide_notes.
//
// Images live on an image host, not in git: the MEDIA R2 bucket, served by
// this Worker at /media/<key>. Each slide's notes file carries the image's
// URL, so the repo stays text and any markdown viewer shows the slide. The key
// includes a random part, so URLs can't be guessed from session names.
//
// Sizing follows memopop's settled judgment (slim_deck.py, asset_normalize.py):
// JPEG around quality 82–85, 1600px across for an ordinary slide, up to 2400px
// for dense ones ("well past what OCR needs and still legible to a human").
// The page measures how detailed each photo is (edge density) and picks the
// smallest width that keeps it readable. Re-encoding also strips EXIF,
// including GPS.
//
// Notes follow memopop's slide stenographer and remake-deck's extraction
// rules: verbatim transcript, a slide type from a shared vocabulary (or a
// coined one), one-sentence core message, metrics as printed, claims to
// verify, alt text, and commentary kept apart from the transcription.

import type { Env, Front, Handler, Person, Workspace } from "./index";
import { DIR, open, read, walk, write, parseFront, renderFront, slug, now, people } from "./index";

const ROOT = "slides";
const MAX_BYTES = 4_000_000;

const SLIDE_TYPES = [
  "title", "agenda", "speaker_bio", "divider", "problem", "data_chart", "market_landscape", "case_study",
  "how_it_works", "architecture", "product", "standards_regulation", "roadmap", "quote", "takeaway",
  "sponsor", "contact", "other",
];

const ev = (args: any, env: Env) => (args?.event ? String(args.event) : env.DEFAULT_EVENT);

// The capture link carries a token derived from the person's connector key,
// so sharing the link never reveals the key itself.
export async function captureToken(key: string): Promise<string> {
  const hash = await crypto.subtle.digest("SHA-256", new TextEncoder().encode(`${key}:capture`));
  return [...new Uint8Array(hash)].map((b) => b.toString(16).padStart(2, "0")).join("").slice(0, 32);
}

async function personForToken(env: Env, token: string): Promise<{ key: string; person: Person } | null> {
  for (const [key, person] of Object.entries(people(env))) if ((await captureToken(key)) === token) return { key, person };
  return null;
}

function folderFor(session: string, date: string): string {
  return `${ROOT}/${slug(session) || `unsorted-${date}`}`;
}

export async function serveMedia(env: Env, key: string): Promise<Response> {
  if (!/^[a-z0-9][a-z0-9/_.-]{0,300}$/i.test(key) || key.includes("..")) return new Response("Not found", { status: 404 });
  const obj = await env.MEDIA.get(key);
  if (!obj) return new Response("Not found", { status: 404 });
  return new Response(obj.body, {
    headers: {
      "content-type": obj.httpMetadata?.contentType ?? "image/jpeg",
      "cache-control": "public, max-age=31536000, immutable",
      etag: obj.httpEtag,
    },
  });
}

const mediaKey = (url: string) => url.split("/media/")[1] ?? "";

function toBase64(bytes: Uint8Array): string {
  let s = "";
  for (let i = 0; i < bytes.length; i += 0x8000) s += String.fromCharCode(...bytes.subarray(i, i + 0x8000));
  return btoa(s);
}

// ---------------------------------------------------------------- capture page

export async function handleCapture(request: Request, env: Env, token: string): Promise<Response> {
  const who = await personForToken(env, token);
  if (!who) return new Response("Unknown capture link", { status: 401 });
  const url = new URL(request.url);

  if (request.method === "GET") {
    return new Response(capturePage(who.person.name, url.searchParams.get("session") ?? "", url.searchParams.get("event") ?? env.DEFAULT_EVENT), {
      headers: { "content-type": "text/html; charset=utf-8", "cache-control": "no-store" },
    });
  }
  if (request.method !== "POST") return new Response("Method not allowed", { status: 405 });

  const form = await request.formData();
  const event = String(form.get("event") || env.DEFAULT_EVENT);
  const session = String(form.get("session") || "").trim();
  const speaker = String(form.get("speaker") || "").trim();
  const files = form.getAll("slide").filter((f): f is File => typeof f === "object" && f !== null && "arrayBuffer" in f);
  if (!files.length) return Response.json({ ok: false, error: "No photos received." }, { status: 400 });
  const meta = JSON.parse(String(form.get("meta") || "[]")) as { px?: string; detail?: string; original_bytes?: number }[];

  try {
    const saved: string[] = [];
    const summary = await write(env, event, who.person, `slides: ${files.length} captured${session ? ` (${session})` : ""}`, async (ws) => {
      saved.length = 0;
      const t = now(env);
      const folder = folderFor(session, t.date);
      const taken = (await walk(ws, folder)).filter((p) => /\/\d+\.md$/.test(p)).length;
      const paths: string[] = [];
      for (const [i, file] of files.entries()) {
        const bytes = new Uint8Array(await file.arrayBuffer());
        if (bytes.length > MAX_BYTES) throw new Error(`A photo is ${(bytes.length / 1e6).toFixed(1)} MB after shrinking; the limit is ${MAX_BYTES / 1e6} MB.`);
        const nn = String(taken + i + 1).padStart(2, "0");
        const key = `${event}/${folder}/${nn}-${crypto.randomUUID().slice(0, 12)}.jpg`;
        await env.MEDIA.put(key, bytes, { httpMetadata: { contentType: "image/jpeg" }, customMetadata: { captured_by: who.person.name, event } });
        const imageUrl = `${env.PUBLIC_URL || new URL(request.url).origin}/media/${key}`;
        const base = `${folder}/${nn}`;
        const m = meta[i] ?? {};
        const front: Front = {
          image_url: imageUrl,
          status: "needs-notes",
          session,
          speaker,
          captured_by: who.person.name,
          captured_at: t.iso,
          image_px: m.px ?? "",
          image_kb: String(Math.round(bytes.length / 1024)),
          detail: m.detail ?? "",
          original_kb: m.original_bytes ? String(Math.round(m.original_bytes / 1024)) : "",
          slide_type: "",
          core_message: "",
          transcription_fidelity: "",
        };
        await ws.fs.promises.writeFile(`${DIR}/${base}.md`, `${renderFront(front, Object.keys(front))}\n# Slide ${nn}${session ? ` · ${session}` : ""}\n\n![Slide ${nn}](${imageUrl})\n\n_Captured by ${who.person.name}, ${t.stamp}. Notes pending: ask Claude to "write up my slides"._\n`);
        paths.push(`${base}.md`);
        saved.push(`${base}.md`);
      }
      return { paths, summary: `Saved ${files.length} slide(s) to ${folder}/.` };
    });
    return Response.json({ ok: true, saved, summary });
  } catch (err: any) {
    return Response.json({ ok: false, error: err?.message ?? String(err) }, { status: 500 });
  }
}

function capturePage(name: string, session: string, event: string): string {
  const esc = (s: string) => s.replace(/[&<>"]/g, (c) => ({ "&": "&amp;", "<": "&lt;", ">": "&gt;", '"': "&quot;" })[c]!);
  return `<!doctype html><html lang="en"><head><meta charset="utf-8"><meta name="viewport" content="width=device-width,initial-scale=1">
<title>Capture slides</title><meta name="theme-color" content="#111">
<style>
:root{--bg:#fafaf9;--fg:#1c1917;--mut:#78716c;--line:#e7e5e4;--acc:#0f766e;--card:#fff}
@media (prefers-color-scheme:dark){:root{--bg:#0c0a09;--fg:#f5f5f4;--mut:#a8a29e;--line:#292524;--acc:#2dd4bf;--card:#1c1917}}
*{box-sizing:border-box}body{margin:0;background:var(--bg);color:var(--fg);font:16px/1.4 system-ui,-apple-system,sans-serif}
main{max-width:520px;margin:0 auto;padding:20px 16px 48px}h1{font-size:20px;margin:0 0 4px}p{margin:0 0 16px;color:var(--mut);font-size:14px}
label{display:block;font-size:13px;color:var(--mut);margin:12px 0 4px}input[type=text]{width:100%;padding:12px;border:1px solid var(--line);border-radius:10px;background:var(--card);color:var(--fg);font-size:16px}
.row{display:flex;gap:8px;margin-top:16px}.btn{flex:1;display:flex;align-items:center;justify-content:center;padding:16px;border-radius:12px;background:var(--acc);color:#fff;font-weight:600;border:0;font-size:16px}
.btn.alt{background:var(--card);color:var(--fg);border:1px solid var(--line)}.chk{display:flex;gap:8px;align-items:center;margin-top:14px;font-size:14px}
#log{margin-top:20px;display:grid;gap:8px}.item{display:flex;gap:10px;align-items:center;background:var(--card);border:1px solid var(--line);border-radius:10px;padding:8px;font-size:13px}
.item img{width:72px;height:48px;object-fit:cover;border-radius:6px}.ok{color:var(--acc)}.err{color:#dc2626}input[type=file]{display:none}
</style></head><body><main>
<h1>Capture slides</h1><p>${esc(name)} · ${esc(event)}. Photos are shrunk on this phone to the smallest size that stays readable, then saved to the team workspace under your name.</p>
<label for="session">Session or panel</label><input id="session" type="text" value="${esc(session)}" placeholder="e.g. Converting a 1990 data center to 20MW of AI" autocomplete="off">
<label for="speaker">Speaker (optional)</label><input id="speaker" type="text" placeholder="e.g. Ari Chernikoff" autocomplete="off">
<div class="chk"><input id="dense" type="checkbox"><label for="dense" style="margin:0;color:var(--fg)">Dense slide: keep more detail</label></div>
<div class="row"><label class="btn" for="cam">Take photo</label><label class="btn alt" for="lib">Choose photos</label></div>
<input id="cam" type="file" accept="image/*" capture="environment"><input id="lib" type="file" accept="image/*" multiple>
<div id="log"></div>
</main><script>
const EVENT=${JSON.stringify(event)};
const TIERS=[1280,1600,2048,2400];
// Edge density on a small grayscale copy: how much fine detail (text, tables,
// chart labels) the slide carries. More detail needs more pixels to stay legible.
function detailTier(bmp){const w=256,h=Math.max(1,Math.round(bmp.height*w/bmp.width));const c=new OffscreenCanvas(w,h).getContext('2d');c.drawImage(bmp,0,0,w,h);
const d=c.getImageData(0,0,w,h).data;const g=new Float32Array(w*h);for(let i=0;i<w*h;i++)g[i]=.299*d[i*4]+.587*d[i*4+1]+.114*d[i*4+2];
let e=0;for(let y=1;y<h-1;y++)for(let x=1;x<w-1;x++){const i=y*w+x;if(Math.abs(g[i+1]-g[i-1])+Math.abs(g[i+w]-g[i-w])>48)e++}
const r=e/((w-2)*(h-2));return r<.05?0:r<.11?1:r<.18?2:3}
async function shrink(file,dense){const bmp=await createImageBitmap(file,{imageOrientation:'from-image'});let t=detailTier(bmp);if(dense)t=Math.min(3,t+1);
const long=Math.min(TIERS[t],Math.max(bmp.width,bmp.height));const s=long/Math.max(bmp.width,bmp.height);const w=Math.round(bmp.width*s),h=Math.round(bmp.height*s);
const cv=new OffscreenCanvas(w,h);const cx=cv.getContext('2d');cx.fillStyle='#fff';cx.fillRect(0,0,w,h);cx.drawImage(bmp,0,0,w,h);
const blob=await cv.convertToBlob({type:'image/jpeg',quality:t>=2?.85:.82});return{blob,px:w+'x'+h,detail:['low','normal','high','dense'][t],original_bytes:file.size}}
async function send(files){if(!files.length)return;const log=document.getElementById('log');const fd=new FormData();const meta=[];const rows=[];
fd.append('event',EVENT);fd.append('session',document.getElementById('session').value);fd.append('speaker',document.getElementById('speaker').value);
for(const f of files){const row=document.createElement('div');row.className='item';row.innerHTML='<img alt=""><span>Shrinking…</span>';log.prepend(row);rows.push(row);
try{const r=await shrink(f,document.getElementById('dense').checked);row.querySelector('img').src=URL.createObjectURL(r.blob);
row.querySelector('span').textContent=(f.size/1e6).toFixed(1)+' MB → '+Math.round(r.blob.size/1024)+' KB · '+r.px+' · '+r.detail+' detail · uploading…';
fd.append('slide',r.blob,'slide.jpg');meta.push({px:r.px,detail:r.detail,original_bytes:r.original_bytes})}catch(e){row.querySelector('span').innerHTML='<span class="err">Could not read this photo: '+e.message+'</span>'}}
fd.append('meta',JSON.stringify(meta));
try{const res=await fetch(location.pathname,{method:'POST',body:fd});const j=await res.json();
rows.forEach((row,i)=>{const s=row.querySelector('span');if(j.ok)s.innerHTML=s.textContent.replace(' · uploading…','')+'<br><span class="ok">Saved as '+(j.saved[i]||'')+'</span>';else s.innerHTML='<span class="err">'+j.error+'</span>'})}
catch(e){rows.forEach(r=>r.querySelector('span').innerHTML='<span class="err">Upload failed: '+e.message+'. Try again.</span>')}}
for(const id of ['cam','lib'])document.getElementById(id).addEventListener('change',e=>{send([...e.target.files]);e.target.value=''});
</script></body></html>`;
}

// ---------------------------------------------------------------- tools

export const SLIDE_TOOLS: any[] = [
  {
    name: "slide_capture_link",
    description:
      "The person's own link to a camera page for photographing slides (or picking photos). It shrinks each photo to the smallest size that stays legible, strips location data, and saves it to the event workspace under their name. Use whenever someone wants to save a slide image: images attached in chat can be read but not saved by any tool. Pass the session so photos are grouped; the link works all event.",
    inputSchema: {
      type: "object",
      properties: { session: { type: "string", description: "Session or panel title, to prefill" }, event: { type: "string" } },
    },
    annotations: { readOnlyHint: true },
  },
  {
    name: "slides",
    description: "List captured slides, grouped by session, with who captured them and whether their notes are written. needs_notes: true lists only slides still waiting for notes.",
    inputSchema: {
      type: "object",
      properties: { session: { type: "string" }, needs_notes: { type: "boolean" }, event: { type: "string" } },
    },
    annotations: { readOnlyHint: true },
  },
  {
    name: "view_slide",
    description: "Look at a captured slide: returns the image itself plus its current notes. Use before writing notes with save_slide_notes.",
    inputSchema: { type: "object", properties: { path: { type: "string", description: "slides/<session>/NN.md" }, event: { type: "string" } }, required: ["path"] },
    annotations: { readOnlyHint: true },
  },
  {
    name: "save_slide_notes",
    description:
      "Write a captured slide's metadata and narrative, following the capture-slides skill: verbatim transcript with roles, slide type, one-sentence core message, layout, metrics as printed, claims to verify, alt text, and commentary kept separate. Fills an empty slide's notes; on a slide that already has notes it adds yours as another take rather than overwriting. Also adds the slide to its session's running narrative.",
    inputSchema: {
      type: "object",
      properties: {
        path: { type: "string" },
        slide_type: { type: "string", description: `${SLIDE_TYPES.join(", ")}, or a coined lower_snake_case type` },
        new_type_rationale: { type: "string" },
        title: { type: "string", description: "The slide's heading, verbatim" },
        core_message: { type: "string", description: "One sentence: the single point this slide makes. Your words." },
        tags: { type: "array", items: { type: "string" } },
        transcript: { type: "string", description: "Every text element, verbatim, labeled by role (Kicker, H1, Sub, Body, Chart label, Footnote…). Mark [illegible] or [clipped]; never complete it." },
        layout: { type: "string", description: "Rows and columns, what sits where, reading order, emphasis" },
        metrics: { type: "object", description: "{ label as printed: value as printed }" },
        claims_to_verify: { type: "array", items: { type: "string" } },
        alt: { type: "string", description: "One sentence for someone who can't see it, naming the numbers and people shown" },
        commentary: { type: "string", description: "2–4 sentences: why it matters to us, what's missing, how strong the evidence is. Your judgment, apart from the transcription." },
        transcription_fidelity: { type: "string", description: "verbatim, partial, or illegible" },
        speaker: { type: "string" },
        session: { type: "string" },
        event: { type: "string" },
      },
      required: ["path", "core_message", "transcript"],
    },
  },
];

const sidecar = (path: string) => {
  const p = String(path ?? "").replace(/^\/+/, "").replace(/\.(jpg|md)$/, "");
  if (!p.startsWith(`${ROOT}/`) || p.split("/").some((s) => s === ".." || s === ".git")) throw new Error(`Not a slide path: ${path}`);
  return { md: `${p}.md` };
};

export const SLIDE_HANDLERS: Record<string, Handler> = {
  async slide_capture_link(args, env, person) {
    const key = Object.entries(people(env)).find(([, p]) => p.email === person.email)?.[0];
    if (!key) throw new Error("Couldn't find this connector's key.");
    const q = new URLSearchParams();
    if (args?.session) q.set("session", String(args.session));
    if (args?.event) q.set("event", String(args.event));
    const base = env.PUBLIC_URL || "https://event-hog.tanujsiripurapu.workers.dev";
    const link = `${base}/capture/${await captureToken(key)}${q.size ? `?${q}` : ""}`;
    return `${person.name}'s slide capture link (personal: saves under their name; fine to bookmark or add to the home screen):\n${link}\n\nOpen it on the phone, take or pick photos, then come back and say "write up my slides".`;
  },

  async slides(args, env) {
    const ws = await open(env, ev(args, env), "read");
    const want = args?.session ? folderFor(String(args.session), "") : "";
    const groups = new Map<string, string[]>();
    for (const p of await walk(ws, ROOT)) {
      if (!p.endsWith(".md") || p.endsWith("README.md")) continue;
      if (want && !p.startsWith(`${want}/`)) continue;
      const { front } = parseFront((await read(ws, p)) ?? "");
      if (args?.needs_notes && front.status !== "needs-notes") continue;
      const folder = p.slice(0, p.lastIndexOf("/"));
      const line = `- ${p} · ${front.status === "needs-notes" ? "needs notes" : `${front.slide_type || "?"}: ${front.core_message}`} · ${front.captured_by}${front.image_kb ? ` · ${front.image_kb} KB` : ""}`;
      groups.set(folder, [...(groups.get(folder) ?? []), line]);
    }
    if (!groups.size) return args?.needs_notes ? "Every captured slide has notes." : "No slides captured yet. slide_capture_link gives the camera page.";
    return [...groups].map(([f, lines]) => `${f}/ (${lines.length})\n${lines.sort().join("\n")}`).join("\n\n");
  },

  async view_slide(args, env) {
    const { md } = sidecar(args.path);
    const ws = await open(env, ev(args, env), "read");
    const notes = await read(ws, md);
    if (notes === null) throw new Error(`No slide at ${md}. List them with slides.`);
    const { front } = parseFront(notes);
    const obj = front.image_url ? await env.MEDIA.get(mediaKey(front.image_url)) : null;
    if (!obj) throw new Error(`${md} has no image on the image host (image_url: ${front.image_url || "none"}).`);
    const bytes = new Uint8Array(await obj.arrayBuffer());
    return { content: [{ type: "image", data: toBase64(bytes), mimeType: "image/jpeg" }, { type: "text", text: `${md}\n\n${notes}` }] };
  },

  async save_slide_notes(args, env, person) {
    const { md } = sidecar(args.path);
    if (!args?.core_message || !args?.transcript) throw new Error("Slide notes need at least a core_message and a verbatim transcript.");
    const fidelity = ["verbatim", "partial", "illegible"].includes(args.transcription_fidelity) ? args.transcription_fidelity : "verbatim";
    const type = slug(args.slide_type || "other").replace(/-/g, "_") || "other";
    return write(env, ev(args, env), person, `slide notes: ${md}`, async (ws) => {
      const current = await read(ws, md);
      if (current === null) throw new Error(`No slide at ${md}. List them with slides.`);
      const t = now(env);
      const { front, order, body } = parseFront(current);
      const metrics = args.metrics && typeof args.metrics === "object" ? Object.entries(args.metrics) : [];
      const sections = [
        args.title ? `**Title:** ${args.title}` : null,
        `**Core message:** ${String(args.core_message).trim()}`,
        `### Transcript (${fidelity})\n\n${String(args.transcript).trim()}`,
        args.layout ? `### Layout\n\n${String(args.layout).trim()}` : null,
        metrics.length ? `### Metrics (as printed)\n\n${metrics.map(([k, v]) => `- ${k}: ${v}`).join("\n")}` : null,
        Array.isArray(args.claims_to_verify) && args.claims_to_verify.length ? `### Claims to verify\n\n${args.claims_to_verify.map((c: string) => `- ${c}`).join("\n")}` : null,
        args.alt ? `### Alt text\n\n${String(args.alt).trim()}` : null,
        args.commentary ? `### Commentary (${person.name}'s read, not the slide's)\n\n${String(args.commentary).trim()}` : null,
        args.new_type_rationale ? `_New slide type \`${type}\`: ${args.new_type_rationale}_` : null,
      ]
        .filter(Boolean)
        .join("\n\n");

      const first = front.status === "needs-notes";
      if (first) {
        Object.assign(front, {
          status: "noted",
          slide_type: type,
          core_message: String(args.core_message).trim(),
          transcription_fidelity: fidelity,
          tags: Array.isArray(args.tags) ? args.tags.join(", ") : front.tags ?? "",
          noted_by: person.name,
        });
        if (!front.speaker && args.speaker) front.speaker = String(args.speaker);
        if (!front.session && args.session) front.session = String(args.session);
      }
      const block = first ? `## Notes · ${t.stamp} · ${person.name}\n\n${sections}\n` : `## Another take · ${t.stamp} · ${person.name}\n\n${sections}\n`;
      const keep = first ? body.replace(/\n_Captured by[^\n]*Notes pending[^\n]*_\n?/, "\n") : body;
      await ws.fs.promises.writeFile(`${DIR}/${md}`, `${renderFront(front, order)}${keep.replace(/\s*$/, "\n\n")}${block}`);
      const paths = [md];

      // The session's running narrative: one line per slide, in capture order.
      if (first) {
        const folder = md.slice(0, md.lastIndexOf("/"));
        const index = `${folder}/README.md`;
        const nn = md.slice(folder.length + 1, -3);
        const existing = await read(ws, index);
        const head = existing
          ? existing.replace(/\s*$/, "\n")
          : `# ${front.session || folder.split("/").pop()}\n\n${front.speaker ? `**Speaker:** ${front.speaker}\n\n` : ""}The talk, slide by slide, as the team captured it.\n\n`;
        await ws.fs.promises.writeFile(`${DIR}/${index}`, `${head}- **${nn}** · ${type} · ${String(args.core_message).trim()} ([image](${front.image_url}), [notes](${nn}.md))\n`);
        paths.push(index);
      }
      return { paths, summary: `${first ? "Notes written" : "Another take added"} for ${md}.` };
    });
  },
};

export const SLIDE_PROMPTS = [
  {
    name: "capture-slides",
    description: "Get the camera link for photographing slides, then write up what was captured.",
    text: "Use event-hog: load the capture-slides skill with get_skill and follow it. Give me my slide_capture_link (for the session I'm in, if I've said). When I say I've captured slides, list the ones that need notes, look at each with view_slide, and write them up with save_slide_notes. Then offer flash cards and post angles from them.",
  },
];
