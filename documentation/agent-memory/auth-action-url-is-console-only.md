<!-- Mirror of ~/.claude/projects/D--SynoDrive-VSCN/memory/auth-action-url-is-console-only.md — kept in the repo so any
     Claude instance can read it without access to the user profile. Edit both copies. -->
---
name: auth-action-url-is-console-only
description: "Dev's auth emails point at Firebase's generic page, and the admin API refuses to move them — EMAIL_TEMPLATE_UPDATE_NOT_ALLOWED, not an IAM problem"
metadata:
  node_type: memory
  type: project
---

**2026-09-03.** Password reset on dev "works" but the link lands on Firebase's own
generic handler, `https://vscn-dev-f4b60.firebaseapp.com/__/auth/action`, so the site's
`/auth/action` page is **never exercised on dev**. Prod is correct
(`https://vscn.ch/auth/action`). The field is `notification.sendEmail.callbackUri` in
project config.

**Two dead ends, both of which cost time:**

1. **`ActionCodeSettings` cannot do it.** `ActionCodeSettings.url` is the *continue*
   URL — appended to the link as `continueUrl`. It does not move the action handler.
   Verified against the firebase-js-sdk docs after I claimed the opposite.
2. **The Identity Toolkit admin API refuses it.** `PATCH
   /admin/v2/projects/<p>/config?updateMask=notification.sendEmail.callbackUri` returns
   `400 EMAIL_TEMPLATE_UPDATE_NOT_ALLOWED`. This is **not** IAM: the dev service account
   already holds `roles/firebaseauth.admin` (checked with `gcloud projects
   get-iam-policy`). Google blocks email-template writes on these projects over that API
   regardless of permission, and the error string is undocumented anywhere public.

**The only route is the Firebase console:** Authentication → Templates → any template →
pencil → "customize action URL". It is **one per-project setting shared by every
template**, so doing it from one template covers reset, verify and change-email at once.

**How to apply:** `scripts/set-auth-action-url.mjs -P dev|prod` is the reader — bare run
reports current vs. expected, `--dump` prints the whole notification block. Reach for it
when an auth email lands somewhere unexpected, and don't re-litigate the write path.
The related open gap: **no auth email on either project carries a `continueUrl`**, so a
member who finishes a reset has no route back into the site. That one *is* fixable in
code, via `ActionCodeSettings`, and is not done.

**2026-09-03, the consequence that made this more than a parity item.** The
console-only handler is what turned a latent client bug into a dev-only broken
upload. `/auth/action` is the ONE place in the app that pairs `user.reload()`
with `getIdToken(true)`; because dev's emails never reach it, nothing on dev
ever refreshed the ID token after verification. A verified member's cached
account record said `emailVerified: true` while their token still said
`email_verified: false` for up to an hour, so `uploadImage` took the verified
path (a uuid image id) that neither ruleset would accept from that token, and
`activatePublicProfileIfExists` had its `active: true` flip rejected and
swallowed — leaving verified members as invisible drafts. Fixed in code
(`hasVerifiedClaim` in `src/lib/auth.ts`, now the single source of truth for
every write gate), so the app no longer depends on which handler ran. Moving
dev's `callbackUri` in the console is still worth doing for parity, but it is
no longer the thing standing between a member and an upload.

Related: [[dev-vs-prod-firestore-divergence]].

Related: [[prod-release-order]] — prod's handler is already right, so this is a
dev-parity item, not a release gate.
