# vc-self-host-stack

A curated, deployable open-source tech stack a VC firm can self-host instead of paying $85k–$280k/yr in SaaS rent.

The thesis (vendor-by-vendor pricing, recommended OSS alternatives, savings math): see [A logic behind Self-Hosted VC Stacks](https://www.lossless.group/vibe-with-us/a-logic-behind-self-hosted-vc-stacks) on lossless.group.

## Shape

```
self-host-stack/
  core/                       ← the tools we've chosen and stand behind (submodules)
    twenty-crm/                 → lossless-group/twenty-crm   (Affinity alternative)
    papermark/                  → lossless-group/papermark    (DealRoom / ShareVault alternative)
    …                           more to come (Cal.com, Mattermost, Metabase, …)
  studies/                    ← areas where we explored alternatives but didn't commit
  client-stacks/              ← per-client deployed instances (gitignored — operational, not public)
```

- **`core/`** is the marketing surface. Each entry is a thin deploy wrapper around an upstream OSS tool, ideally referencing the official upstream image rather than vendoring it. The submodules point at our forks under `lossless-group/` so we can layer Lossless-flavored deploy artifacts (Dockerfiles, Railway / Fly templates, env examples) without polluting upstream.
- **`studies/`** is the "we looked at these and chose otherwise" layer. Pinned-upstream submodules for prior art we read but didn't ship.
- **`client-stacks/`** is operational. Each subdir is one firm's actual deployment, with real env files and real database connection strings. **Intentionally gitignored** — these are not marketing material and they contain secrets.

## Why this repo exists

A VC firm's standard SaaS stack (Affinity + DealRoom + Cal.com + Slack + Zoom + Visible.vc + Tableau + Notion + …) runs $85k–$280k/yr depending on team size. Every line item has a credible open-source self-hosted alternative; the friction has historically been integration and deploy ergonomics, not capability. This repo is the integration-and-deploy-ergonomics layer.

## Status

Early. The first two pieces are TwentyCRM (CRM/relationship intelligence) and Papermark (virtual data room / deal flow document sharing). The catalogue this repo will grow into is enumerated in the [logic doc](https://www.lossless.group/vibe-with-us/a-logic-behind-self-hosted-vc-stacks).

## See also

- [lossless-group/twenty-crm](https://github.com/lossless-group/twenty-crm) — the CRM fork
- [lossless-group/papermark](https://github.com/lossless-group/papermark) — the VDR fork
- [lossless-group/lossless-monorepo](https://github.com/lossless-group/lossless-monorepo) — the parent pseudomonorepo this lives inside as a submodule
