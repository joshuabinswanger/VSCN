# Release log

One entry per verification run: date, released commit, project, machine verdict, walk, action.
`npm run verify:release -- --project prod|dev` prints the entry; whoever ran it pastes it here and
fills in the action. Newest first. How to read a verdict: [release-verification.md](release-verification.md).

Green entries are one line. The value is the history: slow drift shows up here as a pattern
rather than as a member's email.

## 2026-09-22 · 51da312 · dev
Machine: RED — functions deployed: `onImageWentLive`, `sendAdminDigest`, `adminListActions` not deployed;
         `onAuthUserCreated`/`onAuthUserDeleted` and the eight admin callables deployed 2026-09-15, source changed 2026-09-22
Walk:    n/a (dev)
Action:  pending — deploy functions to vscn-dev-f4b60 (`INFOMANIAK_SMTP_PASSWORD` is already bound), re-verify

## 2026-09-22 · 1e033a7 · prod
Machine: RED — functions deployed: `adminListActions` not deployed; the eight admin callables deployed 2026-09-15,
         source changed 2026-09-17 (PR #48 shipped the admin console UX pass through hosting only)
         WARN upload pairing: authorize 28 ok of 28 / complete 1 ok of 1 since 49d9be8 (2026-09-17) — the window
         spans the upload outage; the one completion is the first upload after the IAM grant, 14:08Z
         WARN stranded state: 19 expired permits and 19 `uploading` records from the 2026-09-22 morning retries,
         none past the 12 h sweep horizon — sweepImages ran 09:26Z with nothing old enough to clear
Walk:    not run (blocked on machine check)
Action:  pending — deploy functions to vscn-39508, re-verify, then walk

## 2026-09-22 · 1e033a7 · prod · acceptance test against the 2026-09-14 → 2026-09-22T14:00Z window
Machine: RED — upload pairing: authorize 31 ok of 33 / complete 0 ok of 0 — the eight-day outage, reconstructed from the logs
         IAM grants: `roles/firebaserules.firestoreServiceAgent` had already been applied by hand earlier on
         2026-09-22, so probe 4 was tested with a bogus expected role instead: red, then the role removed
Walk:    n/a (acceptance test)
Action:  protocol accepted — it goes red against the known-broken state; first run of the protocol
