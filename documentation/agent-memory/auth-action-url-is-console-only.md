<!-- Mirror of ~/.claude/projects/D--SynoDrive-VSCN/memory/auth-action-url-is-console-only.md — kept in the repo so any
     Claude instance can read it without access to the user profile. Edit both copies. -->
---
name: auth-action-url-is-console-only
description: "Dev CANNOT have a custom auth action URL — the console's own save gets the same 400 the API does; the workaround is to redeem the oobCode against the site directly"
metadata:
  node_type: memory
  type: project
---

**2026-09-03.** Password reset on dev works, but the link lands on Firebase's generic
handler, `https://vscn-dev-f4b60.firebaseapp.com/__/auth/action`, so the site's own
`/auth/action` page is never reached from an email. Prod is correct
(`https://vscn.ch/auth/action`). The field is `notification.sendEmail.callbackUri`.

**This is not fixable on dev.** Three routes tried, all closed:

1. **`ActionCodeSettings` cannot do it.** `.url` is the *continue* URL, appended as
   `continueUrl`. It does not move the action handler.
2. **The admin API refuses it:** `400 EMAIL_TEMPLATE_UPDATE_NOT_ALLOWED`. Not IAM — the
   dev service account holds `roles/firebaseauth.admin`.
3. **The Firebase console refuses it too.** Watching the network while saving the
   console's "Action URL" dialog shows it issuing the *identical* request —
   `PATCH .../v2/projects/vscn-dev-f4b60/config?updateMask=notification.sendEmail.callbackUri`
   — and getting the same **400**. The dialog just closes and silently reverts. So the
   restriction is per-project and route-independent; there is no UI that can do what the
   API cannot.

Cause unconfirmed and undocumented. Prod was created 2026-04-20 and has a custom URL;
dev 2026-05-26 and cannot get one — consistent with a Google-side lockdown landing
between those dates, but that is inference, not fact. Note the implication for prod:
its value is already set, so it works, but **changing** it there may be equally locked.

**The workaround, which makes the custom page fully testable on dev:** the `oobCode` in a
generated link does not care which page redeems it.
`set-auth-action-url.mjs -P dev --link <email>` prints both the real link and the same
code re-pointed at the site. Verified 2026-09-03: that URL renders "Set a new password"
on `vscn-dev-f4b60.web.app/auth/action`. Generating a link sends no email.

**How to apply:** don't spend time on the config field for dev — it is closed. Use
`--link` to exercise the page, and `--dump` to inspect the notification block.

**2026-09-03, the consequence — this is what the closed door actually cost.**
Because dev's emails can never reach the site's `/auth/action`, and that page is
the ONE place in the app that pairs `user.reload()` with `getIdToken(true)`,
nothing on dev ever refreshed the ID token after verification. That turned a
latent client bug into a broken feature: a verified member's cached account
record said `emailVerified: true` while their token still said
`email_verified: false` for up to an hour, so `uploadImage` took the verified
path (a uuid image id) that neither ruleset would accept from that token, and
`activatePublicProfileIfExists` had its `active: true` flip rejected and then
swallowed by its own `.catch` — leaving verified members as invisible drafts.
Evidence at the time: the account's only image records were slot ids while Auth
reported `emailVerified: true`, and `lastRefreshAt` had not moved since sign-in.

**So the code fix is not a convenience, it is the only available route.** Fixed
by `hasVerifiedClaim` in `src/lib/auth.ts` (commit `9f72838`), now the single
source of truth for every gate that decides what to WRITE. Do not write another
gate that reads `user.emailVerified` to decide a write — dev will keep
exercising the "no handler ever ran" path forever, so the client can never
depend on one having run.

Related: [[dev-vs-prod-firestore-divergence]].

Related: [[prod-release-order]] — prod's handler is already right, so this is dev-parity
only, not a release gate.

## The `continueUrl` half — FIXED 2026-09-03

Every send site now passes `ActionCodeSettings` naming its own return
destination, via `returnTo(lang, path)` in `src/lib/authEmail.ts`, and
`/auth/action` honours the incoming `continueUrl` (`continueTarget()`,
same-origin enforced — the value arrives through an email client, so an
off-site one would make the success button an open redirect).

This matters most **on dev**, where the config above is locked: dev's emails go
to Firebase's own page, and a `continueUrl` is the only thing that can put a
way back to the site on it.

**The bug found underneath it:** `/auth/action`'s hard-coded post-reset and
post-recover destination was `/signup`, and `/signup` is a **301 to
/onboarding**. So a member who had just reset their password, reading "You can
now sign in", was sent into the signup flow. Both now go to `/login`.

Verified on the dev server against real oobCodes: a same-origin `continueUrl`
came through as the Continue href, and an off-origin one
(`https://evil.example.com/steal`) was rejected and fell back to `/login`.

**Two traps met while testing:** `generatePasswordResetLink` **invalidates the
user's previous codes**, so minting several up front leaves only the last one
working — mint one, use it, mint the next. And both browser tools strip the
query string on some navigations, which presents as the expired-link view;
`location.search` is the thing to check before believing a failure.
