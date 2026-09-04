---
# Mirror of ~/.claude/projects/D--SynoDrive-VSCN-repo/memory/rebuild-target-per-project.md
name: rebuild-target-per-project
description: "requestRebuild's target workflow is a param per Firebase project — deploying the old hardcoded version to dev makes staging saves trigger PRODUCTION deploys"
metadata:
  type: project
---

`requestRebuild` originally hardcoded `firebase-hosting-merge.yml` and `ref: "main"`.
Deployed unchanged to the dev project, every staging profile save would dispatch a
**production** deploy. This actually happened on 2026-09-01 before it was caught.

Fixed in commit `24397fe` (branch `claude/charming-mendel-c54de0`, also applied
uncommitted-then-committed in the main checkout): `GITHUB_WORKFLOW` and `GITHUB_REF`
are `defineString` params defaulting to the production values, with
`functions/.env.vscn-dev-f4b60` overriding them to `firebase-hosting-staging.yml` / `dev`.

**Why:** the defaults preserve prod behaviour exactly, so prod needs no config change,
while dev cannot reach production. Verify after any dev deploy by reading the live
function's env: `functions:list -P dev --debug` must show `GITHUB_WORKFLOW` and
`GITHUB_REF`. If they are ABSENT, an old build was deployed and dev is aimed at prod.

**How to apply — deploy from the tree that actually has the change.** This bit twice in
one session: a deploy run from the main checkout shipped the old hardcoded function
because the fix only existed in a Claude worktree. Before any functions deploy, confirm
`grep -n GITHUB_WORKFLOW functions/src/index.ts` in the directory you are deploying FROM.

**Related traps in the same area:**

- Firebase CLI discovery has a 10s budget and fails with "User code failed to load.
  Cannot determine backend specification. Timeout after 10000" on a cold module load,
  typically right after the predeploy `npm install`. The code is fine; set
  `$env:FUNCTIONS_DISCOVERY_TIMEOUT = "120"` and retry. The var is in SECONDS.
- There is no `prod` Firebase alias. `.firebaserc` defines `default: vscn-39508` and
  `dev`. `-P prod` errors out.
- The staging workflow does NOT auto-deploy on push to `dev` — deliberately disabled in
  commit `3e8e2fc`. Staging deploys only via `workflow_dispatch` (which is what
  `requestRebuild` does) or by hand with `npm run deploy:dev`.
- Secrets are pinned by VERSION, not `latest`. After `functions:secrets:set` you MUST
  redeploy or the function keeps reading the old version.

Related: [[rebuild-dispatcher-cloud-function]], [[deploy-dev-needs-development-mode]].
