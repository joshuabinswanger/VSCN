> Mirrors the user's memory note `~/.claude/projects/D--SynoDrive-VSCN/memory/account-deletion-is-immediate.md`; keep both copies in sync.

**2026-09-04, Josh: "scheduled deletion is unnecessary. just make it delete accounts
straight away".** `requestAccountDeletion` now opens the deletion job and immediately runs
`purgeAccount` — documents, files and the Auth user, with no way back.

**Why the job record survives the change:** `purgeAccount` reads it to know which images and
files belong to the account, and its `steps` are what make a purge resumable when a stage
fails halfway. `purgeAfter` is now `Timestamp.now()`, so a job that DOES fail is already due
and `purgeExpiredAccounts` finishes it on the next pass instead of a month later.
`onAuthUserDeleted` sees the job already exists and stands down, so deleting the Auth user
from inside `purgeAccount` does not re-enter.

**How to apply — the environments disagree, and the code does not show it.** The callable is
deployed on **dev only**. Prod's deployed `requestAccountDeletion` still opens a 30-day job
and walks away, so reading `functions/src/accounts.ts` tells you what dev does and nothing
about what prod does. Any prod release has to include `--only functions` or prod members get
a delete button whose copy promises immediate and permanent while the backend schedules.

**Still scheduled, deliberately:** `cancelDeletion`, `purgeExpiredAccounts`, the dated banner
and "Keep my account" all stay. An admin can still schedule a dated deletion through
adminOps, and a member in that state needs to see it and needs a way out.

**The last gate is the address, not the password (2026-09-04, `d71cf5b`).** Josh: "a typed
confirmation would be good!" The delete panel now asks you to type the account's own email
address before the confirm button will enable, then still asks for the password. The
single-step design was justified in the code as "a second confirmation adds a click and no
safety" — that reasoning rested on the 30 days and died with them. The address rather than
the word DELETE because the form is bilingual: a magic word needs translating, and switching
language mid-form would invalidate what you had just typed. Case and surrounding whitespace
are forgiven; the match is re-checked inside the click handler rather than trusted to the
button's `disabled` attribute.

See [[prod-release-order]] — this is a fourth thing riding on that one deploy, and it is not
in the runbook.
