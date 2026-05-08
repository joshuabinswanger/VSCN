# Profile Form and Community Card Updates

> Last updated: 2026-05-08

---

## Overview

This document covers three areas updated in the same session: client-side avatar resizing, the tags field, and community card link display.

---

## Avatar Upload

Updated:

- [`src/lib/validation.ts`](../src/lib/validation.ts)
- [`src/components/ProfileForm.astro`](../src/components/ProfileForm.astro)

Avatars are now resized client-side before being uploaded to Firebase Storage. The function `resizeAvatar()` in `src/lib/validation.ts` draws the selected image onto a 512×512 canvas using a cover crop (scales to fill, centred) and exports it as a JPEG at quality 0.92. The file written to Storage is always a 512×512 JPEG regardless of what the user selected.

The raw file size limit before resize is 10 MB. File type is validated before resizing — only JPEG, PNG, and WebP are accepted.

The resized blob is stored as a component-level variable and converted to a `File` at submit time before being passed to `uploadAvatar()` in [`src/lib/storage.ts`](../src/lib/storage.ts).

---

## Tags

Updated:

- [`src/components/ProfileForm.astro`](../src/components/ProfileForm.astro)
- [`src/lib/firestore.ts`](../src/lib/firestore.ts)
- [`firestore.rules`](../firestore.rules)

### Data model

Tags are stored as `string[]` on both `users/{uid}` and `publicProfiles/{uid}`. The maximum is 7 tags, each ≤ 50 characters.

The limit is enforced in two places:

- Client-side: `addTag()` in `ProfileForm.astro` returns early if `tags.length >= 7`.
- Server-side: `validPublicFields()` in `firestore.rules` rejects writes where `data.tags.size() > 7`.

A global tag registry lives at `tags/{slug}`. It is readable by everyone. Authenticated users can add new tags via `getOrCreateTag()` in `src/lib/firestore.ts`, which creates the document if it does not already exist.

### Profile form UI

The Tags field has three interactive parts:

**Selected tags** sit above the toggle and are always visible. Each chip is dark-filled with a `×` to remove. Clicking a chip removes the tag and returns it to the suggestion panel.

**Browse tags toggle** opens a collapsible panel showing all available registry tags as a 3-column grid (2 columns on mobile). Tags already selected are excluded. The panel is hidden by default; clicking "Browse tags" opens it, "Hide tags" closes it.

**Inline autocomplete** fires as the user types. When the input text matches the start of a registry tag, the input is filled with the full tag name and the completion portion is selected. Pressing Enter confirms; pressing Backspace or Delete dismisses the completion and restores just the typed portion.

### Styling note

Tag chips (`.tag-chip`, `.tag-suggestion-chip`) are created dynamically by JavaScript and do not receive Astro's scoped `data-astro-cid-*` attribute. Their styles use `:global()` wrappers in the component `<style>` block to ensure they apply.

---

## Community Card Link Display

Updated:

- [`src/components/CommunityGrid.astro`](../src/components/CommunityGrid.astro)
- [`src/styles/member-card.css`](../src/styles/member-card.css)

### Social link

The social media URL is now shown inline next to the portfolio link, separated by a `|` divider. The link text is the literal string `"social:"`. The divider only renders when both fields are set.

### Portfolio link text

`www.` is stripped from the start of the portfolio URL before display. If the remaining text is longer than 13 characters (or 17 when no social link is present), the link text falls back to `"portfolio"`. The link `href` is always the full normalised URL regardless of the display text.

The two-threshold approach gives the portfolio label more room when it is the only link on the row.

### Hover z-index

Hovered cards in the grid are raised to `z-index: 10` so the bio panel overlaps adjacent cards cleanly. This is set in `CommunityGrid.astro`'s global style block rather than `member-card.css` because it is specific to the grid layout context.
