<!-- Mirror of ~/.claude/projects/D--SynoDrive-VSCN/memory/shared-stylesheet-preview-mechanism.md — kept in the repo so any
     Claude instance can read it without access to the user profile. Edit both copies. -->

---
name: shared-stylesheet-preview-mechanism
description: The way an editor preview stays honest here is one plain .css + one .ts shared with the real component — never a lookalike; profile.css and communityCard.css are the two instances
metadata: 
  node_type: memory
  type: project
  originSessionId: b58f7d4e-bbf2-4f19-a2f6-4579ba899643
  modified: 2026-09-02T10:31:15.217Z
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

**Why:** the previews are the only way a member sees their own edits at all — public member
data is a build-time snapshot (see [[profile-editor-preview-mode]]), so a real page cannot
show an unsaved change. A preview that lies is worse than none.

**How to apply:** before hand-writing any rule for a preview, ask which real component owns
that drawing and whether its rules can move to `src/styles/`. Verify at
`/proto/profile-preview` — the no-auth harness that feeds both renderers real member data.

Full writeup: `documentation/20260902-previews-render-the-real-thing.md`.
