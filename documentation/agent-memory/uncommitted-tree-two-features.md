> Mirrors the `~/.claude/projects/D--SynoDrive-VSCN/memory/uncommitted-tree-two-features.md` memory file; keep the two in sync.

---
name: uncommitted-tree-two-features
description: "RESOLVED 2026-08-31: the four-day dirty tree on feature/user-content-backend was split into six topical commits, so the 3fcc0ba failure did not repeat; the branch has since been pushed and merged into dev. Kept for the hunk-splitting technique."
metadata:
  type: project
---

> **Fully closed as of 2026-09-03.** The branch is pushed and merged into `dev`, and the
> prod-rules blocker dissolved when projects were withdrawn — see the corrected "Still open"
> section at the end. What is worth keeping here is the hunk-splitting technique.

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

**What was open on 2026-08-31 — all three have since closed:**

- ~~Nothing is pushed.~~ `feature/user-content-backend` was pushed and is now fully merged
  into `dev` (0 commits outstanding by content and patch-id) — [[stale-branches-superseded]].
- ~~The manual PROD rules deploy blocks the projects half.~~ Dissolved 2026-09-01: projects
  were ripped out, so the client sends `projects: deleteField()`, which merges to an absent
  key and passes even prod's old ruleset — [[projects-feature-withdrawn]],
  [[user-content-backend-status]]. The *new* (tightened) ruleset is still undeployed, which
  is harmless rather than blocking.
- ~~The old GitHub rebuild token must be revoked.~~ Revoked, and the stale secret versions
  destroyed — [[rebuild-dispatcher-cloud-function]] (CLOSED 2026-09-01).

The repo mirrors of these notes (`documentation/agent-memory/*.md`) are **now tracked**, and
`CLAUDE.md` was updated to say so. An edit to either copy belongs in both.
