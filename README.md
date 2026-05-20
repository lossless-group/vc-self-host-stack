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

## Coming next

Cal.com (scheduling), Mattermost (team chat), Jitsi Meet (video), Metabase (BI), NocoDB (no-code DB), BookStack (knowledge base). Each will land as its own submodule under `core/` with the same deploy-wrapper discipline. See the [full catalogue](#the-stack) below.

---

## Repo shape

```
self-host-stack/
  core/                       ← the tools we've chosen and stand behind (submodules)
    twenty-crm/                 → lossless-group/twenty-crm   (Affinity alternative)
    papermark/                  → lossless-group/papermark    (DealRoom / ShareVault alternative)
    …                           more to come
  studies/                    ← alternatives we explored but didn't ship (submodules)
  client-stacks/              ← per-firm deployed instances (gitignored — operational, not public)
```

- **`core/`** is the marketing surface. Each entry is a thin deploy wrapper around an upstream OSS tool, ideally referencing the official upstream image rather than vendoring it. The submodules point at forks under `lossless-group/` so deploy-side modifications can layer without polluting upstream.
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
| **Salesforce Financial Services Cloud** | $325–$750/user/month + $50k–$250k implementation[^xwmpq2][^sye4vh] | **SuiteCRM** — Enterprise-grade fork of SugarCRM, full module ecosystem, battle-tested | $0 |
| **4Degrees** | ~$100/user/month[^9heupy] | **EspoCRM** — Custom deal flow pipelines, flexible workflow builder, fast setup | $0 |
| **DealCloud** | ~$85,000/yr enterprise[^9heupy] | **Corteza CRM** — Privacy-first, GDPR-compliant, API-first low-code architecture | $0 |

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

| Proprietary Vendor | Pricing | Self-Hosted Alternative | Licensing Cost |
|---|---|---|---|
| **Visible.vc** | $149/mo (15 companies) → $349/mo (40 companies)[^9irjl6] | **Ghostfolio** — Open-source wealth/portfolio tracking with data-driven insights | $0 |
| **Archstone** | $297/mo Core (15 portfolio + 25 LPs)[^9irjl6] | **Wealthfolio** — Local-first private portfolio tracker; desktop, mobile, or self-hosted web | $0 |
| **Carta Portfolio** | $280–$77,000/yr by portfolio size[^9heupy] | **Rotki** — Privacy-focused, fully encrypted local portfolio manager with accounting/analytics | $0 |
| *(any of the above)* | *(see above)* | **Baserow + NocoDB (custom)** — Custom portfolio tracking DB with API-driven data collection | $0 |

**Annual savings (20 portfolio companies):** $3k–$4k vs. Visible.vc Standard; $8k–$13k at enterprise scale.

### Team Communication & Collaboration

Real-time messaging platforms for deal discussions, channel-organized portfolio updates, and LP communications.

| Proprietary Vendor | Pricing | Self-Hosted Alternative | Licensing Cost |
|---|---|---|---|
| **Slack Pro** | $7.25/user/month (billed annually)[^v6511v][^nn66bt] | **Mattermost** — Self-hosted Slack clone; strong encryption, extensive plugin system, mobile apps | $0 |
| **Slack Business+** | $12.50/user/month[^nn66bt] | **Rocket.Chat** — MIT-licensed, omnichannel comms, video calls, federation, fully brandable | $0 |
| **Slack Pro + AI** | $22.25/user/month[^v6511v] | **Zulip** — Thread-centric chat with unique conversation model; self-hosted or cloud | $0 |
| **Microsoft Teams** | $4–$12.50/user/month (M365 bundle)[^v6511v] | **Element (Matrix)** — Fully end-to-end encrypted messaging on federated Matrix protocol | $0 |

**Annual savings:** $1.2k–$3.9k for 15-person team; $3.1k–$6.3k for 50-person firm.

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
| **Calendly Standard** | $10/user/month[^lbh4u5][^g0nlcg] | **Cal.com** — Open-source Calendly alternative; full source access, self-hostable, identical feature set | $0 |
| **Calendly Teams** | $16/user/month with routing/distribution[^lbh4u5] | **Easy!Appointments** — Self-hosted scheduling with Google Calendar/CalDAV sync, provider mgmt, email notifications, API | $0 |
| **Calendly Enterprise** | From $15,000/yr (SAML SSO, advanced controls)[^7yw3a9] | **Cal.com (self-hosted Enterprise)** — Full enterprise feature set including SSO, SCIM, audit logs | $0 |
| **Doodle Business** | ~$14.95/user/month (group find-a-time polls)[^doodle] | **Rallly** — Open-source Doodle alternative for group scheduling; modern Next.js, 10k+ GitHub stars. Different lane than Cal.com — covers IC scheduling, LP annual meeting coordination, partner offsites where 1:1 booking pages don't fit. | $0 |

**Annual savings (15-person team):** $1.3k–$4k vs. Teams or Enterprise tiers. Add ~$2.7k/yr if replacing Doodle Business at the same scale.

### Database & Workflow Applications

No-code/low-code database platforms for custom deal pipelines, LP management dashboards, and investment committee workflows.

| Proprietary Vendor | Pricing | Self-Hosted Alternative | Licensing Cost |
|---|---|---|---|
| **Airtable Pro** | $20/user/month[^wv1771] | **NocoDB** — Turns any MySQL/PostgreSQL into Airtable-like UI; 56k+ GitHub stars, auto-generated REST APIs | $0 |
| **Airtable Business** | $45/user/month[^wv1771] | **Baserow** — Fast even at unlimited rows; Airtable-style interface, automation, dashboards, API integration | $0 |
| **Notion Plus** | $10/user/month[^fpdi0w] | **NocoBase** — Broader low-code application framework; builds full custom business apps beyond just DB UI | $0 |
| **Notion Business** | $20/user/month (includes AI)[^fpdi0w] | **Teable** — Modern spreadsheet-style open-source alternative with relational capabilities | $0 |

**Annual savings (15-person team):** $2.4k–$7.5k depending on vendor tier replaced.

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

| Proprietary Vendor | Pricing | Self-Hosted Alternative | Licensing Cost |
|---|---|---|---|
| **Confluence Standard** | $5.42/user/month (Rovo AI included)[^fpdi0w] | **Outline** — Modern, fast wiki with Slack-style editing, real-time collaboration, markdown-native | $0 |
| **Confluence Premium** | $10.42/user/month[^fpdi0w] | **BookStack** — Self-hosted wiki with book/chapter/page hierarchy; ideal for organizing investment frameworks | $0 |
| **Notion Plus** | $10/user/month[^fpdi0w] | **Wiki.js** — Modern open-source wiki; multiple auth options, beautiful UI, extensive plugin ecosystem | $0 |
| **Notion Business** | $20/user/month (includes AI)[^fpdi0w] | **AppFlowy** — The most Notion-shaped OSS option; docs + databases + AI in one app, 60k+ GitHub stars, native desktop clients, self-hostable via AppFlowy Cloud. Also covers Airtable-style database use cases. | $0 |

**Annual savings (20-person team):** $1.3k–$4.2k; $4.1k–$10.8k for 50-person firm.

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
[^9irjl6]: [5 Best VC Portfolio Monitoring Tools (2026 Compared)](https://vcbeast.com/best-portfolio-monitoring-tools)
[^v6511v]: [The 5 best Slack alternatives for businesses in 2026](https://zapier.com/blog/slack-alternatives/)
[^nn66bt]: [Slack Pricing in 2026: Complete Guide & What It Really Costs Your Business](https://www.zenzap.co/blog-posts/slack-pricing-in-2026-complete-guide-what-it-really-costs-your-business)
[^7yw3a9]: [Calendly vs Zoom Scheduler: Honest Comparison (2026)](https://prospeo.io/s/calendly-vs-zoom)
[^lbh4u5]: [Calendly vs Zoom Scheduler: Full Comparison for 2026](https://zeeg.me/en/blog/post/calendly-vs-zoom-scheduler)
[^g0nlcg]: [Calendly Pricing](https://calendly.com/pricing)
[^doodle]: [Doodle Pricing — Business Plan](https://doodle.com/en/premium/)
[^wv1771]: [The Open-Source Airtable Alternative: APITable, nocodb & ...](https://aitable.ai/blog/open-source-airtable-alternative/)
[^fpdi0w]: [Confluence vs Notion Pricing 2026 | Features & Cost Comparison](https://www.docsie.io/blog/articles/confluence-vs-notion-pricing-comparison-2026/)
[^m69w5r]: [Top Tableau competitors and alternatives to consider](https://www.thoughtspot.com/data-trends/business-intelligence/tableau-competitors)
[^zy5y8t]: [Tableau Alternatives: Visual Data Analysis Tools for Every Budget](https://querio.ai/articles/tableau-alternatives-visual-data-analysis-tools-for-every-budget)
[^4m5obv]: [Best Tableau Alternatives in 2026: Matched to Why You're Looking](https://www.definite.app/blog/best-tableau-alternatives)
