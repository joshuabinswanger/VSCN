<!-- Mirrors the ~/.claude memory file community-default-view-index.md; keep the two in sync. -->

---
name: community-default-view-index
description: /community opens on the Index, temporarily — one constant to flip back once members have registered and filled their galleries
metadata:
  type: project
---

Since 2026-09-06 a bare `/community` opens on the **Index** (the ledger), not the
gallery spread. Reason is content, not design: dev has 20 members and only 15 with
artwork, prod has none, so the picture views open on a near-empty page while the
ledger is complete from the first member. Josh: "when people register then we will
switch to gallery view."

**Why:** the whole change is one exported constant, `DEFAULT_VIEW` in
`src/lib/communityLayout.ts`. Everything that had "spread" baked into it now reads
that constant instead — the server-rendered visible half (`#member-grid` vs
`#member-index`), the pressed toggle button, and the URL the selector writes. So
the no-JS render, the first paint and the dealt page cannot disagree about what the
bare URL means.

**How to apply:** to switch back, set `DEFAULT_VIEW = "spread"` and nothing else.
The one thing that is NOT keyed to it is `TAG_CHIP_VIEW` — deliberately: a tag chip
must go to the pictures whatever the default is, so `communityTagHref` in
`src/lib/links.ts` now emits an explicit `?pattern=spread` where it used to rely on
the absent parameter meaning "gallery". That absent-parameter assumption is the
trap: anything else that links to /community expecting a gallery is now silently
landing on the ledger. See [[community-click-semantics]] and
[[image-cards-need-content]].
