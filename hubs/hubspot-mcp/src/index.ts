// hubspot-mcp: a client's own front door to HubSpot's remote MCP server.
//
// HubSpot's MCP server (mcp.hubspot.com) only accepts OAuth from a HubSpot "MCP
// auth app" using its client secret, and has no dynamic client registration.
// Claude can hold a client secret in a custom connector; Codex and most other
// MCP clients can't. So this Worker sits in between:
//
//   MCP client ──(our OAuth: DCR + PKCE)──▶ hubspot-mcp ──(HubSpot OAuth, client
//   secret)──▶ mcp.hubspot.com
//
// To the client it is an ordinary OAuth-protected MCP server it can register
// with itself. To HubSpot it is the one confidential client. Each person signs
// in to HubSpot as themselves, so HubSpot still attributes every record to the
// person who made it. Their HubSpot tokens live encrypted in this Worker's KV
// (the props of their grant), and are refreshed when the client refreshes.
//
// One deployment per client (per HubSpot app), in that client's Cloudflare
// account, like the Twenty instances: each wrangler environment is one client.
// ALLOWED_HUB_IDS pins a deployment to that client's portal(s).

import {
  OAuthProvider,
  OAuthError,
  AuthorizationError,
  CimdFetchError,
  authorizationErrorRedirect,
  type OAuthHelpers,
  type ConsentDescription,
} from "@cloudflare/workers-oauth-provider";

interface Env {
  OAUTH_KV: KVNamespace;
  OAUTH_PROVIDER: OAuthHelpers;
  /** This Worker's public origin, e.g. https://hubspot-mcp-edviro.example.workers.dev */
  PUBLIC_URL: string;
  /** Who this deployment is for, shown on the consent page ("Edviro"). */
  LABEL: string;
  HUBSPOT_CLIENT_ID: string;
  HUBSPOT_CLIENT_SECRET: string;
  /** Comma-separated HubSpot portal (hub) IDs allowed to sign in. Empty: any. */
  ALLOWED_HUB_IDS?: string;
  /** 32+ random characters; signs the "remember this app" consent cookie. */
  CONSENT_SECRET: string;
}

// What a grant carries, encrypted, for the proxy to use.
interface Props {
  hsAccess: string;
  hsRefresh: string;
  /** ms since epoch */
  hsExpiresAt: number;
  hubId: string;
  user: string;
}

const HUBSPOT = "https://mcp.hubspot.com";
const DAY = 86_400;

// ---------------------------------------------------------------- HubSpot OAuth

async function hubspotToken(env: Env, params: Record<string, string>): Promise<{ ok: boolean; status: number; json: any }> {
  const res = await fetch(`${HUBSPOT}/oauth/v3/token`, {
    method: "POST",
    headers: { "content-type": "application/x-www-form-urlencoded", accept: "application/json" },
    body: new URLSearchParams({ ...params, client_id: env.HUBSPOT_CLIENT_ID, client_secret: env.HUBSPOT_CLIENT_SECRET }),
  });
  return { ok: res.ok, status: res.status, json: await res.json().catch(() => ({})) };
}

// Which portal and which user a HubSpot token belongs to. The MCP token
// endpoint's introspection first, then HubSpot's classic token-info endpoint.
async function whoIs(env: Env, token: string, tokenResponse: any): Promise<{ hubId: string; user: string }> {
  const pick = (j: any) => ({
    hubId: String(j?.hub_id ?? j?.hubId ?? j?.portal_id ?? j?.portalId ?? ""),
    user: String(j?.user ?? j?.email ?? j?.user_email ?? j?.username ?? j?.sub ?? j?.user_id ?? ""),
  });
  let found = pick(tokenResponse);
  if (found.hubId && found.user) return found;
  try {
    const res = await fetch(`${HUBSPOT}/oauth/v3/token/introspect`, {
      method: "POST",
      headers: { "content-type": "application/x-www-form-urlencoded", accept: "application/json" },
      body: new URLSearchParams({ token, client_id: env.HUBSPOT_CLIENT_ID, client_secret: env.HUBSPOT_CLIENT_SECRET }),
    });
    if (res.ok) {
      const more = pick(await res.json());
      found = { hubId: found.hubId || more.hubId, user: found.user || more.user };
    }
  } catch {}
  if (found.hubId && found.user) return found;
  try {
    const res = await fetch(`https://api.hubapi.com/oauth/v1/access-tokens/${encodeURIComponent(token)}`);
    if (res.ok) {
      const more = pick(await res.json());
      found = { hubId: found.hubId || more.hubId, user: found.user || more.user };
    }
  } catch {}
  return found;
}

