> Mirrors the `~/.claude/projects/D--SynoDrive-VSCN/memory/preview-lightbox-shared-module.md` memory file; keep the two in sync.

---
name: preview-lightbox-shared-module
description: "LIVE ON DEV 1431ed2 (PR #90) — the editor Preview tab + onboarding card now open PhotoSwipe; one lightbox module (src/lib/lightbox.ts) for all four callers; `npm run worktree` branches off the STALE local dev ref"
metadata:
  node_type: memory
  type: project
  originSessionId: 92df3efc-4faa-4226-8f1d-a4a6122f6929
  modified: 2026-09-24T16:21:17.019Z
---

**Merged to dev 2026-09-24 as `1431ed2` (PR #90), not on prod.** Josh: "the photoswipe does
not work in the preview". Root cause: it had never been wired up. The Preview tab's work
links and the card's frame link were href-less on purpose, and nothing bound PhotoSwipe in
the editor.

- `src/lib/lightbox.ts` is now the site's ONE lightbox: `createLightbox(strings, target?)`,
  `bindCardOpener(container, lightbox)` (the card's whole-carousel opener moved out of
  CommunityGrid), `parseLightboxStrings`, `lightboxStringsFrom(ui table)`. The member page
  and CommunityGrid used to carry verbatim copies of the options; all four callers (member
  page, grid, ProfileForm, OnboardingForm + the proto harness) build theirs from it.
- `bindPreviewLightbox()` in profilePreview.ts binds ONCE per page load. PhotoSwipe resolves
  `children` at click time, so re-rendered figures need no rebind.
- The editor writes NO `data-pswp-profile`, so the lightbox credit is plain text and nothing
  navigates out of an unsaved form. The preview card's link stays href-less, and the opener
  falls back to the slide without `aria-hidden` (the one the carousel is showing).
- Omit `target` for a hand-opened-only lightbox: a PhotoSwipe gallery WITHOUT `children`
  opens on ANY click inside it, arrows included.

**Verified:** harness locally and on dev (page "1 / 3", card "1 / 3"). Also locally: the card
opens on the showing slide and follows the lightbox on close. Regression checks on the member
page, a Gallery card (8 slides) and the Grid wall (19). The signed-in /profile walk is NOT done.

**Trap, found on the way:** `npm run worktree -- <branch>` bases on the LOCAL `dev` ref
(`scripts/new-worktree.mjs`, `base = "dev"`), which was sitting at PR #75 while origin/dev
was at #87. Pass `--from origin/dev`, or `git reset --hard origin/dev` in the fresh worktree
before working. Also: the local site-data export dies on the revoked credential
([[dev-deploy-is-ci-only]]) and DELETES the old `.site-data.json`. For local-only rendering,
copy a recent dev snapshot and bump `generatedAt`; the validator rejects anything older
than 1 h. A rejected snapshot is cached until `astro dev` restarts.

Related: [[gallery-card-lightbox-all-slides]], [[profile-editor-preview-mode]],
[[merge-gate-must-read-exit-code]].
