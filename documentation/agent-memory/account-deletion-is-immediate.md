> Mirrors the `~/.claude/projects/D--SynoDrive-VSCN/memory/account-deletion-is-immediate.md` memory file; keep the two in sync.

---
name: account-deletion-is-immediate
description: "member-facing account deletion destroys everything on the spot — on BOTH environments since the 2026-09-06 prod functions deploy; the 30-day grace is gone everywhere"
metadata:
  node_type: memory
  type: project
  originSessionId: 0245c4ba-76a1-4d2e-ba9e-2c372be82057
  modified: 2026-09-04T07:47:15.576Z
---

**2026-09-04, Josh: "scheduled deletion is unnecessary. just make it delete accounts
straight away".** `requestAccountDeletion` now opens the deletion job and immediately runs
`purgeAccount` — documents, files and the Auth user, with no way back.

**Why the job record survives the change:** `purgeAccount` reads it to know which images and
files belong to the account, and its `steps` are what make a purge resumable when a stage
fails halfway. `purgeAfter` is now `Timestamp.now()`, so a job that DOES fail is already due
and `purgeExpiredAccounts` finishes it on the next pass instead of a month later.
`onAuthUserDeleted` sees the job already exists and stands down, so deleting the Auth user
from inside `purgeAccount` does not re-enter.

**The environments AGREE again as of 2026-09-06.** They did not for two days: the callable was
deployed on dev only, so reading `functions/src/accounts.ts` told you what dev did and nothing
about what prod did. The prod release of 2026-09-06 ran `deploy -P default --only functions`
and `requestAccountDeletion` was updated with the rest — **a real member on vscn.ch who presses
delete now loses the account on the spot, with no 30 days to change their mind.** That
behaviour change rode along with a hosting release nobody would describe as "about deletion",
which is the thing to remember: a functions deploy ships every callable, not the one you came
for. Diff `functions/src` against what is deployed before assuming a release is narrow.

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
