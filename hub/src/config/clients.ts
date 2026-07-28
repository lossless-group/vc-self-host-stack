// One entry per managed client. The CLIENT env var (set per Railway service)
// selects which client's page a deployment renders. No secrets here — only
// URLs that are already reachable on the public internet behind logins.

export interface ClientHub {
  slug: string;
  display_name: string;
  crm_url: string;
  mcp_url: string;
  agent_doc_url: string;
  /** Outline knowledge base — omit for clients without one deployed. */
  wiki_url?: string;
}

export const CLIENTS: Record<string, ClientHub> = {
  "palmer-ai": {
    slug: "palmer-ai",
    display_name: "Palmer AI",
    crm_url: "https://twenty-server-production-4b1e.up.railway.app",
    mcp_url: "https://twenty-server-production-4b1e.up.railway.app/mcp",
    agent_doc_url:
      "https://raw.githubusercontent.com/lossless-group/vc-self-host-stack/main/docs/twenty/connect-your-ai.md",
    wiki_url: "https://outline-production-3d8d.up.railway.app",
  },
  "reach-edu": {
    slug: "reach-edu",
    display_name: "Reach University",
    crm_url: "https://twenty-server-production-7c98.up.railway.app",
    mcp_url: "https://twenty-server-production-7c98.up.railway.app/mcp",
    agent_doc_url:
      "https://raw.githubusercontent.com/lossless-group/vc-self-host-stack/main/docs/twenty/connect-your-ai.md",
  },
};

export function activeClient(): ClientHub {
  const slug = import.meta.env.CLIENT ?? process.env.CLIENT ?? "palmer-ai";
  const client = CLIENTS[slug];
  if (!client) throw new Error(`Unknown CLIENT slug: ${slug}`);
  return client;
}
