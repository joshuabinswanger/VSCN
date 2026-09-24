> Mirrors the `~/.claude/projects/D--SynoDrive-VSCN/memory/publication-invoker-is-declared.md` memory file; keep the two in sync.

---
name: publication-invoker-is-declared
description: "A functions deploy REWRITES a service's invoker policy from the deploy manifest, so invoker: private silently revoked the hand-applied grant on acknowledgeSitePublication; the deployer is named in code since 2026-09-22"
metadata: 
  node_type: memory
  type: project
  originSessionId: 9c2cf163-a4d8-43d4-8357-0ac01de92630
  modified: 2026-09-22T18:17:36.673Z
---

`firebase deploy --only functions` rewrites each service's Cloud Run invoker policy from the
deploy manifest. `invoker: "private"` declares **nobody**, so every functions deploy silently
revoked the `roles/run.invoker` binding that let the Hosting deployer call
`acknowledgeSitePublication` — a binding that existed only because a human had granted it in the
console. Fixed 2026-09-22 in `functions/src/publication.ts`: the manifest now names
`vscn-hosting-deployer@<project>.iam.gserviceaccount.com`, derived from `GCLOUD_PROJECT` /
`GCP_PROJECT` / `FIREBASE_CONFIG` at discovery and **failing closed** if none resolves, so dev and
prod each grant their own deployer and the deploy applies the binding itself.
`tests/functions/publication.test.cjs` pins the manifest.

**Why:** the failure is invisible until the next release, and it is not just a red badge. The
merge workflow's last step 403s, the revision is never acknowledged, `rebuildQueue/site` stays
dirty, and `flushMemberRebuilds` redispatches a full export-render-deploy every 15 minutes until
someone clears it. On dev, 2026-09-22: deploy at 17:35 wiped it, the release at 17:58 died at the
ack step, Josh re-granted by hand, and a redeploy of that one function at 18:12 then left the
binding intact — the proof the fix works.

**How to apply:** never re-apply this grant by hand. If
[[release-verification-protocol]]'s probe 4 reports it missing, the project was last deployed from
a commit that still said `private`; deploy functions from a commit that has the fix instead. The
general lesson is wider than this one function: anything IAM that a deploy can express belongs in
the code, because what the deploy manifest says beats whatever a console click left behind.
SHIPPED TO PROD in release `f21a60f` on 2026-09-22, and proven there: prod functions were deployed
by hand at 19:25 and the binding survived, where the same deploy erased it on dev that afternoon. Related:
[[release-verification-protocol]], [[rebuild-dispatcher-cloud-function]].
