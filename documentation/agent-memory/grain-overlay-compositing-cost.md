> Mirrors the ~/.claude memory file `grain-overlay-compositing-cost.md` (per-project memory store), so any Claude instance can read it from the repo. Keep the two copies in sync.

Josh, 2026-09-09: "sometimes when i open the page on my iphone the page block and there is
a white bar at the bottom and the header is invisble". ~30%; any page; **only a reload**
fixes it (rotation does not); happens opening cold. His screenshot: **vscn.ch (prod), Chrome
on iOS**.

## What the screenshot proves

The white band at the bottom sits **outside the fixed-positioning viewport**. Two
independent markers put its top edge there: `.lang-toggle` is `position: fixed; bottom:
20px` and sits ~20px above the band, and the grain overlay (also fixed) stops at the same
line. So the page's viewport box ends there while the browser's content area continues
~90 CSS px further down.

At the same time the content is clipped at the **top** by the URL bar — and the navbar,
which is `position: sticky; top: 0` inside `.page-wrap`, is not pinned anywhere on screen.
If the scroller had merely scrolled, the nav would be stuck at the top and visible. It is
not. So the whole shell is **offset upward** (~45 CSS px) as well as short at the bottom.

**One cause, both symptoms: the layout viewport is mis-sized and mis-positioned against
what is actually visible.** The header is hidden behind the browser's own URL bar, and
because `body { overflow: hidden }` and the only scroller is `.page-wrap`, nothing the
reader does can bring it back — that is the "page block". A reload rebuilds the viewport,
which is why reload is the only cure and why rotation is not (rotation re-lays-out at the
same wrong offset).

## Why it looked like the grain, and why it is not

`--color-bg` is `#fcfbfa` — very nearly white. What makes the paper *read* as paper is the
multiply grain on top of it. Outside the fixed viewport there is no grain, so that band
reads as a stark white bar against grained paper. **The grain is why the gap is visible,
not why the gap exists.** Note also the grain renders perfectly in the screenshot — no
dropped tiles, no blank patches — which kills the memory-pressure/compositing theory I had
been building.

## The fix, ON DEV as of 2026-09-09 (`828d035-dirty`, built 16:44 UTC)

`100dvh` is a promise about the toolbars that iOS does not always keep, so the shell is
sized from `window.visualViewport` instead — `body { height: var(--shell-h, 100dvh) }`, with
`--shell-h` written by an inline watchdog in Layout.astro's HEAD (it has to land before the
first paint, or it misses the very load it exists to rescue). Plus, in global.css:
`overflow: hidden` stated on `html` rather than left to propagate up from body,
`overscroll-behavior: none` on both, `html` carrying the paper colour, and a
`<meta name="theme-color" content="#fcfbfa">`.

**Three guards, each found by a FAILING TEST rather than by reasoning. Do not remove any of
them, and re-test them if the watchdog is touched:**

1. **A focused editable suspends the sync.** The on-screen keyboard shrinks the visual
   viewport without shrinking the page; without this the shell collapses into the keyboard's
   leftovers on every /login, /profile and /signup field — far worse than the bug being
   fixed.
2. **`vv.scale !== 1` is ignored.** Pinch zoom shrinks `vv.height` the same way.
3. **Re-sync on `astro:after-swap` / `astro:page-load`, resetting the cache first.** A view
   transition swaps the document and takes the inline style on `<html>` with it, so
   `--shell-h` is gone after every in-site navigation — and the "nothing changed" guard then
   treats the loss as a no-op. Verified: without it, one tap on COMMUNITY undid the fix for
   the rest of the visit.

A fourth trap, same shape, in the watchdog's own first run: `last` must seed to **-1**, not
0. In the head there is no layout yet and `vv.height` reads 0; seeded with 0 the guard
swallowed that measurement AND recorded it as synced, and no resize event follows a first
layout — so `--shell-h` was never written at all.

**UNVERIFIED ON THE DEVICE.** Everything above was proven in Chromium at an emulated 375x812.
The bug itself is a WebKit failure at ~30% of cold opens, so confirming the fix is
statistical: ~30 cold opens of https://vscn-dev-f4b60.web.app on the iPhone. The scroll-nudge
half (debounced `window.scrollTo(0,0)` when `vv.offsetTop` is non-zero) is the least certain
piece — it may or may not be able to unpark a stuck visual viewport.

## What WAS changed (stands on its own, is not the fix)

The grain overlay was genuinely over-built, measured at 375x812:

- `200%` x `200%` at `-50%` = **4.00 viewport areas**, of which 1.74 is ever on screen —
  `translate()` percentages resolve against the element's own size and the keyframes never
  exceed 8%. 41.8 MB of backing store on a dpr-3 phone, for a decoration.
- `steps(5)` is a **per-interval** timing function and the rule has 11 keyframes, so it is
  10 intervals x 5 = **49 distinct positions per 350 ms = 140 changes/second**, faster than
  any display refresh. The chunky 5-step film-grain intent is not what the CSS does.
- The reduced-motion branch set `animation: none` but left `will-change: transform`,
  pinning a 42 MB layer for an overlay that never moved.

Now 140% at -20% (pixel-identical; verified covering the viewport at all 350 sampled times,
33px/72px worst-case margin; 4.00 → 1.96 areas, 41.8 → 20.7 MB), and reduced-motion
collapses to `inset: 0` + `will-change: auto` (1.00 area). On dev with the rest; UNCOMMITTED in the working tree.

## Second author of the same symptom

Turnstile's slot is `position: fixed; right: 1rem; bottom: 1rem` and its interactive box is
~300x65 **white** — on a 375px phone that also reads as a white bar across the bottom (seen
live in the dev pane). Josh ruled it out for *this* bug on timing (predates `f3cd529`), but
a future white-bar sighting has two possible authors and "does tapping it say Verify you are
human" separates them in seconds. See [[turnstile-app-check-provider]].

## Method notes

rAF does not fire while the Browser pane is hidden ([[browser-pane-frozen-timeline]]), so
sampling an animation there means driving `anim.currentTime` by hand rather than waiting for
frames — that is how the 140/second number was measured.
