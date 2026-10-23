# The member page paints in

**Date:** 2026-10-20 · **Branch:** `feat/profile-paint-in` · **Josh:** "make an animation that
paints in the profile page after navigation" — "name, text, tags and then images, so it looks
smooth like scrolling on the Portfolios page" — works below the first picture "sit still".

## What it does

A member page no longer fades in as one. After the arrival pause (`ARRIVE_DELAY_MS` in
`Layout.astro`, unchanged at 500 ms) its head builds up in the Portfolios cards' own
vocabulary and curve (`cubic-bezier(0.16, 1, 0.3, 1)`):

1. the round portrait settles in (opacity + a small scale),
2. the name rises word by word out of its own line, a beat apart,
3. every text line in page order drifts up into place — role, affiliation, place, "open to",
   the bio's paragraphs, the tag rows, the links, a first project's words, the index on a
   desktop, the Portfolios pill —
4. the first picture opens out of an inset and settles from a slight zoom, once it has
   loaded and decoded (capped at 4 s).

Everything after the first picture is untouched. A direct load plays the same after the
intro. The iOS swipe back shows the page plainly (it is already on screen). Reduced motion
shows the page plainly. The editor's Works tab draws the same markup without the motion flag,
so it does not animate.

## Where

- `src/lib/entrance.ts` — the shared bits: word masks (`splitWords`), and what an entrance
  waits for (`whenIntroDone`, `whenHoldDone`, `whenImageReady`, `capped`).
  `pagesEntrance.ts` now uses them; its behaviour is unchanged.
- `src/lib/profilePaint.ts` — `paintSchedule()` is the pure timetable (unit-tested in
  `tests/unit/profilePaint.test.mjs`); `preparePaint()` stamps `data-paint` and `--d` on the
  page; `paintIn()` waits and adds `.is-in`.
- `src/styles/profile.css` — the start states under `.mprof[data-motion]` and the
  transitions under `.is-in`.
- `src/pages/[...lang]/members/[slug].astro` — `data-paints-in` on the article (what
  `Layout.astro` reads to skip its whole-page fade), the inline script that sets
  `data-motion` before the first paint, and the play at `astro:page-load`.

## Traps met

- **A start rule that stops matching gives WebKit nothing to transition from.** The pill's
  first start rule was `.mprof-bar[data-motion]:not(.is-in)`; under `.is-in` it no longer
  matched and the pill snapped in. Every start rule now keeps matching and the end rule
  overrides it, as the cards' rules do.
- **A transition naming a custom property it cannot see is no transition.** `--paint-ease`
  was defined on `.mprof` only; the pill sits outside the article, so its whole `transition`
  declaration was invalid. The curve is now defined on the pill too.
- Until the script has stamped the schedule, the whole aside and the works are held
  (`:not([data-painted])`), so the plain page never shows and then vanishes.
