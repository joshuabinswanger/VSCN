# ⓘ Info Tips on /profile — Implementation Plan

> **For agentic workers:** REQUIRED SUB-SKILL: Use superpowers:subagent-driven-development (recommended) or superpowers:executing-plans to implement this plan task-by-task. Steps use checkbox (`- [ ]`) syntax for tracking.

**Goal:** Every static hint on `/profile` sits behind a small ⓘ button beside its label and opens on click/tap; dynamic status lines stay visible; the signup wizard is untouched.

**Architecture:** One `InfoTip.astro` component renders only the button. The hint stays the same `<p class="field-note">` in the same place, gains an id, `data-tip` and `hidden`; the button toggles it via `aria-controls`/`aria-expanded`. The field keeps `aria-describedby` pointing at the note, so screen readers still announce it while it is visually hidden. Shared components (`BilingualField`, `MemberTypeSelector`, `VisualNeedsSelector`) take an optional `tip` prop so the wizard keeps written-out notes.

**Tech Stack:** Astro 7 components, plain TS in an Astro `<script>`, CSS in `src/styles/global.css`.

**Spec:** `documentation/20260923-projects-design.md` → "PR 1 — ⓘ info tips on `/profile`".

## Global Constraints

- `/profile` only. `src/components/OnboardingForm.astro` is NOT edited; any shared component defaults to the written-out note.
- Click/tap opens, never hover-only.
- Dynamic notes stay visible and untouched: `#social-status`, `#gallery-status`, `#gallery-note`, `#gallery-note-unverified` (the two swap by script, so they are treated as one dynamic pair), `#gallery-nudge`, `.gallery-caption-de-note`, `.gallery-desc-de-note`, `#receive-community-emails-note`.
- Strings go through `src/i18n/translations.ts`, both `en` and `de`.
- `npx astro check` baseline is 25 pre-existing errors: no more than 25, none in touched lines.
- Work happens on a branch `feat/profile-info-tips` cut from `origin/dev`, in its own worktree (`npm run worktree`), NOT on `feat/projects`. Run `npm install` there.

## File structure

- Create `src/components/InfoTip.astro` — the ⓘ button plus the one delegated click handler.
- Modify `src/styles/global.css` — `.label-row`, `.infotip`, and the open-state rule next to `.field-note` (line ~297).
- Modify `src/i18n/translations.ts` — one key, `profile.info.toggle`.
- Modify `src/components/BilingualField.astro`, `MemberTypeSelector.astro`, `VisualNeedsSelector.astro` — optional `tip` prop.
- Modify `src/components/ProfileForm.astro` — every static note, plus the per-row notes in the gallery template and their ids in `renderGallery()`.

---

### Task 1: The InfoTip component

**Files:**
- Create: `src/components/InfoTip.astro`
- Modify: `src/styles/global.css` (after the `.field-note` rule, ~line 301)
- Modify: `src/i18n/translations.ts` (en block near `"profile.note.portfolio"` ~line 209; de block ~line 733)

**Interfaces:**
- Produces: `<InfoTip lang={lang} for="note-id" />` renders `<button type="button" class="infotip" data-infotip aria-controls="note-id" aria-expanded="false" aria-label="…">ⓘ</button>`. `for` may be omitted when the id is assigned later by script (gallery rows): then the button carries `data-infotip-for="<key>"` via the `rowKey` prop and the script resolves it (Task 3).
- Produces: CSS contract — a note with `data-tip` is `hidden` until its button opens it; `.label-row` is a flex row holding a label and its tip.

- [ ] **Step 1: Add the string**

In `src/i18n/translations.ts`, en block:
```ts
    "profile.info.toggle": "More about this field",
```
de block:
```ts
    "profile.info.toggle": "Mehr zu diesem Feld",
```

- [ ] **Step 2: Write the component**

