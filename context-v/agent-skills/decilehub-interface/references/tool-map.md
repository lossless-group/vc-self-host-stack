# Decile Hub MCP — the 158-tool map

Enumerated live from `https://humain.decilehub.com/mcp` on **2026-08-18**
(`tools/list` → 158 tools, `prompts/list` → 0, `resources/list` → 0).
The surface is the same for every tenant; only the data behind it differs.

## Why this file exists

**Decile ships zero tool annotations.** Every one of the 158 tools returns an
empty `annotations` object — there is no `readOnlyHint`, no `destructiveHint`,
no `openWorldHint`. A client has no machine-readable way to tell
`list_people` from `publish_newsletter`. The **Tier** column below is the
missing classification, supplied by us.

| Tier | Count | Meaning | Rule |
|---|---|---|---|
| 🟢 read | 85 | Returns data, mutates nothing | Run freely |
| 🟡 write | 38 | Creates or updates records; additive and recoverable | Say what you're about to write, then write |
| 🟠 confirm | 22 | Deletes, tag removals, batch stage moves, GL postings, entity creation | Name the exact records and get a yes first |
| 🔴 outbound | 13 | Leaves the building — email, network feed, public links, other people's inboxes | Preview first, explicit yes, never batch |

Tiers are **ours**, not Decile's. When Decile adds tools, classify new ones by
asking: *does it leave the building?* (🔴) → *is it hard to undo?* (🟠) →
*does it write?* (🟡) → else 🟢.

Descriptions below are the tools' own first lines, truncated. The tools carry
much longer descriptions in-band — the 🔴 ones in particular spell out their
own preview-first and `confirm: true` requirements. Read the live description
before first use of any tool you haven't run before.

## Identity & connection

| Tool | Tier | What it does |
|---|---|---|
| `whoami` | 🟢 read | Identify the authenticated API token — returns token metadata (kind, permissions, expiry), the user, the account, account_user role flags, and… |
| `get_account` | 🟢 read | Get the current account associated with the API key. |
| `list_account_users` | 🟢 read | List the AccountUsers (team members) on the current account — id, name, email, title, is_admin. Use to discover the `assigned_id` value for… |
| `debug_api_request` | 🟢 read | Verify the API key works by hitting GET /accounts. |
| `check_api_key_status` | 🟢 read | Report whether the current request includes a valid X-Decile-API-Key header. |

## CRM directory — people

| Tool | Tier | What it does |
|---|---|---|
| `search_people_orgs` | 🟢 read | Look up people and organizations in the account's Hub CRM by name, email fragment, or company name — answers "who/what is X?" and "who referred us… |
| `list_people` | 🟢 read | List people with optional filters. Each person includes a `picture` object (or null) with a downloadable `url`, `content_type`, `byte_size`, and… |
| `get_person` | 🟢 read | Get a single person by ID. The response includes a `picture` object (or null) with a downloadable `url`, `content_type`, `byte_size`, and `filename`. |
| `create_or_update_person` | 🟡 write | Create a person or update the existing person matched by email. |
| `update_person` | 🟡 write | Update an existing person selected by numeric ID. All fields except id are optional. |
| `update_people` | 🟡 write | Update up to 100 existing people by numeric ID with per-item results. Remote image URLs are fetched sequentially; omit images or split image-heavy… |
| `create_people` | 🟡 write | Bulk create people (max 100 per request). Returns created/duplicates/errors arrays. |
| `delete_person` | 🟠 confirm | Delete a person by ID. |
| `add_person_note` | 🟡 write | Add a note to a person by ID. |
| `delete_person_note` | 🟠 confirm | Delete a note from a person by note ID. |
| `remove_person_tags` | 🟠 confirm | Remove one or more tags from a person identified by `email`. Send the `tags` to remove |

## CRM directory — organizations

| Tool | Tier | What it does |
|---|---|---|
| `list_organizations` | 🟢 read | List organizations with optional filters. Each organization includes a `logo` object (or null) with a downloadable `url`, `content_type`,… |
| `get_organization` | 🟢 read | Get a single organization by ID. The response includes a `logo` object (or null) with a downloadable `url`, `content_type`, `byte_size`, and… |
| `create_or_update_organization` | 🟡 write | Create an organization or update the existing organization matched by name. |
| `update_organization` | 🟡 write | Update an existing organization selected by numeric ID. All fields except id are optional. |
| `update_organizations` | 🟡 write | Update up to 100 existing organizations by numeric ID with per-item results. Remote image URLs are fetched sequentially; omit images or split… |
| `create_organizations` | 🟡 write | Bulk create organizations (max 100 per request). Returns created/duplicates/errors arrays. |
| `delete_organization` | 🟠 confirm | Delete an organization by ID. |
| `add_organization_note` | 🟡 write | Add a note to an organization by ID. |
| `delete_organization_note` | 🟠 confirm | Delete a note from an organization by note ID. |
| `remove_organization_tags` | 🟠 confirm | Remove one or more tags from an organization identified by `name`. Send the `tags` to remove |

