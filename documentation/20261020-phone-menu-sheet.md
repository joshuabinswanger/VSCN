# The phone menu is a full-screen sheet; the desktop pills are text

**Date:** 2026-10-20 · **Branch:** `feat/phone-menu-sheet` · **Josh:** "animation on menu seems
to be cut off. also the pills don't seem right" → "remove pills. make the menu full screen with
nice animation in and out" → "on mobile at least" → "desktop stays for now, just replace with
normal text".

## What changed

- **Phone.** The hamburger still turns into a cross; it now opens a paper sheet over the whole
  screen below the header row. INFO / COMMUNITY / LOGIN (or PROFILE) stand on it as large type
  (`--fs-300`, 40px, the MENU size in type.css), stacked at the left where the title sits; the
  current page carries an arrow after its word; the language switch sits small beneath (a copy,
  `#nav-sheet-lang`, kept in step by `updateNavLinks`, since the fixed `.lang-toggle` is hidden
  on every page with a footer). In: the sheet fades up and each line rises out of a short drop on
  the site's curve, 60 ms apart. Out: the lines drop bottom to top, quicker, and the sheet fades
  after them.
- **Desktop.** The three words stand plain on the paper, the current page underlined. No chips,
  no wipe.
- **The "cut off".** The menu used to close itself at `astro:before-preparation`, the same moment
  the tapped chip's wipe started, so the wipe died a few frames in. The sheet now closes at
  `astro:after-swap`, two frames late, once the new page is in and held invisible for its pause.

## Traps met

- **A persisted element moved into the new document has no before-change style.** Closing the
  sheet in the same task as the swap snapped it shut; two `requestAnimationFrame`s later it
  fades.
- **`overflow: hidden` on the root, swapped off `<html>` mid view transition, crashes WebKit.**
  Bisected in headless WebKit 2368 with `addStyleTag` overrides: the sheet's position, its
  touch-action, its transitions and `display: contents` on the login group were all innocent; the
  root scroll lock crashed the WebContent process on every navigation from the open sheet. The
  sheet's own `touch-action: none` keeps the page still instead.

## Verified

Headless WebKit at iPhone 13 size and Chromium: open, close, tap INFO → LOGIN and INFO →
COMMUNITY from the open sheet (the arrow moves at once, the sheet stays through the old page's
fade, fades after the swap). Lint, Astro check, unit tests. The judge is Josh's phone.
