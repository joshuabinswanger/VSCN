> Mirror of the `~/.claude` memory file `header-letter-overwrite-animation.md` — readable without access to Josh's user profile.

---
name: header-letter-overwrite-animation
description: "The header brand hover now overwrites the following VSCN letters instead of expanding in place — one slot per glyph, px widths, spill slots past the shell edge"
metadata: 
  node_type: memory
  type: project
  originSessionId: 65c8bc48-6d38-4c2a-8d64-66be51f71479
  modified: 2026-08-24T19:58:07.046Z
---

As of 2026-08-24 the VSCN header no longer expands a letter's tail in place and shoves its neighbours sideways. Hovering a letter **writes its word over the letters that follow it**: `VSCNVSCNVSCNVSCN` becomes `VSCommunicationN`. Josh chose glyph-for-glyph replacement (letter count stays 16, so the line's width drifts a little) over pixel-locking the header width, and chose to let a hover near the right end simply run past the shell edge rather than keeping an endless clipped stream.

`src/layouts/Layout.astro` renders one `.brand-slot` per glyph position — 16 resting slots plus 12 empty spill slots for words that overrun — each holding a resting half and an overwrite half whose widths JS animates between the glyph's measured advance and zero. The letters turn like the flaps on a split-flap board: the outgoing letter tips away about its own centre on the first beat, the incoming one drops in on the second, both the same way round so the pair reads as one fall.

**Why:** two structural constraints are easy to break and neither is obvious from reading the CSS.

- The slot must be a **grid container**. Formatted markup puts whitespace text nodes between its two halves; in an inline flow that whitespace is a real space between the two halves of one glyph and inflates the title by ~60%. A grid container generates no boxes for whitespace-only nodes. The alternative — cramming the markup onto one line, as the old `.brand-letter` did — loses to Prettier, whose `--write` output for the crammed form is itself malformed.
- The collapse animates **`width` in px**, not the `0fr↔1fr` inline-grid trick used elsewhere in this project, because a transition cannot interpolate from `auto`. That means JS measures every glyph the title can show (`measureBrandGlyphs`) and re-measures whenever `fitBrandName` changes the font size, applying the new resting widths under a `.brand-name--measuring` class so they don't animate.

**How to apply:** end states are verified — resting and post-hover lines land exactly on the shell's 205/1075 content edges at the 900px measure, the overrun cases reach ~1547px without growing `document.scrollWidth`. The **motion itself was never seen**: see [[browser-pane-frozen-timeline]]. Eyeball the stagger and the flap fold in a real browser before shipping, and re-check the resize re-fit, which a frozen ResizeObserver could not exercise.

**Motion history, so it is not re-litigated:** a fade-and-rise came first, then a cross-flip where both letters turned at once, then this. Josh was offered a faithful four-face split-flap — letters split at a hairline seam, old top half falling to reveal the new top, new bottom half dropping over the old — and chose the whole-letter fold instead, so there is deliberately **no seam and no half-glyphs**. Josh then asked for the two turns not to overlap at all, so the first finishes before the second begins. That forced the structure: the two letters are stacked in one grid cell at their own natural widths, and the CELL is what carries the animated width — resizing on the second beat only, as the incoming letter drops in. An earlier version animated the widths of the two letters themselves across the whole flip, which meant the outgoing letter kept narrowing while the incoming one was already dropping in, so its departure never actually finished. Sequencing those per-letter widths instead is not an option: it collapses the cell to nothing at the changeover and shuffles the rest of the line sideways. Opacity switches in zero time at the changeover rather than fading, so a letter stays solid ink while it tips. Reversing on un-hover plays the fold backwards — a true board only ever falls forward, which a two-state CSS toggle cannot express.

**Words queue, they never overlay.** The last complaint was not about one letter but about two words: sliding onto a new letter used to retract the old word and spell the new one at the same time, so the line was full of letters turning in both directions. Hover is now scheduled in JS (`requestBrandOverwrite`): if a word is showing, or is still on its way off the line, the new one waits. `clearBrandOverwrite` records `brandRetractEndsAt` from the number of letters leaving — the retraction unwinds with the same left-to-right stagger it arrived with, so the LAST letter to leave sets the time (`0.5s + (n-1) × 0.025s`, i.e. 625ms for a six-letter word, 775ms for `ommunication`). Sweeping across several letters replaces the pending target rather than queueing one word per letter, and leaving the line cancels it. A hover onto an idle line still applies instantly with no timer, so the common case has no added latency.

`BRAND_FLIP_S` in the script duplicates two beats of `--brand-flap-beat` in the CSS by hand — change one and the queue timing silently drifts from the animation.
