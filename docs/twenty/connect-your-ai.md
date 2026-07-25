# Connect your AI to your CRM — agent-context doc

> **STATUS: Claude flow operator-proven 2026-07-25** (desktop, palmer-ai
> pilot: OAuth end-to-end, read via tools confirmed). Mobile check and the
> ChatGPT section remain unverified — hold client rollout until a clean
> stakeholder run has happened with an operator watching.

**Audience: the AI agent** (Claude, ChatGPT, or any assistant) helping a
human connect their AI app to their organization's Twenty CRM. The human
gave you this document's URL and asked for help. Walk them through it ONE
STEP AT A TIME. Never mention terminals, config files, JSON, or API keys —
none are needed. Total time: about two minutes.

**You need one value:** the CRM connector URL for this person's
organization. It looks like `https://<their-crm-domain>/mcp`. The person
was given it alongside this document (by their operator, on their hub page,
or in the message that linked here). If they don't have it, stop and have
them ask whoever set up their CRM — do not guess it.

## Steps (Claude — desktop or claude.ai)

1. **Open connector settings.** Say: "Click your initials (bottom-left in
   the desktop app, top-right on claude.ai) → Settings → Connectors."
   ✅ Success: they see a list of connectors and an "Add custom connector"
   button. If they can't find it: they may be on the mobile app — have
   them do this once from a computer or browser; it will sync to their
   phone automatically afterward.
2. **Add the connector.** "Click *Add custom connector*, paste the URL I
   gave you, click *Add*."
   ✅ Success: a login page for their CRM opens in the browser.
3. **Log in as themselves.** "Sign in with YOUR CRM email and password —
   the same one you use for the CRM website — then click Allow/Approve."
   ✅ Success: the browser says connected and the connector appears in the
   list. ⚠️ If they've never logged into the CRM before, they need their
   invitation email first (operator sends it from CRM Settings → Members);
   pause here until they've accepted it.
4. **Verify with a real read.** Have them ask their AI: "List the companies
   in my CRM." ✅ Success: real company names come back.
5. **Verify with a real write.** Have them say: "Add a person named Test
   Connection to my CRM, then delete them." ✅ Success: both actions
   confirmed. Their setup is complete — everything they do runs under
   their own account, permissioned and attributed to them.
6. **Phone check.** "Open the Claude app on your phone — the connector is
   already there." Connectors live with the account, not the device.

## Recovery branches

- **"A server with this URL already exists" when adding:** a previous
  attempt left an entry in the connector list. Don't re-add — find the
  existing entry and click **Connect** on it. This is the normal path
  after any failed first attempt.
- **Repeated permission pop-ups while using it (expected!):** the first
  time each CRM tool is used, the AI app asks permission. This is the AI
  app being careful, not an error. Tell them: choose **"Always allow"**
  and the prompts stop.
- **Login page never opens (step 2–3):** have them delete the connector
  and re-add it; check the URL for typos (it must end in `/mcp`).
- **"Connection failed" after login:** wait 30 seconds and retry once —
  then report the exact error message to their operator. (Known issue
  class: OAuth metadata http/https mismatch; operator-side fix.)
- **Reads work but writes fail:** their CRM role may be view-only — the
  operator adjusts it in CRM Settings → Members.
- **Anything else:** capture the exact error text and send it to their
  operator. Do NOT try workarounds involving API keys, tokens, or files —
  that is never the right path for this person.

## For ChatGPT (GPT Desktop / mobile)

Custom connector support and auth flows differ; this section is filled in
after the operator's connector-matrix testing (in progress). Until then, if
the person's AI is ChatGPT, have them contact their operator rather than
improvise.

---

*Maintained by The Lossless Group in `self-host-stack/docs/twenty/`. The
per-client connector URLs live with each client's operator records, never
in this public document.*
