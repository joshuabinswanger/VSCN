# Member Card Refactor and Community Page Fixes

> Last updated: 2026-05-11

---

## Overview

This document covers the extraction of `MemberCard.astro` as a standalone component, a series of CSS fixes for the bio expansion panel (width matching, seam line, drop shadow, mobile height), the active-member filter on the community page, and preview card consistency in the profile form.

---

## Active Member Filter

Updated: [`src/pages/community.astro`](../src/pages/community.astro)

The community page now filters out members whose `active` field is explicitly `false`. Members without the field set (existing records) are treated as active.

```ts
.filter((d) => d.data().active !== false)
```

This runs server-side at render time, so inactive profiles never reach the client.

---

## MemberCard Component Extraction

New file: [`src/components/MemberCard.astro`](../src/components/MemberCard.astro)

The member card HTML and styles were extracted from `CommunityGrid.astro` (where they lived as inline markup and a separate `src/styles/member-card.css` import) into a dedicated component. `member-card.css` was deleted; all styles now live in `MemberCard.astro` under `<style is:global>`.

The component accepts two props:

| Prop | Type | Default | Purpose |
|---|---|---|---|
| `member` | `PublicProfileDoc & { uid: string }` | — | Data to render |
| `preview` | `boolean` | `false` | Renders a skeleton card with JS-hookable IDs for the ProfileForm live preview |

A `stripStorageToken()` helper runs on `photoURL` before rendering to remove the `token` query param from Firebase Storage URLs. This prevents cache mismatches when the token rotates.

### HTML structure (non-preview)

```html
<div class="member-card-wrap">
  <article class="member-card">
    <div class="member-avatar-wrap">...</div>
    <div class="member-info">...</div>
    <!-- bio toggle button, or empty div if no bio -->
  </article>
  <!-- bio paragraph rendered as sibling, not child -->
  <p id="member-bio-{uid}" class="member-bio">{bio}</p>
</div>
```

The bio `<p>` is a **sibling** of `<article>`, not a child. This was the key structural decision — see the Bio Width Fix section below.

---

## Bio Width Fix

**Problem:** On desktop the expanded bio panel was narrower than the card above it.

**Root cause:** The bio was originally inside `<article class="member-card">`. When a hover state applied `filter: drop-shadow(...)` to `.member-card`, the browser promoted the element to a new stacking/containing context. Absolutely-positioned descendants (the bio, using `left: 0; right: 0`) computed their offsets relative to the filtered element instead of the nearest positioned ancestor, breaking the width match.

**Fix:** Move the bio outside `<article>` entirely, making it a sibling inside `.member-card-wrap`. `.member-card-wrap` has `position: relative` on desktop, so `left: 0; right: 0` on the absolutely-positioned bio now correctly spans the full wrap width regardless of any filter applied to the sibling card.

---

## Seam Line Fix (mobile)

**Problem:** A visible hairline appeared between the bottom of the card and the top of the expanded bio panel on mobile.

**Root cause:** Two adjacent bordered elements — the card's `border-bottom` and the bio's `border-top: 0` — left a rendering gap between them at subpixel zoom levels.

**Fix:** `margin-top: -1.5px` on `.member-bio` slides the bio up by exactly one border width. Because the bio is later in DOM order it paints on top of the card, and its white `background` covers the card's bottom border. The desktop CSS block overrides this to `margin: 0` since the desktop bio uses `position: absolute; top: 100%` and does not need the overlap trick.

---

## Drop-Shadow Fix

**Problem:** After the bio was moved outside the card, `filter: drop-shadow` was briefly placed on `.member-card-wrap` to try to encompass both elements. This caused the desktop bio to not render.

**Root cause:** `filter` on a containing element clips or prevents rendering of absolutely-positioned children that overflow outside the element's bounds. The bio is positioned at `top: 100%`, physically below the wrap, so it was clipped or hidden entirely.

**Fix:** Keep `filter: drop-shadow` on `.member-card` only (the sibling, not the parent). Since the bio is now a sibling rather than a descendant of the card, the card's `filter` no longer affects the bio's containing block. The bio's `z-index: 5` and white background cover any visual bleed from the shadow below the card edge.

```css
/* shadow on the card, not the wrap */
.member-card-wrap:hover .member-card,
.member-card-wrap:focus-within .member-card {
  filter: drop-shadow(0 4px 5px rgba(0, 0, 0, 0.07));
}
```

