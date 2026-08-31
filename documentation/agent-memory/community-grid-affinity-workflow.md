<!-- Mirrors ~/.claude/projects/D--SynoDrive-VSCN/memory/community-grid-affinity-workflow.md so any agent can read it without Josh's user profile. -->
---
name: community-grid-affinity-workflow
description: The community grid layout is redrawn in an Affinity doc (1px = 1 CSS px, artboard height = tileRows) and translated back by a library script that skips locked shapes
metadata:
  type: project
---

The `/community` slot tables ([[image-cards-need-content]], since 2026-08-27 in
`src/lib/communityLayout.ts`: `SPREAD_TILE`/`TEXT_TILE` — no longer inside
`CommunityGrid.astro`) can be authored visually in Affinity (set up 2026-08-27). The
document lives in `D:\SynoDrive\VSCN\Design\community-grid\` (Josh saves it there —
created unsaved), full workflow in that folder's `README.md`. CAUTION: the doc's first
artboard still shows the SCRAPPED stagger drawing; the live gallery `SPREAD_TILE` was
authored in code ([[community-gallery-layout-selector]]) and has NO artboard yet — redraw
the artboard to match before tuning visually.

**Why:** the layout is drawn, not derived — Josh wanted to design it in Affinity rather
than by editing colStart/rowSpan numbers.

**How to apply:**
- Scale: 1 doc px = 1 CSS px of the capped grid; column 55px × 24, row 30px.
  **Artboard height = tileRows** (STAGGER_TILE 6000px = 200 rows, TEXT_TILE 900px = 30).
- Locked shapes = graph-paper furniture, unlocked rectangles = slots. That lock bit is
  the translator's whole discriminator — don't lock slot rects or unlock furniture.
- Translate: run the Affinity library script "VSCN Community Grid → Slot Table", or via
  MCP `execute_script` (same code, in the library). It snaps, validates the component's
  five rules (incl. seam vs next tile), and emits paste-ready `Pattern` literals.
  Round-trip verified: reproduces the shipped tables verbatim.
- Affinity SDK gotchas hit here are recorded as MCP SDK hints: `Colour.createRGBA8` takes
  an object not positional args (silent grey otherwise); artboard children need spread
  coords; no bring-to-front command — use `createMoveNodes(sel, lastSibling,
  NodeMoveType.After, NodeChildType.Main)`.
