// Upload links: a way in for files Claude already holds.
//
// A photo attached in chat is visible to Claude but can't ride a tool call. In
// Claude's code-execution sandbox, though, the attachment is a real file
// (/mnt/user-data/uploads/...). upload_link mints a URL that sandbox can PUT
// that file to with curl. It only works where the Claude org allows the
// sandbox to reach this Worker's host (an admin's network-egress setting);
// otherwise the camera page (slide_capture_link) is the way in.
//
// The URL is stateless and signed: the payload names the person (by their
// capture token, never the connector key), the event, the kind of file and
// an expiry, and is signed with that person's connector key. Single use is a
// marker object in the MEDIA bucket, written when the link is spent.
//
// Slides become slide stubs exactly like camera captures, so slides,
// view_slide and save_slide_notes work on them. Everything else lands under
// <event>/uploads/<kind>/ and the caller puts its /media/ URL in a note or
// contact.

import type { Env, Handler, Person } from "./index";
import { people, slug, now, write } from "./index";
import { addSlides, captureToken, personForToken } from "./slides";

const TTL_SECONDS = 15 * 60;
const SLIDE_MAX = 4_000_000; // view_slide returns the image inline; keep it small enough to show.
const FILE_MAX = 15_000_000;
const USED = "_upload-links-used";

const KINDS = ["slide", "badge", "business_card", "photo", "document"] as const;
type Kind = (typeof KINDS)[number];

const TYPES: Record<string, { type: string; ext: string; magic: (b: Uint8Array) => boolean }> = {
  jpg: { type: "image/jpeg", ext: "jpg", magic: (b) => b[0] === 0xff && b[1] === 0xd8 },
  jpeg: { type: "image/jpeg", ext: "jpg", magic: (b) => b[0] === 0xff && b[1] === 0xd8 },
  png: { type: "image/png", ext: "png", magic: (b) => b[0] === 0x89 && b[1] === 0x50 && b[2] === 0x4e && b[3] === 0x47 },
  webp: { type: "image/webp", ext: "webp", magic: (b) => ascii(b, 0, 4) === "RIFF" && ascii(b, 8, 12) === "WEBP" },
  gif: { type: "image/gif", ext: "gif", magic: (b) => ascii(b, 0, 4) === "GIF8" },
  heic: { type: "image/heic", ext: "heic", magic: (b) => ascii(b, 4, 8) === "ftyp" },
  pdf: { type: "application/pdf", ext: "pdf", magic: (b) => ascii(b, 0, 5) === "%PDF-" },
};
const SLIDE_EXTS = ["jpg", "jpeg", "png", "webp"];

const ascii = (b: Uint8Array, from: number, to: number) => String.fromCharCode(...b.subarray(from, to));

interface Ticket {
  p: string; // the person's capture token
  n: string; // nonce: spent once
  x: number; // expiry, unix seconds
  ev: string;
  k: Kind;
  f: string; // file type key in TYPES
  base: string; // slugged filename, for non-slide keys
  s?: string; // session
  sp?: string; // speaker
  no?: string; // field note
}