---

## Mobile Bio Animation

The bio uses an `overflow: hidden` + animated `max-height` pattern on mobile (no JavaScript height measurement needed):

```css
.member-bio {
  overflow: hidden;
  max-height: 0;
  opacity: 0;
  padding: 0 15px 0 20px;
  transition: max-height 0.3s ease, opacity 0.2s ease,
              padding-top 0.2s ease, padding-bottom 0.2s ease;
}

.member-card-wrap.is-expanded .member-bio {
  max-height: 200px;
  opacity: 1;
  padding-top: 8px;
  padding-bottom: 8px;
}
```

Padding is excluded from the collapsed state and animated in separately so the text does not jump at the start of the expand.

The toggle button (`<button class="member-bio-toggle">`) is hidden on desktop via `display: none`. Desktop uses hover/focus-within on the wrap to show the bio instead.

---

## Desktop Bio Dropdown

On desktop the bio appears as an absolutely-positioned panel that slides in from above:

```css
@media (--bp-desktop), (--bp-desktop-wide) {
  .member-card-wrap { position: relative; }

  .member-bio {
    position: absolute;
    top: 100%;
    left: 0;
    right: 0;
    z-index: 5;
    opacity: 0;
    visibility: hidden;
    transform: translateY(-6px);
    transition: opacity 0.18s ease, transform 0.18s ease, visibility 0.18s;
    margin: 0;
    padding: 25px;
  }

  .member-card-wrap:hover .member-bio,
  .member-card-wrap:focus-within .member-bio {
    opacity: 1;
    visibility: visible;
    transform: translateY(0);
  }
}
```

`visibility: hidden` (not `display: none`) is used so the opacity/transform transition runs on both open and close.

Hovered cards in the grid are raised to `z-index: 10` via a rule in `CommunityGrid.astro` so the bio panel overlaps adjacent cards cleanly.

---

## CommunityGrid Updates

Updated: [`src/components/CommunityGrid.astro`](../src/components/CommunityGrid.astro)

- Replaced inline card markup with `<MemberCard member={m} />`.
- Removed `@import "../styles/member-card.css"` (file deleted).
- Updated JS toggle selectors from `.member-card.is-expanded` to `.member-card-wrap.is-expanded`.
- Updated grid layout:
  - Default (mobile): `minmax(0, 1fr)`, single column.
  - Tablet (≤ 1050px): `repeat(2, minmax(0, 330px))`, `gap: 2rem`.
  - Desktop (> 767px): `repeat(3, minmax(0, 1fr))`, `gap: 3rem`.
  - Mobile breakpoint cap: `minmax(0, 400px)`.

---

## ProfileForm Preview Card

Updated: [`src/components/ProfileForm.astro`](../src/components/ProfileForm.astro)

The inline preview HTML in `ProfileForm.astro` was replaced with `<MemberCard preview />`. This ensures the preview and community grid cards share the same markup and base styles.

### Preview overrides

The preview card requires several CSS overrides because its bio must always be visible (not animated) and the desktop absolute-positioning must be disabled:

```css
:global(.member-card--preview) {
  max-width: 360px;
}

/* hides the placeholder <div aria-hidden="true"> that would create an extra grid row */
:global(.member-card--preview > [aria-hidden="true"]) {
  display: none !important;
}

/* bio is static and always visible in preview */
:global(.member-card--preview .member-bio) {
  position: static !important;
  max-height: none !important;
  opacity: 1 !important;
  visibility: visible !important;
  overflow: visible !important;
  transform: none !important;
  grid-column: 1 / -1 !important;  /* spans full card width */
  padding: 8px 15px 8px 20px !important;
  border: none !important;
  margin: 0 !important;
}
```

`grid-column: 1 / -1` is required because the bio, when rendered inside the card's 3-column grid (avatar / info / toggle), would otherwise land in column 1 (the avatar column) instead of spanning the full width.

---

## Member Info Vertical Centering

The `.member-info` block inside the card uses `align-self: center` to vertically center the name/role/links column relative to the avatar, while keeping text left-aligned internally:

```css
.member-info {
  display: grid;
  text-align: left;
  align-self: center;   /* centers the block in the card row */
  gap: 0.2rem;
  width: min-content;
  min-width: 0;
  padding-left: 20px;
}

@media (--bp-desktop) {
  .member-info { padding-left: 5px; }
}
```
