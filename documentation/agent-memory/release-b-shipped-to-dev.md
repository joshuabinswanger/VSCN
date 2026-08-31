<!-- Mirrors ~/.claude/projects/D--SynoDrive-VSCN/memory/release-b-shipped-to-dev.md — readable by any Claude instance without user-profile access. -->
---
name: release-b-shipped-to-dev
description: "The image-led directory is BUILT and live on dev hosting with 16 seeded galleries; prototype deleted; rules deployed to dev; what remains is Josh's authenticated pass, the member review email, and one combined prod release"
metadata:
  type: project
---

As of 2026-08-24 (afternoon), phases 0–2 of the release plan
(`documentation/20260824-next-release-plan.md`) are done on
`feature/user-content-backend` (~19 commits ahead of `dev`, everything
committed, still unpushed — Josh gates pushes):

- **The directory swap is implemented and live on dev hosting**:
  https://vscn-dev-f4b60.web.app/community serves the image-led multicol grid
  (21 cells, 16 image cards from seeded galleries), member pages in both
  locales, card→page morph, per-member OG images. The three grid decisions
  went with my recommendations (multicol / shuffle-within-tiers / keep GSAP)
  under Josh's "lets do 1-4".
- **The prototype is deleted** (62 pages build where 84 did); the sole
  survivor is `/proto/profile-preview`, rewired to `fetchMemberViews()`.
  MemberCard and embla-carousel are gone; editor + onboarding previews bind
  `CommunityCardPreview`. Curated images moved to
  `scripts/assets/curated-galleries/` for the prod seeding at launch.
- **Both rules files are deployed to dev** and the seeded objects serve 200
  with the immutable cache header. Found and fixed on the way:
  firestore.rules hardcoded the PROD bucket in its Storage-URL allowlists —
  deployed to dev unfixed, every avatar/gallery save there would have been
  rejected. `validStorageUrl()` now accepts both buckets.
- **Dev Firestore was synced from prod (23 docs) and seeded** with 16 curated
  galleries via `scripts/seed-curated-galleries.mjs` (writes users AND
  publicProfiles so an editor save can't wipe the seed; skips non-empty
  galleries; prod runs require `--only <slugs>` = the green-light list).

**Left, in order:** (1) Josh's signed-in pass on dev — avatar upload, legacy
JPEG replacement, crop UI, a real gallery upload, editor typing→preview sync;
(2) the member review email (drafted by Claude, sent by Josh, BCC) linking
each member's dev card/page for image consent + memberType confirmation;
(3) prod: seed approved galleries, merge feature→dev→main (main push
auto-deploys hosting; prod rules are a MANUAL deploy in the same window).

Verification honesty: browser checks ran in the hidden in-app pane, where
lazy images never load (`document.visibilityState === "hidden"`) — forcing
one eager proved loading works; 504 "Outdated Optimize Dep" after building
under a live dev server is the documented red herring, cleared by reload.
Lint baseline is now **8** (debugInfo died with the old grid); CLAUDE.md
updated. Still true from [[member-curation-stage1]]: `3fcc0ba`'s gallery +
memberType work has never been reviewed, and it is now load-bearing under
the new directory.

Related: [[user-content-backend-status]], [[image-cards-need-content]],
[[dev-vs-prod-firestore-divergence]], [[member-profile-pages-live]].
