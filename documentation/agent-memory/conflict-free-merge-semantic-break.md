<!-- Mirror of ~/.claude/projects/D--SynoDrive-VSCN/memory/conflict-free-merge-semantic-break.md — kept in the repo so any
     Claude instance can read it without access to the user profile. Edit both copies. -->

---
name: conflict-free-merge-semantic-break
description: "git merge-tree reporting zero conflicts says nothing about whether the result builds — dev's lazy getBucket() and a branch's module-scope `bucket` import lived in different files and broke the functions build silently"
metadata:
  node_type: memory
  type: feedback
---

**2026-09-06.** Merging `claude/design-notes-20260904` into `dev` produced **zero textual
conflicts** — `git merge-tree` against the merge base confirmed it before the merge, and
`git merge` said "Merge made by the 'ort' strategy" with no complaint. The result did not
compile.

`dev`'s one exclusive commit, `5d34ee0`, had replaced `functions/src/admin.ts`'s
module-scope `bucket` export with a lazy `getBucket()`. The branch's `adminDeleteImage`
(`c60d478`) was written before that landed and did `import { adminAuth, bucket, db }`.
**Two different files**, so nothing overlapped and nothing conflicted:

```
src/adminOps.ts(4,21): error TS2305: Module '"./admin"' has no exported member 'bucket'.
```

**Why it matters here specifically:** `functions/src/admin.ts` is imported by nine
modules, so it is the repo's widest semantic blast radius, and this is the SECOND time the
module-scope bucket has broken a functions deploy (see
[[firebase-entity-restructuring]]). Worse, a deploy would not have named the problem —
the comment on `getBucket` records that evaluating it at import time makes firebase-tools
report a generic `Cannot determine backend specification. Timeout after 10000` instead of
the real error. `tsc` is the only thing that says what actually broke.

**Why:** a merge conflict is a claim about overlapping *lines*. It is not a claim about
whether an exported name still exists, whether a signature still matches, or whether the
thing you import is still a value rather than a function.

**How to apply:** never treat "merged clean" as "landed". After ANY merge into `dev`,
before deploying: `npm run lint`, `npx astro build --mode development`, and — if
`functions/` was touched on either side — `node "C:\Program Files\nodejs\node.exe"
./node_modules/typescript/bin/tsc` from `functions/`. The functions build is NOT part of
the Astro build and nothing else catches it. Check the *branch's* age against what `dev`
changed underneath it: a branch cut before a refactor is where these live.

Related: [[deploy-dev-needs-development-mode]], [[stale-branches-superseded]]
