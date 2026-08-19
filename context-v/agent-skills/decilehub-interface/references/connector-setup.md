# Wiring the Decile Hub connector into Claude

Decile Hub ships a **native remote MCP server** at
`https://<tenant>.decilehub.com/mcp`. There is no server to deploy, no
gateway to run, nothing to self-host. Everything below was probed live
against the humain tenant on **2026-08-18**.

## Two auth channels — pick by who the person is

| | **OAuth** (the client channel) | **API token** (the operator channel) |
|---|---|---|
| Who | Every team member with a Hub login | Michael / an operator building or debugging |
| Setup | Add the connector URL, sign in via popup | Paste a token into a header |
| Identity | The person's own Hub account | One shared token, one Hub identity |
| Scope | Their Hub roles and pipelines | Whatever the token holder can see |
| Offboarding | Disable their Hub account | Rotate the token, update every consumer |
| Surfaces | Claude Desktop, claude.ai / Teams, mobile | Claude Code, scripts, curl |

**Default to OAuth for anyone who isn't the operator.** A shared token means
every action in Decile's audit trail is attributed to the token's owner, not
to the person who asked for it — which destroys the audit trail exactly when
a fund needs it.

## OAuth — what Decile advertises

```
GET https://<tenant>.decilehub.com/.well-known/oauth-protected-resource
→ { "resource": ".../mcp", "authorization_servers": ["https://<tenant>.decilehub.com"],
    "bearer_methods_supported": ["header"] }

GET https://<tenant>.decilehub.com/.well-known/oauth-authorization-server
→ authorization_endpoint: /oauth/authorize
  token_endpoint:         /oauth/token
  registration_endpoint:  /oauth/register        ← dynamic client registration
  grant_types_supported:  ["authorization_code"]
  code_challenge_methods: ["S256"]               ← PKCE
  token_endpoint_auth_methods_supported: ["none"] ← public client
```

DCR + PKCE + public client is exactly the shape Claude's custom-connector
flow expects, which is why the setup below is four clicks and no config file.

An unauthenticated request to `/mcp` returns `401` with
`www-authenticate: Bearer realm="MCP", resource_metadata="…"` — that challenge
is what kicks off the browser flow.

## Claude Desktop / claude.ai / Claude Teams — the client path

1. **Settings → Connectors → Add custom connector.**
2. URL: `https://<tenant>.decilehub.com/mcp` (humain: `https://humain.decilehub.com/mcp`).
3. **Connect** → a Decile Hub sign-in popup appears → the person signs in with
   their own Hub account and approves.
4. Verify by asking Claude to run `whoami`. It should return *their* email,
   the account name, and their `accessible_pipeline_ids`. If it returns
   someone else's email, they're on a shared token — stop and fix that.

Prerequisites on the Decile side: the person has a Hub account on the tenant,
and their `account_user` roles cover what they'll be asked to do (`investor`,
`portfolio`, `data_room`, `capital_call`, … — `whoami` lists them).

Offboarding is one action: disable their Hub account. The connector goes dead
on the next call. Nothing to revoke in Claude.

## Claude Code / scripts — the operator path

The same endpoint accepts the **raw API token** in the `Authorization` header
— no `Bearer` prefix, same scheme as the REST API.

```bash
key=$(grep '^DECILEHUB_API_KEY=' client-stacks/<client>/decilehub/.env | cut -d= -f2-)
curl -s -X POST https://<tenant>.decilehub.com/mcp \
  -H "Content-Type: application/json" \
  -H "Accept: application/json, text/event-stream" \
  -H "Authorization: $key" \
  -d '{"jsonrpc":"2.0","id":1,"method":"tools/call",
       "params":{"name":"whoami","arguments":{}}}'
```

`Accept: application/json, text/event-stream` is **required** — streamable
HTTP transport rejects a request that doesn't advertise both.

Tokens are minted in Hub at **Settings → API** (`/settings/api`). **Legacy
tokens are rejected with 403** — if a token that used to work stops working,
mint a fresh one before debugging anything else.

## The three ways this silently breaks

1. **Wrong base URL.** `DECILE_API_URL` must be the tenant *root*
   (`https://humain.decilehub.com`), never the docs page. humain's `.env` was
   once set to `.../docs/api` and every call 404'd.
2. **`Bearer` prefix on the token channel.** One stale example in Decile's own
   docs shows `Bearer <token>`. The scheme is a raw `apiKey` header. Send the
   token bare.
3. **Var-name drift — the live one.** Decile never specified an env-var name,
   so every consumer picked its own. **Four spellings of the same key** are in
   circulation:

   | Name | Who reads it |
   |---|---|
   | `DECILEHUB_API_KEY` | the operator's shell / `~/.secrets` — canonical for humans |
   | `DECILE_HUB_API_KEY` | augment-it `services/decile-mcp/server.ts` |
   | `DECILE_API_KEY` | older augment-it scripts |
   | `DECILE_API_BASE_URL` | (URL alias) older scripts, for `DECILE_API_URL` |

   A consumer reading a name the `.env` doesn't set gets an **empty string** and
   fails with an unhelpful 401 — not a missing-variable error. Set all of them
   in the client `.env` until the consumers are unified, and when you rotate the
   key, rotate every copy.

## Same host, two protocols

`https://<tenant>.decilehub.com` serves both:

- `/mcp` — the MCP server (this file). **158 tools, 0 prompts, 0 resources.**
- `/api/v1/*` — the REST API. Authoritative contract is the on-disk OpenAPI
  spec (`202506_decilehub-docs_swagger.yaml`, ~12k lines); the operating guide
  is the `decile-hub-connector` skill, which covers the three pagination
  patterns, upsert-by-natural-key semantics, and the error shapes.

The MCP tools wrap the REST endpoints, so REST is the escape hatch when a tool
doesn't exist for something the API can do. In Desktop and Teams there is no
escape hatch — MCP is the whole surface.
