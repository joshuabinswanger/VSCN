<!-- Mirror of ~/.claude/projects/D--SynoDrive-VSCN/memory/signup-notification-and-legal-pages.md — kept in sync so any Claude instance can read it without Josh's user profile. -->
---
name: signup-notification-and-legal-pages
description: "Admin email on Auth-create via Brevo (EU) + Impressum/Contact/Privacy pages and the site's first footer — built 2026-09-10 on feat/signup-notify-legal-pages, UNCOMMITTED, secrets and DNS still on Josh"
metadata: 
  node_type: memory
  type: project
  originSessionId: b7329d95-5f7c-4542-9623-1cf555b66083
  modified: 2026-09-10T09:10:59.140Z
---

Built 2026-09-10 in worktree `wt-feat-signup-notify-legal-pages` (branch
`feat/signup-notify-legal-pages` off dev). Runbook mirrored at
`documentation/20260910-signup-notification-and-legal-pages.md`.

**Why it is shaped this way:**
- vscn.ch has NO sending mailbox — MX is Cloudflare Email Routing (forward-only). So the
  ping goes through Brevo's transactional REST API from `notifications@vscn.ch`; Josh chose
  that sender, and it only works once he authenticates the domain in Brevo (DKIM + code TXT
  on Cloudflare). Brevo over Resend was HIS call after asking "is there a company in the EU":
  an EU processor is one plain line in the privacy policy; a US one rests on the DPF.
- The repo is PUBLIC, so the recipient (Josh's private Gmail) is a Secret Manager secret
  `ADMIN_NOTIFY_TO`, not a `functions/.env` param. `BREVO_API_KEY` is the other secret.
- Josh picked "Account created" as the trigger — wizard step 1 — so the subject says
  *started signing up*; he will get mail for abandoned attempts too, by his choice.
- Legal prose lives in `src/i18n/legal.ts` (sections, en/de), entity facts in
  `src/data/legalEntity.ts`. VSCN is informal: Joshua Binswanger privately, data controller
  himself, `info@vscn.ch`, no CHE, and NO postal address was given — the line is omitted.

**How to apply / what is still open:**
- **DNS IS DONE** (2026-09-10, Claude in Josh's Chrome): `vscn.ch` added to Brevo as a
  sending domain, and all four records created in Cloudflare and confirmed resolving —
  root TXT `brevo-code:a051a7da427ae96a2e0d6186a28fa160`, CNAMEs `brevo1._domainkey` →
  `b1.vscn-ch.dkim.brevo.com` and `brevo2._domainkey` → `b2.vscn-ch.dkim.brevo.com`, and
  `_dmarc` TXT. THE DKIM CNAMES MUST BE "DNS only": Cloudflare defaults the proxy toggle ON
  for a CNAME, and a proxied DKIM record resolves to Cloudflare instead of Brevo, so the
  signature silently fails. The root SPF was NOT touched (Brevo signs with its own domain);
  it is still the single firebasemail+cloudflare record, and a second `v=spf1` TXT would
  break both.
- **BREVO IS FULLY SET UP** (2026-09-10): domain `vscn.ch` **Authenticated**, and sender
  `VSCN <notifications@vscn.ch>` **Verified** with DKIM on vscn.ch and DMARC configured. The
  sender needed NO confirmation email — an authenticated domain auto-verifies its addresses,
  which was the saving grace, since `notifications@vscn.ch` has no Cloudflare Email Routing
  rule and could not have received one. Same reason: replies and bounces to that address are
  DISCARDED unless a routing rule is added. Branded subdomain declined (tracking links only).
  Brevo's page-level banner claimed "records don't match" while all four records showed green
  — trust the per-record verdicts, not the banner.
- Josh must still, IN HIS OWN TERMINAL: generate the v3 API key (SMTP & API → API keys; none
  exists yet), set `BREVO_API_KEY` + `ADMIN_NOTIFY_TO` on BOTH projects (`-P dev` and
  default), deploy functions, test with a throwaway dev account. Claude does not create or
  handle the key: it is a live sending credential and `functions:secrets:set` reads it from
  stdin, which Claude's shell lacks.
- The privacy policy is written from the code as it stands and asserts "no analytics".
  Any new data path (a contact form, a new provider) needs a paragraph in legal.ts.
- Uncommitted at time of writing; PR into dev, then the usual prod release.
- See [[verification-publishes-without-rebuild]] (where the Impressum was first noted
  open), [[turnstile-app-check-provider]] (deploy needs FUNCTIONS_DISCOVERY_TIMEOUT=90),
  [[account-deletion-is-immediate]] (what the retention section promises).
