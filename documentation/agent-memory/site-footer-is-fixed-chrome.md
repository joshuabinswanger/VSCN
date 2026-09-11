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
