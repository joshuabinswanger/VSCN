<!-- Mirror of ~/.claude/projects/D--SynoDrive-VSCN/memory/email-mailbox-migration.md, kept in sync so any Claude instance can read it without Josh's profile. -->
---
name: email-mailbox-migration
description: "DECIDED 2026-09-17, not yet bought: vscn.ch gets a real mailbox at Infomaniak because Brevo structurally lands in Gmail's Promotions tab; the exact DNS change and its two sharp traps"
metadata: 
  node_type: memory
  type: project
  originSessionId: 38d5fd25-1fd8-4787-89fa-1c256b44b0c4
  modified: 2026-09-18T09:40:14.663Z
---

**DONE 2026-09-18: vscn.ch has a real mailbox.** MX is
`mta-gw.infomaniak.ch` priority 5, SPF is
`v=spf1 include:_spf.firebasemail.com include:spf.infomaniak.ch ~all`, DKIM is
`20260918._domainkey`. Verified from outside, and the new MX was probed over
SMTP: it answers `220 … Infomaniak Network Mail Exchanger` and returns
`250 2.1.5 Ok` to `RCPT TO:<info@vscn.ch>`, so the mailbox exists and accepts
mail. DMARC (`p=none`, rua at Brevo) and the brevo/firebase DKIM CNAMEs all
survived the move untouched.

Until that day its MX pointed at Cloudflare Email Routing, which only forwards.
That is *why* Brevo exists in this project at all — see
[[signup-notification-and-legal-pages]].

**Two things went wrong in the cutover, both worth knowing:**

- **The auto-mode classifier refuses `[DNS / Domain / Cert Changes]` for
  destructive DNS work.** Adding the DKIM TXT went through; typing the domain
  name into Cloudflare's "this cannot be undone" confirm dialog was refused
  twice. So the disable, the MX and the SPF edit all had to be handed to Josh as
  instructions. Plan for that: an agent can *prepare* and *verify* a DNS
  migration but should not expect to execute the breaking half.
- **"Edit the SPF record in place" was read as "put the new value in that
  record".** Josh replaced the SPF content with `mta-gw.infomaniak.ch`, so the
  zone briefly had no `v=spf1` at all and no MX. When instructing someone
  through a DNS change, say *which record type each value belongs to* in the
  same breath as the value — a hostname belongs in MX, never in TXT — and give
  the full replacement string on its own, not as a diff of the old one.

Josh chose **Infomaniak kSuite Standard** (CHF 1.76/user/month, ~CHF 21/year,
two addresses per user, servers in Switzerland, ordinary IMAP/SMTP, 500 mails
per day / 100 recipients per send). **Not purchased as of 2026-09-18** — the
account is Josh's to create.

**Only `info@vscn.ch` becomes a real mailbox** (Josh, 2026-09-18). That is not a
gap: `notifications@vscn.ch` is only ever a *From:* address, set by
`NOTIFY_FROM` in `functions/src/authTriggers.ts:19`, and Brevo accepts it
because the whole domain is authenticated there — no mailbox required. It has
never had a Cloudflare routing rule either, so replies to it already vanish and
the move changes nothing about that. kSuite Standard stays the cheaper buy even
for a single address (CHF 1.76 vs CHF 2.29 for a standalone Mail-Service
address).

**The DKIM record does not exist until the mail service does.** Infomaniak
generates the key pair when the service is created and the domain linked, so
there is nothing to look up beforehand; the selector is a date-like string. For
vscn.ch it is **`20260918`**, and the record
`20260918._domainkey.vscn.ch` (TXT, `v=DKIM1; t=s; p=MIIBIjANBgkq…`) was
**published in Cloudflare on 2026-09-18** and verified byte-identical against
1.1.1.1 and 8.8.8.8, TTL 300. Doing this ahead of the cutover is free: a DKIM
selector nothing signs with yet affects no mail, and it means one less thing
inside the window. In Cloudflare the *Name* field takes `20260918._domainkey`
and Cloudflare appends the zone — Infomaniak's own Cloudflare guide claims
Cloudflare appends `._domainkey` too, which is **wrong**; following it literally
yields `20260918.vscn.ch`. Any pre-existing `_domainkey` NS delegation would
have to be deleted first; vscn.ch has none.

