# TagSelector Component

> Last updated: 2026-05-14

---

## Overview

`TagSelector` is a reusable Astro component (`src/components/TagSelector.astro`) that encapsulates everything related to picking a user's tags: the input field, the selected-chip list, autocomplete from the global tag registry, curated category groups, and best-effort registration of new tags. It is used in both the onboarding flow ([OnboardingForm.astro](../src/components/OnboardingForm.astro)) and the profile editor ([ProfileForm.astro](../src/components/ProfileForm.astro)).

Internally it is a **custom element** (`<tag-selector>`). The Astro file renders the static markup and a single global `<script>` block defines a `TagSelectorElement` class that owns all behaviour. Parents interact with it through DOM-standard APIs (`element.value`, `change` event) — no shared module state, no imports of internal helpers.

---

## Usage

```astro
---
import TagSelector from "../components/TagSelector.astro";
---

<label class="label" for="tag-input">Tags</label>
<TagSelector lang={lang} maxTags={7} inputId="tag-input" />
```

### Props

| Prop | Type | Default | Notes |
|---|---|---|---|
| `lang` | `"en" \| "de"` | `"en"` | Picks placeholder, group titles, and error copy from `src/i18n/translations.ts`. |
| `maxTags` | `number` | `7` | Upper bound on selected tag count. Matches the `validPublicFields` Firestore rule (`tags.size() <= 7`). |
| `inputId` | `string` | `"tag-selector-input"` | Id applied to the inner `<input>`, so the parent's `<label for=...>` association still works. |

### Reading and writing tags from the parent

The component exposes a `value` getter/setter on the element. Parents query the element and read/write tags through it:

```ts
const tagSelector = document.querySelector<HTMLElement & {
  value: string[];
  inputValue: string;
}>("tag-selector");

// Prefill from Firestore on load
if (tagSelector) tagSelector.value = data.tags ?? [];

// Read at save time
const tagsPayload = tagSelector?.value ?? [];
await updateUserProfile(uid, { tags: tagsPayload, updatedAt: new Date() });
```

The element dispatches a bubbling `change` event whenever the selection changes (add, remove, or external `.value` assignment). The detail is `{ tags: string[] }`. Both current consumers just read `.value` at submit time, so neither subscribes to the event — but it is there for future live previews.

`inputValue` exposes the text currently in the input box (used by `OnboardingForm` to round-trip in-progress typing through `sessionStorage` across a language switch).

---

## How it works

### Custom-element lifecycle

`customElements.define("tag-selector", TagSelectorElement)` is guarded by a `customElements.get("tag-selector")` check so re-evaluation of the script block (e.g. across Astro view transitions) does not throw.

`connectedCallback` reads the `data-max-tags` / `data-lang` attributes, queries internal children, attaches event listeners, renders the initial empty state, and kicks off the registry fetch (`getTags()` from `src/lib/firestore.ts`).

### Upgrade-properties pattern

If a consumer's script runs *before* the custom element's class is registered, a `tagSelector.value = […]` assignment creates a regular own-property on the element. Once the class is registered the property would shadow the prototype's getter/setter and the render would never run. To avoid this, `connectedCallback` looks for own-property `value` and `inputValue` slots, captures them, `delete`s them, and re-assigns — which now goes through the prototype setters.

Both current consumers run their `.value` assignment inside an `astro:page-load` callback that fires *after* all module scripts evaluate, so the race is mostly theoretical — but the pattern is cheap insurance.

### Tag groups

Three curated groups are hardcoded as a constant at the top of the script:

```ts
const CURATED_TAG_GROUPS = {
  disciplines: ["medical", "molecular", "astronomy", "geology", "physics", "biology"],
  tools: ["blender", "houdini", "maya", "after-effects", "unreal", "davinci"],
  topics: ["animation", "simulation", "vfx", "education", "research", "data-vis"],
} as const;
```

