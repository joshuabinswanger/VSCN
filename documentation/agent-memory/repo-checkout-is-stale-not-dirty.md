> Mirrors the `~/.claude/projects/D--SynoDrive-VSCN/memory/repo-checkout-is-stale-not-dirty.md` memory file; keep the two in sync.

---
name: repo-checkout-is-stale-not-dirty
description: "repo/ looked like 3000 lines of uncommitted work; it was 39 commits behind, and most of the dirt was work already merged upstream"
metadata: 
  node_type: memory
  type: project
  originSessionId: be0cab60-8649-45a6-af4f-89656734979a
  modified: 2026-09-17T15:33:27.374Z
---

2026-09-17. `repo/` sat on `dev` at `6c1fccf` (09-14) while `origin/dev` was at
`56133f8` (09-16) — **39 commits behind, 1 ahead**. `git status` showed 59
modified and 75 untracked paths, which read as a huge body of unsaved work. It
was not.

**27 of the 59 modified files were byte-identical to `origin/dev`.** The work
had already merged via PRs #25–#38; the checkout simply never pulled, so git
diffed live files against a stale HEAD and called the difference "modified".
The same was true of untracked files — audit documents that exist upstream
showed as untracked because local HEAD predates the commit that added them.

**Committing that tree would have regressed production security.** Its
`firestore.rules` still had the client-side `/images` create rule where dev now
has `allow create: if false`; its `storage.rules` still let members write
directly to the public `users/` path, which dev replaced with the private
`pending/` staging design. `src/lib/images.ts` and `membersBuild.ts` were
likewise the 09-15 audit remediation caught mid-flight, superseded hours later
by `07cbfbd` and `551b130`.

**Two things in it were genuinely novel and would have been lost by a reset:**
the whole communication-preferences slice (PR #45) and `6c1fccf`'s worktree
teardown fix (PR #44), plus six agent-memory mirrors newer than upstream's.

**The trap worth remembering:** the working tree's `functions/src/index.ts` was
STALE, missing `completeImageUpload` and `acknowledgeSitePublication`. Copying
that file forward would have deleted two deployed Cloud Functions with no error
anywhere. When porting out of a stale tree, a file is only safe to copy whole
once you have proved it is a SUPERSET of upstream — check, per file, and take
upstream's version plus your hunk where it is not.

**How to tell the two apart**, since `git status` cannot: compare each dirty
file's working-tree bytes against `git show origin/dev:<file>`, and compare
`git rev-parse HEAD:<file>` with `origin/dev:<file>` to see whether upstream
moved it too. Same-base means the local edit is new; drifted means it may be
an older draft of something already landed. Consistent with
[[stale-branches-superseded]]: judge the feature, not the patch-id.