**TTL lowering turned out to be unnecessary.** Every relevant record is on
Cloudflare's *Auto*, which resolves as 300 s — verified on the live MX and SPF
records. There is no day-ahead preparation step.

**Why:** the member-invitation mail kept landing in Gmail's Promotions tab. That
is not a wording problem and cannot be fixed by editing the text. A Brevo
*campaign* carries a tracking pixel, rewrites every link through a Brevo
redirector, appends a mandatory unsubscribe footer and (on the free plan) a
"Sent by Brevo" logo. Brevo's campaign settings expose **no** toggle for open or
click tracking — only UTM. The *transactional* API removes the pixel, the
rewriting and the footer (per-message header `X-Mailin-Track: 0`), but still
sends from Brevo's shared bulk IPs, whose reputation is itself a Promotions
signal. For a couple of hundred genuinely personal mails a year an ESP is simply
the wrong instrument; a real mailbox makes one-to-one mail *be* one-to-one mail.
Migadu was rejected despite USD 19/year: its 20-outbound-per-day cap is exactly
the size of one member run. Google Workspace works best of all but costs 3–4×
and would reverse Josh's deliberate choice of a non-US mail processor.

**How to apply — the migration, and its two sharp edges:**

- Current Cloudflare state, verified 2026-09-17: **one** routing rule,
  `info@vscn.ch` → `joshua.binswanger@gmail.com`, Active. Catch-all is Drop and
  Disabled. `notifications@vscn.ch` has **no rule at all**, which is why replies
  and bounces to it vanish. So exactly one forwarding behaviour must be
  preserved, not a grown ruleset.
- **Cloudflare locks the MX records while Email Routing is enabled.** Routing
  must be disabled first, and disabling it *deletes Cloudflare's own MX, SPF and
  DKIM entries*. From that instant until the new MX resolve, incoming mail is
  rejected — Cloudflare answers for the domain with routing off. Do it in one
  sitting; lower the TTL a day ahead.
- **The SPF record must be edited IN PLACE.** Two `v=spf1` TXT records are a hard
  PermError (RFC 7208 §4.5) that would break Firebase auth mail and Brevo
  simultaneously. Target value: `v=spf1 include:_spf.firebasemail.com
  include:spf.infomaniak.ch ~all` — Cloudflare's include drops out, Firebase's
  stays. Infomaniak documents `-all`; keep `~all`, it is the safer failure mode
  and the record already uses it.
- Infomaniak's records: **MX `mta-gw.infomaniak.ch`, priority 5**, SPF include
  `spf.infomaniak.ch`, plus a DKIM record whose selector the Infomaniak console
  shows once the domain is linked. Confirm against the console rather than
  trusting these values blind.
- **Brevo survives the move untouched.** It is not in the SPF record at all — it
  signs with its own DKIM (the `brevo1`/`brevo2._domainkey` CNAMEs) and uses its
  own return-path domain. The `onAuthUserCreated` signup ping keeps working.
  Multiple DKIM selectors coexist fine.
- **Follow-on in code:** the privacy policy names the email processor, so
  `src/i18n/legal.ts` needs a paragraph when Infomaniak joins. See
  [[signup-notification-and-legal-pages]] for that rule.
- Josh can keep writing in Gmail: add `info@vscn.ch` as a send-as identity
  pointed at Infomaniak's SMTP, and the mail leaves through a normal mail server
  under his own domain.

**Brevo artefacts now sitting in the account** (harmless, reusable, not sent):
contact attribute `ANREDE`; list #3 "Galerie-Einladung 2026-09 (ohne Bilder)"
holding the 20 members who have no gallery images, each with a personalised
salutation; campaign draft "Galerie-Einladung Mitglieder 2026-09" with the full
German invitation text, sender `Joshua Binswanger (VSCN) <info@vscn.ch>`. Two
test sends went to `info@rhizome.ch`. The 20 were **never** mailed. The same
text also exists as a transactional script in the session scratchpad
(`send-invites.mjs` + `mail-body.mjs`), which needs `BREVO_API_KEY` in the
environment — the classifier blocks Claude from reading that secret, so only
Josh can run it.
