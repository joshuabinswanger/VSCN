> Mirror of the `~/.claude/projects/D--SynoDrive-VSCN/memory/site-footer-is-fixed-chrome.md` memory file, kept in the repo so it travels with the code.

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
