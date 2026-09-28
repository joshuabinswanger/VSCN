# Component system

## Restyling contract

`src/styles/global.css` owns semantic colors, surfaces, borders, radii, page measures and shared controls. `src/styles/type.css` owns type voices. Component styles own layout; avoid local font and color overrides when an existing role applies. Keep icon geometry separate from the size of the clickable control.

## Layers

| Layer | Canonical owners |
| --- | --- |
| Primitives | `components/ui/Button`, `Input`, `Field`, `Feedback`; existing `.input`, `.textarea`, `.btn-*`, `.checkbox-label`, `.optchip` styles |
| Interaction patterns | `lib/uiTabs`, `lib/confirmDialog`, `BilingualField`, `InfoTip`, `TagSelector`, `MemberTypeSelector`, `OpenToSelector`, `VisualNeedsSelector`, `lib/pager` |
| Editor domains | `components/profile/ProfileDetails`, `WorkEditor`, `ProjectEditor`, `AccountSettings`, `ProfilePreview` |
| State and effects | `profileEditorController`, `profilePersistence`, `editorDraft`, `publicationStatus`, `galleryQueue`, `projectStore` |
| Public rendering | Existing `memberView`, project/gallery models, public profile renderer and previews use the same data transformations and styles |

Use native input/select/textarea/checkbox/radio semantics under these shared styles; wrappers are useful when they enforce a real contract, not merely to rename native elements. `Field` associates labels and gives hints/errors stable IDs; its input must name those IDs with `aria-describedby`. `Feedback` chooses the appropriate live-region role. Tabs require linked tab/tabpanel IDs and one roving tab stop. Confirmation dialogs focus the safe action and cancel on Escape.

Editor CSS is scoped to `.profile-editor`, including generated gallery rows. Keep that wrapper around assembled editor components. Do not put persistence into a presentation component or duplicate public rendering for a preview.

## Examples and review

`/styleguide` shows default, disabled, invalid, success, error and empty states. `/styleguide/editor/en` and `/styleguide/editor/de` use actual domain components with sample content. Neither sample editor writes to an account.

For component changes, inspect long English/German labels, keyboard operation, empty and populated data, async feedback and 320/375/390/768px layouts. Test the behavior that can lose or disclose data; avoid tests that merely repeat markup or implementation details.

The extracted controllers still contain substantial legacy orchestration. Keep moving independently testable behavior into focused modules as features change; do not fork the existing project/gallery/member transformations or perform an unrelated framework rewrite before a release.
