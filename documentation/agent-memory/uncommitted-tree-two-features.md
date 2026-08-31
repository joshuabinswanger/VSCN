> Mirror of `~/.claude/projects/D--SynoDrive-VSCN/memory/uncommitted-tree-two-features.md`, kept in the repo
> so any Claude instance can read it without access to the user profile.

---
name: uncommitted-tree-two-features
description: "Three days of uncommitted work on feature/user-content-backend holds two distinct features — member projects and the spread gallery — and unlike 3fcc0ba they ARE separable into two commits"
metadata:
  type: project
---

As of 2026-08-27, `feature/user-content-backend` has **21 modified files, ~1900 insertions,
and two untracked source files**, with the **last commit on 2026-08-24** (`0c985b3`). Three
days of work has never been committed.

Two distinct features are sitting in that one dirty tree:

- **Member projects** — `src/lib/projects.ts` (untracked), the `projects` array on the
  profile doc, `description` + `projectId` on gallery items, `validProjects()` in
  `firestore.rules`, the editor UI in `ProfileForm.astro` (+119 project-touching lines), the
  profile page credit line, and 27 new i18n keys.
- **The spread gallery** — `src/lib/communityLayout.ts` (untracked), the rewritten
  `CommunityGrid.astro` (+159 layout lines), `Layout.astro`, the community cards,
  `global.css`, and the `--grid-max` widening to 2000px.

**They are separable, and that is the point of writing this down.** Measured per file, the
two touch almost disjoint sets: the only file scoring in both buckets is `Layout.astro`, and
its single "project" hit is the English word in a comment, not the feature. `translations.ts`
is projects-only. `community.astro` is a one-line comment edit.

- Projects commit: `firestore.rules`, `ProfileForm.astro`, `ProfileViewPreview.astro`,
  `OnboardingForm.astro`, `translations.ts`, `firestore.ts`, `gallery.ts`, `memberView.ts`,
  `profilePreview.ts`, `profileView.ts`, `members/[slug].astro`,
  `proto/profile-preview.astro`, plus new `src/lib/projects.ts`.
- Gallery commit: `CommunityGrid.astro`, `Layout.astro`, `community/*`, `community.astro`,
  `global.css`, plus new `src/lib/communityLayout.ts`.

**Why it matters:** this repo has run this exact failure before. `CLAUDE.md` records that two
features once sat interleaved in one dirty tree for two months and could no longer be split —
that history is permanently the single commit `3fcc0ba`, build-verified only and never
reviewed ([[member-curation-stage1]]). The window where this tree is still splittable is open
now and closes as the two features grow into the same files.

**How to apply:** do not offer to "commit everything" as one change. Split along the two
lists above. Josh gates his own commits and pushes, so propose, do not run it unasked.

Blocking prerequisite that travels with the projects half: the **manual PROD rules deploy**.
Until it lands, every profile Save writes `projects` and is rejected whole by `hasOnly`,
silently taking unrelated edits with it — see [[user-content-backend-status]] and
[[firestore-rules-hasonly-gotcha]].

Also untracked and deliberate: `documentation/agent-memory/*.md`, the repo mirrors of these
notes. Convention is to leave them untracked unless asked to commit them.
