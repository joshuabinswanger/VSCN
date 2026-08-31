> Mirror of the `~/.claude` memory file `browser-pane-frozen-timeline.md` — readable without access to Josh's user profile.

---
name: browser-pane-frozen-timeline
description: "The in-app Browser pane can run with document.hidden true, freezing rAF, CSS transitions and ResizeObserver — animations look broken when the code is fine"
metadata: 
  node_type: memory
  type: reference
  originSessionId: 65c8bc48-6d38-4c2a-8d64-66be51f71479
  modified: 2026-08-24T19:57:52.033Z
---

The in-app Browser pane sometimes attaches to a page it never composites — `document.hidden === true`, `document.timeline.currentTime` stuck at 0, `requestAnimationFrame` never fires. Screenshots fail with "the Browser pane is not displayed".

In that state **every CSS transition is created but pinned at time zero**: `getAnimations()` reports `playState: "running"` with `currentTime: 0`, and `getComputedStyle` keeps returning the pre-change value forever. `ResizeObserver` callbacks never fire either, because they are delivered as part of the rendering steps — so anything driven by one (in VSCN: `fitBrandName` re-fitting the header on resize) silently does not run.

**Why:** this reads exactly like a CSS bug. Chasing it produced two wrong diagnoses in a row — first "the `0fr↔1fr` collapse doesn't resolve inside a grid item", then "Chrome can't interpolate `fr` track lists" — both false. The property was applying correctly the whole time; only the animation clock was dead.

**How to apply:** check `document.hidden` / `document.timeline.currentTime` before diagnosing any animation. To verify layout in that pane, inject `transition: none !important` for the elements involved, force a reflow (`void el.offsetWidth`), and assert on **end states** — geometry, computed widths, class-driven values. Accept that motion smoothness and resize-driven re-fits cannot be verified there, and say so instead of implying they were. See also [[header-letter-overwrite-animation]] and the 0×0-viewport note in the repo's CLAUDE.md "Tooling notes".
