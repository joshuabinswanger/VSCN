# Signup notification + Impressum / Contact / Privacy (2026-09-10)

Branch `feat/signup-notify-legal-pages`. Two things Josh asked for in one breath: an email
when someone signs up, and legal pages so people can reach out when something is wrong.

## 1. The admin ping

`functions/src/authTriggers.ts` → `onAuthUserCreated`, a v1 auth trigger next to the
existing `onAuthUserDeleted`. Fires at **Auth-create = wizard step 1**, before email
verification and before the wizard is finished, so the subject line says *started signing
up*, never *joined*: abandoned attempts and anything past Turnstile also produce a mail.
Dev's subject is prefixed `[dev]`; both projects deploy the function.

Formatting and delivery are pure functions in `functions/src/notify.ts`, tested from the
root project (`tests/unit/signupNotification.test.mjs`) with no `firebase-functions` in
`node_modules` needed. A failed send logs `Signup notice not sent` and returns; the account
creation is never touched.

### Why Brevo, and why the recipient is a secret

`vscn.ch`'s MX is `route1/2/3.mx.cloudflare.net` — **Cloudflare Email Routing, forward-only**.
There is no mailbox on the domain that can send, so a sender had to come from a
transactional provider. Built first on Resend (US), switched the same day to **Brevo**
(Sendinblue SAS, Paris) on Josh's call: an EU processor is a plain line in the privacy
policy, a US one is a paragraph resting on the Data Privacy Framework — and Google is
already unavoidably on that list. Brevo's free plan is 300 mails/day, no card, forever.
Endpoint `POST https://api.brevo.com/v3/smtp/email`, header `api-key`, body
`{sender:{name,email}, to:[{email}], subject, textContent}` — see `notify.ts`.

The repo is public. `NOTIFY_FROM` (a `vscn.ch` address) is a plain param in
`functions/.env`; the API key and the **recipient** (a private Gmail address) are Secret
Manager secrets.

### One-time setup

1. **DONE 2026-09-10 (by Claude, in Josh's Chrome).** Brevo account existed already; `vscn.ch`
   was added as a sending domain (Manual setup, no branded subdomain) and all four records
   were created in Cloudflare. Verified resolving from 1.1.1.1:

   | Name | Type | Content | Proxy |
   |---|---|---|---|
   | `vscn.ch` | TXT | `brevo-code:a051a7da427ae96a2e0d6186a28fa160` | DNS only |
   | `brevo1._domainkey` | CNAME | `b1.vscn-ch.dkim.brevo.com` | **DNS only** |
   | `brevo2._domainkey` | CNAME | `b2.vscn-ch.dkim.brevo.com` | **DNS only** |
   | `_dmarc` | TXT | `v=DMARC1; p=none; rua=mailto:rua@dmarc.brevo.com` | DNS only |

   The DKIM CNAMEs MUST be DNS only — Cloudflare's proxy toggle defaults to on for CNAMEs
   and a proxied DKIM record answers with Cloudflare's own address, so the signature never
   validates. Brevo signs with its own domain, so the root SPF was left alone: it is still
   the single `v=spf1 include:_spf.firebasemail.com include:_spf.mx.cloudflare.net ~all`.
   A second `v=spf1` TXT would invalidate both.
2. **DONE 2026-09-10.** Brevo's *Verify records* returned green on all four, and
   *Authenticate domain* succeeded — the Domains list reads "All domains are authenticated".
   (Brevo's top-of-page banner still said "Your records don't match yet" while every
   individual record showed a green match; the banner is stale, the per-record verdicts are
   the truth.) The branded subdomain was declined: it only rewrites tracking links, and a
   plain-text admin ping has none.
3. **DONE 2026-09-10.** Sender `VSCN <notifications@vscn.ch>` added and immediately
   **Verified** — no confirmation email was sent to it, because an authenticated domain
   auto-verifies its addresses. It lists DKIM signature `vscn.ch` and "DMARC is configured".
   This matters: `notifications@vscn.ch` has no Cloudflare Email Routing rule, so a
   verification mail sent there would have gone nowhere. For the same reason **replies and
   bounces to that address are discarded** — add a routing rule for `notifications@` if you
   ever want to see them.
4. **STILL OPEN — needs Josh, in his own terminal.** No API key exists yet. SMTP & API →
   API keys → Generate API key (v3, `xkeysib-…`). Claude deliberately does not create or
   handle it: the value is a live sending credential, and `functions:secrets:set` prompts on
   stdin, which Claude's shell does not have.
## 2. The legal pages and the footer

There was no footer. `src/components/SiteFooter.astro` is rendered by `Layout.astro` on every
page except the `fullscreen` landing hero, inside `.page-wrap` so it scrolls with the
content. Its right padding keeps the last link out from under the fixed `.lang-toggle` on a
phone (verified at 375px).

Three pages under `src/pages/[...lang]/` — `impressum`, `contact`, `privacy` — paths
untranslated like the rest of the site. One renderer, `LegalPage.astro`; the prose lives in
`src/i18n/legal.ts` as en/de section arrays, NOT in `translations.ts` (a privacy policy is
dozens of paragraphs). `tests/unit/legalContent.test.mjs` holds both languages to the same
section ids and refuses placeholders.

Who stands behind the site is one file: `src/data/legalEntity.ts`. VSCN is informal — run by
Joshua Binswanger privately, he is the data controller, contact `info@vscn.ch`, no CHE. When
a Verein is founded, change it there.

**Open:** `addressLines` is empty — no postal address was provided. The Impressum omits the
line rather than show a placeholder. Swiss law does not demand one for a non-commercial
site, but German visitors expect it; fill it in when Josh decides.

The privacy policy is written from the code as it stands — Hosting/Auth/Firestore/Storage,
Turnstile, the Brevo ping, GitHub rebuilds, no analytics since `ef63f4d`, immediate account
deletion. **A new data path means a new paragraph here.** The test also asserts the text
never mentions analytics.
