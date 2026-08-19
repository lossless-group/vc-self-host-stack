---
name: custom-domain-cutover
description: Point a custom (sub)domain at a Railway service and survive the cutover — DNS records, wildcard overrides, cert issuance, and the stale-cache theater that follows. Use whenever minting a `*.didi.sh` (or any custom) domain for a client hub/app, whenever a freshly-cut domain "doesn't work" on someone's machine while probes say it's live, or whenever the user says "I can't see the subdomain."
publish: true
---

# custom-domain-cutover

Born 2026-07-25 cutting `palmer-ai.didi.sh` over to the palmer-ai hub on
Railway, through a Vercel-DNS zone with a wildcard. Every step below was
actually hit.

## The procedure

1. **Register the domain on the Railway service**
   (`generate_domain` with `domain:`). Railway returns TWO records:
   a CNAME target (e.g. `<hash>.up.railway.app`) and a
   `_railway-verify.<sub>` TXT.
2. **Find where the zone's DNS actually lives** — `dig +short <zone> NS`.
   Don't assume Cloudflare; didi.sh lives at **Vercel DNS**
   (`ns1/ns2.vercel-dns.com`), managed in the Vercel dashboard →
   Domains → <zone> → DNS Records.
3. **Add both records.** An explicit record out-specifies any wildcard
   (`*.<zone>`) for that label — you do NOT need to touch the wildcard.
   Cloudflare-specific: the CNAME must be **DNS only (grey cloud)**;
   proxying breaks Railway's cert issuance.
4. **Wait for the automatic chain**: DNS propagates → Railway validates
   the TXT → cert issues → domain serves. Usually minutes with a low TTL.

## Verification commands (in escalation order)

```bash
dig +short <name> NS                          # who runs the zone
dig +short <sub>.<zone> CNAME @<authoritative-ns>   # is the record IN the zone
dig +short <sub>.<zone> A @1.1.1.1            # has the world seen it
curl -s --resolve <sub>.<zone>:443:<railway-edge-ip> https://<sub>.<zone>/  # bypass ALL caches — the truth
```

The `--resolve` probe is the killer move: if it serves the right content
with `subject: CN=<sub>.<zone>` in `curl -v`, the cutover is DONE
server-side and every remaining symptom is client-side cache.

## The stale-cache theater (what "it doesn't work" means after cutover)

A machine that resolved the name BEFORE the record existed holds the old
answer (often the wildcard's) past its nominal TTL. Symptoms: probes say
live, the human sees the old target's 404. **Hard refresh (Cmd/Ctrl+
Shift+R) does NOT fix this** — it clears page cache, not DNS.

macOS flush:

```bash
sudo dscacheutil -flushcache; sudo killall -HUP mDNSResponder
```

Chrome keeps its OWN DNS cache and open sockets to the old server:
`chrome://net-internals/#dns` → Clear host cache, then
`chrome://net-internals/#sockets` → Flush socket pools.

Zero-effort alternative: open the URL on a **phone with Wi-Fi off** —
cellular resolvers are fresh. Doubles as the mobile check.

## Gotchas that look like failures but aren't

- **Visiting the CNAME target directly** (`<hash>.up.railway.app`) shows
  Railway's "train has not arrived" 404 — always. It's routing plumbing,
  not a page; Railway routes by requested hostname.
- **Trailing dot** on the CNAME value in the DNS UI (`…railway.app.`) is
  normal FQDN notation.
- A wildcard-backed zone serves SOME page at the subdomain *before* your
  record lands (e.g. Vercel `DEPLOYMENT_NOT_FOUND`) — that's the
  wildcard, not a broken cutover.
- The TXT verify record can be deleted after the cert issues, if tidy
  zones matter.
