# Profile preview mode in the editor — and why the directory card swap waits

Date: 2026-08-24. Branch: `feature/user-content-backend` (uncommitted).

## The decision

`/profile` stays **one page** with an `Edit | Preview` switch, rather than gaining a second
route for the public view. Preview renders the member's profile page from the form's
current, unsaved state.

The reason is not taste. Public member data is a **build-time snapshot** — `firebase-admin`
runs at build, and saving a profile only fires a GitHub Action to trigger a rebuild. So a
real `/profile/<id>` page cannot show a member their own edit until a rebuild and deploy
have run. Navigating a member to their public page is a feedback loop measured in minutes.
The preview therefore has to be rendered client-side, in the editor, from live form state.

The public page still exists for **visitors** — that is what a community card clicks into.
One editor page and one public artefact are not in tension; they have different audiences.

## The finding that changed the sequencing

The plan was to drop the simple member cards in favour of the image cards plus the profile
page. Measured against live Firestore on 2026-08-24 (read-only count, same auth path as
`scripts/gen-proto-real-data.mjs`):

```
activeProfiles: 21
withUploadedGallery: 0
withAvatar: 13
```

**No member has uploaded a single gallery image.** The prototype's artwork is not member
data — it was hand-curated from portfolio sites and Instagram into
`src/lib/proto-images-real.json`, and `gen-proto-real-data.mjs` reads images from that local
manifest, never from a `gallery` field.

Consequences for the swap:

- An image-led directory today renders **21 typographic cards and zero images**.
- It would also *lose* imagery: the current simple card shows an avatar, and 13 of 21
  members have one. The image card design does not use avatars. Net change today:
  13 images → 0.

So the directory swap is **blocked on content, not on code**. `/community` keeps the simple
card for now. The preview is the thing that unblocks it: showing a member their profile page
with an empty-work invitation is the mechanism that gets galleries filled.

Two open design questions this raises, both Josh's call:

1. Should the image card **fall back to the member's avatar** when they have no gallery?
   That would give 13 of 21 cards an image immediately — but it turns the page from a
   gallery of scientific illustration into a directory of faces.
2. Does the directory swap wait for a gallery threshold, or ship early and let cards
   upgrade from typographic to image as members upload?

## What was built

| File | Role |
|---|---|
| `src/lib/profileView.ts` | `ProfileViewModel` — the one shape the profile page, the directory card and the preview all consume. Two producers: a stored `publicProfiles` doc at build time, form state at runtime. |
| `src/lib/profilePreview.ts` | `renderProfilePreview(root, vm, labels)` — binds a view model into the shell. |
| `src/components/ProfileViewPreview.astro` | The profile-page design as an empty shell plus its styles. |
| `src/components/ProfileForm.astro` | `Edit \| Preview` switch; both previews moved into preview mode. |
| `src/pages/proto/profile-preview.astro` | No-auth harness — the editor is behind auth, so this is the only way to see the preview without credentials. |
| `src/i18n/translations.ts` | Toggle and profile-view strings, en + de. |

Design notes worth keeping:

- **`updatePreview()` was deliberately left alone.** The earlier plan was to extract it into
  a shared state object. That is wasted work now: it binds `MemberCard`, which is being
  replaced, so it should be deleted with the card rather than refactored first. The new
  renderer is separate and the old one is untouched.
- The existing always-visible card preview **moved into preview mode** rather than being
  deleted. It previews what `/community` actually renders today, and it swaps for the image
  card when the directory does. The side effect is that the form itself got shorter.
- Preview mode hides fields by **exclusion** —
  `.profile-form.is-previewing > *:not(.view-toggle):not(.preview-section):not(.form-footer)`
  — so the switch needed no restructuring of ~200 lines of field markup, and the footer
  stays visible so a member can save from preview without switching back.
- Variable-length lists (tags, links, works) are built by **cloning `<template>` elements**
  the component renders. Astro scopes component CSS with a `data-astro-cid-*` attribute on
  every selector, so nodes built from scratch in JS would match none of the component's
  rules; cloned nodes carry the attribute and style correctly.
- **`hidden` loses to an author `display`.** The renderer hides empty sections with the
  `hidden` attribute, but `.ppv__open` and `.ppv__row` are `display: flex`, so empty
  "Open to" and "Elsewhere" rows rendered as stray headings. Caught in the browser, not by
  reasoning. Fixed with `.ppv [hidden] { display: none }` — served (0,4,0) against the class
  rules' (0,2,0), counting Astro's scope attribute on every compound.
- `profilePreview.ts` imports the link-shaping rules from `proto-links.ts`, still in the
  prototype namespace. Deliberate: one source of truth, and they graduate with the profile
  page. Noted as a graduation item, not left silent.

## Verification

- `npm run lint` at the documented baseline (9 warnings / 0 errors).
- `npm run build` renders 42 pages.
- Harness checked in Chrome at 1440: full profile (ikonaut — bio, 7 tags, portfolio +
  LinkedIn, artwork), artwork-less profile (Anna Bürgisser), and the empty profile
  (falls back to "Your name", only the work invitation shows).
- Mobile 390px: no element overflows, no horizontal scroll, headline clamps to 24.7px.
- Mode-switch CSS verified by measuring computed `display` in both states.

**Not verified, and it needs Josh signed in:** the toggle driving the real editor
end-to-end. `/profile` redirects to `/onboarding` without auth, so the live wiring — typing
a field and watching the preview update, tags and openTo syncing, gallery adds reaching the
preview — has never been exercised against a real session. The harness proves the renderer
and the CSS proves the switch; the join between them is inference.

Ignorable: `504 (Outdated Optimize Dep)` on Astro's dev toolbar, caused by running
`npm run build` while a dev server holds its Vite cache. Not application code.
