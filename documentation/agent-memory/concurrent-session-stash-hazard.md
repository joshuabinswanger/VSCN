<!-- Mirror of ~/.claude/projects/D--SynoDrive-VSCN/memory/concurrent-session-stash-hazard.md — kept in the repo so any
     Claude instance can read it without access to the user profile. Edit both copies. -->

---
name: concurrent-session-stash-hazard
description: "Two Claude sessions edit D:/SynoDrive/VSCN/repo in ONE working tree; a `git stash` in one yanks the other's edits mid-build and yields a HYBRID dist that still says Complete — and a deploy ships the other session's uncommitted work"
metadata:
  type: project
---

On 2026-09-06 two sessions were working in the same checkout at once. At
22:35:46 the other one ran `git stash` (the HEAD reflog shows it as
`reset: moving to HEAD` — that line IS the tell) and popped it about two
seconds later. My `astro build` was running across that window and produced a
dist with SOME of my edits: the top-bar CSS was read before the stash and came
through, `communityCard.css` was read at HEAD and lost its `clip-path`. The
build reported `65 page(s) built … Complete!` either way. Nothing was lost —
the pop restored every file, which is why all my files carried one identical
mtime (22:35:48) and every fingerprint was present on disk.

**Why:** a stash is a `reset --hard` followed by a restore, and neither the
build nor the deploy has any idea it happened; the only evidence is the dist
disagreeing with the tree, and a "completed" build is no evidence at all. The
shared tree also means `npm run deploy:dev` ships whatever the OTHER session has
uncommitted — that evening it was `DEFAULT_VIEW = "index"` in
`src/lib/communityLayout.ts` plus `links.ts`, which made the bare `/community`
open on the ledger, and it went to dev under my deploy.

**How to apply:**
- Before deploying, grep `dist/` for a fingerprint of EVERY change, not one — and
  grep the whole of `dist/`, not `dist/_astro/*.css`: Astro inlines global
  stylesheets like `communityCard.css` into the page HTML, so a `_astro` glob
  reports a present rule as missing.
- `git reflog --date=format:%T -3` — a `reset: moving to HEAD` timestamped
  inside your build means the build is a hybrid; rebuild on the settled tree.
- `git status` before a deploy: any modified file you did not touch is another
  session's work-in-progress. Read its diff; say in the report that the deploy
  carries it. You cannot leave it out without stashing THEIR tree — the very
  move that caused this.
- Tool notes saying a file "changed on disk since you last read it" with your
  edits still present are this pattern, not a revert.

Related: [[deploy-dev-needs-development-mode]] (the deploy path itself),
[[conflict-free-merge-semantic-break]] (a build that passes is not the same as
the build you meant), [[stale-branches-superseded]] (the other worktrees are
clean and behind dev — this hazard is the SHARED tree, not the extra ones).