`src/components/InfoTip.astro`:
```astro
---
// THE ⓘ BESIDE A LABEL (2026-09-23, Josh: "all the tips etc. are things that
// are hidden behind an information icon"). Only the button lives here. The
// hint stays the field's own <p class="field-note"> — same place, same text,
// now `hidden` with `data-tip` — so the field's aria-describedby still points
// at it and a screen reader announces it whether or not it is open.
//
// Click/tap, never hover: hover is not a phone gesture. /profile only; the
// signup wizard keeps its notes written out (Josh: "sign up should be more
// written out").
import { useTranslations, type Lang } from "../i18n/utils";

interface Props {
  lang: Lang;
  /** id of the note this button opens. Omit only inside a cloned template. */
  for?: string;
  /** In a cloned template: which note in the same row, resolved by renderGallery(). */
  rowKey?: string;
}

const { lang, for: noteId, rowKey } = Astro.props;
const t = useTranslations(lang);
---

<button
  type="button"
  class="infotip"
  data-infotip
  data-infotip-for={rowKey}
  aria-controls={noteId}
  aria-expanded="false"
  aria-label={t("profile.info.toggle")}
>ⓘ</button>

<script>
  // ONE delegated listener for every tip on the page, including the ones in
  // gallery rows that are re-cloned on every upload — binding per button
  // would lose them on each re-render.
  function onClick(event: Event) {
    const button = (event.target as Element | null)?.closest<HTMLButtonElement>("[data-infotip]");
    if (!button) return;
    const id = button.getAttribute("aria-controls");
    const note = id ? document.getElementById(id) : null;
    if (!note) return;
    const open = button.getAttribute("aria-expanded") !== "true";
    button.setAttribute("aria-expanded", String(open));
    note.hidden = !open;
  }
  document.addEventListener("click", onClick);
</script>
```

Astro bundles a component `<script>` once per page however many instances render, so there is exactly one listener.

- [ ] **Step 3: The styles**

In `src/styles/global.css`, directly after the `.field-note { … }` rule:
```css
/* A LABEL AND ITS ⓘ on one line (2026-09-23). The tip is a sibling of the
   <label>, never inside it: a button inside a label is interactive content
   inside interactive content, and a click on it would also focus the input. */
.label-row {
  display: flex;
  align-items: center;
  gap: 0.35rem;
}

.infotip {
  display: inline-grid;
  place-items: center;
  width: 1.15rem;
  height: 1.15rem;
  padding: 0;
  border: 1px solid var(--color-border);
  border-radius: 50%;
  background: transparent;
  color: var(--color-muted);
  font-size: 0.7rem;
  line-height: 1;
  cursor: pointer;
}

.infotip[aria-expanded="true"],
.infotip:hover,
.infotip:focus-visible {
  color: var(--color-text);
  border-color: currentColor;
}
```

`hidden` on the note does the hiding; no extra rule is needed. **Check** that no rule gives `.field-note` its own `display` (the `[hidden]` trap noted in `lightboxText.ts`): run `grep -rn "field-note" src/styles src/components | grep display`. If one exists, add `.field-note[data-tip][hidden] { display: none; }`.

- [ ] **Step 4: Build and lint**

Run: `npm run lint && npx astro check`
Expected: lint 0; astro check ≤ 25 errors, none in `InfoTip.astro`.

- [ ] **Step 5: Commit**

```bash
git add src/components/InfoTip.astro src/styles/global.css src/i18n/translations.ts
git commit -m "feat(profile): InfoTip — an ⓘ that opens a field's own note"
```

---

### Task 2: Static notes on /profile behind tips

**Files:**
- Modify: `src/components/ProfileForm.astro` (notes at ~160, 195, 212, 266, 337, 586, 594, 603, 623; the `<BilingualField>` calls at ~121 and ~163; `<MemberTypeSelector>` ~108; `<VisualNeedsSelector>` ~232)
- Modify: `src/components/BilingualField.astro`, `src/components/MemberTypeSelector.astro`, `src/components/VisualNeedsSelector.astro`

**Interfaces:**
- Consumes: `InfoTip` from Task 1.
- Produces: shared components accept `tip?: boolean` (default `false`) and, when true, render their notes hidden behind an `InfoTip`.

- [ ] **Step 1: The pattern, applied to Portfolio first**

Before (`ProfileForm.astro` ~178-196):
```astro
<label id="portfolio-label" class="label" for="portfolio">{t("profile.label.portfolio")}</label>
…
<p class="field-note">{t("profile.note.portfolio")}</p>
```
After:
```astro
<div class="label-row">
  <label id="portfolio-label" class="label" for="portfolio">{t("profile.label.portfolio")}</label>
  <InfoTip lang={lang} for="note-portfolio" />
</div>
…
<p id="note-portfolio" class="field-note" data-tip hidden>{t("profile.note.portfolio")}</p>
```
and the input gains `aria-describedby="note-portfolio"`. Add `import InfoTip from "./InfoTip.astro";` to the frontmatter.

- [ ] **Step 2: Apply to every other static note in ProfileForm**