const allowedHubs = (env: Env) =>
  String(env.ALLOWED_HUB_IDS ?? "")
    .split(",")
    .map((s) => s.trim())
    .filter(Boolean);

const ttlFrom = (expiresAt: number) => Math.max(60, Math.floor((expiresAt - Date.now()) / 1000) - 60);

async function s256(verifier: string): Promise<string> {
  const hash = await crypto.subtle.digest("SHA-256", new TextEncoder().encode(verifier));
  return btoa(String.fromCharCode(...new Uint8Array(hash))).replace(/\+/g, "-").replace(/\//g, "_").replace(/=+$/, "");
}

// ---------------------------------------------------------------- the MCP proxy

const PASS_UP = ["content-type", "accept", "mcp-session-id", "mcp-protocol-version", "last-event-id"];
const PASS_DOWN = ["content-type", "mcp-session-id", "cache-control"];

const proxy = {
  async fetch(request: Request, env: Env, ctx: ExecutionContext & { props: Props }): Promise<Response> {
    const props = ctx.props;
    const headers = new Headers({ authorization: `Bearer ${props.hsAccess}` });
    for (const h of PASS_UP) {
      const v = request.headers.get(h);
      if (v) headers.set(h, v);
    }
    const hasBody = !["GET", "HEAD", "DELETE"].includes(request.method);
    const upstream = await fetch(`${HUBSPOT}/`, { method: request.method, headers, body: hasBody ? request.body : undefined });

    // HubSpot refused the token (revoked, or expired early): tell the client
    // its token is no good, so it refreshes, which refreshes HubSpot's too.
    if (upstream.status === 401) {
      return new Response(JSON.stringify({ error: "invalid_token", error_description: "HubSpot rejected the session. Refresh or sign in again." }), {
        status: 401,
        headers: {
          "content-type": "application/json",
          "www-authenticate": `Bearer error="invalid_token", resource_metadata="${env.PUBLIC_URL}/.well-known/oauth-protected-resource/mcp"`,
        },
      });
    }
    const out = new Headers();
    for (const h of PASS_DOWN) {
      const v = upstream.headers.get(h);
      if (v) out.set(h, v);
    }
    return new Response(upstream.body, { status: upstream.status, headers: out });
  },
};

// ---------------------------------------------------------------- sign-in pages

const esc = (v: unknown) => String(v ?? "").replace(/[&<>"']/g, (c) => `&#${c.charCodeAt(0)};`);

function page(title: string, body: string): string {
  return `<!doctype html><html lang="en"><head><meta charset="utf-8"><meta name="viewport" content="width=device-width,initial-scale=1">
<title>${esc(title)}</title>
<style>
:root{--bg:#f5f7f5;--card:#fff;--ink:#171d1a;--muted:#5f6b65;--line:#d8ded9;--accent:#16493d;--warn-bg:#fdf3e1;--warn:#7a5310}
@media (prefers-color-scheme:dark){:root{--bg:#101815;--card:#17201b;--ink:#edf0ee;--muted:#a7b4ab;--line:#26302a;--accent:#6fcf97;--warn-bg:#2d2414;--warn:#e0b15c}}
*{box-sizing:border-box}body{margin:0;background:var(--bg);color:var(--ink);font:16px/1.5 system-ui,-apple-system,Segoe UI,sans-serif;padding:24px 16px}
main{max-width:460px;margin:8vh auto;background:var(--card);border:1px solid var(--line);border-radius:14px;padding:28px}
h1{font-size:22px;line-height:1.25;margin:0 0 12px}p{margin:0 0 14px;color:var(--muted)}strong{color:var(--ink)}
.warn{background:var(--warn-bg);color:var(--warn);border-radius:10px;padding:10px 12px}
.row{display:flex;gap:10px;margin-top:20px}button{flex:1;font:inherit;font-weight:600;border-radius:10px;padding:12px;border:1px solid var(--line);background:transparent;color:var(--ink);cursor:pointer}
button.go{background:var(--accent);border-color:var(--accent);color:var(--card)}label{display:flex;gap:8px;align-items:center;color:var(--muted);font-size:14px;margin-top:6px}
</style></head><body><main>${body}</main></body></html>`;
}

function consentPage(env: Env, d: ConsentDescription, handle: string): string {
  const who = d.clientDomain
    ? `Published by <strong>${esc(d.clientDomain)}</strong>.`
    : "This app registered itself, so its name isn't verified.";
  return page(
    `Connect ${d.clientName} to HubSpot`,
    `<h1>Let <strong>${esc(d.clientName)}</strong> use ${esc(env.LABEL)}'s HubSpot as you?</h1>
<p>${who} Access goes to <strong>${esc(d.redirectHost)}</strong>.</p>
${d.redirectIsLoopback ? `<p class="warn">This sends access to an app on your computer (Codex, Claude Code, an IDE). Continue only if you just started connecting from it.</p>` : ""}
<p>Next you'll sign in to HubSpot. Anything this app does there is recorded as you.</p>
<form method="post">
<input type="hidden" name="handle" value="${esc(handle)}">
<label><input type="checkbox" name="remember" value="1" checked> Don't ask again for this app on this browser</label>
<div class="row"><button name="decision" value="deny">Cancel</button><button class="go" name="decision" value="approve">Continue to HubSpot</button></div>
</form>`,
  );
}

const html = (body: string, status = 200, headers?: Headers) => {
  const h = headers ?? new Headers();
  h.set("content-type", "text/html; charset=utf-8");
  return new Response(body, { status, headers: h });
};
const problem = (env: Env, message: string, status = 400) =>
  html(page("Couldn't connect", `<h1>Couldn't connect to HubSpot</h1><p>${esc(message)}</p><p>Start again from the app you were connecting.</p>`), status);

async function toHubSpot(env: Env, oauth: OAuthHelpers, request: any, headers?: Headers): Promise<Response> {
  const verifier = crypto.randomUUID() + crypto.randomUUID();
  const up = await oauth.beginUpstream(request, { data: { verifier }, headers });
  const url = new URL(`${HUBSPOT}/oauth/authorize/user`);
  url.searchParams.set("client_id", env.HUBSPOT_CLIENT_ID);
  url.searchParams.set("redirect_uri", `${env.PUBLIC_URL}/callback`);
  url.searchParams.set("state", up.state);
  url.searchParams.set("code_challenge", await s256(verifier));
  url.searchParams.set("code_challenge_method", "S256");
  up.headers.set("Location", url.toString());
  return new Response(null, { status: 302, headers: up.headers });
}

const pages = {
  async fetch(req: Request, env: Env): Promise<Response> {
    const url = new URL(req.url);
    const oauth = env.OAUTH_PROVIDER;
    const remember = { secret: env.CONSENT_SECRET };
    try {
      if (url.pathname === "/") {
        return new Response(
          `HubSpot MCP for ${env.LABEL}. Add ${env.PUBLIC_URL}/mcp to Claude, Codex, or any MCP client; it signs you in to HubSpot.\n`,
          { headers: { "content-type": "text/plain; charset=utf-8" } },
        );
      }

      if (url.pathname === "/authorize" && req.method === "GET") {
        const request = await oauth.parseAuthRequest(req);
        const details = await oauth.describeConsent(request);
        if (await oauth.isConsentRemembered(req, request, remember)) return toHubSpot(env, oauth, request);
        const consent = await oauth.beginConsent(request);
        return html(consentPage(env, details, consent.handle), 200, consent.headers);
      }

      if (url.pathname === "/authorize" && req.method === "POST") {
        const form = await req.formData();
        const handle = String(form.get("handle") ?? "");
        if (form.get("decision") !== "approve") {
          const denied = await oauth.denyConsent(req, handle);
          return new Response(null, { status: 302, headers: denied.headers });
        }
        const approved = await oauth.approveConsent(req, handle, form.get("remember") ? { remember } : {});
        return toHubSpot(env, oauth, approved.request, approved.headers);
      }

      if (url.pathname === "/callback") {
        const { request: original, data, headers } = await oauth.finishUpstream<{ verifier: string }>(req);
        const code = url.searchParams.get("code");
        if (url.searchParams.get("error") || !code) {
          headers.set("Location", authorizationErrorRedirect(original, "access_denied"));
          return new Response(null, { status: 302, headers });
        }
        const tok = await hubspotToken(env, {
          grant_type: "authorization_code",
          code,
          redirect_uri: `${env.PUBLIC_URL}/callback`,
          code_verifier: data.verifier,
        });
        if (!tok.ok || !tok.json.access_token) {
          return problem(env, `HubSpot didn't accept the sign-in (${tok.status} ${tok.json.error ?? ""} ${tok.json.message ?? tok.json.error_description ?? ""}).`.trim(), 502);
        }
        const id = await whoIs(env, tok.json.access_token, tok.json);
        const allowed = allowedHubs(env);
        if (allowed.length && !allowed.includes(id.hubId)) {
          return problem(
            env,
            id.hubId
              ? `This connector is for ${env.LABEL}'s HubSpot, and you signed in to a different HubSpot account (${id.hubId}). Sign in to ${env.LABEL}'s.`
              : `HubSpot didn't say which account you signed in to, so this connector can't confirm it's ${env.LABEL}'s.`,
            403,
          );
        }
        const props: Props = {
          hsAccess: tok.json.access_token,
          hsRefresh: tok.json.refresh_token ?? "",
          hsExpiresAt: Date.now() + Number(tok.json.expires_in ?? 1800) * 1000,
          hubId: id.hubId,
          user: id.user,
        };
        const { redirectTo } = await oauth.completeAuthorization({
          request: original,
          userId: `${id.hubId || "hub"}:${id.user || "user"}`,
          metadata: { label: id.user ? `${id.user} @ ${id.hubId}` : id.hubId },
          scope: original.scope,
          props,
        });
        headers.set("Location", redirectTo);
        return new Response(null, { status: 302, headers });
      }

      return new Response("Not found", { status: 404 });
    } catch (error) {
      if (error instanceof AuthorizationError && error.redirectTo) return Response.redirect(error.redirectTo, 302);
      if (error instanceof AuthorizationError) return problem(env, error.description ?? "This sign-in link expired or was already used.");
      if (error instanceof CimdFetchError) return problem(env, "This app couldn't be verified.");
      throw error;
    }
  },
};

// ---------------------------------------------------------------- the provider

let provider: OAuthProvider<Env> | undefined;

function build(env: Env): OAuthProvider<Env> {
  return new OAuthProvider<Env>({
    apiRoute: "/mcp",
    apiHandler: proxy as any,
    defaultHandler: pages as any,
    authorizeEndpoint: "/authorize",
    tokenEndpoint: "/token",
    clientRegistrationEndpoint: "/register",
    // Claude's default: it identifies itself by a metadata document Anthropic
    // hosts (CIMD) instead of registering. DCR stays on for Codex and others.
    clientIdMetadataDocumentEnabled: true,
    resourceMetadata: {
      resource: `${env.PUBLIC_URL}/mcp`,
      authorization_servers: [env.PUBLIC_URL],
      resource_name: `HubSpot for ${env.LABEL}`,
    },
    // Our grant lasts as long as it's used; idle for 30 days, sign in again.
    refreshTokenIdleTTL: 30 * DAY,
    tokenExchangeCallback: async ({ grantType, props, env: e }) => {
      const p = props as Props;
      // Our access token lives exactly as long as the HubSpot token inside it.
      if (grantType === "authorization_code") return { accessTokenTTL: ttlFrom(p.hsExpiresAt) };
      if (grantType !== "refresh_token") return;
      if (!p.hsRefresh) throw new OAuthError("invalid_grant", { description: "No HubSpot refresh token; sign in again." });
      const r = await hubspotToken(e as Env, { grant_type: "refresh_token", refresh_token: p.hsRefresh });
      if (!r.ok || !r.json.access_token) {
        if (r.status === 400 || r.status === 401) {
          throw new OAuthError("invalid_grant", { description: "HubSpot access was revoked or expired; sign in again." });
        }
        throw new OAuthError("temporarily_unavailable", { description: "HubSpot is unavailable; try again shortly.", statusCode: 503 });
      }
      const next: Props = {
        ...p,
        hsAccess: r.json.access_token,
        hsRefresh: r.json.refresh_token ?? p.hsRefresh,
        hsExpiresAt: Date.now() + Number(r.json.expires_in ?? 1800) * 1000,
      };
      return { newProps: next, accessTokenTTL: ttlFrom(next.hsExpiresAt), refreshTokenIdleTTL: 30 * DAY };
    },
  });
}

export default {
  fetch(request: Request, env: Env, ctx: ExecutionContext): Promise<Response> {
    provider ??= build(env);
    return provider.fetch(request, env, ctx);
  },
};
