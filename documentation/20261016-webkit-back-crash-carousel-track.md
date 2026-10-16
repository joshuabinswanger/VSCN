# WebKit Back crash: the carousel track must be a scroller inline (2026-10-16)

## Symptom

Playwright WebKit 26.6 (webkit-2368) at 390 × 844 lost the page ("Page crashed",
the WebContent process died) on this sequence against a local `astro preview`:

1. open `/community`
2. tap the header's `/info` link
3. Back (or any client-side link back to `/community`)

Not at 1280 × 800, not in Chromium, not on the deployed dev host, not on
production. It looked data-dependent (a prod-data build crashed, the dev host
did not); it is not.

## What actually decides it

Four ingredients, each proven necessary by removing it alone:

| Ingredient | Removed how | Result |
| --- | --- | --- |
| A view transition | `delete Document.prototype.startViewTransition` | no crash |
| The document as root scroller (phones, since #184 on 2026-10-11) | `.page-wrap` made the scroller again by injected CSS | no crash |
| The card's carousel track as a user-scrollable box | `.ccard__track { overflow: hidden }` | no crash |
| `communityCard.css` coming back **revalidated (304)** for the arrival | serve it `immutable`, or without an ETag | no crash |

The crash lands after `astro:after-swap`, while WebKit captures the new state.
Which stylesheet is revalidated matters: an ETag on `communityCard.css` alone
crashes; on `community.css`, `lightbox.css`, `Layout.css`, the HTML or the JS
it does not. Data does not matter: the deployed dev host crashes the same way
behind a proxy that serves its CSS `no-cache` + ETag. `git bisect` (with that
harness) puts the first bad commit at the merge of #184
(`69d6d6f`, "Refine mobile typography, gallery spacing and native scrolling"),
which made the document the scroller on phones.

Why the deployed hosts survive: Firebase serves `/_astro/*` as
`public, max-age=31536000, immutable`, so the sheet is reused without
revalidation. `astro preview` serves it `no-cache` with an ETag, which is the
whole difference. The exposure in the wild is therefore small, but a browser
that revalidates (a forced reload's aftermath, a cache that ignores
`immutable`, a future header change) would take the page down with no error.

## The fix

The track's `overflow: auto hidden` is declared inline on the element in
`CommunityImageCard.astro`, as well as in `communityCard.css`. With the scroller
declared on the element, the track is a scroll container from the moment the
swap inserts it, independent of that sheet. Verified 0 crashes on both data
sets with the revalidating harness; the same rule appended to `Layout.css`
(always present, never re-requested on navigation) also cures it, which is
what pointed at the sheet rather than the box.

Things that did NOT cure it, so do not reach for them first: disabling the
named transitions (`mimg-*`, `mname-*`), all CSS animations, scroll-driven
timelines, scroll snap on the root, suppressing the router's `scrollTo`,
removing the leaked root rules from `communityCard.css`, and preloading the new
stylesheets as real `<link>`s before the swap.

## Reproducing

`astro preview` is the revalidating server, so the original steps still work
against a production build (`node scripts/export-site-data.mjs`,
`npx astro build --mode production`, `npx astro preview --port 4418`). Click the
`/info` link through the DOM (`el.click()`): on a phone it sits behind the
hamburger and a Playwright click times out. Listen for `page.on("crash")`.