| note key | note id | label element | describedby target |
|---|---|---|---|
| `profile.note.languages` | `note-languages` | the `<legend class="label">` — put `<InfoTip>` inside the legend, after the text (a button is allowed in a legend) | the `<fieldset>` gets `aria-describedby` |
| `profile.note.social` | `note-social` | `<p id="social-label" class="label">` → wrap in `.label-row` | `#social-editor` |
| `profile.note.tags` | `note-tags` | `<label for="tag-input">` → `.label-row` | leave `TagSelector` alone; put `aria-describedby` on the wrapper `#member-tags-field` |
| `profile.gallery.coverNote` | `note-gallery-cover` | the gallery section's heading/label — find the label above `#gallery-queue` | none (no single control) |
| `profile.active.note` | `note-active` | `<label class="checkbox-label">` → wrap label + tip in `.label-row` | `#profile-active` |
| `profile.wantsToContribute.note` | `note-contribute` | same as above | `#wants-to-contribute` |
| `profile.note.preferredLanguage` | `note-preferred-language` | `<label for="preferred-language">` → `.label-row` | `#preferred-language` |
| `profile.note.phone` | `note-phone` | `<label for="phone">` → `.label-row` | `#phone` |

Do NOT touch the notes listed as dynamic in Global Constraints. If a note not in this table exists (grep again: `grep -n 'class="field-note"' src/components/ProfileForm.astro`), decide by one test: does any script write its text or its `hidden`/`display`? If yes it is dynamic, leave it; if no, give it a tip following the table's pattern.

- [ ] **Step 3: The shared components get a `tip` prop**

`BilingualField.astro` — add to Props `tip?: boolean;`, destructure it, import `InfoTip`, and:
```astro
<div class="bifield__head">
  <label class="label" for={id} data-bifield-label>{label}</label>
  {tip && <InfoTip lang={lang} for={`${id}-note`} />}
  <div class="bifield__switch" …>
```
Keep both notes (the EN and DE notes say different things); each gets an id and, when `tip`, `data-tip` and `hidden`:
```astro
{note && <p id={`${id}-note`} class="field-note" data-tip={tip || undefined} hidden={tip}>{note}</p>}
…
<p id={`${idDe}-note`} class="field-note" data-tip={tip || undefined} hidden={tip}>{noteDe}</p>
```
and point the tip at the EN note only when `note` exists, else at the DE note: `for={note ? `${id}-note` : `${idDe}-note`}`. The EN/DE switch script already toggles the panes; a DE note opened while the EN pane shows is not reachable, so the tip must follow the pane. In the component's existing switch script (find `data-bifield-btn`), after switching panes, set the tip's `aria-controls` to the visible pane's note id and copy the open state across:
```ts
const tipBtn = field.querySelector<HTMLButtonElement>("[data-infotip]");
if (tipBtn) {
  const open = tipBtn.getAttribute("aria-expanded") === "true";
  const noteId = which === "de" ? `${idDe}-note` : `${id}-note`;
  tipBtn.setAttribute("aria-controls", noteId);
  field.querySelectorAll<HTMLElement>(".field-note[data-tip]").forEach((n) => { n.hidden = !open || n.id !== noteId; });
}
```
(Read the existing script first and adapt the variable names — `field`, `which`, `id`, `idDe` stand for whatever it already calls them. The ids must come from data attributes, since a component script cannot read props.)

Both inputs get `aria-describedby` pointing at their own pane's note.

`MemberTypeSelector.astro` and `VisualNeedsSelector.astro` — add `tip?: boolean` (and `lang` is already a prop), put `{tip && <InfoTip lang={lang} for="note-member-type" />}` inside the legend (VisualNeeds: `note-visual-needs`, next to its label/legend), and give the note `id`, `data-tip={tip || undefined}`, `hidden={tip}`.

In `ProfileForm.astro` pass `tip` to all four call sites (`<MemberTypeSelector lang={lang} tip />`, both `<BilingualField … tip />`, `<VisualNeedsSelector lang={lang} tip />`). `OnboardingForm.astro` passes nothing and so is unchanged.

- [ ] **Step 4: Check the wizard did not change**

Run: `git diff --stat origin/dev -- src/components/OnboardingForm.astro`
Expected: no output.

- [ ] **Step 5: Lint, check, build**

Run: `npm run lint && npx astro check && npm run build:site -- --mode development`
Expected: lint 0; check ≤ 25; build completes. (`build:site` needs `.site-data.json`; if absent run `node scripts/export-site-data.mjs development` first — if that fails for credentials, report it and run `npx astro build` with the snapshot the dev server uses; do not substitute a weaker check silently.)

