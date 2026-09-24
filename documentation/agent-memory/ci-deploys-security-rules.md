> Mirrors the `~/.claude/projects/D--SynoDrive-VSCN/memory/ci-deploys-security-rules.md` memory file; keep the two in sync.

---
name: ci-deploys-security-rules
description: Since 2026-09-22 the merge and staging workflows deploy firestore.rules and storage.rules ahead of Hosting; storage rules needed a NAMED BUCKET because the default-bucket lookup is invisible to the deployer whatever it is granted
metadata: 
  node_type: memory
  type: project
  originSessionId: 9c2cf163-a4d8-43d4-8357-0ac01de92630
  modified: 2026-09-22T19:59:54.338Z
---

Both hosting workflows deploy the security rules in the deploy job, on the deployer's own
credential, immediately before Hosting. Until then nothing deployed rules automatically: every
workflow was `--only hosting`, so each ruleset change was a hand deploy someone had to remember.
Proven on dev 2026-09-22, `d7e89c2`: both rulesets released at 19:58:12 by the staging workflow,
and the check went fully green.

**Why:** rules drift is invisible until a member's save silently stops working, because the
`hasOnly` allowlist rejects the whole write with no error anywhere. That is also why the step sits
*before* Hosting rather than after. An old branch's rules once replaced newer ones this way and
took the Storage size cap with them, see [[storage-rules-cap-tracks-max-edge]].

**How to apply:** it took three tries, all of them on dev, and the last one is the durable lesson.
`roles/firebaserules.admin` alone gives 403 on `firebasestorage.defaultBucket.get`, because a
storage ruleset release is named after the bucket. Adding `roles/firebasestorage.viewer`
(read-only on purpose — the admin role can create and delete the default bucket) then gives **404**
from the same endpoint, which the CLI reports as "Firebase Storage has not been set up" on a
project that plainly has it; as owner that endpoint returns a healthy bucket, so the resource is
just hidden from the deploy credential. Do not hunt a third permission. `firebase.json` now lists
storage as an **array with a target** and `.firebaserc` names the bucket per project, because
`deploy/storage/prepare.js` resolves a default **only when the config is not an array**. No lookup,
no permission, and the bucket becomes a written fact — the same principle as the expectations
table in [[release-verification-protocol]], which now carries both grants so the check goes red if
either disappears. The rules tests are unaffected: they run on `firebase.security-audit.json`,
which keeps the single-object form. Related: [[publication-invoker-is-declared]],
[[merge-gate-must-read-exit-code]].
