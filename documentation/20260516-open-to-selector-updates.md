# OpenToSelector — 2026-05-16 Updates

Component file: [src/components/OpenToSelector.astro](../src/components/OpenToSelector.astro)

## Changes

### Layout order

The section now renders in this order:

1. Label ("I'm interested in…")
2. Preset option pills (`openTo-chips`)
3. Selected custom chips (`openTo-custom-list`)
4. Input + Add button row (`openTo-input-row`)

### Add button

The plain text input now sits in a flex row (`openTo-input-row`) alongside a `+` button (`.openTo-add-btn`). Clicking the button triggers the same logic as pressing Enter. Focus returns to the input after each submission.

The placeholder text no longer instructs users to press Enter, since the button makes the action self-evident.

### Custom chip style

Custom chips (`.openTo-custom-chip`) now match the visual style of the preset pills:

| Property | Before | After |
| --- | --- | --- |
| `font-family` | `monospace` | `inherit` |
| `font-size` | `0.8rem` | `0.88rem` |
| `padding` | `0.35rem 0.65rem` | `0.45rem 0.9rem` |
| `border-radius` | `var(--radius-sm)` | `999px` |
| `background` | `#111` | `#111` (selected/dark state) |

Custom chips remain dark (filled) to indicate they are confirmed active selections, matching the `.openTo-chip--selected` state of preset pills. A hover state (`#333`) was also added for consistency.

## Translation keys updated

| Key | Old | New |
| --- | --- | --- |
| `profile.openTo.custom.ph` (en) | "Something else? Type and press Enter" | "Something else? Add a custom option…" |
| `profile.openTo.custom.ph` (de) | "Etwas anderes? Tippen und Enter drücken" | "Etwas anderes? Eigene Option hinzufügen…" |
