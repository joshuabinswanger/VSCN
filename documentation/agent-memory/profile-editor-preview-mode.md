---
name: profile-editor-preview-mode
description: /profile is now a four-tab editor (Profile · Work · Account · Preview) — one form, sticky Save; the public page is a build-time snapshot so preview must stay client-side
metadata: 
  node_type: memory
  type: project
  originSessionId: 850f72f6-4f13-40e9-bbc7-26ed272c9d47
  modified: 2026-08-27T17:53:41.716Z
---

> Mirror of `~/.claude/projects/D--SynoDrive-VSCN/memory/profile-editor-preview-mode.md` — readable without access to Josh's user profile.

**Restructured 2026-08-27, uncommitted:** the Edit|Preview switch became a four-tab row —
**Profile · Work · Account · Preview** — after Josh picked "restructured navigation" over
polish-in-place or an editorial redesign. Still ONE `<form>`: tab switches only toggle
`display` on `.form-section` wrappers (`display: contents` when active, so every field stays
a direct grid item and the layout is unchanged), and the single Save handler still collects
every field. The Save footer is now `position: sticky` at the bottom of `.page-wrap`;
`.profile-form`'s `overflow: hidden` had to become `overflow-x: clip` or sticky never
engages. Logout and the danger zone moved into the Account tab; the verify-email banner
moved above the form so it shows on every tab. `profile.mode.*` i18n keys were replaced by
`profile.tab.*` (both locales). Work verified against the built page with scripts stripped;
**real click wiring + preview render with a live session still needs Josh signed in.**

The original design decision stands: Josh chose a single page with client-side preview over
a second route, and there is a hard technical reason it is the right call: public member
data is a **build-time snapshot** (`firebase-admin` at build, saving only fires a rebuild
dispatch), so a real `/profile/<id>` page cannot show a member their own edit until a
rebuild and deploy finish. The preview renders from live form state. The public page still
exists — for visitors, not for editing.

Architecture: one `ProfileViewModel` (`src/lib/profileView.ts`) that the profile page, the
directory card and the preview all consume, with two producers — a stored `publicProfiles`
doc at build time, form state at runtime. `renderProfilePreview()` in
`src/lib/profilePreview.ts` binds it into the shell in `ProfileViewPreview.astro`. The
component owns the design, a function binds values, so preview cannot drift from the real
rendering. Preview renders on tab entry only (`syncProfileView` early-returns while the
`is-previewing` class is absent).

Two gotchas that cost real debugging, both worth remembering:

- **`hidden` loses to an author `display`.** Empty sections are hidden via the `hidden`
  attribute, but flex containers ignored it and empty "Open to" / "Elsewhere" rows rendered
  as stray headings. Fixed with `.ppv [hidden] { display: none }`. Caught by looking at a
  screenshot, not by reasoning.
- **JS-built nodes don't match Astro-scoped CSS.** Astro adds `data-astro-cid-*` to every
  selector, so dynamically created list items match nothing. Clone `<template>` elements the
  component rendered instead — the clones carry the attribute.

No-auth harness for the preview renderer: `/proto/profile-preview`. `/profile` redirects to
`/onboarding`-ish without auth, so end-to-end checks need a real session.

Sequencing is gated by [[image-cards-need-content]]. Original preview-mode writeup:
`documentation/20260824-profile-preview-mode.md`.
