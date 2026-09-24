> Mirrors the `~/.claude/projects/D--SynoDrive-VSCN/memory/work-details-fold.md` memory file; keep the two in sync.

---
name: work-details-fold
description: "LIVE ON DEV 347520e (PR #93), not prod — each work's words fold in the Works tab; existing works start FOLDED, new uploads OPEN; signed-in walk not done"
metadata:
  type: project
---

**Merged to dev 2026-09-24 as `347520e` (PR #93), not on prod.** Josh: "make the image details
collapsible in the work tab. default for already there images is collapsed then".

- One `<details class="gallery-details">` per row in ProfileForm.astro wraps the EN/DE switch,
  caption, description, both links and the (still separately foldable) tag fold. The ⋯ menu
  sits OUTSIDE it, so a folded row can still be moved.
- `galleryDetailsOpenUI` (Map by imageId), unknown = FOLDED, the opposite default to
  `galleryTagsOpenUI`. `onGalleryUploaded()` sets the new id to open before rendering (this
  covers video links too); `onGalleryReplaced()` copies the old id's state to the new record.
- The folded summary prints the caption, or "No caption yet" (`profile.gallery.details.noCaption`).
- The outer fold has its OWN chevron class: `.gallery-details[open] .gallery-tags-chevron`
  would also rotate the nested tag fold's arrow.

**Verified:** lint, astro check, PR checks, dev deploy; rendering checked at 1280 and 375 by
loading /profile's HTML with scripts stripped and cloning the row template by hand, which works
without signing in. **NOT walked signed in**: folded-on-load and open-on-upload are unproven
in the real page.

Trap on the way: the `npm run worktree` node_modules junction points at `repo/`, which sits on
stale main and lacks `sortablejs`, so `astro check` failed with 4 errors that were not mine. Drop
the junction (`cmd /c rmdir`) and `npm ci` in the worktree. Related: [[profile-editor-preview-mode]],
[[projects-reintroduced]], [[preview-lightbox-shared-module]].
