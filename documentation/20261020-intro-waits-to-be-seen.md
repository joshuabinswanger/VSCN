# The intro waits to be seen

**Date:** 2026-10-20 · **Branch:** `fix/intro-waits-to-be-seen` · **Josh:** "sometimes the initial
VSCN animation on page load does not work"

## Cause

`PageLoader.astro` played the intro on a clock from the moment its script ran, whether or not
anyone could see the page. A page often loads out of sight: Safari preloads the address bar's
top hit while you are still typing, a link can open in a background tab, Chrome prerenders
likely navigations. In every such case the letters wrote and flew unseen, and the visitor
arrived on the full stacked name, on a jumble of late timers, or on an empty paper.

Reproduced in Playwright WebKit by overriding `document.visibilityState` to `hidden` for the
first 1.5 s of a load: the words were written at 334 ms, unseen, and the page was shown with
the full name standing. Normal loads played correctly in every one of eight repeated runs,
which is why it only ever showed up "sometimes".

## Fix

`whenShown()` in `PageLoader.astro`: a prerendering document waits for `prerenderingchange`,
a hidden one for `visibilitychange` to `visible`, and only then does `play()` start — from
its first beat. The same probe now shows nothing written while hidden and the whole intro,
travel included, after the page is shown.

## Not covered

A page restored from the back-forward cache shows no intro: the loader was removed when it
first played. That is a return, not a load.