- [ ] **Step 6: Commit**

```bash
git add src/components/ProfileForm.astro src/components/BilingualField.astro src/components/MemberTypeSelector.astro src/components/VisualNeedsSelector.astro
git commit -m "feat(profile): static field notes open from an ⓘ; the wizard keeps them written out"
```

---

### Task 3: Tips inside cloned gallery rows

**Files:**
- Modify: `src/components/ProfileForm.astro` — the `<template data-gallery-tpl="item">` (notes at ~460 and ~465) and `renderGallery()` (~2264)

**Interfaces:**
- Consumes: `InfoTip` with `rowKey` (Task 1).

- [ ] **Step 1: Template markup**

The two static row notes (`profile.gallery.siteLinkNote`, `profile.gallery.linkNote`) each get a tip. There is no label element for these inputs today, so the tip sits at the start of the prefix row:
```astro
<div class="label-row">
  <div class="input-prefix-wrap">
    <span class="input-prefix">https://</span>
    <input type="text" class="input input-prefixed" data-gallery-field="siteLink" />
  </div>
  <InfoTip lang={lang} rowKey="siteLink" />
</div>
<p class="field-note" data-tip data-tip-note="siteLink" hidden>{t("profile.gallery.siteLinkNote")}</p>
```
Same for `link` with `rowKey="link"` / `data-tip-note="link"`. Make the prefix wrap grow: add `.label-row > .input-prefix-wrap { flex: 1; }` in the component's scoped style (it is the same component, so scoping matches the cloned row).

- [ ] **Step 2: Ids at clone time**

In `renderGallery()`, inside the per-row `.map((item, index) => { … })`, after the row is cloned:
```ts
// A template is cloned once per image, so its tips cannot carry ids of their
// own; each row gets its note ids here and its buttons are pointed at them.
row.querySelectorAll<HTMLElement>("[data-tip-note]").forEach((note) => {
  const key = note.dataset.tipNote ?? "";
  note.id = `gallery-${index}-note-${key}`;
  const button = row.querySelector<HTMLButtonElement>(`[data-infotip-for="${key}"]`);
  button?.setAttribute("aria-controls", note.id);
  row.querySelector<HTMLElement>(`[data-gallery-field="${key}"]`)?.setAttribute("aria-describedby", note.id);
});
```
An open tip closes when the row re-renders — acceptable (the note is one click away, and re-renders happen on upload/remove/reorder, not while typing).

- [ ] **Step 3: Lint, check**

Run: `npm run lint && npx astro check`
Expected: lint 0; check ≤ 25.

- [ ] **Step 4: Commit**

```bash
git add src/components/ProfileForm.astro
git commit -m "feat(profile): gallery rows' link notes open from an ⓘ too"
```

---

### Task 4: Verify in the browser, then PR

- [ ] **Step 1: Run the dev server** from the worktree: `npm run dev` via Bash (the preview tool ignores worktree launch.json; it picks 4322/4323 when 4321 is taken). Open `/profile` by URL in the browser pane.

- [ ] **Step 2: Check, desktop and at 375px width** (`resize_window` preset mobile, then reset to desktop):
  - No static note is visible on any of the four tabs; each has an ⓘ.
  - Clicking ⓘ opens the note directly under its field; clicking again closes it; `aria-expanded` flips (read via `read_page`).
  - Bio/Role: open the tip, switch to DE, the DE note shows; switch back, the EN note shows.
  - A gallery row's two link tips work on a row, and still work after an upload re-renders the rows (if a signed-in session is not available in the pane, say so — do not claim it).
  - `#social-status`, `#gallery-status`, the gallery notes and the email-preference note are still visible when their script shows them.
  - `/onboarding` still shows every note written out.
  The profile page needs a signed-in session to render past the login gate. If the pane cannot sign in, report which checks were not walked.

- [ ] **Step 3: Full gate**

Run: `npm run lint && npx astro check && npm run test:unit`
Expected: lint 0, check ≤ 25, unit all pass.

- [ ] **Step 4: Push and open the PR to `dev`**

```bash
git push -u origin feat/profile-info-tips
gh pr create --base dev --title "Profile: field notes behind an ⓘ" --body "…"
```
PR body: what moved, what stayed visible and why, the wizard untouched, what was and was not walked in the browser. End with the 🤖 attribution line. Merge into `dev` once checks are green (standing permission), gating on `gh pr checks --watch` exit code itself — never piped through `tail`.
