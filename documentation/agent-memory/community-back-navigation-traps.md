> Mirror of the `~/.claude/projects/D--SynoDrive-VSCN/memory/community-back-navigation-traps.md` memory file, kept in the repo so any Claude instance can read it without access to the user profile. Keep both copies in sync.

---
name: community-back-navigation-traps
description: "Back from a profile was broken three ways at once — replaceState(null) ate ClientRouter's state, .page-wrap scroll was never restored, and the deal reshuffled; all three fixed 2026-09-01"
metadata: 
  node_type: memory
  type: project
  originSessionId: f49ede1e-5399-49d4-b844-eefe32ece1ee
  modified: 2026-09-01T13:20:23.127Z
---

2026-09-01, Josh: "back navigation dors not work getting back from profiles". It was
three independent faults stacked, and only the first one made the page visibly refuse
to go back. Worth remembering because each is a trap the site's own architecture sets.

**1. `history.replaceState(null, …)` DESTROYS ClientRouter's state.** It does not mean
"leave the state alone" — it overwrites with null. CommunityGrid used it twice, to
mirror the view mode into `?pattern=` and the tag into `?tag=`. ClientRouter keeps
`{index, scrollX, scrollY}` there and its popstate handler needs it; with null it bails
without swapping. Symptom, reproduced: choose any view, open a member, press Back — the
URL returns to `/community` and **the member's page stays on screen**. Every view
switch armed it, so it read as intermittent. Fixed by `syncURL()`, which passes
`history.state` through.

**2. Scroll restoration is a no-op on this site by construction.** ClientRouter restores
scroll by writing to the *window*, and here `body` is `overflow: hidden` with
`.page-wrap` as the scrollport. So every Back landed at the top. Layout.astro now saves
`.page-wrap`.scrollTop to `sessionStorage` and restores it. Two non-obvious parts:
  - **Key off a tracked index, not `history.state.index`.** On a Back the browser has
    already swapped state to the *destination* before Astro starts the transition, so a
    save during that transition writes the outgoing page's offset under the
    destination's key — obliterating the value about to be restored. Observed exactly
    that. `currentIndex` is adopted on `astro:page-load` instead.
  - **Assign until it holds, not once.** An offset larger than the scroller is silently
    clamped, and at `astro:page-load` the page is still growing (the directory deals in
    its *own* page-load handler, whose order relative to Layout's is a bundling detail).
    One assignment, and even two a frame apart, became 0.

**3. A random deal means you never come back to the same page.** With scroll restored
this got worse, not better: the right offset of a different arrangement. The shuffle is
now seeded (mulberry32) from a seed stored per history index. The input must be
**sorted by `data-rank` before shuffling** — a deal re-sorts the cells in the DOM
afterwards, so a seeded shuffle over `cells` in DOM order is not reproducible.

The browser pane will not fire `scroll` events for a programmatic `scrollTop`
assignment, so the save path cannot be exercised from JS there; the
`astro:before-preparation` path can, and was. See [[browser-pane-frozen-timeline]].

Related: [[community-gallery-layout-selector]], [[community-click-semantics]]
