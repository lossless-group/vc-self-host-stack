#!/usr/bin/env python3
"""Fetch person data from Context.dev People Enrich for every named contact in an intro sheet.

Built for the batch founder intros blueprint
(context-v/blueprints/Batch-Founder-Intros-and-Signal-Data.md). Reads a sheet with the
standard intro columns, calls Context.dev once per row that has a `contact_name`, and
saves every full response to a JSONL file beside the sheet. With --apply, it also fills
blank `contact_linkedin` cells for confirmed matches. It never overwrites a cell, and it
never writes to Twenty.

Usage:
  context-dev_fetch-person-data.py SHEET.csv [--raw OUT.jsonl] [--apply] [--refetch]

  SHEET.csv  needs contact_name, contact_linkedin, firm_name, firm_domain
  --raw      where responses go (default: SHEET__Context-Dev-Raw.jsonl next to SHEET)
  --apply    fill blank contact_linkedin for confirmed matches
  --refetch  call again even for rows that already have a saved 200 response

How each row is looked up: by its LinkedIn URL if it has one, else by first + last
name. Either way, the firm name (and domain, when known) goes along as a company clue.

A match counts as confirmed when Context.dev returns a candidate AND the sheet's firm
appears in the person's work history. Context.dev's "current role" is often a board
seat, so the work history is the better check. Unconfirmed candidates are printed and
left alone.

Firm domains are printed as suggestions and never written. Context.dev rarely returns
one, and firm_domain is the join key, so check the site before you fill it in.

Rerunning resumes: rows with a saved 200 response are skipped unless you pass --refetch.

The key comes from CONTEXT_DEV_API_KEY, falling back to ~/.secrets. Plans cap
concurrent requests (2 on ours), so calls run two at a time and retry on 429.
Rejected calls cost no credits.
"""
import argparse, csv, json, os, re, sys, time, urllib.error, urllib.request
from concurrent.futures import ThreadPoolExecutor

URL = "https://api.context.dev/v1/people/enrich"
CONCURRENCY = 2


def api_key():
    key = os.environ.get("CONTEXT_DEV_API_KEY")
    if key:
        return key
    secrets = os.path.expanduser("~/.secrets")
    if os.path.exists(secrets):
        for line in open(secrets):
            m = re.match(r"\s*(?:export\s+)?CONTEXT_DEV_API_KEY=(.*)", line)
            if m:
                return m.group(1).strip().strip("'\"")
    sys.exit("CONTEXT_DEV_API_KEY not set and not found in ~/.secrets")


def body_for(row):
    b = {"tags": ["intro-sheets"], "timeoutOpts": {"milliseconds": 60000, "behavior": "return-partial"}}
    if row["contact_linkedin"].strip():
        b["social_urls"] = [row["contact_linkedin"].strip()]
    else:
        first, _, last = row["contact_name"].strip().partition(" ")
        b["name"] = {"first": first, "last": last}
    company = {"name": row["firm_name"].split(" / ")[0]}
    if row["firm_domain"].strip():
        company["domain"] = row["firm_domain"].strip()
    b["company"] = company
    return b


def call_once(key, row):
    body = body_for(row)
    req = urllib.request.Request(URL, data=json.dumps(body).encode(), method="POST",
                                 headers={"Content-Type": "application/json", "Authorization": f"Bearer {key}"})
    try:
        with urllib.request.urlopen(req, timeout=90) as r:
            return {"row": row, "request": body, "http": r.status, "response": json.load(r)}
    except urllib.error.HTTPError as e:
        return {"row": row, "request": body, "http": e.code, "response": e.read().decode()[:500]}
    except Exception as e:
        return {"row": row, "request": body, "http": None, "response": repr(e)}


def call(key, row):
    for attempt in range(8):
        res = call_once(key, row)
        if res["http"] != 429:
            return res
        time.sleep(2 + attempt)
    return res


def match_of(res):
    return res["response"].get("match") if isinstance(res["response"], dict) else None


def firm_entries(person, firm_name):
    """Work-history entries whose organization looks like the sheet's firm."""
    key = firm_name.split(" / ")[0].split(" ")[0].lower()
    return [e for e in person.get("experience", []) if key in (e.get("organization") or {}).get("name", "").lower()]


def linkedin_of(person):
    url = next((u for u in person.get("social_urls", []) if "linkedin.com/in/" in u), None)
    return url and url.replace("://linkedin.com", "://www.linkedin.com").rstrip("/")


def main():
    ap = argparse.ArgumentParser(description=__doc__.split("\n")[0])
    ap.add_argument("sheet")
    ap.add_argument("--raw")
    ap.add_argument("--apply", action="store_true")
    ap.add_argument("--refetch", action="store_true")
    args = ap.parse_args()
    raw = args.raw or re.sub(r"\.csv$", "", args.sheet) + "__Context-Dev-Raw.jsonl"
    key = api_key()

    rows = list(csv.DictReader(open(args.sheet)))
    fields = list(rows[0].keys())
    named = [r for r in rows if r["contact_name"].strip()]

    done = {}
    if os.path.exists(raw) and not args.refetch:
        for line in open(raw):
            r = json.loads(line)
            if r["http"] == 200:
                done[r["row"]["contact_name"]] = r
    todo = [r for r in named if r["contact_name"] not in done]
    print(f"{len(named)} named contacts, {len(done)} already fetched, calling {len(todo)}", file=sys.stderr)
    with ThreadPoolExecutor(CONCURRENCY) as ex:
        for res in ex.map(lambda r: call(key, r), todo):
            done[res["row"]["contact_name"]] = res
    with open(raw, "w") as out:
        for r in named:
            if r["contact_name"] in done:
                out.write(json.dumps(done[r["contact_name"]]) + "\n")

    filled = 0
    for row in rows:
        res = done.get(row["contact_name"])
        if not res:
            continue
        m = match_of(res)
        name = row["contact_name"]
        if res["http"] != 200:
            print(f"ERROR {res['http']}\t{name}\t{str(res['response'])[:120]}")
        elif m["status"] != "candidate":
            print(f"NONE\t{name}\t{row['firm_name']}")
        else:
            person = m["person"]
            entries = firm_entries(person, row["firm_name"])
            li = linkedin_of(person)
            tag = "MATCH" if entries else "CHECK"
            print(f"{tag}\t{name}\t{row['firm_name']}\tscore={m['score']}\t{li or '-'}")
            if entries and args.apply and li and not row["contact_linkedin"].strip():
                row["contact_linkedin"] = li
                filled += 1
            domains = sorted({e["organization"]["domain"] for e in entries if e["organization"].get("domain")})
            if domains and not row["firm_domain"].strip():
                print(f"  domain suggestion for {row['firm_name']}: {', '.join(domains)} (check before filling)")

    if args.apply:
        with open(args.sheet, "w", newline="") as f:
            w = csv.DictWriter(f, fieldnames=fields, lineterminator="\n")
            w.writeheader()
            w.writerows(rows)
        print(f"filled {filled} contact_linkedin cells in {args.sheet}", file=sys.stderr)
    print(f"responses saved to {raw}", file=sys.stderr)


if __name__ == "__main__":
    main()
