> Mirror of the `~/.claude/projects/D--SynoDrive-VSCN/memory/community-click-semantics.md` memory file, kept in the repo so any Claude instance can read it without access to the user profile. Keep both copies in sync.

---
name: community-click-semantics
description: "Josh's rule as of 2026-09-01: clicking a thing opens or expands THAT thing, and travel is always a named control — image cards open the lightbox, ledger rows expand, both grew a 'View profile' link"
metadata: 
  node_type: memory
  type: feedback
  originSessionId: f49ede1e-5399-49d4-b844-eefe32ece1ee
  modified: 2026-09-01T13:20:38.329Z
---

2026-09-01 Josh asked for three changes that turn out to be one rule: "on click directly
lightbox", "in index clicking on the profile expands it", "add 'view profile' button to
image cards and index entries in a sensible way".

**Why:** clicking a picture and being taken somewhere else is the one thing a wall of
artwork should not do, and a 1rem chevron at the end of a full-width row is not the way
to open that row. The corollary is that navigation then needs a control that *says*
where it goes — a member's name is a destination but not an affordance, especially on a
touch screen where there is no hover to reveal that it is a link.

**How to apply:** the gallery card's whole-frame link is now a PhotoSwipe trigger
(`cursor: zoom-in`, per-slide `data-pswp-*` copied onto it by `syncTrigger` on every
carousel move); the ledger row's line is now the `<summary>` of its disclosure (via a
new `summary` slot on `MemberDetailPanel`, with a static-line fallback so a member with
nothing to disclose is not deleted from the ledger); and both surfaces carry a muted,
underlined `View profile` link — `.ccard__profile` and `.cindex__profile`, deliberately
identical in voice because it is the same control.

Two details that are easy to get wrong on the way back in:
- `community.card.viewProfile` ends in a **colon** — it is an aria-label prefix ("View
  profile: Jane Doe"). The visible control uses `community.card.viewProfile.text`.
- Native `<summary>` rather than a click handler, on purpose. Keyboard activation and
  the expanded/collapsed announcement come free, and a JS toggle would leak `open`
  state across ClientRouter navigations. Do not put `display: contents` back on
  `.pdisc` while doing this — see [[details-display-contents-crash]].

Same session, same spirit: the grid wall now prints the author name on mobile instead of
revealing it on hover, because a touch screen has no hover
([[community-mobile-pattern]]), and the disclosure chevrons grew from ~16×15px marks to
2rem hit areas.

Related: [[community-back-navigation-traps]], [[projects-feature-withdrawn]]
