> Mirrors the `~/.claude/projects/D--SynoDrive-VSCN/memory/projects-reintroduced.md` memory file; keep the two in sync.

---
name: projects-reintroduced
description: "Projects are back as an OPTIONAL grouping of gallery images — LIVE ON DEV 2026-09-24 (PR #82 800769e + drag fix PR #83 4d8405d), walked signed in, NOT on prod; info tips (PR #80/#81) shipped to dev first"
metadata:
  node_type: memory
  type: project
  originSessionId: 93e93cfb-9cf8-4fb7-9b05-140b5f0c59ce
  modified: 2026-09-24T01:22:26.216Z
---

2026-09-23, Josh: "lets introduce projects again". Spec `documentation/20260923-projects-design.md` (amended after the final review), plans `documentation/20260923-info-tips-plan.md` and `documentation/20260923-projects-plan.md`. **On dev, not prod.**

Josh's decisions, each a fork he chose:
- **Optional grouping**, not the gallery's unit. A community "collapse to projects" filter or Projects section: "not for now".
- All fields optional (title/titleDe, description/descriptionDe, link, affiliations). One image is a valid project.
- **Affiliations = both** kinds, repeatable like Social Media: a name with optional link, or a VSCN member. Member credits need **no approval**.
- **Images inherit the project link** into the `siteLink` slot; the image's own link wins.
- In the editor a project **encapsulates** its images (framed block in the one linear list). Moving is by **dragging** (SortableJS), ⋯ menu as keyboard fallback.
- Info tips (ⓘ) on `/profile` only; **the signup wizard stays written out**.

**Shape:** `projects/{id}` owner-only + optional `images.projectId`; the gallery id array stays the only order. Unlike the withdrawn version ([[projects-feature-withdrawn]]), which was an array on the profile doc ([[rules-evaluation-budget]]); this follows [[works-on-the-record-restructure]].

**Traps that bit or nearly bit (why they matter next time):**
- The exporter's `imageKeys` is an ALLOWLIST — without `projectId` the build groups nothing and every unit test still passes.
- The rebuild fingerprint (`functions/src/rebuildQueue.ts`) only sees what it reads: project-only edits never published until projects were folded in.
- An empty block is never written; it shows a note instead ("Add an image to keep this project").
- SortableJS nested lists: a cross-list drop has a dead centre unless `invertSwap` + `invertedSwapThreshold: 1`; on touch the fallback lane passes onMove a PLAIN `{clientX, clientY}` object, never a TouchEvent.
- `/profile` now calls `loadProjects` on open: **rules must be live before hosting** or every member's editor sits behind Retry ([[firestore-rules-hasonly-gotcha]]).

**How to apply — prod release (Josh runs it; prod commands are classifier-blocked):** deploy functions to prod by hand from the dev tip BEFORE the release PR merges (uploads keeps projectId, purge deletes projects, adminLookupMember lists them, requestRebuild fingerprint); the merge workflow deploys rules before hosting. `onAuthUserCreated` failed its dev deploy twice on Secret Manager access (unrelated, previous revision serving) — a chip was raised to fix it before prod.

**Still open:** Josh's iPhone touch-drag pass; watching a project publish needs a VISIBLE account — Josh's dev profile is `active: false`, so his saves queue no rebuild by design (and `/members/josh` on dev is a different member).

**Info tips redesigned 2026-09-24 (PR #86, dev `973ca71`, not prod):** plain italic "i", the note opens as a toggletip box under the label (push-down, caret aimed by `placeInfoTip()` in `src/lib/infotip.ts`, one open at a time, Esc/outside click close). Image-row and project fields have visible `<label>`s wired at clone time. Signed-in walk on dev still owed: the Playwright profile was held by another session.


**PR #87 (2026-09-24, dev `d3a14ab`):** Josh reversed the push-down box the same day. Focusing a text field now opens its tip, which hovers under the field at exactly the field's width: `placeInfoTip(note)` in `src/lib/infotip.ts` measures the field (its https:// frame, or a checkbox's label row). The i is a bare italic letter with no ring. Committed with `commit-tree` onto origin/dev, because another session had uncommitted lightbox work in the same `wt-feat-projects` tree.

**PR #92 (2026-09-24, dev `11b00c6`):** Josh wants the i INSIDE text fields, not next to the title. The pattern is a `.infotip-field` wrapper, or the last cell of an `.input-prefix-wrap`, with the rules in global.css (Astro scoped styles do not reach a child component's root, so they cannot live in ProfileForm). Chip groups, checkboxes, the social rows and the select keep the i beside the title. BilingualField has one i per pane. In the browser pane, `.focus()` fires no focus events until a real click gives the pane focus (`document.hasFocus()` is false), so test the focus path with a real click.

**PR #94 (2026-09-24):** Josh reported "the i does not expand anything". Cause: Astro INLINES InfoTip's small script once at top level and once per i inside each `<template>` (6 in the gallery row, 1 in the project block). Every cloned row runs its copies again, so a module-scoped `installed` flag guards nothing: each copy added a click handler, and an even total toggled the box shut within the same click. The guard lives on `window.__vscnInfoTips` now. A harness that imports the module once can never catch this. To reproduce, inject the page's own inline scripts and clone the templates. The same trap applies to any component script rendered inside a `<template>`.
