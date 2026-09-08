<!-- Mirrors the ~/.claude memory file `profile-optchip-unification.md`; keep both copies in sync. -->

---
name: profile-optchip-unification
description: "UNCOMMITTED on feat/tag-selector-density: every multi-select in the profile is now one `.optchip` in global.css; the components' own size/shape rules were DELETED, not overridden, because their selectors outranked any shared class"
metadata: 
  node_type: memory
  type: project
  originSessionId: b6100d1c-0227-4a19-aca6-c3dc83b528c6
  modified: 2026-09-08T11:03:01.288Z
---

Five controls — Open to, Visual needs, Languages, Primary audience, Tags — were three different
drawings (two 999px pills, two rounded rects with a real checkbox, tags a third size). They are
now one `.optchip` block in `src/styles/global.css`, plus `.optchip--on` for the filled state
and `.optchip--tag` for the smaller uppercase variant. Rounded rectangle at `--radius-sm`,
1.5px border, `--color-dark` fill when selected. Verified in the page: all 59 chips resolve to
exactly two drawings, differing only in type size.

**Why the local rules had to GO, not be overridden:** the components styled chips through
selectors like `open-to-selector.open-to-selector button.openTo-chip.openTo-chip--selected`,
which beats a plain `.optchip` every time. A shared class that merely *exists* alongside them
changes nothing — the declarations had to be deleted from
`OpenToSelector` / `VisualNeedsSelector` / `TagSelector` / `ProfileForm`, leaving those files
only their layout. Same specificity trap as
[[shared-stylesheet-preview-mechanism]].

**How to apply:**
- Add `.optchip` in markup, or `optchip optchip--on` from JS where chips are built
  (`btn.className = ...` in the three selectors). Never restate size, shape, border or colour
  locally — that is the bug the block exists to prevent.
- Languages and Primary audience lost their visible checkbox: the fill is the selected state.
  The input is still in the DOM and still focusable — `.optchip` CLIPS it (1px + `clip-path`)
  rather than `display: none`, which would drop it from the tab order — and
  `:has(input:focus-visible)` puts the ring on the chip.
- Tag chips are `.optchip--tag`: 0.72rem uppercase, the size of `.gallery-lang-btn` (the
  gallery description's EN/DE switch), which is what Josh picked after 0.62rem read as too
  small on a phone. The three tag groups sit in ONE white panel drawn like `.input`.
- `MemberTypeSelector` is deliberately untouched — single-select, still 0.9rem. It is the
  remaining odd one out; Josh has not ruled on it.
- Related: [[member-added-languages-deferred]] (a language selector would inherit this for
  free), [[preview-tool-ignores-worktree-launch-json]].
