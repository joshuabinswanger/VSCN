<!-- Mirror of ~/.claude/projects/D--SynoDrive-VSCN/memory/image-descriptions-long-and-short.md — kept in the repo so any
     Claude instance can read it without access to the user profile. Edit both copies. -->

---
name: image-descriptions-long-and-short
description: "REVERSED after one day — a gallery image carries ONE description again (plus its caption); `descriptionShort` is retired and swept on save, and the seeded dev placeholder text still must not reach prod"
metadata: 
  node_type: memory
  type: project
  modified: 2026-09-04T08:42:08.256Z
  originSessionId: 518ce24d-1209-4699-96da-58481bea6b94
---

**The split lasted one day.** 2026-09-03, Josh: "image descriptions should have a long
and short version: one for portfolio the rest for lightbox and other places" — so
`description` (600) became portfolio-only and a new `descriptionShort` (240) went
everywhere else. 2026-09-04, Josh: "we only need one description field for the image: so
only caption (make a good example) and a Description (can be longer)". Asked what to do
with the text already written into the short field on dev, he chose **drop it**.

**Where it stands now.** Two texts per image: `caption` (140, doubles as alt text) and
`description` (600, travels everywhere again — the portfolio figcaption AND every
`data-pswp-description`). `MAX_GALLERY_DESCRIPTION_SHORT` and every read of the short
field are gone. `updateImageText` in `src/lib/images.ts` writes
`descriptionShort: deleteField()` unconditionally as a retirement sweep, so records
written during the field's one-day life clean themselves on their owner's next save; that
line is the only mention of the name left in the app. Old values are deliberately NOT
merged into `description` — doing so would overwrite a member's long text with their
one-line summary in exactly the cases where both exist.

**Why the split failed:** in the editor it read as being asked to write the same thing
twice at two lengths with no way to tell which surface would show which, so it mostly
went unfilled — and the lightbox then showed nothing where the member had plainly
written something.

**The caption placeholder is now an example, not a specification.** It said "One line.
Also read aloud as the image description."; it now shows a caption
("Zebrafish retina in cross-section, confocal"). The label and the example had to be
split into `profile.gallery.caption` and `profile.gallery.caption.ph` first, because the
same string was also the field's `aria-label` via `named()` — an example there would have
a screen reader announce one specific zebrafish before every caption box.

**Adding a field to a gallery item is still a five-place change**, and `hasOnly` means
missing one silently rejects the whole profile save (see
[[firestore-rules-hasonly-gotcha]]): `validGalleryItem` AND `validImage` in
`firestore.rules`, `GalleryItem` + `sanitizeGalleryItems` in `src/lib/gallery.ts`,
`updateImageText` in `src/lib/images.ts`, `ProfileWork` in `src/lib/profileView.ts` and
`works()` in `src/lib/memberView.ts`, and `ImageDoc` in `functions/src/types.ts`. The
editor's two producers both have to project it too — `ProfileForm.astro`'s publish
payload and `profilePreview.ts`. REMOVING one is safe by comparison: `hasOnly` accepts a
subset, so no rules deploy was needed, and `firestore.rules` still permits
`descriptionShort` purely so the sweep above can clear it.

**The per-image `link` reached the lightbox on the same day** (from Josh's sketch: "DESC
(WITH LINKS)"). Its chain is longer than it looks — `CommunityWorkCard`, the member page,
and for the directory card `pswpFor` → `data-work-link` on the slide → `copy()` in
`communityCarousel.ts` → `data-pswp-link` on the trigger, plus `profilePreview.ts` for
the editor's preview. Miss the carousel copy and the link is right on slide 1 and stale
on every other.

**Dev carries PLACEHOLDER text, and it must not reach prod.**
`scripts/seed-image-descriptions.mjs` filled all 50 seeded images on dev, because both
fields were empty everywhere and the change could not otherwise be looked at. Every
string begins "Placeholder summary/description, standing in for the artist's own …" and
makes no claim about any picture — the same principle `seed-curated-galleries.mjs` states
for captions. The script **refuses `-P prod` outright**, is idempotent, never touches text
it did not write, and `--clear --write` removes exactly its own strings. Run that before
any prod seeding round, or before showing dev to the members in the review email. It
still writes and clears BOTH fields (it runs on the Admin SDK, so the retired key is no
obstacle), so `--clear --write` remains the complete undo — but the LONG placeholder is
now what dev shows in the lightbox as well as on the portfolio page, so dev's lightbox
reads as a paragraph where it used to read as a sentence.

Related: [[barless-lightbox-geometry]] (where the description is now drawn),
[[image-cards-need-content]], [[vscn-gallery-tech-stack]],
[[profile-editor-preview-mode]], [[dev-vs-prod-firestore-divergence]]

**Release ordering:** this note holds one gate of three that ride on a single prod deploy — see [[prod-release-order]] before sequencing anything.