## Pipelines & prospects

| Tool | Tier | What it does |
|---|---|---|
| `list_pipelines` | 🟢 read | List active pipelines for the current account. Pass `kind` to filter by pipeline category (e.g. `investor` for LP/investor pipelines). Each row… |
| `get_pipeline` | 🟢 read | Get a single pipeline by ID. |
| `search_pipeline_prospects` | 🟢 read | Look up pipeline prospects — investor/LP prospects AND deal-flow (company) prospects — by name or email fragment, |
| `get_prospects` | 🟢 read | List pipeline prospects with optional filters. |
| `upsert_pipeline_prospect` | 🟡 write | Create or update a single pipeline prospect. Body must contain exactly one of `person` or `organization` inside `prospect`. |
| `update_pipeline_prospect` | 🟠 confirm | Update a single pipeline prospect by ID — same fields as the batch tool without the wrapper array. |
| `update_pipeline_prospects` | 🟠 confirm | Batch update pipeline prospects — change stage, probability, rating, contact dates, append a note, or update tags/custom_data_points. |
| `create_multiple_prospects` | 🟡 write | Create multiple prospects on a pipeline. Provide at least one of people or organizations. |
| `bulk_create_prospects` | 🟡 write | Create up to 100 prospects on a pipeline in ONE call with per-entry dedupe and outcomes. Each entry is {type: "Person"\|"Organization" (default… |
| `delete_pipeline_prospect` | 🟠 confirm | Remove a prospect from its pipeline by ID. This is a RECOVERABLE soft discard, not a permanent deletion: the prospect disappears from the pipeline… |
| `add_pipeline_prospect_note` | 🟡 write | Add a note to a pipeline prospect by ID. |
| `delete_pipeline_prospect_note` | 🟠 confirm | Delete a note from a pipeline prospect by note ID. |
| `remove_pipeline_prospect_tags` | 🟠 confirm | Remove one or more tags from pipeline prospects. Send `pipeline_id`, the `tags` to remove |
| `create_pipeline_data_point` | 🟡 write | Create a custom data point (Variable) on the account, scoped to the type of the targeted pipeline (investor / company / etc). The data point is… |
| `list_variables` | 🟢 read | List the firm's merge-tag variables for a pipeline — the same catalog users pick from when composing emails. Required: `pipeline_id`. |
| `get_variable` | 🟢 read | Get a single variable's full schema — `{id, name, context, description, value, format_name, display_format}`, plus `select_options` when… |
| `list_prospect_attachments` | 🟢 read | List the files available for an investment-pipeline prospect: direct CRM attachments on the prospect's organization/person (`source: "direct"`)… |
| `upload_prospect_attachment` | 🟡 write | Attach a file directly to an investment-pipeline prospect (its underlying organization/person) — the same attachment list the prospect page shows… |
| `download_prospect_attachment` | 🟢 read | Download a prospect attachment (pitch deck, cap table, or other file listed by list_prospect_attachments) by its ActiveStorage signed blob id.… |
| `delete_prospect_attachment` | 🟠 confirm | Delete a direct prospect attachment by its `id` from list_prospect_attachments (source: "direct" entries only — questionnaire uploads carry no id… |
| `list_pipeline_action_executions` | 🟢 read | List the pipeline action executions queued for a prospect at its current stage (send_email, move_to_stage, assign_user, apply_tag, execute_job,… |
| `preview_pipeline_action_execution` | 🟢 read | Render the email a pending `send_email` PipelineActionExecution would send — subject, body, recipient, attachments, resolved/unresolved variables… |
| `execute_pipeline_action_execution` | 🔴 outbound | Execute ONE pending pipeline action execution for a prospect (send the email, move the stage, apply the tag, run the job, etc.). The action runs… |

## Email & newsletters

| Tool | Tier | What it does |
|---|---|---|
| `preview_email` | 🟢 read | Render an email — subject, body, recipient, attachments, resolved/unresolved variables — WITHOUT sending it. Stateless: no DB row is written. Use… |
| `send_email` | 🔴 outbound | Send a composed email — immediate, scheduled, or as a test send. Mirrors the UI's "quick email" compose path. Reuses the canonical… |
| `list_email_templates` | 🟢 read | List the email templates available to the current account, paginated 50 per page (0-indexed). Optionally filter by `pipeline_id` to narrow to a… |
| `get_email_template` | 🟢 read | Get a single email template's full schema — `rich_subject`, `body` (HTML), `variables[]` (each `{name, required}`), and `attachments[]`. |
| `list_newsletters` | 🟢 read | List the account's newsletters (newest first), with `status`, `body_mode`, schedule/publish timestamps, and a one-line recipient-filter summary. |
| `get_newsletter` | 🟢 read | Get one newsletter: subject, body, recipient-filter detail (including `recipient_count`), and delivery stats (sent / failed / unsubscribed / opens… |
| `create_newsletter` | 🟡 write | Create a draft newsletter with its content and recipient filter. Creating never sends anything: the newsletter lands in `draft` and only… |
| `update_newsletter` | 🟡 write | Update a draft or scheduled newsletter's content, name, or recipient filter. Only the fields you supply change; everything else is left alone. |
| `preview_newsletter` | 🟢 read | Render a newsletter exactly as it will be mailed — resolved subject, finalized `body_html`, variable resolution, recipient count, and the publish… |
| `send_test_newsletter` | 🔴 outbound | Send a test copy of the newsletter to literal email addresses you supply. The real audience is never contacted, no `Newsletter::Send` rows are… |
| `publish_newsletter` | 🔴 outbound | Send the newsletter to every calculated recipient, or schedule it for a future time. This is irreversible: there is no unsend. |

## LP closing & fundraise paperwork

| Tool | Tier | What it does |
|---|---|---|
| `send_pact` | 🔴 outbound | Send a PACT (Pledge Agreement for Capital Transaction) email to a Person — mirrors the UI "Send PACT" button. |
| `send_lpa` | 🔴 outbound | Send an LPA (Limited Partnership Agreement) email to a Person — mirrors the UI "Send LPA" button. |
| `list_pacts` | 🟢 read | List signed PACTs (soft commitments) on the caller account's investor pipelines — answers "has NAME signed a PACT?". |
| `get_research_investors` | 🟢 read | List the shared "Decile Research" LP roster. Every authenticated account sees the same roster. |
| `copy_research_investors_to_pipeline` | 🟠 confirm | Copy selected entries from the shared "Decile Research" LP roster into one of the caller's own |

## Deal flow — shares & memos

| Tool | Tier | What it does |
|---|---|---|
| `list_deal_shares` | 🟢 read | List the deal shares submitted by the current account into the network feed. Each row carries the full submission attributes (company_name,… |
| `get_deal_share` | 🟢 read | Fetch a single deal share owned by the current account by id, with its full submission attributes (company_name, the_bet, referring manager,… |
| `share_deal` | 🔴 outbound | Share a deal from the caller account into the network feed. Idempotent per organization. Pass selected_files to attach existing org / deal-memo /… |
| `enrich_deal_share` | 🟡 write | Run AI auto-fill enrichment for a deal share. Given an organization in the caller's account and a list of deal-share form field names, the model… |
| `delete_deal_share` | 🟠 confirm | Permanently delete a deal share owned by the current account by id. Only shares belonging to the active account can be deleted; an unknown or… |
| `copy_deal_to_pipeline` | 🟠 confirm | Copy a network-feed shared deal into one of the caller account's pipeline stages. Creates (or reuses) an organization in the caller's account and… |
| `list_deal_memos` | 🟢 read | List deal memos for the current account. Each row is a compact summary (id, stage, investment_type, organization, close_type, timestamps). Filter… |
| `get_deal_memo` | 🟢 read | Fetch a single deal memo by id with the full payload — organization, counterfactual, links, ratings summary, and question answers — so an agent… |
| `create_deal_memo` | 🟡 write | Start a new deal memo for an organization in the caller account. Fails if the organization already has a non-closed deal memo. |
| `update_deal_memo` | 🟡 write | Update an existing deal memo in the caller account. Rejects updates to closed deal memos. Does not update ratings, answers, attachments, or… |
| `submit_deal_memo_for_review` | 🔴 outbound | Submit a deal memo for review by Decile Hub. Requires the account to have the Deal Memo Review product enabled. Optionally attach a submission… |
| `close_deal_memo` | 🟠 confirm | Close a deal memo with an outcome of approve or pass. Moves the prospect to the configured pipeline stage and dispatches the close notification. |

## Portfolio & investments

| Tool | Tier | What it does |
|---|---|---|
| `list_portfolio_companies` | 🟢 read | List portfolio companies for the current account, scoped across all funds. Each row is a fund's stake in a single underlying organization. Use… |
| `get_portfolio_company` | 🟢 read | Get a single portfolio company by ID, returning the same allowlisted fields exposed by list_portfolio_companies (identity + investment metadata:… |
| `list_portfolio_company_investments` | 🟢 read | List the investments (accounting-transaction-driven tranches) belonging to a single portfolio company for a selected as-of date. Each row includes… |
| `get_portfolio_company_investment` | 🟢 read | Get a single portfolio company investment (accounting-transaction-driven tranche) by ID. Returns the allowlisted column fields exposed by… |
| `list_portfolio_company_valuations` | 🟢 read | List the valuation history for a portfolio company, newest first. Returns valuation dates, event types and reasons, mark values, share pricing,… |
| `get_portfolio_company_valuation` | 🟢 read | Get one portfolio company valuation event with its full mark provenance, including date, source/reason, pricing, approval and audit metadata,… |
| `list_schedule_of_investments` | 🟢 read | Return a structured, read-only Schedule of Investments for reconciliation, including company groups, position/tranche marks, security details,… |

## Fund admin & accounting

| Tool | Tier | What it does |
|---|---|---|
| `list_entities` | 🟢 read | List investment entities (funds, SPVs, holding entities, management companies, general partnerships) for the current account. "Entity" here is the… |
| `get_entity` | 🟢 read | Get a single investment entity (fund, SPV, holding entity, management company, or general partnership) by its integer id. Returns the identity… |
| `create_entity` | 🟠 confirm | Create a firm-admin entity (fund, SPV, holding, management company, or general partnership) under the authenticated account. Onboarding side… |
| `update_entity` | 🟠 confirm | Update writable fields on an existing firm-admin entity. All fields except id are optional; only sent fields are applied. kind is immutable… |
| `list_capital_accounts` | 🟢 read | Lists capital accounts (LPs and GPs) under an entity (fund, SPV, or holding entity), identity-only. Returns id, name, vehicle_type, partner_type,… |
| `get_capital_account` | 🟢 read | Get a single capital account by its integer id. Returns the identity block (id, name, vehicle_type, partner_type, admitted_on, lp_signature_at,… |
| `get_capital_account_calculations` | 🟢 read | Get the period-scoped capital-account numbers for one capital account, grouped into commitments, period_activity, performance (dpi, rvpi, tvpi),… |
| `list_capital_account_calculations` | 🟢 read | Bulk + totals variant of the capital-account calculations endpoint. Returns one calc block per capital account under the entity plus a `totals`… |
| `list_capital_calls` | 🟢 read | Lists capital calls under an entity (fund/SPV). Returns header rows: id, name, status (draft/open/closed), percentage_to_call, notes, pipeline_id,… |
| `get_capital_call` | 🟢 read | Get a single capital call by integer id. Returns the header block: id, name, status (draft/open/closed), percentage_to_call, notes, pipeline_id,… |
| `list_capital_call_details` | 🟢 read | Lists the per-LP detail rows under a capital call. Each row returns: id, capital_account ({id, name}), amount_being_called, called_at,… |
| `list_journal_entries` | 🟢 read | Lists journal entries (general-ledger / accounting transactions, double-entry GL postings) for an entity (fund/SPV). Each row returns id,… |
| `get_journal_entry` | 🟢 read | Get a single journal entry (general-ledger / accounting transaction — a double-entry GL posting) by integer id. Returns id, transaction_at,… |
| `create_journal_entry` | 🟠 confirm | Create one journal entry (general-ledger / accounting transaction — a double-entry GL posting) under an entity (fund/SPV). Posts a single… |
| `bulk_create_journal_entries` | 🟠 confirm | Create many journal entries (general-ledger / accounting transactions — double-entry GL postings) under one entity (fund/SPV) in a single atomic,… |
| `list_accounting_accounts` | 🟢 read | Lists the chart of accounts / GL account codes (FirmAdmin::AccountingAccount) shared across the account. Use this to discover valid account codes… |
| `get_accounting_account` | 🟢 read | Get a single chart-of-accounts / GL account code (FirmAdmin::AccountingAccount) by its integer id. Returns id, code, name, description,… |
| `list_bank_transactions` | 🟢 read | Read-only discovery of imported bank transactions for an entity. Returns a paginated allowlist with entity, normalized transaction details,… |
| `get_bank_transaction` | 🟢 read | Read-only lookup of one imported bank transaction by id. Returns the same privacy-preserving allowlist as list_bank_transactions, including… |
| `generate_financial_report` | 🟡 write | Queue async financial report job for firm-admin-enabled entities of entity_type in current account. Returns job; poll status_url or… |
| `list_financial_reports` | 🟢 read | List financial-report generation jobs for the current account, sorted by created_at desc, paginated 50 per page. |
| `get_financial_report` | 🟢 read | Get current status (and download URLs once succeeded) for a financial-report generation job created by the current token. |

## Data room — files & folders

| Tool | Tier | What it does |
|---|---|---|
| `list_folders` | 🟢 read | List folders in the data room with optional filters; paginated 0-indexed. |
| `get_folder` | 🟢 read | Show a folder, optionally with its child folders and/or files (filterable and orderable). |
| `create_folder` | 🟡 write | Create a new folder, optionally nested under a parent. Folder names must be unique within the same parent. |
| `list_files` | 🟢 read | List files in the data room with optional filters; paginated 0-indexed. |
| `get_file` | 🟢 read | Get details for a specific file (metadata + associated folders). |
| `update_file` | 🟡 write | Update a file's metadata, or upload a new version when file_data_base64 is provided. |
| `upload_file` | 🟡 write | Upload a file to the data room. Provide the file bytes as base64 in file_data_base64 plus the original file_name (with extension). |
| `download_file` | 🟢 read | Download a file by ID. Returns JSON with filename, content_type, byte_size, and base64-encoded data. |
| `save_csv_to_folder` | 🟡 write | Generate a CSV file from structured rows and save it into a data room folder — the "export this list as a CSV/spreadsheet" flow. |
| `create_personalized_link` | 🔴 outbound | Mint a ready-to-open data room preview link on behalf of a recipient, pointed at a specific file or folder. The recipient can open the link… |

## Tasks

| Tool | Tier | What it does |
|---|---|---|
| `list_tasks` | 🟢 read | List Tasks for the active account with optional filters (status, assignee, origin). |
| `get_task` | 🟢 read | Get a single Task by id. |
| `create_task` | 🟡 write | Create a new user-origin Task assigned to an account member. |
| `update_task` | 🟡 write | Update a Task title, description, assignee, due date, or status. |
| `complete_task` | 🟡 write | Mark a Task as completed. |
| `submit_task_decision` | 🟠 confirm | Submit a confirmed approve or decline action only for a non-compliant-wire compliance-review Task created by that workflow. A declined task… |
| `search_task_linkable_files` | 🟢 read | Search data room files that can be linked onto an upload Task, optionally filtered by file name. |
| `link_task_file` | 🟡 write | Link an existing data room file onto an upload Task (idempotent). Linked files count toward the task's required file minimum — pair with the… |
| `unlink_task_file` | 🟡 write | Remove a linked data room file from an upload Task (idempotent). |
| `upload_task_document` | 🟡 write | Attach a document to a Task. Provide the task id plus the file bytes as base64 in file_data_base64 and the original file_name (with extension). |

## Events

| Tool | Tier | What it does |
|---|---|---|
| `list_events` | 🟢 read | List events with optional filters. |
| `get_event` | 🟢 read | Get a single event by ID. |
| `create_event` | 🟡 write | Create a new event. |
| `update_event` | 🟡 write | Update an existing event. |
| `delete_event` | 🟠 confirm | Delete an event by ID. |
| `list_guests` | 🟢 read | List guests for an event. |
| `add_guest` | 🟡 write | Add a guest to an event. |
| `update_rsvp` | 🟡 write | Update RSVP for an event guest. |

## Activity feed

| Tool | Tier | What it does |
|---|---|---|
| `list_activity_entries` | 🟢 read | List activity feed entries for the current account. Filter by subject (entity), event type, actor (user), or date range. Use this to answer "what… |
| `get_activity_entry` | 🟢 read | Get a single activity feed entry by ID, including the full per-type entryable body (audit change diffs, full email bodies and recipients, note… |

## Base community & Braintrust

| Tool | Tier | What it does |
|---|---|---|
| `search_base` | 🟢 read | Full-text search across Base posts and group articles. Returns up to `article_limit` articles and `post_limit` posts. Available to any API token… |
| `base_channels` | 🟢 read | List Base channels accessible to the authenticated user. Available to any API token with Base access (legacy tokens additionally require the… |
| `base_inbox` | 🟢 read | List Base inbox items (posts and replies) for the authenticated user, paginated and filterable. Available to any API token with Base access… |
| `list_channel_posts` | 🟢 read | List posts within a single Base channel, most-recent-first, with pagination meta (page, per_page, total, has_more). Available to any API token… |
| `get_base_post` | 🟢 read | Show a Base post by id, including content (plain text), author, url, and ordered replies. Available to any API token with Base access (legacy… |
| `create_base_post` | 🔴 outbound | Create a new Base post in a channel. `content` is rendered as markdown. Write `@FirstName` or `@FirstName LastName` to mention (notify) a Hub… |
| `create_base_reply` | 🔴 outbound | Reply to a Base post. `content` is rendered as markdown. Write `@FirstName` or `@FirstName LastName` to mention (notify) a Hub user; use the full… |
| `download_base_attachment` | 🟢 read | Download a Base post or reply attachment by its ActiveStorage signed blob id. Returns JSON with filename, content_type, byte_size, and… |
| `braintrust_list` | 🟡 write | List the Braintrusts (shared AI rooms) you are a member of — each with its id, name, your role, member count, archived flag, and when its digest… |
| `braintrust_pull_digest` | 🟡 write | Pull the compact digest of a Braintrust (shared AI room) you are a member of: running digest text, active captured items, and current members.… |
| `braintrust_ask` | 🔴 outbound | Ask an ACTIVE member of a Braintrust (shared AI room) to do or answer something. Creates a Task in their Hub inbox and posts a 🙋 trace line in the… |
| `braintrust_share` | 🔴 outbound | Share context from this session into a Braintrust (shared AI room) you are a member of. Stored as an attributed message with external-session… |

## Decilex wiki & solutions store

| Tool | Tier | What it does |
|---|---|---|
| `wiki_ask` | 🟢 read | Ask a natural-language question against the decilex wiki at `docs/wiki/`. Returns the top candidate pages (with full markdown body + 1-hop graph… |
| `wiki_search` | 🟢 read | Search the decilex wiki by query, by tag, or both. Each hit includes its 1-2 hop graph neighbors so callers do not need a follow-up subgraph call.… |
| `wiki_find_page` | 🟢 read | Look up a single decilex wiki page by its wiki-root-relative path (e.g. "concepts/catch_up_fees.md"). Returns the page metadata: type, name, tags,… |
| `wiki_pages_by_tag` | 🟢 read | Enumerate decilex wiki pages tagged with the given tag. Optional `type` filter narrows to a single page type (e.g. "concept", "entity"). Returns a… |
| `wiki_subgraph` | 🟢 read | Walk the decilex wiki graph from a seed page out to N hops. Returns pages reachable via `related` and (by default) `in_body_link` edges, each… |
| `wiki_edges` | 🟢 read | List every edge incident to a single decilex wiki page — both outbound (this page links elsewhere) and inbound (other pages link here), tagged… |
| `wiki_orphans` | 🟢 read | List decilex wiki pages with zero inbound `related` or `in_body_link` edges. These are pages no other page links to — candidates for promotion in… |
| `wiki_stale_pages` | 🟢 read | List decilex wiki pages whose `last_verified` is older than `older_than_days` (default 90) OR whose source_refs have on-disk mtimes newer than… |
| `solutions_search` | 🟢 read | Search the compound-engineering solutions store at docs/solutions/. Three modes: text search (`query` only) returns BM25-ranked hits with… |
| `solutions_find` | 🟢 read | Fetch one solution doc by its relative path under docs/solutions/. Returns frontmatter + tags + affected_files. The full body is NOT included; if… |
## Re-enumerating after a Decile release

```bash
key=$(grep '^DECILEHUB_API_KEY=' client-stacks/humain-vc/decilehub/.env | cut -d= -f2-)
curl -s -X POST https://humain.decilehub.com/mcp \
  -H "Content-Type: application/json" \
  -H "Accept: application/json, text/event-stream" \
  -H "Authorization: $key" \
  -d '{"jsonrpc":"2.0","id":1,"method":"tools/list"}' \
  | python3 -c 'import json,sys; t=json.load(sys.stdin)["result"]["tools"]; print(len(t)); [print(x["name"]) for x in sorted(t, key=lambda y: y["name"])]'
```

Diff the names against this file. New tools get a tier before they get used.
A stale map is worse than none — it classifies a destructive tool as safe.
