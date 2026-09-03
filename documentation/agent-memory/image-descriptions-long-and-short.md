<!-- Mirror of ~/.claude/projects/D--SynoDrive-VSCN/memory/image-descriptions-long-and-short.md — kept in the repo so any
     Claude instance can read it without access to the user profile. Edit both copies. -->

---
name: image-descriptions-long-and-short
description: "A gallery image carries TWO texts since 2026-09-03 — `description` (long, portfolio page only) and `descriptionShort` (one sentence, lightbox and everywhere else); dev is seeded with clearable placeholder text"
metadata:
  node_type: memory
  type: project
  modified: 2026-09-03T00:00:00.000Z
---

2026-09-03, Josh: "image descriptions should have a long and short version: one for
portfolio the rest for lightbox and other places". Asked which way round, he chose
**long on the profile page, short everywhere else**.

**The two fields.** `description` (max 600) is unchanged in name and meaning but has
LOST a consumer: it now prints only in the figcaption on `/members/<slug>`.
`descriptionShort` (max 240, `MAX_GALLERY_DESCRIPTION_SHORT` in `src/lib/gallery.ts`) is
new and is what every `data-pswp-description` carries — the community cards, the wall
tiles, and the member page's own lightbox. Nothing derives one from the other: a member
who writes only the long text gets no short line, because a machine-truncated paragraph
is not a summary.

**Adding a field to a gallery item is a five-place change**, and `hasOnly` means missing
one silently rejects the whole profile save (see [[firestore-rules-hasonly-gotcha]]):
`validGalleryItem` AND `validImage` in `firestore.rules`, `GalleryItem` +
`sanitizeGalleryItems` in `src/lib/gallery.ts`, `updateImageText` in `src/lib/images.ts`,
`ProfileWork` in `src/lib/profileView.ts` and `works()` in `src/lib/memberView.ts`, and
`ImageDoc` in `functions/src/types.ts`. The editor's two producers both have to project
it too — `ProfileForm.astro`'s publish payload and `profilePreview.ts`.

**Dev carries PLACEHOLDER text, and it must not reach prod.**
`scripts/seed-image-descriptions.mjs` filled all 50 seeded images on dev, because both
fields were empty everywhere and the change could not otherwise be looked at. Every
string begins "Placeholder summary/description, standing in for the artist's own …" and
makes no claim about any picture — the same principle
`seed-curated-galleries.mjs` states for captions. The script **refuses `-P prod`
outright**, is idempotent, never touches text it did not write, and
`--clear --write` removes exactly its own strings. Run that before any prod seeding
round, or before showing dev to the members in the review email.

Related: [[image-cards-need-content]], [[vscn-gallery-tech-stack]],
[[profile-editor-preview-mode]], [[dev-vs-prod-firestore-divergence]]

**Release ordering:** this note holds one gate of three that ride on a single prod deploy — see [[prod-release-order]] before sequencing anything.
