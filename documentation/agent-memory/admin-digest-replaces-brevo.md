<!-- Mirrors the ~/.claude memory file admin-digest-replaces-brevo.md; kept in sync so any agent can read it from the repo. -->

---
name: admin-digest-replaces-brevo
description: "DEPLOYED on both projects but has NEVER DELIVERED: every tick is refused with Infomaniak 535 Invalid login (found 2026-09-23 by the release check's probe 7); the INFOMANIAK_SMTP_PASSWORD value is wrong on both, Josh replaces it"
metadata:
  type: project
---

**STATUS 2026-09-23: deployed on prod and dev, delivering nothing.** Every `sendAdminDigest` tick
fails "535 5.7.0 Invalid login or password" (prod since its first event 2026-09-22T22:05Z, dev
since 20:03Z); after 12 attempts the events are dropped, so the signups and uploads of that
window are lost as notices. The secret exists with one enabled version on each project, so the
check's secrets probe passes; only probe 7 (function errors) saw it. Fix is Josh's: replace the
secret value on both with the password that actually logs in as `SMTP_USER` (info@vscn.ch),
then redeploy `sendAdminDigest` so it picks up the new version. Claude never reads the value
([[password-handling-boundary]]).

On 2026-09-22 the Brevo signup ping became a queued digest (`functions/src/adminDigest.ts`,
composer in `functions/src/notify.ts`, SMTP in `functions/src/mail.ts`), merged to `dev`.
Triggers write `adminEvents/{id}` (server-only); `sendAdminDigest` runs every 10 minutes,
reports what is due in ONE mail, deletes what it covered. A signup is reported when
`users/{uid}.onboardingComplete` is true or 30 minutes after Auth-create, with the whole
profile, live image counts and the onboarding message. An image is reported when its record
crosses into `live` (member origin only), one line per image with its public URL.

**Why:** Brevo existed only because vscn.ch could not send; since 2026-09-18 it can (Infomaniak).
The old ping fired at wizard step 1 and knew only the address; Josh wanted to see what the
person actually did, plus a notice on image upload.

**How to apply:**
- Functions are NOT deployed anywhere yet. Deploy needs the secret first, set by Josh (never me):
  `npx -y firebase-tools@latest functions:secrets:set INFOMANIAK_SMTP_PASSWORD --project vscn-dev-f4b60`
  then from a dev worktree `npx -y firebase-tools@latest deploy --only functions --project vscn-dev-f4b60`.
  Same again for prod `vscn-39508` at release. `ADMIN_NOTIFY_TO` already exists on both.
- From address is now `info@vscn.ch` (Infomaniak sends only as the authenticated box).
- Until deployed, prod still sends the old Brevo ping while dev's POLICY already denies Brevo —
  release dev→main and the prod functions deploy belong together.
- Afterwards: destroy `BREVO_API_KEY` on both projects, move DMARC rua off Brevo, drop Brevo DKIM
  CNAMEs (DNS is Josh's; the classifier blocks me). See [[email-mailbox-migration]],
  [[password-handling-boundary]], [[signup-ping-proven-and-its-traps]].
