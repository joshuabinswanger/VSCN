> Mirrors the `~/.claude/projects/D--SynoDrive-VSCN/memory/site-footer-is-fixed-chrome.md` memory file; keep the two in sync.

---
name: site-footer-is-fixed-chrome
description: "The footer and the profile Save button swapped positioning strategies on the same day — footer fixed and scroll-gated, Save back to sticky — and the mobile bottom corner changed hands"
metadata:
  type: project
---

**2026-09-10, uncommitted on dev.** Two bottom-edge changes that only make sense together.

**The site footer became chrome.** [src/components/SiteFooter.astro](src/components/SiteFooter.astro)
is `position: fixed; left: 30px; bottom: 20px; z-index: 20`, mirroring `.lang-toggle`'s
corner so the two read as one bar with a hole in the middle. It starts
`opacity: 0; visibility: hidden` and an `IntersectionObserver` — rooted on `.page-wrap`,
watching a zero-height sentinel that is the last child of that wrap — toggles `.is-visible`
at the end of the scroll. `visibility` is not decoration next to `opacity`: with opacity
alone the three links stay clickable and in the tab order while invisible (hit-tested).

**The language toggle lost the mobile left corner.** It used to be mirrored to
`left: 30px` on mobile, where a thumb rests. It is bottom-right on every breakpoint now,
because the footer took that corner. At 375px the footer spans 30→295 and the toggle
starts at 303 — 8px of clearance, so anything that widens the footer copy will collide.

**The profile Save button went back to `sticky`** in
[src/components/ProfileForm.astro](src/components/ProfileForm.astro) — Josh: "like a
reversed sticky". This REVERSES his own 2026-09-04 "save changes at bottom always", which
had made it `fixed`. He was asked and confirmed. Being in flow again, it drops the copy of
`.profile-form`'s width/padding that `fixed` forced it to carry.

**Why:** the two are one decision about who owns the bottom edge. The footer moved *out*
of flow to become permanent chrome; Save moved *back into* flow so it stops hovering over
half-empty short tabs. On mobile they now share the bottom line — footer left, Save right.

**How to apply:** treat `.lang-toggle`, `.site-footer` and `.form-footer` as one system;
changing any one's offsets means checking the other two at 375px. The z-index registry in
[src/pages/styleguide.astro](src/pages/styleguide.astro) lists them. `/profile` needs a
sign-in, so the sticky Save is **verified only as compiled CSS, never seen running** —
walk it before shipping. See [[browser-pane-frozen-timeline]] for why every check of the
footer needed a forced paint, and [[profile-editor-preview-mode]] for the tab structure.

