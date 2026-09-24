> Mirrors the `~/.claude/projects/D--SynoDrive-VSCN/memory/merge-into-dev-without-asking.md` memory file; keep the two in sync.

---
name: merge-into-dev-without-asking
description: "Josh's standing preference (2026-09-17) — finished PRs go straight into dev without waiting for him; dev is the test environment and a broken dev is acceptable"
metadata: 
  node_type: memory
  type: feedback
  originSessionId: 695132de-1328-4e16-aa6e-e2bc9ceb5fbd
  modified: 2026-09-17T18:59:50.462Z
---

**Josh's preference, stated 2026-09-17:** merge finished changes directly into `dev`. He
does not mind if dev breaks; it exists to test things.

He said this after asking whether the admin console (PR #42) was live on dev and learning it
had sat as an unmerged draft for three hours while I "handed him the merge".

**Why:** dev is the test bed. Every CI-deployed dev release is the test itself; a PR waiting
in draft for Josh to click Merge is a feature he cannot see and a test that never ran. The
caution that fits `main` is friction on `dev`.

**How to apply:**
- When a branch is built and its PR checks are green, mark the PR ready and merge it with a
  merge commit (the repo convention). No need to stop at "open PR, hand Josh the merge".
  `dev` is unprotected.
- Report the merge and the resulting dev deploy run in the headline block. A red dev deploy
  is a finding to report and fix, not a reason to have held back.
- Scope is `dev` only. `main` (prod) releases remain Josh's decision — see [[prod-release-order]].
- The "hand Josh the merge" bullet in [[dev-deploy-is-ci-only]] came from the permission
  layer refusing a merge twice in one session, not from Josh. PR #42 merged cleanly the same
  evening; per [[site-footer-is-fixed-chrome]] a classifier block is worth one retry.
