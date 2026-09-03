<!-- Mirror of ~/.claude/projects/D--SynoDrive-VSCN/memory/stale-branches-superseded.md — kept in the repo so any
     Claude instance can read it without access to the user profile. Edit both copies. -->
---
name: stale-branches-superseded
description: "main and every claude/* branch is already inside dev, rebased — the ahead/behind counts lie, and merging them would revert dev"
metadata: 
  node_type: memory
  type: project
  originSessionId: 0245c4ba-76a1-4d2e-ba9e-2c372be82057
  modified: 2026-09-03T15:30:27.015Z
---

**2026-09-03. Everything on `main` and on the four `claude/*` branches is already in dev,
and merging any of them would be a regression.** Verified by content, not by counting
commits.

**Why:** that lineage — the intro rework, the member-type selector, `wantsToContribute`,
the server-side rebuild dispatch — was REBASED onto dev's history under different SHAs, so
`git cherry` and `git branch -vv` still report them as outstanding. They are counting
patch-ids, and the patch-ids changed. `dev` is 138 commits ahead of `main`; `main` is
"6 ahead" of dev and none of those six are actually missing.

**How to apply:** before merging any branch into dev, check the FEATURE, not the count.
The four that were checked and found present:

- `ea648e2` / `10a7eba` intro rework → dev's `556ad50` / `44ff1e3`; `PageLoader.astro` is
  byte-identical between `10a7eba` and dev.
- `c2a5ead` member types → dev's `src/lib/memberType.ts` (from `3fcc0ba`, `8e00d27`).
- `800e8b7` `wantsToContribute` in the rules → present in dev's `firestore.rules`.
- `678b5fb` server-side rebuild dispatch → dev's `functions/src/rebuild.ts`; no
  `PUBLIC_GITHUB*` token anywhere under `src/`. See
  [[rebuild-dispatcher-cloud-function]].
- `24397fe` rebuild target per project → superseded by `e96a024`, which IS in dev and is
  the fuller version. See [[rebuild-target-per-project]].
- `e7d4645` "a new public profile says whether it is active" → its own commit message says
  it is superseded by the verification-gated version, and that version is what dev has in
  `publishPublicProfile`.

`feature/user-content-backend` is fully merged (0 commits outstanding, by content and by
patch-id both). `feat/gallery-uploader` is the one branch that carried real work — handled
separately, see [[gallery-uploader-reconciled]].

These branches are safe to delete. Left in place only because deleting someone's branches
is their call.
