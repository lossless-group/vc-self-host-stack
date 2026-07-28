# vc-self-host-stack

**A curated, deployable open-source tech stack a venture firm can self-host instead of paying $85k–$280k/yr in SaaS rent.**

# Why lose so much money every year?

> A typical 15-person VC could spend up to **$85,000/year** on Affinity + Visible + Slack + Zoom + Calendly + Airtable + Tableau + Notion + a per-deal VDR.

> A 50-person firm spends might spend closer to **$278,000/year** on the many tools that a firm of that size would need, at the larger, enterprise tier.

Every line item now has a credible open-source alternative; the friction has historically been the _willingness to futz with it_ -- e.g. integration and deploy ergonomics, not intellectual ability or technical skill.

This repo is the integration-and-deploy-ergonomics layer. Each tool under [`core/`](./core/) ships with a thin deploy wrapper (Dockerfile, Compose snippet, Railway / Fly template, env example) so a competent team can stand up the full stack in a long weekend instead of a long quarter.

Setup and management available on request from [The Lossless Group](https://lossless.group)

---

## What's in `core/` today

| Tool | Replaces | Savings (15-person firm) |
|---|---|---|
| **[twenty-crm](./core/twenty-crm)** — modern open-source CRM, 45k+ GitHub stars, native AI/MCP | Affinity ($33k/yr) or Salesforce FSC ($97k+/yr) | $20k–$130k/yr |
| **[papermark](./core/papermark)** — only fully open-source VDR; unlimited rooms, page-by-page analytics, custom domains | DealRoom ($12k–$15k/yr), ShareVault ($1.5k–$5k+/deal) | $11k–$49k/yr |
| **[plunk](./core/plunk)** — open-source email platform; transactional sends, marketing campaigns, and automation workflows in one, AWS SES backend, Docker-deployable, AGPL-3.0 | Mailchimp ($1.6k–$4.2k/yr), Kit/ConvertKit ($1.1k–$2.4k/yr), SendGrid/Resend (transactional) | $1k–$4k/yr |
| **[postiz-app](./core/postiz-app)** — open-source social media scheduling; one composer → many channels (X, LinkedIn, Instagram, Facebook, TikTok, YouTube, Mastodon, Bluesky), AI copy/design, per-post analytics, team collaboration, unlimited users, AGPL-3.0 | Hootsuite ($1.2k–$3k/yr), Buffer ($2.4k/yr), Sprout Social ($199+/seat/mo) | $1.2k–$5k/yr |
| **[karakeep](./core/karakeep)** — self-hostable bookmark-everything app (links, notes, images) with AI-based automatic tagging and full-text search; multi-user with an admin panel for account creation and role management, AGPL-3.0 | Raindrop.io Pro ($36/yr), Pocket/Instapaper Premium ($36–$60/yr) | $540–$900/yr (15 users) |

## Live in production today (managed tier)

This stopped being theory on 2026-07-24. What's running right now, for real
paying clients, with the receipts in [`changelog/`](./changelog/):

- **Twenty CRM, deployed twice** — two client firms, each in their own
  Railway project with their own postgres, redis, worker, and S3 file
  storage. Zero shared infrastructure between clients. Official upstream
  image, version-pinned (`v2.24.1`), stood up from the written runbook in
  [`docs/twenty/setup.md`](./docs/twenty/setup.md) — the second deployment
  ran start-to-finish off the doc in about six minutes.
- **Backups that restore, weekly** — per-client `pg_dump` cron to a
  per-client Cloudflare R2 bucket (bucket-scoped credentials, so one
  client's backups are invisible to everything else). The restore path is
  drilled, not assumed: we pulled a dump out of R2, rebuilt a database
  from it, and verified the records inside.
- **AI access with no terminal, no config file, no API key** — Twenty's
  native MCP endpoint speaks the full OAuth spec (discovery, dynamic
  client registration, PKCE). Proven end-to-end with Claude Desktop: paste
  one URL as a custom connector, log into the CRM in the browser, and your
  AI reads and writes the CRM *as you*. Setup instructions ship in two
  renditions, including an agent-facing walkthrough
  ([`docs/twenty/connect-your-ai.md`](./docs/twenty/connect-your-ai.md))
  built so a non-technical person can just tell their AI "help me set this
  up." ChatGPT-side and mobile verification are in progress.

Supported means supported: version-pinned images, written restore runbooks
per client, and the deploy gotchas we actually hit (healthcheck `PORT`,
`TRUST_PROXY` behind the proxy, gzipped-dump restores) are encoded in the
runbook so they only bite once — ever, for anyone.

## Coming next

Cal.diy / Tymeslot (scheduling), Mattermost (team chat), Jitsi Meet (video), Metabase (BI), NocoDB (no-code DB), BookStack (knowledge base). Each will land as its own submodule under `core/` with the same deploy-wrapper discipline. See the [full catalogue](#the-stack) below.

---

## Repo shape

```
self-host-stack/
  core/                       ← the tools we've chosen and stand behind (submodules)
    twenty-crm/                 → lossless-group/twenty-crm   (Affinity alternative)
    papermark/                  → lossless-group/papermark    (DealRoom / ShareVault alternative)
    plunk/                      → useplunk/plunk              (Mailchimp / Kit / SendGrid alternative)
    postiz-app/                 → gitroomhq/postiz-app        (Hootsuite / Buffer / Sprout alternative)
    karakeep/                    → karakeep-app/karakeep       (Raindrop.io / Pocket alternative)
    …                           more to come
  studies/                    ← alternatives we explored but didn't ship (submodules)
  client-stacks/              ← per-firm deployed instances (gitignored — operational, not public)
  docs/                       ← client-agnostic deploy runbooks + AI-connection guides (public)
    twenty/                     → setup.md (deploy procedure), connect-your-ai.md (agent-facing setup)
  changelog/                  ← dated ship notes — what went live, when, and what we learned
  context-v/                  ← living documentation (specs, explorations) per Lossless convention
```

- **`core/`** is the marketing surface. Each entry is a thin deploy wrapper around an upstream OSS tool, ideally referencing the official upstream image rather than vendoring it. Where deploy-side modifications are needed, the submodule points at a fork under `lossless-group/` so changes can layer without polluting upstream (e.g. `twenty-crm`, `papermark`); where none are needed yet, it pins the official upstream directly (e.g. `plunk` → `useplunk/plunk`).
- **`studies/`** is the "we looked at these and chose otherwise" layer. Pinned-upstream submodules for prior art we read but didn't ship.
- **`client-stacks/`** is operational. Each subdir is one firm's actual deployment, with real env files and real database connection strings. **Intentionally gitignored** — these are not marketing material and they contain secrets.

---

## The stack

What follows is the full vendor-by-vendor analysis driving the `core/` selections. Each table maps a category of VC tooling from the proprietary side to the open-source self-hosted side, with annual savings math underneath.

### CRM & Relationship Intelligence

Specialized relationship-management platforms for deal flow tracking, LP management, portfolio monitoring, and relationship intelligence via email/calendar mining.

| Proprietary Vendor | Pricing | Self-Hosted Alternative | Licensing Cost |
|---|---|---|---|
| **Affinity CRM** | $167–$225/user/month (~$33,000/yr for 15 users)[^ujtmk6] | **TwentyCRM** — Modern open-source CRM, 45k+ GitHub stars, native AI/MCP integration | $0 |
| **Salesforce Financial Services Cloud** | $325–$750/user/month + $50k–$250k implementation[^xwmpq2][^sye4vh] | *(see TwentyCRM above)* — no OSS option genuinely matches FSC's private-markets workflow at this tier; TwentyCRM + the MCP/AI layer is the closest *functional* replacement and dramatically cheaper | $0 |
| **DealCloud** | ~$85,000/yr enterprise[^9heupy] | *(see TwentyCRM above)* — same logic as FSC; relationship-intelligence flow lives in Twenty + your own AI orchestration on top, not in DealCloud's pipeline UI | $0 |
| **4Degrees** | ~$100/user/month[^9heupy] | *(see TwentyCRM above)* | $0 |

**Annual savings (15-person firm):** $31k–$33k vs. Affinity; up to $130k vs. Salesforce FSC.

### Deal Flow & Virtual Data Rooms

Secure, permissioned document repositories for due diligence, with audit trails, Q&A modules, and granular access controls.

| Proprietary Vendor | Pricing | Self-Hosted Alternative | Licensing Cost |
|---|---|---|---|
| **DealRoom Pipeline** | $12,000/yr (2GB, unlimited users)[^tg05fy] | **Papermark** — Only fully open-source VDR; unlimited data rooms, page-by-page analytics, custom domains | $0 |
| **DealRoom Diligence** | $15,000/yr buy/sell-side[^tg05fy] | **ONLYOFFICE DocSpace** — GDPR-compliant, room-based storage, collaborative editing, Docker deployable | $0 |
| **ShareVault** | $1,500–$5,000+ per deal (3 months)[^pgnjf9] | **Nextcloud + Secure Share** — Self-hosted file sync with enterprise audit logging and access controls | $0 |

**Annual savings (8–10 deals/year):** $11k–$49k in VDR fees alone.

### Portfolio Monitoring & Reporting

Platforms that automate KPI collection from portfolio companies, generate LP quarterly reports, and surface portfolio health dashboards.

> **A note on what doesn't belong here.** A casual search for "open source portfolio tracker" surfaces Ghostfolio, Wealthfolio, Rotki, and similar projects — these are *personal stock and crypto* portfolio trackers. They do not model portfolio companies, KPI collection, LP quarterly reporting, capital-call accounting, or ownership-stake math. We deliberately do not list them. The honest OSS answer for a VC firm is a custom build.

| Proprietary Vendor | Pricing | Self-Hosted Alternative | Licensing Cost |
|---|---|---|---|
| **Visible.vc** | $149/mo (15 companies) → $349/mo (40 companies)[^9irjl6] | **Custom NocoDB or Baserow build** — Portfolio companies as a base, KPIs as a related table, quarterly snapshots as time-series rows. 2–5 days of setup; fits firm's actual reporting cadence; survives metric pivots; joins against the CRM and VDR without integration licenses. | $0 |
| **Archstone** | $297/mo Core (15 portfolio + 25 LPs)[^9irjl6] | *(see above — same custom build)* | $0 |
| **Carta Portfolio** | $280–$77,000/yr by portfolio size[^9heupy] | *(see above — same custom build)* | $0 |

**Annual savings (20 portfolio companies):** $3k–$4k vs. Visible.vc Standard; $8k–$13k at enterprise scale. Setup labor is real but one-time; the alternative pays setup costs *and* SaaS rent forever.

### Team Communication & Collaboration

Real-time messaging platforms for deal discussions, channel-organized portfolio updates, and LP communications.

| Proprietary Vendor | Pricing | Self-Hosted Alternative | Licensing Cost |
|---|---|---|---|
| **Slack Pro** | $7.25/user/month (billed annually)[^v6511v][^nn66bt] | **Mattermost** — Self-hosted Slack clone; strong encryption, extensive plugin system, mobile apps | $0 |
| **Slack Business+** | $12.50/user/month[^nn66bt] | **Rocket.Chat** — MIT-licensed, omnichannel comms, video calls, federation, fully brandable | $0 |
| **Slack Pro + AI** | $22.25/user/month[^v6511v] | **Zulip** — Thread-centric chat with unique conversation model; self-hosted or cloud | $0 |
| **Microsoft Teams** | $4–$12.50/user/month (M365 bundle)[^v6511v] | **Element (Matrix)** — Fully end-to-end encrypted messaging on federated Matrix protocol | $0 |

**Annual savings:** $1.2k–$3.9k for 15-person team; $3.1k–$6.3k for 50-person firm.

### Email Marketing, Newsletters & Broadcast

Outbound, firm-to-audience email: LP quarterly update sends, founder-network newsletters, fund announcements, and the transactional notices the rest of the stack generates (data-room access alerts, scheduling confirmations). A different lane than the internal chat above — this is one-to-many email, not team-to-team messaging.

| Proprietary Vendor | Pricing | Self-Hosted Alternative | Licensing Cost |
|---|---|---|---|
| **Mailchimp Standard** | $20/mo (500 contacts), scaling to ~$135/mo at 10k contacts and $270/mo at 25k[^mchmp1] | **Plunk** — Open-source email platform that unifies transactional, campaign, and automation sends; visual no-code workflow builder, segments, contact management, custom domains with DKIM/SPF, AWS SES backend, Docker-deployable | $0 |
| **Mailchimp Premium** | $350/mo flat to 10k contacts, $620/mo at 25k[^mchmp1] | *(see Plunk above)* | $0 |
| **Kit (ConvertKit) Creator** | $39/mo (1k subs) → $89/mo (5k) → $199/mo (25k)[^kitcrt] | *(see Plunk above)* — same campaign + automation surface for creator-style newsletters | $0 |
| **SendGrid / Resend / Mailgun** | per-email transactional pricing; commonly $80–$500+/mo at firm volume | *(see Plunk above)* — Plunk covers the transactional lane too, so one tool replaces both the marketing ESP and the transactional API | $0 |

**Annual savings (15-person firm):** ~$1.1k–$4.2k depending on list size and tier replaced — Kit Creator (~$1.1k–$2.4k/yr), Mailchimp Standard (~$1.6k/yr), or Mailchimp Premium (~$4.2k/yr). Plunk is AGPL-3.0 and self-hosts on AWS SES at ~$0.10 per 1,000 emails[^plunk1], so a firm sending 50k emails/month pays under $5/month in delivery — the licensing line goes to $0.

### Social Media Management & Scheduling

One composer that publishes to every channel a firm maintains — LinkedIn thought leadership, X/Twitter, portfolio-news announcements, recruiting posts — with per-channel previews, scheduling, AI-assisted copy/design, and per-post analytics in one dashboard. The SaaS incumbents here punish you on the two axes a firm scales fastest: seats and connected accounts.

| Proprietary Vendor | Pricing | Self-Hosted Alternative | Licensing Cost |
|---|---|---|---|
| **Hootsuite Professional** | $99/mo (1 user, 10 social accounts)[^hoot01] | **Postiz** — Open-source command center for social: write once and publish to X, LinkedIn, Instagram, Facebook, TikTok, YouTube, Mastodon, Bluesky and more; AI copy + Canva-style design, official-API analytics, team collaboration, unlimited users, Docker-deployable | $0 |
| **Hootsuite Team** | $249/mo (3 users, 20 social accounts)[^hoot01] | *(see Postiz above)* | $0 |
| **Buffer Team** | $199/mo (25 channels, 6 users); $5/channel/mo entry tier[^smmcmp] | *(see Postiz above)* — same write-once-publish-everywhere surface without per-channel metering | $0 |
| **Sprout Social Standard** | from $199/user/month[^smmcmp] | *(see Postiz above)* — per-seat pricing is what makes Sprout escalate; self-hosting removes the seat tax entirely | $0 |

**Annual savings (15-person firm):** ~$1.2k–$3k/yr replacing Hootsuite (Professional $1.2k/yr → Team $3k/yr) or Buffer Team (~$2.4k/yr); materially more if displacing Sprout Social, where every additional seat is another ~$2.4k/yr. Postiz is AGPL-3.0 with unlimited users self-hosted, so neither seats nor connected accounts inflate the bill.

### Video Conferencing & Meeting Infrastructure

Video platforms for investor meetings, portfolio board meetings, LP annual gatherings, and internal deal review sessions.

| Proprietary Vendor | Pricing | Self-Hosted Alternative | Licensing Cost |
|---|---|---|---|
| **Zoom Business** | $18.33/user/month (full Workplace bundle)[^7yw3a9] | **Jitsi Meet** — Browser-based (no install), up to 1080p, 2–75 participants, complete data control | $0 |
| **Zoom Pro** | $13.33/host/month + $5.99/mo Scheduler add-on[^7yw3a9] | **BigBlueButton** — Whiteboard, breakout rooms, recording, collaboration | $0 |

**Annual savings (15-person team):** ~$2.5k–$3.3k net of infrastructure costs.

### Calendar & Scheduling Infrastructure

Scheduling automation that eliminates email back-and-forth for investor meetings and lets founders self-book partner time.

| Proprietary Vendor | Pricing | Self-Hosted Alternative | Licensing Cost |
|---|---|---|---|
| **Calendly Standard** | $10/user/month[^lbh4u5][^g0nlcg] | **[Cal.diy](https://cal.diy)** — MIT-licensed community edition Cal.com split off after going closed-source (see note below); self-hostable, full source access. **[Tymeslot](https://github.com/Tymeslot/tymeslot)** (Elixir/Phoenix LiveView, AGPL-3.0) is a newer, ground-up alternative built partly in response to that shift — smaller community (145★) but cleaner single-project licensing | $0 |
| **Calendly Teams** | $16/user/month with routing/distribution[^lbh4u5] | **Easy!Appointments** — Self-hosted scheduling with Google Calendar/CalDAV sync, provider mgmt, email notifications, API | $0 |
| **Calendly Enterprise** | From $15,000/yr (SAML SSO, advanced controls)[^7yw3a9] | **Tymeslot** — self-hosted with SSO/OAuth, webhooks, Stripe Connect. Cal.com's old Enterprise self-hosting path is no longer a genuinely free option (see note below) | $0 |
| **Doodle Business** | ~$14.95/user/month (group find-a-time polls)[^doodle] | **Rallly** — Open-source Doodle alternative for group scheduling; modern Next.js, 10k+ GitHub stars. Different lane than Cal.diy/Tymeslot — covers IC scheduling, LP annual meeting coordination, partner offsites where 1:1 booking pages don't fit. | $0 |

**Annual savings (15-person team):** $1.3k–$4k vs. Teams or Enterprise tiers. Add ~$2.7k/yr if replacing Doodle Business at the same scale.

> **A note on Cal.com's 2026 license change.** In April 2026, Cal.com moved its commercial codebase closed-source, citing AI-era code-security concerns industry-wide. The formerly-open community edition was split off as a new project, **[Cal.diy](https://cal.diy)** (MIT license, self-host-only — "use at your own risk," no managed-cloud counterpart). Self-hosting the old Cal.com Enterprise edition now requires an active paying Cal.com relationship and a private-repo invite; it is **no longer a $0, genuinely open-source path**. We're tracking **[Tymeslot](https://github.com/Tymeslot/tymeslot)** as the leading ground-up alternative that emerged from this shift — see `context-v/explorations/Watchlist-Interesting-Tools.md` for the full evaluation.

### Database & Workflow Applications

Relational, no-code database platforms (Airtable-shape) for custom deal pipelines, LP management dashboards, and investment committee workflows. This is the spreadsheet-with-superpowers lane — Notion-style hybrid docs-and-DB tools sit in [Knowledge Management & Documentation](#knowledge-management--documentation) instead, where AppFlowy is the natural OSS counterpart.

| Proprietary Vendor | Pricing | Self-Hosted Alternative | Licensing Cost |
|---|---|---|---|
| **Airtable Team** | $20/user/month[^wv1771] | **NocoDB** — Turns any MySQL/PostgreSQL into an Airtable-like UI; 56k+ GitHub stars, auto-generated REST APIs, multiple views | $0 |
| **Airtable Business** | $45/user/month[^wv1771] | **Baserow** — Fast even at unlimited rows; Airtable-style interface, automation, dashboards, API integration | $0 |
| **Airtable Enterprise** | Custom pricing (typically $60+/user/month) | **Teable** — Modern spreadsheet-style open-source alternative with strong relational capabilities and a polished UI | $0 |

**Annual savings (15-person team):** $3.6k–$8.1k depending on Airtable tier replaced.

### Business Intelligence & Analytics

BI platforms that transform portfolio data and fund metrics into interactive dashboards for partner review and LP presentations.

| Proprietary Vendor | Pricing | Self-Hosted Alternative | Licensing Cost |
|---|---|---|---|
| **Tableau** | $75/user/month (~$900/user/yr)[^m69w5r][^zy5y8t] | **Apache Superset** — Born at Airbnb; 40+ DB connectors, drag-and-drop charts, SQL lab, CSS customization | $0 |
| **Power BI** | $10/user/month (Copilot requires Fabric F64+)[^4m5obv] | **Metabase** — Most beginner-friendly open-source BI; 90k+ company deployments, zero-SQL exploration | $0 |
| **Qlik Sense** | $20/user/month[^m69w5r] | **Lightdash** — Modern open-source BI with native dbt integration for data-team-forward firms | $0 |
| **Sisense** | $10,000+/yr custom pricing[^zy5y8t] | **Redash** — Query-focused BI tool; great for SQL-comfortable analysts doing ad-hoc portfolio analysis | $0 |

**Annual savings (10-person team):** $7k–$7.8k vs. Tableau; $18.9k–$20.1k at 25 users.

### Knowledge Management & Documentation

Internal wikis and knowledge bases that preserve investment theses, due diligence frameworks, LP communications, and operating playbooks.

> **Our pick: [Outline](https://github.com/outline/outline) is the preferred Knowledge Base / Advanced Documents / Company Brain for the moment.** Markdown-native, Notion-adjacent UX — and critically, **API keys and MCP access come free with the open-source deployment**, so agents get full read/write from day one. **Working in production** since 2026-07-27: deployed for a client stack, workspace + collections live, API key minted, and the first documents written by an agent through the REST API the same day (`docs/outline/setup.md`).

| Proprietary Vendor | Pricing | Self-Hosted Alternative | Licensing Cost |
|---|---|---|---|
| **Confluence Standard** | $5.42/user/month (Rovo AI included)[^fpdi0w] | **Outline** ⭐ *our pick* — Modern, fast wiki with Slack-style editing, real-time collaboration, markdown-native; full REST API + API keys + MCP in the free self-hosted edition | $0 |
| **Confluence Premium** | $10.42/user/month[^fpdi0w] | **BookStack** — Self-hosted wiki with book/chapter/page hierarchy; ideal for organizing investment frameworks | $0 |
| **Notion Plus** | $10/user/month[^fpdi0w] | **Wiki.js** — Modern open-source wiki; multiple auth options, beautiful UI, extensive plugin ecosystem | $0 |
| **Notion Business** | $20/user/month (includes AI)[^fpdi0w] | **AppFlowy** — The most Notion-shaped OSS option; docs + databases + AI in one app, 60k+ GitHub stars, native desktop clients, self-hostable via AppFlowy Cloud. Also covers Airtable-style database use cases. | $0 |

> **Evaluated and ruled out: Docmost** (2026-07-27). It looks the most fully-featured of the self-hosted Notion alternatives — spaces, real-time collaboration, a polished editor — but **API keys are gated behind an Enterprise license** in the self-hosted edition. Agent/API access is a headline feature of every Lossless stack, so that's disqualifying regardless of how good the UI is. We deployed it, hit the gate in the settings screen, and replaced it with **Outline**, whose full REST API and API keys are free in self-hosting.

**Annual savings (20-person team):** $1.3k–$4.2k; $4.1k–$10.8k for 50-person firm.

### Research Capture & Bookmarking

Tools for capturing and organizing web research, articles, and reference links gathered during deal sourcing and due diligence, with full-text search so nothing gets lost in browser bookmarks or Slack DMs.

| Proprietary Vendor | Pricing | Self-Hosted Alternative | Licensing Cost |
|---|---|---|---|
| **Raindrop.io Pro** | ~$3/user/month (~$36/yr)[^rdpio1] | **Karakeep** — self-hostable bookmark-everything app (links, notes, images) with AI-based automatic tagging and full-text search; multi-user with admin-managed accounts, AGPL-3.0 | $0 |
| **Pocket / Instapaper Premium** | ~$3–5/user/month[^rdpio1] | *(see Karakeep above)* | $0 |

**Annual savings (15-person firm):** $540–$900/yr.

---

## Total tech stack cost comparison

### Typical 15-person VC firm (annual costs)

**Proprietary SaaS stack:**

| Category | Cost |
|---|---|
| CRM (Affinity) | $33,000 |
| Portfolio Monitoring (Visible) | $4,200 |
| Communication (Slack Pro) | $1,300 |
| Video (Zoom Business) | $3,300 |
| Scheduling (Calendly Teams) | $2,900 |
| Database (Airtable Business) | $8,100 |
| Analytics (Tableau) | $13,500 |
| Knowledge Base (Notion Business) | $3,600 |
| VDR (per-deal) | $15,000 |
| **Total** | **$84,900/yr** |

**Self-hosted open-source stack:** $7,200–$12,000/yr (infrastructure only — VPS / cloud).

**Annual savings: $72,900–$77,700 (86–91% reduction).**

### Typical 50-person VC firm (annual costs)

**Proprietary SaaS stack:**

| Category | Cost |
|---|---|
| CRM (Salesforce FSC + amortized implementation) | $140,000 |
| Portfolio Monitoring | $12,000 |
| Communication (Slack Business+) | $7,500 |
| Video (Zoom Business) | $11,000 |
| Scheduling (Calendly Teams) | $9,600 |
| Database (Airtable Business) | $27,000 |
| Analytics (Tableau) | $45,000 |
| Knowledge Base (Confluence Premium) | $6,250 |
| VDR | $20,000 |
| **Total** | **$278,350/yr** |

**Self-hosted open-source stack:** $18,000–$30,000/yr (dedicated servers / cloud).

**Annual savings: $248,350–$260,350 (89–93% reduction).**

---

## Implementation considerations

**Infrastructure requirements:**

- VPS / cloud infrastructure: $50–$500/month depending on scale
- DevOps expertise for initial setup and maintenance
- Backup and disaster recovery planning
- Security hardening and SSL certificate management

**Hidden benefits beyond cost:**

- **Data sovereignty** — All sensitive deal data, LP information, and portfolio metrics remain under firm control
- **Customization** — Source-code access enables building VC-specific workflows impossible with SaaS
- **Integration** — Self-hosted tools can be deeply integrated without API rate limits or vendor restrictions
- **Compliance** — Easier to meet regulatory requirements with on-premises deployment
- **No vendor lock-in** — Migrate or modify without permission or data export fees

**Trade-offs:**

- Initial setup time investment (typically 40–120 hours for full stack)
- Ongoing maintenance burden (4–8 hours/month for updates and monitoring)
- Less polished UI in some cases compared to VC-specific SaaS
- Requires technical talent on team or fractional DevOps support

---

## Related

- [lossless-group/twenty-crm](https://github.com/lossless-group/twenty-crm) — the CRM fork
- [lossless-group/papermark](https://github.com/lossless-group/papermark) — the VDR fork
- [useplunk/plunk](https://github.com/useplunk/plunk) — the open-source email platform (pinned upstream; not yet forked under lossless-group/)
- [gitroomhq/postiz-app](https://github.com/gitroomhq/postiz-app) — the social-media-scheduling platform (pinned upstream; not yet forked under lossless-group/)
- [lossless-group/lossless-monorepo](https://github.com/lossless-group/lossless-monorepo) — the parent pseudomonorepo this lives inside as a submodule
- [A logic behind Self-Hosted VC Stacks](https://www.lossless.group/vibe-with-us/a-logic-behind-self-hosted-vc-stacks) — the long-form thesis on lossless.group

---

## Sources

[^ujtmk6]: [Affinity CRM for VCs: Pricing, Features, and How It... – VC Beast](https://vcbeast.com/affinity-crm-vc-pricing-features-comparison)
[^xwmpq2]: [Affinity vs Salesforce: Which CRM for PE/VC in 2026?](https://prospeo.io/s/affinity-vs-salesforce)
[^sye4vh]: [2026 Guide to CRM Costs in Private Markets](https://www.4degrees.ai/blog/private-equity-crm-pricing-explained-2026-guide-to-crm-costs-in-private-markets)
[^9heupy]: [Best Venture Capital Software (The $620/mo Stack) in 2026](https://www.peony.ink/blog/venture-capital-software-solutions)
[^tg05fy]: [Dealroom Pricing Breakdown: Plans & Benefits](https://dataroom-providers.org/blog/dealroom-pricing-breakdown/)
[^pgnjf9]: [Deal Room Software Pricing Guide 2024](https://sharevault.com/blog/virtual-data-room/deal-room-software-pricing-guide-2024/)
[^v6511v]: [The 5 best Slack alternatives for businesses in 2026](https://zapier.com/blog/slack-alternatives/)
[^nn66bt]: [Slack Pricing in 2026: Complete Guide & What It Really Costs Your Business](https://www.zenzap.co/blog-posts/slack-pricing-in-2026-complete-guide-what-it-really-costs-your-business)
[^7yw3a9]: [Calendly vs Zoom Scheduler: Honest Comparison (2026)](https://prospeo.io/s/calendly-vs-zoom)
[^lbh4u5]: [Calendly vs Zoom Scheduler: Full Comparison for 2026](https://zeeg.me/en/blog/post/calendly-vs-zoom-scheduler)
[^g0nlcg]: [Calendly Pricing](https://calendly.com/pricing)
[^doodle]: [Doodle Pricing — Business Plan](https://doodle.com/en/premium/)
[^9irjl6]: [5 Best VC Portfolio Monitoring Tools (2026 Compared)](https://vcbeast.com/best-portfolio-monitoring-tools)
[^wv1771]: [The Open-Source Airtable Alternative: APITable, nocodb & ...](https://aitable.ai/blog/open-source-airtable-alternative/)
[^fpdi0w]: [Confluence vs Notion Pricing 2026 | Features & Cost Comparison](https://www.docsie.io/blog/articles/confluence-vs-notion-pricing-comparison-2026/)
[^m69w5r]: [Top Tableau competitors and alternatives to consider](https://www.thoughtspot.com/data-trends/business-intelligence/tableau-competitors)
[^zy5y8t]: [Tableau Alternatives: Visual Data Analysis Tools for Every Budget](https://querio.ai/articles/tableau-alternatives-visual-data-analysis-tools-for-every-budget)
[^4m5obv]: [Best Tableau Alternatives in 2026: Matched to Why You're Looking](https://www.definite.app/blog/best-tableau-alternatives)
[^mchmp1]: [Mailchimp Pricing Plans | Mailchimp](https://mailchimp.com/pricing/marketing/)
[^kitcrt]: [Kit (ConvertKit) Pricing 2026: Plans, Costs & Value](https://www.emailvendorselection.com/kit-pricing/)
[^plunk1]: [Plunk Pricing — The Open-Source Email Platform](https://www.useplunk.com/pricing)
[^hoot01]: [Hootsuite Pricing 2026: Plans, Costs & Hidden Fees](https://checkthat.ai/brands/hootsuite/pricing)
[^smmcmp]: [Social Media Management Pricing Comparison 2026: Hootsuite vs Buffer vs Sprout Social vs Agorapulse](https://www.saaspricepulse.com/blog/social-media-management-pricing-comparison-2026)
[^rdpio1]: [Raindrop.io Pro — Subscription pricing](https://raindrop.io/pro/buy)
