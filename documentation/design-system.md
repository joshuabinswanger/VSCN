# Component system

## Restyling contract

`src/styles/global.css` owns the colour tokens (seven of them: `--color-dark`, `--color-bg`, `--color-border`, `--color-muted`, `--color-text-placeholder`, `--color-error`, `--color-success`; there is no separate surface, strong-border, text-role or status layer, and about a hundred raw hex literals remain in components and pages), radii, page measures and shared controls. `src/styles/type.css` owns type voices. Component styles own layout; avoid local font and color overrides when an existing role applies. Keep icon geometry separate from the size of the clickable control. **The header backdrop is deliberately bare** (decided 2026-09-25, PR #101, Josh: "no filter with blur ... just nothing"): `--color-bg-veil: transparent` and `--veil-filter: none`, so the page scrolls behind the nav and the community filter bar in the clear. Readability over dark artwork is the accepted cost. The backdrop layer is kept, so restoring the frost is a two-token change; the old values (`color-mix(in srgb, var(--color-bg) 72%, transparent)` and `blur(14px)`) are in the comment in `global.css`.

## Layers

| Layer | Canonical owners |
| --- | --- |
| Primitives | `components/ui/Button`, `Input`, `Field`, `Feedback`; existing `.input`, `.textarea`, `.btn-*`, `.checkbox-label`, `.optchip` styles |
| Interaction patterns | `lib/uiTabs`, `lib/confirmDialog`, `lib/draftMerge`, `BilingualField`, `InfoTip`, `TagSelector`, `MemberTypeSelector`, `OpenToSelector`, `VisualNeedsSelector`, `lib/pager` |
| Editor domains | `components/profile/ProfileDetails`, `WorkEditor`, `ProjectEditor`, `AccountSettings`, `ProfilePreview` |
| State and effects | `profileEditorController`, `profilePersistence`, `editorDraft`, `publicationStatus`, `galleryQueue`, `projectStore` |
| Public rendering | Existing `memberView`, project/gallery models, public profile renderer and previews use the same data transformations and styles |

Use native input/select/textarea/checkbox/radio semantics under these shared styles; wrappers are useful when they enforce a real contract, not merely to rename native elements. What the `ui/` primitives actually are, honestly: `Button` and `Input` are thin wrappers that add the `.btn-*` / `.input` class (and `aria-invalid` for `Input`); a native element with the same class is equally canonical, and most of the site uses that. In production only `ProfileForm.astro` imports `Button` and only `ProfileDetails.astro` imports `Input`; `Field` and `Feedback` are used by nothing but `/styleguide`, so today they are a specimen, not the site's canon. `Field` renders the label with `for`, and gives the hint and error stable ids (`{id}-hint`, `{id}-error`) — it does **not** wire `aria-describedby`, because the control arrives through a slot it cannot reach into; the control names those ids itself (see `styleguide.astro`). `Feedback` chooses the live-region role (`alert` for errors, `status` otherwise). Tabs require linked tab/tabpanel IDs and one roving tab stop. The editor's leave confirmation (`lib/confirmDialog.ts`) focuses the safe action, the declining button, and cancels on Escape. The admin console's dialog (`lib/admin/dialog.ts`) does not follow that: it focuses the confirm button even for a destructive action, so that Enter answers yes.

Editor CSS (`src/styles/profile-editor.css`) is nested under `.profile-editor` — plain CSS nesting, not `@scope`, which Safari before 17.4 and Firefox before 146 (December 2025) discard entirely — including generated gallery rows. Keep that wrapper around assembled editor components. A rule there is served at one class more specificity than it reads; one that must not reach a child component says so (`:not(tag-selector *)`). Do not put persistence into a presentation component or duplicate public rendering for a preview.

## Examples and review

`/styleguide` shows default, disabled, invalid, success, error and empty states of the `ui/` primitives, but not loading, danger, icon-only, chip, tabs or dialog states, and a disabled native `.input` has no style of its own. `/styleguide/editor/en` and `/styleguide/editor/de` use actual domain components with sample content, but hard-code three English-named tabs (`profile`, `work`, `account`) and omit the Preview tab, the Save footer and validation, so they are not yet the 320/375/390/768 inspection surface for the whole editor. Neither sample editor writes to an account.

For component changes, inspect long English/German labels, keyboard operation, empty and populated data, async feedback and 320/375/390/768px layouts. Test the behavior that can lose or disclose data; avoid tests that merely repeat markup or implementation details.

The extracted controllers still contain substantial legacy orchestration. Keep moving independently testable behavior into focused modules as features change; do not fork the existing project/gallery/member transformations or perform an unrelated framework rewrite before a release.
