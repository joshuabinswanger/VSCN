<!-- Mirror of ~/.claude/projects/D--SynoDrive-VSCN/memory/release-history-repaired.md — kept in sync so any Claude instance can read it without the user profile. -->

---
name: release-history-repaired
description: dev and main have a real common ancestor since 2026-09-07 — releases are ordinary PRs now, and ahead/behind counts mean something again
metadata:
  type: project
---

Until 2026-09-07 the last three releases were built with `git commit-tree` (tree
from dev, single parent main), which copies a tree onto main WITHOUT real
ancestry. The consequence bit hard during the auth release: the merge base of
main and dev was `272e5729`, ancient, so a dev → main PR three-way merged from a
bogus base and reported **conflicts in five files** even though `git diff main
dev` was only the release's eleven. GitHub then refused to build a preview for a
CONFLICTING PR, so the release was blocked outright — not by any real conflict.

**Fixed by `8840ffa` on dev:** `git merge -s ours origin/main`, which keeps
dev's tree byte for byte and records main as a second parent. Proven safe by
comparing tree hashes before and after — identical, `c09cc1f5` — and by
confirming main held nothing dev lacked (every line that looked unique to main
was just the pre-change version of something the release replaced). The release
then merged normally as `e3c8cf9`.

**How to apply:** the merge base is now main's own tip, so a dev → main PR is an
ordinary fast-forwardable PR with an honest diff and a working preview. Do NOT
use `git commit-tree` for a release again — it would re-break what this fixed.
`git cherry` / `git branch -vv` / ahead-behind counts are trustworthy from
`3066ebf` forward, but still lie about anything older.

Note for a future session: `CLAUDE.md`'s "Releasing to main" section still
describes the commit-tree world and says the history is untrustworthy. That was
true when written and is now half-stale.

Related: [[stale-branches-superseded]], [[prod-release-order]],
[[pr-preview-deploy-secret-fix]].
