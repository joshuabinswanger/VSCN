# Community filter bar moves to the bottom of the viewport

**Date:** 2026-10-12
**Scope:** `/community` only. `src/components/CommunityGrid.astro`,
`src/lib/communityDirectoryController.ts`, `src/components/Navbar.astro`.

## Decision

Josh: "the filter and gallery / grid / index in a bar at the bottom to reflect
modern UI design." The tags filter and the Gallery / Grid / Index selector
leave the header and become a fixed island at the bottom of the viewport.
Nothing about the controls themselves changes: same words, same underline
for the active one, same tags panel, same URLs.

The second half of the same request, ABC Areal as the text face with Archivo
kept for the caps, was dropped the same day: Dinamo's licence is per medium
and a web licence for vscn.ch would have to be bought (non-profit discount,
not exemption), and the fonts may not be put in a public repository, which
this one is. If it comes back, the font files stay out of git.

## What it looks like

**Desktop.** One line of chrome along the bottom edge: the footer's links
fixed bottom-left at 20px (`SiteFooter.astro`), the EN / DE toggle fixed
bottom-right at 20px (`Navbar.astro`), and the pill centred between them.
The pill is paper (`--color-bg`) with a 1px `--color-border` and full
rounding, no blur, in keeping with the bare header. Its type sits on the same
line as the two corners: the box is offset down by its own padding and border
so the line boxes agree at 20px. Tags, a hairline, then the three views.

**Phone.** A full-width strip at `bottom: 0` with a top border and the
safe-area inset, Tags at the left gutter and the views at the right. The
corners are empty on a phone (the footer is in the flow and carries the
language switch), so there is nothing to centre between.

**The tags panel** opens upward from the trigger (`bottom: calc(100% + 0.6rem)`),
capped at `min(60vh, 34rem)` and scrolling inside.

## The one non-obvious piece: the track

The pill is not `left: 50%; translateX(-50%)`. Centred by the viewport
alone, it would sit on the footer's "© 2026 VSCN" in any window narrower than
about 930px once the footer has faded in at the end of the page. So the fixed
element is a full-width **track**, a grid with columns
`minmax(--bar-reserve, 1fr) auto minmax(--bar-reserve, 1fr)`, and the pill is
its middle column. Equal outer columns keep it centred; when the window is
too narrow for both floors plus the pill, the grid overflows to the right
rather than shrinking the floors, and the pill lands just past the footer
instead of on it. The reserve (330px) is the German footer line, 30px in plus
~276px of links and ©, plus a gap. It has to move if the footer's words do.
The track is `pointer-events: none`; the pill takes clicks back.

Measured on the dev build at 1280 and 800 wide: centred to the pixel at
1280; at 800 the pill starts at 330px, 50px clear of the footer's end, and
167px short of the toggle.

## What moved with it

- **The nav's backdrop extension is gone.** `--nav-backdrop-extend` was the
  controller measuring the docked bar's bottom so one veil could run behind
  nav and bar together. The bar paints its own paper now, so the pseudo is
  the nav's box again (`inset: 0`). The tokens still say "nothing"; frost is
  still a token change away.
- **The mobile gallery's fade-out edge is the nav.** `--cgrid-fade-inset` is
  now the nav's measured height (`ResizeObserver` on the nav), not the bar's
  bottom. The `view()` inset and `exit` range are unchanged; only the line
  they measure against moved up to where the top of the page actually is.
- **Comments.** The dock-offset contract (6px into the nav on desktop, 2px on
  a phone, both halves of each) is deleted with the code it described. The
  git history from 2026-09-01 to 2026-10-11 has the reasoning if the bar ever
  goes back up.

## Checked

`npm run lint`, `npm run check`, `npm run test:unit`, and `astro build
--mode development` on a borrowed dev snapshot (the dev service account
returned UNAUTHENTICATED all morning, so no fresh export was possible).
Browser pane at 1280×800, 800×600 and 375×812: pill geometry, click-through
on the track, the panel opening upward, the footer fading in on a real scroll
at the page end, and the strip clearing the phone footer.

## Same day, second pass: floating everywhere, two drop-ups

Josh: "floating bar. also restyle tags to be more modern. the view version
should also be a drop up."

- **Floating on a phone too.** The full-width strip is gone. The pill floats
  centred, 12px off the bottom plus the home-bar inset. Desktop keeps the
  track and the footer reserve described above.
- **Two drop-ups.** The pill holds two chip-shaped triggers, Tags and the
  current view's name, split by a hairline. Each opens a card that rises
  from the bar with a short fade and lift (none under reduced motion).
  Opening one closes the other, and a click outside or Escape closes both
  (`closeBarMenus` in the controller).
- **Tags are chips.** The panel is a rounded search well over a wrapping
  cloud of pill chips, the active one filled dark. With a tag set, the bar's
  trigger fills dark and shows the tag's name. The scope note moved under
  the chips.
- **The view menu** lists Gallery, Grid and Index with a check on the
  current one. The trigger shows the current view's name; strip mode, which
  has no row, falls back to "View".
- **Anchoring.** The tags card hangs from the pill on desktop and spans the
  screen less 12px on a phone, where the pill is too narrow for it. The view
  menu always hangs from its own trigger, right-aligned to the pill's edge.
- **Soft shadows** use `color-mix` on `--color-dark`, so no raw colours.

## Same day, third pass: square corners, the site's tags, nav blocks, page motion

Josh: "make the button bar have sharp angles and the tags use the tag style.
also top nav bar should have rectangular backgrounds. instead of underline
they should get a black background when selected. also make a smooth
animation when switching pages."

- **Square.** Every box in the bottom bar has `border-radius: 0`: the pill,
  the triggers, both cards, the search field, Clear, the view rows.
- **Tags are `.tagchip`.** The filter's options use the same chip and TAG
  voice as the tags on cards and profiles. The component sets only what a
  button needs on top (cursor, hover, the dark pressed state).
- **Nav blocks** (`Navbar.astro`). The underline is gone. Each link's padding
  box is a square rectangle: a faint fill on hover, a solid black block with
  paper-coloured type for the current page. On a phone the 8px edge margin
  moved inside the links so the type stays where it was.
- **Page motion** (`Layout.astro`, keyframes in `global.css`). `<main>` has
  its own view-transition name: the old page fades and lifts 8px in 180ms,
  the new one fades in rising 14px over 380ms after a 90ms beat. Back
  navigations run it in the other direction. The persisted ticker and nav
  hold still. Astro drops the motion under reduced motion.
