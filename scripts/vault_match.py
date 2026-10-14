#!/usr/bin/env python3
"""Find existing Obsidian vault notes for a list of entity names (orgs, people).

Built to keep Twenty CRM exports from duplicating notes already in the vault.
Matches against each note's filename, frontmatter `title` and `aliases`, and the
domain of frontmatter `url` / `og_url`. Never writes; prints candidates for review.

Usage:
  vault_match.py VAULT [--exclude PATH ...] < names.tsv
  names.tsv: one entity per line, `name<TAB>url` (url optional)

Output (TSV): TIER  name  vault-relative-path  size ("empty" if < 50 bytes)
Tiers, strongest first:
  DOMAIN  same website domain
  EXACT   same normalized name (case, accents, punctuation, legal suffixes,
          parentheticals and spaces ignored -- "Deep Infra" == "DeepInfra")
  PREFIX  shorter name is the leading words of the longer AND covers > half of
          its words, or the extra words are generic ("Mythic" ~ "Mythic AI",
          "Antler" ~ "Antler VC" yes; "Carbon" ~ "Carbon Arc" no)
  FUZZY   squashed-name similarity >= 0.9 (typos)
  NONE    nothing found
"""
import os, re, sys, unicodedata, difflib, argparse
from urllib.parse import urlparse

SUFFIXES = {"inc","llc","ltd","corp","corporation","co","company","the","plc","gmbh","sa","ag"}
GENERIC_TAIL = {"ai","vc","labs","hq","app","technologies","technology"}
SKIP_DIRS = {".obsidian",".git","node_modules",".trash"}

def norm(s):
    s = unicodedata.normalize("NFKD", s).encode("ascii","ignore").decode().lower()
    s = re.sub(r"\([^)]*\)", " ", s)
    s = re.sub(r"\.(com|ai|io|co|net|org)\b", "", s)
    toks = [t for t in re.split(r"[^a-z0-9]+", s) if t and t not in SUFFIXES]
    return " ".join(toks)

def domain(u):
    if not u: return ""
    if "://" not in u: u = "https://" + u
    h = urlparse(u.strip()).netloc.lower().split(":")[0]
    return h[4:] if h.startswith("www.") else h

def frontmatter(path):
    try:
        with open(path, encoding="utf-8", errors="ignore") as f:
            head = f.read(4000)
    except OSError:
        return {}, 0
    size = os.path.getsize(path)
    fm = {}
    m = re.match(r"---\n(.*?)\n---", head, re.S)
    if m:
        for line in m.group(1).splitlines():
            k, _, v = line.partition(":")
            k = k.strip()
            if k in ("title","url","og_url","aliases"):
                fm[k] = v.strip().strip("\"'")
    return fm, size

def build_index(vault, exclude):
    idx, seen = [], set()
    for root, dirs, files in os.walk(vault, followlinks=True):
        dirs[:] = [d for d in dirs if d not in SKIP_DIRS]
        real = os.path.realpath(root)
        if real in seen: dirs[:] = []; continue
        seen.add(real)
        if any(real.startswith(os.path.realpath(e)) for e in exclude): continue
        for fn in files:
            if not fn.endswith(".md"): continue
            p = os.path.join(root, fn)
            fm, size = frontmatter(p)
            names = {fn[:-3]}
            if fm.get("title"): names.add(fm["title"])
            for a in re.split(r"[,\[\]]", fm.get("aliases","")):
                if a.strip(): names.add(a.strip().strip("\"'"))
            idx.append({"path": os.path.relpath(p, vault), "size": size,
                        "keys": {norm(n) for n in names if norm(n)},
                        "domain": domain(fm.get("url") or fm.get("og_url"))})
    return idx

def match(name, url, idx):
    n, d, hits = norm(name), domain(url), []
    nsq = n.replace(" ", "")
    for e in idx:
        if d and e["domain"] == d: hits.append(("domain", e)); continue
        if n in e["keys"] or nsq in {k.replace(" ", "") for k in e["keys"]}:
            hits.append(("exact", e)); continue
        for k in e["keys"]:
            short, long_ = sorted((n, k), key=len)
            st, lt = short.split(), long_.split()
            extra = lt[len(st):]
            if len(short) >= 4 and lt[:len(st)] == st and (len(st) / len(lt) > 0.5 or all(t in GENERIC_TAIL for t in extra)):
                hits.append(("prefix", e)); break
            if difflib.SequenceMatcher(None, nsq, k.replace(" ", "")).ratio() >= 0.9:
                hits.append(("fuzzy", e)); break
    order = {"domain":0,"exact":1,"prefix":2,"fuzzy":3}
    return sorted(hits, key=lambda h: (order[h[0]], -h[1]["size"]))

if __name__ == "__main__":
    ap = argparse.ArgumentParser()
    ap.add_argument("vault"); ap.add_argument("--exclude", action="append", default=[])
    a = ap.parse_args()
    idx = build_index(a.vault, a.exclude)
    print(f"# indexed {len(idx)} notes", file=sys.stderr)
    for line in sys.stdin:
        if not line.strip(): continue
        name, _, url = line.rstrip("\n").partition("\t")
        hits = match(name, url, idx)
        if not hits: print(f"NONE\t{name}"); continue
        for tier, e in hits[:4]:
            kind = "empty" if e["size"] < 50 else f"{e['size']}B"
            print(f"{tier.upper()}\t{name}\t{e['path']}\t{kind}")
