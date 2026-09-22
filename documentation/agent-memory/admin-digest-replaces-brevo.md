<!-- Mirrors ~/.claude/projects/D--SynoDrive-VSCN/memory/admin-digest-replaces-brevo.md; keep both copies in sync. -->
---
name: admin-digest-replaces-brevo
description: Operator notices are a queued digest sent from the Infomaniak mailbox; Brevo is gone from code and policy; functions NOT yet deployed, Josh must set INFOMANIAK_SMTP_PASSWORD first
metadata:
  type: project
---

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
