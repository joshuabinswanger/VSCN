<!-- Mirror of ~/.claude/projects/D--SynoDrive-VSCN/memory/shared-stylesheet-preview-mechanism.md — kept in the repo so any
     Claude instance can read it without access to the user profile. Edit both copies. -->

---
name: shared-stylesheet-preview-mechanism
description: The way an editor preview stays honest here is one plain .css + one .ts shared with the real component — never a lookalike; profile.css and communityCard.css are the two instances
metadata: 
  node_type: memory
  type: project
  originSessionId: b58f7d4e-bbf2-4f19-a2f6-4579ba899643
  modified: 2026-09-09T09:43:46.860Z
---

**The pattern, established 2026-09-01 and completed 2026-09-02:** when the profile editor
has to preview something the site renders, it renders **that component's own markup**, styled
by a **plain `.css` file both import** and driven by a **module both call**. Never a
parallel `.ppv__*` / `.ccpv__*` design that tracks the real thing by hand — both attempts at
that drifted badly enough for Josh to reject them ("preview should actually show the profile
page 1 to 1, atm it is not accurate at all"; "carousel shouls be the same elemnt in preview
as well").

Two instances now:

- `src/styles/profile.css` ← `members/[slug].astro` + `ProfileViewPreview.astro`
- `src/styles/communityCard.css` + `src/lib/communityCarousel.ts` ←
  `CommunityImageCard.astro` + `CommunityCardPreview.astro`

**Why a plain `.css` and not a scoped `<style>`:** Astro stamps a per-component
`data-astro-cid-*` on every selector, so two components importing one scoped block still get
two different rules. This is the same fact behind the older gotcha that JS-built nodes match
no scoped CSS (clone `<template>`s instead).

**Why the extraction is never total, and the trap if you finish it anyway:** rules that reach
into a THIRD component's classes must stay scoped. `.ccard__caption-row .pdisc__toggle` moved
to a plain sheet loses the scope attribute and lands at (0,2,0) — a **tie** with
MemberDetailPanel's own `.pdisc__toggle` rule — so which one wins becomes source order
between two stylesheets. Scoped it is (0,3,0)+attr and wins outright.

**Still a mirror:** the card preview's no-artwork face (`.ccpv__tframe`) still tracks
`CommunityTextCard` by hand. It has no carousel to get wrong, so it was left; extracting it
the same way is the obvious next step.

**A THIRD way a preview lies, found 2026-09-08 — the preview's own deliberate deviation.**
Sharing the stylesheet does not make the preview honest if the preview component then adds a
rule of its own. `CommunityCardPreview.astro` capped itself at `.ccard--preview { max-width:
22rem }`, with a comment explaining that a card at the full width of the editor's measure
"reads as a banner rather than as a card". True on desktop. On a phone the directory deals one
card per row and `.ccard` takes `width: 100%`, so the cap was inventing a slot narrower than
any the member will ever see: 264px against the 345px their real card gets. Josh, twice: "preview
gallery on mobile should be full width as the gallery", then "the gallery card preview is still
not full width". Fixed by lifting the cap under `@media (--bp-mobile)` only (dev `6909840`).

Two things that finding teaches:

- A preview-only rule is a **claim about every viewport**, and one written for the desktop
  reasoning will be wrong at the other breakpoint. Any `--preview` rule that changes SIZE (not
  just interactivity, like the inert `frame-link` or the `[hidden]` fix) deserves a breakpoint
  check before it is trusted.
- **Fixing the container is not fixing the width.** The same day, the doubled gutter
  (`.preview-section` sitting inside `.profile-form`'s own 15px on top of `main`'s) was
  cancelled with `margin-inline: -15px`; correct, necessary, and invisible while the 22rem cap
  was still clamping the card. Two independent limits, and only the second one showed.

**How to prove a preview matches:** measure both, at the same emulated viewport, and compare
EDGES not widths — the preview card and the live gallery card now both occupy 15px..375px at a
390px viewport. Computed style is what settles it (`getComputedStyle(el).width`); the number
`264px` is what identified the cap, because it is exactly 22rem. See
[[astro-inlines-css-check-the-html]] for the verification detour that finding cost.

**Why:** the previews are the only way a member sees their own edits at all — public member
data is a build-time snapshot (see [[profile-editor-preview-mode]]), so a real page cannot
show an unsaved change. A preview that lies is worse than none.

**How to apply:** before hand-writing any rule for a preview, ask which real component owns
that drawing and whether its rules can move to `src/styles/`. Verify at
`/proto/profile-preview` — the no-auth harness that feeds both renderers real member data.

Full writeup: `documentation/20260902-previews-render-the-real-thing.md`.
