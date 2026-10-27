# hubspot-mcp

A client's own front door to HubSpot's remote MCP server (`mcp.hubspot.com`).

HubSpot's MCP server takes OAuth only from a HubSpot *MCP auth app* holding its
client secret, and it has no dynamic client registration. Claude can store a
client secret in a custom connector; Codex and most other MCP clients can't.
This Worker is an ordinary OAuth-protected MCP server that any client can
register with on its own (DCR + PKCE). Behind it, it signs each person in to
HubSpot with the app's secret and passes MCP traffic through.

- **Each person is themselves.** They sign in to HubSpot in their own browser;
  HubSpot attributes every record to them, with their permissions.
- **Their HubSpot tokens never leave this Worker.** They sit encrypted in the
  props of that person's grant (KV), and are refreshed when the client
  refreshes. Our access token lives exactly as long as the HubSpot token in it.
- **Pinned to one portal.** `ALLOWED_HUB_IDS` refuses a sign-in to any other
  HubSpot account.
- **One deployment per client**, in that client's Cloudflare account: one
  wrangler environment each, like the per-client Twenty instances.

## Connect

| Client | How |
|---|---|
| Claude (desktop, web, mobile) | Settings → Connectors → Add custom connector → URL `<PUBLIC_URL>/mcp`. Leave Advanced settings empty. |
| Codex | `codex mcp add hubspot --url <PUBLIC_URL>/mcp`, then `codex mcp login hubspot` |
| Anything else | Streamable HTTP at `<PUBLIC_URL>/mcp`; OAuth is discovered from the 401 |

A browser opens: a consent page here (it warns when access goes to an app on
your computer), then HubSpot's sign-in.

## Add a client

1. In the client's HubSpot: Development → MCP Connectors → create one (or use
   the existing one). Add the redirect URL `<PUBLIC_URL>/callback`.
2. In the client's Cloudflare account: `npx wrangler kv namespace create
   hubspot-mcp-oauth`.
3. Add an `env.<client>` block to `wrangler.jsonc`: its KV id, `PUBLIC_URL`,
   `LABEL`, `HUBSPOT_CLIENT_ID`, `ALLOWED_HUB_IDS`.
4. `npx wrangler deploy --env <client>`, then the two secrets:
   `HUBSPOT_CLIENT_SECRET` (from the client-stack `.env`) and
   `CONSENT_SECRET` (48 random characters; it only signs the "don't ask
   again" cookie, so rotating it just brings the consent page back).

## Deployments

| Client | URL | HubSpot portal |
|---|---|---|
| Edviro | https://hubspot-mcp-edviro.tanujsiripurapu.workers.dev/mcp | 246641970 |
