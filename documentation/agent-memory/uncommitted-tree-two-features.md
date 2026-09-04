> Mirror of `~/.claude/projects/D--SynoDrive-VSCN/memory/uncommitted-tree-two-features.md`, kept in the repo
> so any Claude instance can read it without access to the user profile.

---
name: uncommitted-tree-two-features
description: "RESOLVED 2026-08-31: the four-day dirty tree on feature/user-content-backend was split into six commits, so the 3fcc0ba failure did not repeat — but all 35 commits on the branch are still unpushed and the prod rules deploy still blocks profile Saves"
metadata:
  type: project
---

**Resolved on 2026-08-31.** The dirty tree that had been growing on
`feature/user-content-backend` since 2026-08-24 (`0c985b3`) — 26 modified files, ~4,350
insertions, eight untracked source files — was committed as **six topical commits** rather
than one. The `3fcc0ba` failure did not repeat.

The split, in order (later commits depend on earlier ones):

1. `chore:` untrack `.firebase/hosting.ZGlzdA.cache` and ignore `.firebase/`.
2. `feat(functions):` the GitHub rebuild token leaves the browser — `functions/`,
   `firebase.json`, the deploy workflow, `profile.ts`, `firebase.ts`.
3. `feat(profile):` projects, visual needs, science-side fields — `firestore.rules`, the
   editor, the preview, `firestore.ts`, `gallery.ts`, `memberType.ts`, `memberView.ts`,
   `members/[slug].astro`, new `projects.ts` + `VisualNeedsSelector.astro` +
   `seed-visual-needs.mjs`.
4. `feat(community):` the slot layout, three views, and the iOS `<details>` workaround —
   `CommunityGrid.astro`, new `communityLayout.ts`, `community/*`, `global.css`.
5. `feat(header):` the brand ticker letter-overwrite hover — `Layout.astro` alone.
6. `docs:` the WebKit crash record and the agent-memory mirrors.

**What made it splittable, and the technique worth reusing:** the two features touched
almost disjoint file sets. The one genuinely mixed file was `translations.ts`, whose 15
hunks divided cleanly by key prefix — `community.*` to commit 4, `profile.*`/`member.*` to
commit 3. `git apply --cached` on a hunk subset **fails** here (dropping early hunks
invalidates the later hunks' new-side line numbers). What works: reconstruct the wanted
intermediate file from `git show HEAD:<path>` plus the chosen hunks in a script, write it,
`git add`, then restore the full working copy from a saved backup. The staged/unstaged split
is then exactly the feature boundary.

Verified after the split: `npm run lint` at the standing 8-warning / 0-error baseline, and
`npm run build` green at 66 pages. **Intermediate commits were not individually built** —
only the final tree was.

**Still open, and both matter more than the commits did:**

- **Nothing is pushed.** `feature/user-content-backend` has no upstream and sits 35 commits
  ahead of `origin/dev`. Josh gates his own pushes — propose, do not run it unasked.
- **The manual PROD rules deploy still blocks the projects half.** Until it lands, every
  profile Save writes `projects` and is rejected whole by `hasOnly`, silently taking
  unrelated edits with it — see [[user-content-backend-status]] and
  [[firestore-rules-hasonly-gotcha]].
- The old GitHub rebuild token was in the public client bundle and **must be revoked** —
  see [[rebuild-dispatcher-cloud-function]].

The repo mirrors of these notes (`documentation/agent-memory/*.md`) are **now tracked**, and
`CLAUDE.md` was updated to say so. An edit to either copy belongs in both.
