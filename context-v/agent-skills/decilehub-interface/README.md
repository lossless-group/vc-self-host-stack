# decilehub-interface

An agent skill for operating a VC firm's **Decile Hub** from Claude Desktop,
claude.ai, or Claude Teams, through Decile's native MCP connector.

## Install

**Claude Desktop / claude.ai** — zip this folder and upload it under
**Settings → Capabilities → Skills**. The zip needs one top-level directory
containing `SKILL.md`:

```
decilehub-interface/
  SKILL.md
  references/
  templates/
```

**Claude Code** — symlink the folder as a *direct child* of `~/.claude/skills/`:

```bash
ln -s "$PWD/decilehub-interface" ~/.claude/skills/decilehub-interface
```

A symlinked *parent* directory does not expose the skills nested inside it, and
a newly linked skill loads in the **next** session, not the current one.

## Connect Decile first

**Settings → Connectors → Add custom connector →**
`https://<tenant>.decilehub.com/mcp` → sign in with your own Hub account.

Sign in as yourself. Decile attributes every action to the account that performed
it, so individual logins keep the audit trail honest and offboarding is just
disabling a Hub account.

## Getting updates

You don't need git, GitHub, or a checkout. When a new version ships you'll get a
link to a **GitHub Release** — download the `.zip` from that page, then in Claude
go to **Settings → Capabilities → Skills**, remove the old `decilehub-interface`,
and upload the new one. Roughly thirty seconds.

The connector you set up in Settings → Connectors is **separate** and is not
affected by a skill update — you never have to redo that.

## What's here

| | |
|---|---|
| `SKILL.md` | The operating guide: safety tiering, data model, nine ordered procedures |
| `references/tool-map.md` | All 158 MCP tools, grouped and tiered read / write / confirm / outbound |
| `references/pipeline-vocabulary.md` | Every pipeline and stage for the configured tenant, plus the `[Hold]` rule |
| `references/connector-setup.md` | OAuth vs API-token channels, and the ways setup silently breaks |
| `templates/deal-upsert.md` | Fill-in form: create or update a deal record |
| `templates/lp-upsert.md` | Fill-in form: create or update an LP record |
| `templates/speech-to-text-upsert.md` | Voice memo or call transcript → *n* records |

## Why it exists

Decile ships **158 MCP tools with zero annotations** — nothing marks a tool
read-only or destructive, so `list_people` and `publish_newsletter` (irreversible,
mails every recipient) look identical to a client. This skill supplies the
missing classification, the firm's own stage vocabulary, and the discipline that
keeps an agent from reporting data the CRM doesn't actually hold.

It is the **operating layer**, not a catalogue. Decile publishes an official
`decile_hub` skill listing the tools; where the two disagree on a *fact*, theirs
and the live spec win — where they disagree on *what to do*, this one does.

## Tenant-specific content

`references/pipeline-vocabulary.md` and the *Client constants* table in
`SKILL.md` describe one firm's Decile tenant. Re-pull both for another tenant —
each file carries the command that regenerates it. No credentials are stored in
this folder; the email-intake address in particular is deliberately referenced
but never printed, because possession of it is authorization.
