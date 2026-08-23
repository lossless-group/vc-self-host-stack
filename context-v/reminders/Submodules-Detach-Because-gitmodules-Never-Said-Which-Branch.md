---
title: "Submodules detach because .gitmodules never said which branch"
lede: "The parent pins a raw SHA, so every submodule update lands on a detached HEAD. Declaring branch and update in .gitmodules fixes it once for every clone — but the bulk scripts that promise to fix it are exactly the things that have historically detached submodules AND clobbered their remotes."
date_created: 2026-08-23
date_modified: 2026-08-23
authors:
  - Michael Staton
augmented_with:
  - Claude Code on Claude Opus 5
semantic_version: 0.0.0.1
status: Draft
tags:
  - Reminder
  - Git
  - Submodules
  - Pseudomonorepos
  - Detached-HEAD
  - Handle-With-Care
site_uuid: ded636bc-1472-48b2-bbca-156490a6ea38
hex_code: yqptwy
date_authored_initial_draft: 2026-08-23
date_authored_current_draft: 2026-08-23
publish: true
---

# Submodules detach because `.gitmodules` never said which branch

## The mechanism (2026-08-23, `self-host-stack`)

A submodule pointer in the parent is a **gitlink: a raw 40-char SHA**, not a
branch name. So `git submodule update` has a commit to check out and nowhere to
attach it. You land detached. Every time. This is by design, not a
misconfiguration.

Compounding it, every entry in this repo's `.gitmodules` looked like this:

```ini
[submodule "core/cal.diy"]
	path = core/cal.diy
	url = https://github.com/lossless-group/cal.diy.git
```

No `branch =` line — the exact smell `branch-alignment.md` calls out:

> A submodule entry without a `branch =` line is a smell — it means
> `git submodule update --remote` won't know which branch to follow.

So there was no recorded answer to "which branch was this SHA supposed to be
on," and reattaching was a manual, per-submodule, per-machine chore.

## The fix that travels

Two lines per entry, in `.gitmodules` — the one file that reaches every clone:

```ini
[submodule "core/cal.diy"]
	path = core/cal.diy
	url = https://github.com/lossless-group/cal.diy.git
	branch = main
	update = merge
```

- **`branch =`** gives `git submodule update --remote` a branch to follow.
  Read straight from `.gitmodules`; it correctly does *not* get copied into
  `.git/config`.
- **`update = merge`** makes `git submodule update` merge into the submodule's
  current branch instead of checking out the pinned SHA detached. Per
  `git-submodule(1)`: *"the submodule's HEAD will not be detached."*

Verified end-to-end: after these landed, `git submodule update --remote
core/cal.diy` left HEAD on `main` and did not move the parent gitlink.

### Read the actual default branch — do not assume `main`

Of the eight submodules here, **two are not `main`**:

| Submodule | Default branch |
|---|---|
| `core/plunk` | `next` |
| `core/plane` | `preview` |
| everything else | `main` |

```bash
git ls-remote --symref <url> HEAD
```

Writing `branch = main` across the board would have silently broken exactly the
two that are hardest to notice.

## ⚠️ The part to be careful with

**Bulk submodule scripts are the thing that has historically caused the
headache, not cured it.** Past experience in this tree: they detach submodules
*and* lose their remotes, which is a worse state than the one you started in.

The command block below **could** be a good set of commands for bringing a
second machine into line. It was verified on the machine that authored it. It
has **not** been run on the other machine, and it is the same *shape* as the
scripts that have glitched before. Treat it as a candidate, not a recipe.

```bash
# CANDIDATE — read the failure modes below before running
git pull
git submodule sync --recursive
git config submodule.recurse true
git config diff.submodule log
git config -f .gitmodules --get-regexp '^submodule\..*\.update$' | while read -r k v; do
  n=${k#submodule.}; n=${n%.update}
  git config --local "submodule.$n.update" "$v"
done
```

Only the last loop is needed on an already-initialized clone: `git submodule
init` **does not overwrite existing `.git/config` values**, so a plain pull gets
you `branch` but not `update`. Fresh clones get both automatically and need
none of this.

### Known failure modes

**1. `git submodule sync` and `remote set-url` overwrite remotes.** Both reset a
submodule's `origin` to whatever URL `.gitmodules` records. This is documented
behavior, not a bug — `git-submodule(1)` on `sync`:

> Synchronize submodules' remote URL configuration setting to the value
> specified in `.gitmodules`.

If a submodule has an SSH remote, a personal fork, or an upstream you added by
hand, it is silently replaced with the https URL from the parent. **This is the "lose their remotes"
glitch.** Check before running:

```bash
git submodule foreach --recursive 'git remote -v'
```

**2. `submodule.recurse true` makes detaching *more* frequent, not less.** Every
pull that bumps a pointer now yanks the submodule to the pinned SHA. It is still
worth setting — without it, pulls leave you on stale submodule content silently,
which is a quieter and worse failure — but it is a trade, not a pure win.

**3. `update = merge` has its own trade.** When the pinned SHA is *older* than
your branch tip, merge leaves you on newer content and the parent gitlink shows
modified. Default `checkout` gives exact content but detached. Merge is chosen
here because its failure mode is visible.

**4. `update` in `.gitmodules` only affects `git submodule update`.** Per
`git-config(1)`, `git checkout --recurse-submodules` ignores it entirely.

### The safer path

Doing it by hand, one submodule at a time, has been the reliable approach. The
`.gitmodules` change reduces how often that is necessary; it does not make bulk
scripts trustworthy. If running the block above, do it on one submodule first
and diff the result.

## The distinction that actually matters

**"Update the submodules" is two different operations, and only one is routine.**

| Command | What it does | When |
|---|---|---|
| `git submodule update` | Brings submodule content to **the SHA the parent already pins**. Parent unchanged. | **Routine.** Otherwise your working tree is on stale submodule content. |
| `git submodule update --remote` | Moves the submodule to **the branch tip** and **changes the parent gitlink**. | **Deliberate.** This is a version bump — it belongs in its own commit with its own reasoning. |

The `.gitmodules` change keeps you attached during **both**. It is *not* an
argument for running `--remote` on a schedule. `branch-alignment.md` is explicit
about the adjacent version of this:

> Observe and surface, but do not auto-realign as a side effect of unrelated
> work — branch realignment touches shared remotes and breaks parallel agent
> sessions.

## Also found: `reattach-all-submodule-remotes.sh` never worked

The anchor monorepo's `reattach-all-submodule-remotes.sh` had a one-character
bug since inception:

```bash
name=$(echo "$path_key" | sed 's/^submodule\\.//;s/\\.path$//')
```

Inside single quotes, `\\.` is a literal backslash followed by any char — it
never matches `submodule.core/cal.diy.path`. `name` came back as the full
untrimmed key, the URL lookup missed, and `set -euo pipefail` killed the script
on the first submodule. Fixed to single backslashes; it now resolves all eight.

Note what that script does even when working: `git remote set-url origin`, on
every initialized submodule. That is failure mode #1 above, by design.

## Related

- `context-v/agent-skills/pseudomonorepos/references/branch-alignment.md` (anchor
  monorepo) — the tier model, FF mechanics, and the `branch =` smell
- [[Railway-IaC-Pull-Does-Not-Pin-Database-Images]] — same genre: a tool's
  convenience command quietly not doing what its name implies
- Commit `c4ad8dc` — where the eight `branch`/`update` pairs landed
