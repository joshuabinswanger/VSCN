> Mirrors the `~/.claude/projects/D--SynoDrive-VSCN/memory/admin-digest-replaces-brevo.md` memory file; keep the two in sync.

---
name: admin-digest-replaces-brevo
description: "DELIVERING on prod since 2026-09-23 07:45Z after a day of SMTP 535: the secret was wrong, and a new secret version only takes effect after a redeploy; unsent notices now show in the admin Queues tab"
metadata:
  node_type: memory
  type: project
  originSessionId: f87376d8-2519-4bc1-93cd-3aa33faee948
  modified: 2026-09-23T07:46:13.014Z
---

**STATUS 2026-09-23: DELIVERING on prod.** First send 07:45:07Z ("Admin digest sent"), carrying a
member's 07:28 upload. From deploy until then every tick was refused "535 5.7.0 Invalid login" on
both projects (prod since 2026-09-22T22:05Z), and events older than 12 ticks were dropped unsent.
Fix: Josh wrote a new secret version from the DPAPI file `C:\Users\Josh\.vscn\smtp-vscn.cred`
with `[IO.File]::WriteAllText` + `--data-file` (no trailing newline), then redeployed
`sendAdminDigest`; prod now binds `INFOMANIAK_SMTP_PASSWORD@3`, dev `@2` (dev not yet proven by a
real event). **A new secret version does nothing until the function is redeployed**: Functions pin
the version at deploy time. The secrets probe passed throughout; only probe 7 (function errors)
saw it. Since the unsent-notices change (branch `feat/admin-unsent-notices`), a refused send also
records `lastError`/`lastAttemptAt` on the event, and the admin console's Queues tab lists every
waiting notice with the badge counting the failing ones, so the next 535 is on screen rather than
only in the log. Claude never reads the value ([[password-handling-boundary]]).

On 2026-09-22 the Brevo signup ping became a queued digest (`functions/src/adminDigest.ts`,
composer in `functions/src/notify.ts`, SMTP in `functions/src/mail.ts`), merged to `dev`.
Triggers write `adminEvents/{id}` (server-only); `sendAdminDigest` runs every 10 minutes,
reports what is due in ONE mail, deletes what it covered. A signup is reported when
`users/{uid}.onboardingComplete` is true or 30 minutes after Auth-create, with the whole
profile, live image counts and the onboarding message. An image is reported when its record
crosses into `live` (member origin only, hidden owners skipped), one line per image with its
public URL.

**Why:** Brevo existed only because vscn.ch could not send; since 2026-09-18 it can (Infomaniak).
The old ping fired at wizard step 1 and knew only the address; Josh wanted to see what the
person actually did, plus a notice on image upload.

**How to apply:**
- Rotating the SMTP password = new secret version on BOTH projects (Josh, from the DPAPI file),
  then `deploy --only functions:sendAdminDigest --project <id>` on each. Project ids, not
  aliases: `.firebaserc` has `default` and `dev`, no `prod`.
- From address is `info@vscn.ch` (Infomaniak sends only as the authenticated box).
- Still open: destroy `BREVO_API_KEY` on both projects, move DMARC rua off Brevo, drop Brevo DKIM
  CNAMEs (DNS is Josh's; the classifier blocks me). See [[email-mailbox-migration]],
  [[password-handling-boundary]], [[signup-ping-proven-and-its-traps]].