A fourth group, **Other**, is populated dynamically from the Firestore `tags` registry — any registry tag whose normalized form (`label.trim().toLowerCase().replace(/\s+/g, "-")`) is not in any curated list ends up here. So *every* tag in the system lives inside some category.

Each group renders inside a native `<details>` element, which gives keyboard accessibility (Space/Enter expands), state persistence across renders, and a CSS-only chevron rotation — no JS toggle logic needed.

Each summary shows a tabular-numerics chip count (`(6)`) that reflects how many chips are visible *after* the current text filter and already-selected exclusions are applied. The count hides itself when zero.

### Adding a tag

`addTag(value)` is the single funnel that handles:

1. **Normalisation** — strips leading `#`, collapses whitespace.
2. **Validation** — empty / >50 chars / cap reached / duplicate (case-insensitive). Validation failures populate the inline `.ts-error` message using `s["profile.tag.error"]`.
3. **Best-effort registry write** — calls `getOrCreateTag(norm, user.uid)` to register the slug globally. **This intentionally swallows failures** because the Firestore rule on `tags/{slug}` requires `email_verified == true`. Unverified users can still pick their own tags; the global registry just won't pick them up until they verify. The local selection always proceeds regardless of registry outcome.
4. **Local update** — appends to `_tags`, re-renders, emits `change`.

Removal works via event delegation on `.ts-selected`: clicking the chip's `×` filters the tag out and re-renders.

### Autocomplete

On `input`, the component scans registry tags for one that starts with the typed prefix and isn't already selected. If found, the input's text is filled in and the auto-completed portion is selected — so the user can either accept (Enter) or reject (Backspace, which restores just the typed portion). The chip search inside the category panels is independent — it filters by *substring* on every keystroke, so typing "vis" reveals `data-vis` in the Topics group.

### Styling

All styles live in a single `<style is:global>` block scoped under the `tag-selector` element name (e.g. `tag-selector .tag-chip { … }`). This means:

- The chips inherit consistent styles wherever the component is dropped in.
- Parent components don't need to import or duplicate any tag CSS.
- The selector scope prevents bleed onto unrelated `.tag-chip` markup elsewhere in the codebase.

---

## Firestore touchpoints

| Where | What |
|---|---|
| `getTags()` — `src/lib/firestore.ts` | One-shot read of the `tags` collection, ordered by `label`. Public read per [firestore.rules:8](../firestore.rules#L8). |
| `getOrCreateTag(label, uid)` — `src/lib/firestore.ts` | Idempotent slug create — only writes if the doc doesn't exist. Write is gated by `email_verified == true` per [firestore.rules:10-12](../firestore.rules#L10-L12); failures are swallowed by the component. |
| `updateUserProfile(uid, { tags })` — *called by parents* | The component itself never writes the selected tag list to the user document. That's the parent's responsibility (e.g. on Next in onboarding or Submit in profile). |

---

## Why a custom element, not a class-style React/Vue component?

The rest of the app is plain Astro + DOM scripts — no client framework is loaded. A custom element gives us:

- Encapsulated lifecycle (`connectedCallback` runs whenever an instance enters the DOM, including across Astro view transitions).
- A DOM-standard interface (`element.value`, `addEventListener('change', …)`) that any future consumer can use without importing anything component-specific.
- Zero runtime cost beyond the script that defines it.

The tradeoff is hand-rolled state management instead of a reactive framework, which is fine for a small focused component like this one.

---

## Customisation

| What | Where |
|---|---|
| Curated group chips | `CURATED_TAG_GROUPS` constant in the script block |
| Group titles | `onboarding.tags.group.{disciplines,tools,topics,other}` in `src/i18n/translations.ts` |
| Max tags | `maxTags` prop (also constrained by `firestore.rules` `tags.size() <= 7`) |
| Placeholder / note text | `profile.ph.tags`, `profile.note.tags` in translations |
| Error message | `profile.tag.error` in translations |
| Chip style | `tag-selector .tag-chip`, `tag-selector .tag-suggestion-chip` in the component's global style block |
