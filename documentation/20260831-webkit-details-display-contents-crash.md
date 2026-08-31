# iOS WebKit crash: `display: contents` + a scroll-container `::details-content`

The bug that made `/community` impossible to open on an iPhone, what it
actually is, and the workaround the community cards now carry.

**The workaround:** `.pdisc` keeps a real box (never `display: contents`) and
`::details-content` keeps `overflow: clip` (never `hidden` or `auto`) in
`src/components/community/CommunityImageCard.astro`,
`CommunityTextCard.astro`, `MemberDetailPanel.astro` and
`src/components/CommunityGrid.astro`. Do not "tidy" either of those back.

## DO NOT FILE — already reported and fixed upstream

Checked WebKit Bugzilla on 2026-08-31 before filing. This exact bug is
**[bug 320447](https://bugs.webkit.org/show_bug.cgi?id=320447)**, reported
2026-07-28 by Miel Peeters and **RESOLVED FIXED** on 2026-08-05 via
[PR #70572](https://github.com/WebKit/WebKit/pull/70572), landed as
[318661@main](https://commits.webkit.org/318661@main).

Root cause per that report, confirmed at source level:

> Null pointer dereference in `RenderElement::getUncachedPseudoStyle()`,
> reached from `RenderLayerScrollableArea::updateScrollCornerStyle()` while
> resolving the **scroll-corner** pseudo style. Because the `<details>` has
> `display: contents` it has no render element for the pseudo style to be
> resolved against.

That is the mechanism behind our own black-box finding. A scrollable area wants
a scroll-corner pseudo; resolving it needs a render element; `display: contents`
means there is none. It also explains precisely why `overflow: clip` is safe —
`clip` establishes no scrollable area, so `updateScrollCornerStyle()` is never
reached.

**Our workaround stays.** The fix landed in trunk on 2026-08-05 and has not
shipped in a released iOS as of iOS 26.6 (confirmed failing on device on
2026-08-31, Safari and Chrome for iOS). Until the fix reaches shipping Safari
*and* our users' devices update, `.pdisc` must keep a real box and the pseudo
must keep `overflow: clip`. Revisit no earlier than the Safari release that
contains 318661@main.

The draft below is kept only as the record of what we independently established
by bisection, and because the hosted test cases are still useful for retesting
when a new iOS ships.

---

# WebKit bug report draft

**Title:** Page fails to load entirely when `::details-content` of a
`display: contents` `<details>` is given a scroll-container `overflow`

**Attachment:** `webkit-details-display-contents-repro.html` (927 bytes)

## Summary

Giving `::details-content` an `overflow` value that creates a scroll container
(`hidden` or `auto`) makes the page **completely unloadable** when the
originating `<details>` element has `display: contents`. The browser never
renders the document; it reports a generic load failure and reloading repeats
it. One `<details>` element in a 927-byte document with no JavaScript, no
images and no other CSS is enough.

`overflow: clip` — which clips without establishing a scroll container — does
**not** trigger it, which suggests the fault is in creating a scrollable area
for a pseudo-element box whose originating element generates no box at all.

## Minimal reproduction

```html
<!DOCTYPE html>
<html><head><meta charset="utf-8"><style>
  .row { display: grid; grid-template-columns: minmax(0, 1fr) auto; }
  .row .pdisc { display: contents; }
  .pdisc::details-content { overflow: hidden; }
</style></head><body>
  <div class="row">
    <span>role text</span>
    <details class="pdisc">
      <summary></summary>
      <div>panel body</div>
    </details>
  </div>
</body></html>
```

**Expected:** the page loads; the disclosure works.
**Actual:** the page never loads.

Note the `.row` grid is *not* required — see the matrix below. It is included
only because it is how the original site hit this.

## What does and does not trigger it

Each row is a separate standalone document containing one `<details>`.

| Configuration | Result |
|---|---|
| `display: contents` + pseudo `overflow: hidden` | **fails to load** |
| `display: contents` + pseudo `overflow: auto` | **fails to load** |
| `display: contents` + pseudo `overflow: clip` | loads |
| `display: contents` + pseudo `content-visibility: hidden` | loads |
| `display: contents` + pseudo `block-size: 0` | loads |
| `display: contents` + pseudo `grid-column: 1 / -1` | loads |
| `display: contents` + pseudo `color: red` | loads |
| `display: contents` + `overflow: hidden` on a normal child `<div>` | loads |
| `display: contents`, parent is `display: block` not grid | **fails to load** |
| `<details>` generates a box + full pseudo styling incl. `overflow: hidden` | loads |

So: the trigger is specifically a scroll-container `overflow` on
`::details-content` while the `<details>` is `display: contents`. Parent layout
mode is irrelevant. Element count is irrelevant (one is enough).

## Test cases — how to retest when a new iOS ships

The four pages live in [webkit-details-repro/](webkit-details-repro/) rather than
in `public/`, so they are **not** on the live site: four unlinked test pages had
no business shipping to production. Each is standalone — one `<details>`, no JS,
no images — and carries a visible verdict box, so a page that renders is
self-evidently a pass.

To put them back on dev for a device retest:

```bash
cp -r documentation/webkit-details-repro public/t && npm run deploy:dev
```

They then answer at `https://vscn-dev-f4b60.web.app/t/` — `wk-hidden` and
`wk-auto` are the two that fail to load, `wk-clip` is the control that loads.
Delete `public/t` again afterwards. `minimal-attachment.html` is the 927-byte
single-case file, the one to attach to a bug report.

**The verdict to look for:** if `wk-hidden` renders, commit 318661@main has
reached this device's WebKit and the workaround in `src/components/community/`
can go. If it still fails to load, it has not.

## Environment

- Device: iPhone 15
- iOS version: 26.6
- Browsers: reproduces in **Safari** and in Chrome for iOS (which uses the
  system WebKit engine). Both were tested on the device above; the failure
  is identical in each.
- Desktop Chrome/Blink at the same viewport is unaffected.

## Why it mattered

The combination is not contrived. `::details-content` shipped in Safari 18.4
and its headline use case is animating a disclosure open, which wants
`block-size: 0 → auto` plus an `overflow` to clip during the animation.
`display: contents` on the `<details>` is a natural way to let the summary and
the panel participate in a parent grid. Following both pieces of published
guidance at once produces a page that cannot be opened, with no console error
and no indication of the cause.