const b64url = (bytes: Uint8Array) => btoa(String.fromCharCode(...bytes)).replace(/\+/g, "-").replace(/\//g, "_").replace(/=+$/, "");
const unb64url = (s: string) => Uint8Array.from(atob(s.replace(/-/g, "+").replace(/_/g, "/")), (c) => c.charCodeAt(0));

async function sign(key: string, payload: string): Promise<string> {
  const k = await crypto.subtle.importKey("raw", new TextEncoder().encode(`${key}:upload`), { name: "HMAC", hash: "SHA-256" }, false, ["sign"]);
  return b64url(new Uint8Array(await crypto.subtle.sign("HMAC", k, new TextEncoder().encode(payload))));
}

function sameString(a: string, b: string): boolean {
  if (a.length !== b.length) return false;
  let diff = 0;
  for (let i = 0; i < a.length; i++) diff |= a.charCodeAt(i) ^ b.charCodeAt(i);
  return diff === 0;
}

async function redeem(env: Env, token: string): Promise<{ ticket: Ticket; person: Person } | string> {
  const [payload, mac] = token.split(".");
  if (!payload || !mac) return "Not an upload link.";
  let ticket: Ticket;
  try {
    ticket = JSON.parse(new TextDecoder().decode(unb64url(payload)));
  } catch {
    return "Not an upload link.";
  }
  const who = await personForToken(env, ticket.p);
  if (!who || !sameString(await sign(who.key, payload), mac)) return "This upload link isn't valid.";
  if (Date.now() / 1000 > ticket.x) return "This upload link expired. Ask Claude for a new one.";
  return { ticket, person: who.person };
}

const json = (body: unknown, status = 200) => Response.json(body, { status });

// ---------------------------------------------------------------- endpoint

export async function handleUpload(request: Request, env: Env, token: string): Promise<Response> {
  if (request.method !== "PUT" && request.method !== "POST") return new Response("Method not allowed", { status: 405, headers: { allow: "PUT, POST" } });
  const redeemed = await redeem(env, token);
  if (typeof redeemed === "string") return json({ ok: false, error: redeemed }, 401);
  const { ticket, person } = redeemed;

  // curl -T sends the raw body; curl -F file=@... sends a form. Take either.
  let bytes: Uint8Array;
  if ((request.headers.get("content-type") ?? "").startsWith("multipart/form-data")) {
    const form = await request.formData();
    let file: File | undefined;
    form.forEach((v) => {
      if (!file && typeof v === "object" && v !== null && "arrayBuffer" in v) file = v as File;
    });
    if (!file) return json({ ok: false, error: "The form had no file in it." }, 400);
    bytes = new Uint8Array(await file.arrayBuffer());
  } else {
    bytes = new Uint8Array(await request.arrayBuffer());
  }

  const spec = TYPES[ticket.f];
  const max = ticket.k === "slide" ? SLIDE_MAX : FILE_MAX;
  if (!bytes.length) return json({ ok: false, error: "The upload was empty." }, 400);
  if (bytes.length > max) {
    return json({ ok: false, error: `The file is ${(bytes.length / 1e6).toFixed(1)} MB; the limit for a ${ticket.k} is ${max / 1e6} MB. Shrink it and ask for a new link.` }, 413);
  }
  if (!spec.magic(bytes)) return json({ ok: false, error: `That file isn't a ${ticket.f.toUpperCase()}. Ask for a link with the file's real name.` }, 415);

  const marker = `${USED}/${ticket.n}`;
  if (await env.MEDIA.head(marker)) return json({ ok: false, error: "This upload link was already used. Ask Claude for a new one." }, 409);
  await env.MEDIA.put(marker, person.name, { customMetadata: { used_at: new Date().toISOString() } });

  const origin = new URL(request.url).origin;
  try {
    if (ticket.k === "slide") {
      const saved: string[] = [];
      const summary = await write(env, ticket.ev, person, `slides: 1 uploaded${ticket.s ? ` (${ticket.s})` : ""}`, async (ws) => {
        saved.length = 0;
        const out = await addSlides(env, ws, person, ticket.ev, { session: ticket.s ?? "", speaker: ticket.sp ?? "", note: ticket.no ?? "" }, [{ bytes, contentType: spec.type, ext: spec.ext }], origin);
        saved.push(...out.paths);
        return out;
      });
      return json({ ok: true, saved, summary, next: "Back in Claude: view_slide, then save_slide_notes." });
    }
    const t = now(env);
    const key = `${ticket.ev}/uploads/${ticket.k}/${t.date}-${ticket.base}-${crypto.randomUUID().slice(0, 12)}.${spec.ext}`;
    await env.MEDIA.put(key, bytes, { httpMetadata: { contentType: spec.type }, customMetadata: { uploaded_by: person.name, event: ticket.ev, kind: ticket.k } });
    const url = `${env.PUBLIC_URL || origin}/media/${key}`;
    return json({ ok: true, url, kb: Math.round(bytes.length / 1024), next: "Put this URL in the contact or note it belongs to." });
  } catch (err: any) {
    // The link is spent but nothing landed: free it so a retry works.
    await env.MEDIA.delete(marker);
    return json({ ok: false, error: err?.message ?? String(err) }, 500);
  }
}

// ---------------------------------------------------------------- tool

export const UPLOAD_TOOLS: any[] = [
  {
    name: "upload_link",
    description:
      "A one-time URL (15 minutes) for sending a file you already have in your code-execution sandbox, such as a photo the person attached in chat (/mnt/user-data/uploads/...), to the event's image host under this person's name. Upload it from the sandbox with the curl command returned. Kinds: slide (becomes a slide waiting for notes, like a camera capture; JPEG, PNG or WebP up to 4 MB), badge, business_card, photo, document (up to 15 MB; PDFs allowed). Before uploading a photo, re-encode it if you can (Pillow: JPEG quality 85, at most 2400px on the long side), which also strips location data. The upload's response gives the /media/ URL: put it in the log_contact or add_note it belongs to, and only after the upload succeeded. If curl can't reach the host (the sandbox's network access doesn't allow it, or there is no sandbox), don't retry: give the person slide_capture_link instead.",
    inputSchema: {
      type: "object",
      properties: {
        kind: { type: "string", enum: [...KINDS] },
        filename: { type: "string", description: "The file's name, with its real extension (jpg, png, webp, gif, heic, pdf)" },
        session: { type: "string", description: "For slides: the session or panel title, so it groups with that session's slides" },
        speaker: { type: "string", description: "For slides" },
        note: { type: "string", description: "For slides: what the person said about it, kept as a field note" },
        event: { type: "string" },
      },
      required: ["kind", "filename"],
    },
  },
];

export const UPLOAD_HANDLERS: Record<string, Handler> = {
  async upload_link(args, env, person) {
    const kind = String(args?.kind ?? "") as Kind;
    if (!KINDS.includes(kind)) throw new Error(`kind must be one of ${KINDS.join(", ")}.`);
    const filename = String(args?.filename ?? "").trim();
    const f = filename.split(".").pop()?.toLowerCase() ?? "";
    if (!TYPES[f]) throw new Error(`Can't take a .${f || "?"} file. Allowed: ${Object.keys(TYPES).join(", ")}.`);
    if (kind === "slide" && !SLIDE_EXTS.includes(f)) throw new Error("A slide must be JPEG, PNG or WebP. Convert it first (Pillow), then ask again with the new name.");

    const key = Object.entries(people(env)).find(([, p]) => p.email === person.email)?.[0];
    if (!key) throw new Error("Couldn't find this connector's key.");

    const ticket: Ticket = {
      p: await captureToken(key),
      n: crypto.randomUUID(),
      x: Math.floor(Date.now() / 1000) + TTL_SECONDS,
      ev: args?.event ? String(args.event) : env.DEFAULT_EVENT,
      k: kind,
      f,
      base: slug(filename.replace(/\.[^.]+$/, "")).slice(0, 40) || kind,
    };
    if (kind === "slide") {
      if (args?.session) ticket.s = String(args.session).slice(0, 200);
      if (args?.speaker) ticket.sp = String(args.speaker).slice(0, 200);
      if (args?.note) ticket.no = String(args.note).slice(0, 1000);
    }
    const payload = b64url(new TextEncoder().encode(JSON.stringify(ticket)));
    const base = env.PUBLIC_URL || "https://event-hog.tanujsiripurapu.workers.dev";
    const url = `${base}/upload/${payload}.${await sign(key, payload)}`;
    return [
      `Upload link for ${person.name}: one use, expires in 15 minutes, ${kind}, .${f}.`,
      "",
      "Run in the sandbox (replace the path with the file's):",
      `curl -sS --fail-with-body -T '/mnt/user-data/uploads/${filename.replace(/'/g, "")}' '${url}'`,
      "",
      kind === "slide"
        ? "The response lists the slide's path. Then view_slide and save_slide_notes."
        : "The response has the file's /media/ URL. Put it in the contact or note it belongs to.",
      `If curl can't connect, the sandbox isn't allowed to reach ${new URL(base).host}. Don't retry; give the person slide_capture_link.`,
    ].join("\n");
  },
};