**2026-09-11 — mobile lift, and the release that is waiting on Josh.** Save's bottom
padding drops from `1.25rem` to `0.5rem` under `@media (--bp-mobile)` (Josh: "put save bar
lower on mobile"), which puts it on roughly the footer's own `bottom: 20px` line instead of
a step above it — the bottom edge reads as one strip rather than a staircase. Committed as
`0150597`, pushed to `dev`, live on dev.

**SHIPPED TO PROD 2026-09-12 as `730f950`** (PR #23, dev → main, CI green). The prod
ruleset went first — `firebase deploy --project vscn-39508 --only firestore:rules` — which
is what `siteLink` needed; see [[image-has-two-links]]. Walked on vscn.ch: hidden at the
top, `is-visible` at the end, footer `left: 30 / bottom: 20` and toggle `right: 30 /
bottom: 20`.

**The classifier block is not absolute, and `npx` is the trap.** The same prod deploy that
was refused on 2026-09-11 went through on 09-12 untouched, so a block is worth retrying
rather than treating as permanent. What actually failed first was `npx firebase` — "could
not determine executable to run", because firebase-tools is global here, not a project
dependency. Call `firebase` directly.

**A thing that looks like a bug and is not:** Cloudflare's visible Turnstile challenge is a
fixed 300px box at the bottom of the viewport, `z-index: 1000`, and it covers the footer
AND the language toggle while it is up. Measured at 375px: the widget spans 63→363, the
footer 30→295, the toggle 303→345. This predates the corner swap — a 300px box covers the
whole bottom strip whichever corner the toggle is in — so it is not a regression from
moving the toggle right.

The sticky Save bar — desktop resting position and the mobile lift both — is still **never
seen running**, on either environment, because `/profile` needs a sign-in.

**2026-09-23 — it was never at the bottom. ON DEV `4098f2f` (PR #79), not prod.** Josh's
screenshot showed Save floating over the portfolio hint, ~100px up the screen. A sticky box
pins against its scroll container's **padding** edge, and `.page-wrap` carries 80px of
`padding-bottom` for the fixed footer, so `bottom: 0` had meant "96px up" since 09-10 — the
cost of "never seen running". Fix: the padding is `--page-wrap-pad-bottom` in
[src/layouts/Layout.astro](src/layouts/Layout.astro) and Save uses
`bottom: calc(-1 * var(--page-wrap-pad-bottom, 0px))`. Dropping it to the edge exposed a
second collision the lift had hidden: on mobile it landed ON the EN/DE toggle (Save 204→330,
toggle 303→345 at 375px), so mobile adds `padding-right: 3rem` and Save ends at 294, ~9px
short of the toggle. **Seen running signed in on dev**: desktop bottom 884 of 900, mobile 806
of 812, and at full scroll it rests at the form's end with the footer below it.

**How to apply:** any sticky child of `.page-wrap` inherits this trap — `bottom: 0` is the
padding edge, not the screen edge. Measure with `getBoundingClientRect()` against
`innerHeight`, not by reading the CSS.

**2026-09-24 — mobile corners swapped again. ON DEV `c0870f4` (PR #85), not prod.** Josh:
Save should "align right as well" on mobile, which forces EN/DE elsewhere, which forces the
footer out of the corner "as a stacked list at the bottom, as is common with mobile
versions". So under `--bp-mobile` only: Save is flush right (the 3rem inset from #79 is
gone); `.lang-toggle` is `left: 30px; right: auto` (back where it was before 09-10); and
`.site-footer` is `position: static`, always visible, one link per line with a hairline
above, on the same 30px edge — at full scroll the toggle, fixed in `.page-wrap`'s 80px
bottom padding, reads as the list's last line. Desktop is untouched. Walked signed in on dev
at 375×812: toggle 30→72, Save 204→330 on the same line.

**Two traps from this round:** Playwright's Chromium reserves a 15px scrollbar gutter
(`scrollbar-gutter: stable both-edges`), so in-flow content measures 15px further in than on
a phone with overlay scrollbars — the footer at x 45 against a fixed toggle at 30 is that
artefact, not misalignment. And a local `npm run build` in a fresh worktree failed on
`sortablejs`: the worktree's `node_modules` is a junction to `repo/node_modules`, which
predates PR #82, so a dependency added on dev is missing locally until `repo/` installs it;
CI's build was the gate.

**2026-09-24, later — the switch is not chrome on a phone at all. ON DEV `9a141a3` (PR #89).**
Josh: "the language switch on mobile has to be placed underneath, so when you scroll all the
way to the bottom, above the impressum etc. think from a UX perspective!" — the bottom-left
fixed toggle from PR #85 lasted hours. Now, under `--bp-mobile` on every page with a footer,
nothing floats at the bottom but Save; the page ends: rule, **EN / DE** (`#footer-lang`,
rendered by SiteFooter with its href computed at build by the navbar's own rule), Impressum /
Contact / Privacy, ©. `.page-wrap.has-footer` (Layout.astro) hides the fixed `#nav-lang` and
cuts the end padding to 30px; the footerless landing hero keeps its fixed toggle bottom-right.
Navbar's session-choice listener and OnboardingForm's save-before-leaving hook both match
`#footer-lang` — a second copy of a control needs every listener of the first.

**Why:** a floating switch sits over content and competes with Save; at the end of the page
is where people look for it. **How to apply:** the lesson Josh drew is "think from a UX
perspective" — I had solved the corner collision geometrically twice before asking where a
member expects the control to be. Ask that first.

**Trap:** `:global(body:has(#site-footer)) .lang-toggle` in Navbar's scoped `<style>` was
DROPPED from the compiled CSS with no warning; the rest of that `@media` block survived. Put
page-level conditions on a class the owning layout sets, not on `:has()` inside `:global()`.
Also: `.page-wrap` has `scroll-behavior: smooth`, so a measuring script must use
`scrollTo({behavior: 'instant'})` or it reads a scroll still in flight.

**2026-09-24, evening — two columns. ON DEV `556314e` (PR #91).** Josh: "put the de en on the
right the rest on the left". The phone footer is a `1fr auto` grid: Impressum / Contact /
Privacy and © down the left, `#footer-lang` alone in column 2, row 1, `justify-self: end` —
level with Impressum and on the same right edge as Save (330 at 375px). Walked signed in on
dev /profile. The mobile bottom edge has now settled as: Save floats bottom-right while
scrolling; everything else is in the flow at the end.
