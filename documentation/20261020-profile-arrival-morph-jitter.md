# Member page arrival on iOS: the morphs that jittered

**Date:** 2026-10-20 · **Branch:** `fix/profile-arrival` · **Reported by Josh:** "on opening the
profile page on iOS the build up of the page is not smooth and images and text jitter"

## What happened

Since 2026-10-16 the arriving page is held invisible (`<main>` at opacity 0, paused WAAPI fade)
and since 2026-10-20 that hold is a fixed 500 ms pause before a plain fade (`ARRIVE_DELAY_MS` in
`Layout.astro`). Two elements still carried Astro `transition:name`s across the card → member
page change: the card frame / first work figure (`mimg-<memberId>`) and the card name link / page
`<h1>` (`mname-<memberId>`). A named element is lifted into its own `::view-transition-group`
and animated by the browser from the card's box to the page's box, over the root snapshot.

The arriving page is at opacity 0 for the whole view transition. Whether the morph is visible
then depends on how the engine captures a named element under an opacity-0 ancestor:

| Engine | Named element under `opacity: 0` parent, mid-transition |
| --- | --- |
| WebKit (Playwright 2368, same WebCore as iOS) | painted at full strength |
| Chromium 1243 | not painted |

(Minimal page: `#main { opacity: 0 }` around a `view-transition-name: box` element, 3 s
animations, screenshot at 800 ms. The red box shows in WebKit only.)

So on an iPhone: the old page fades out (the picture and name with it), the view transition
starts and the picture and name come back at full strength, fly to their place on a blank page,
vanish when the transition ends (they now sit inside the held `<main>`), and fade back in 500 ms
later with the page. On a desktop Chrome the whole morph is invisible, which is why nothing
showed there. Headless WebKit's video does not render WAAPI fades, so the recorded frames
only show the held snapshots: the first picture and the name stay while everything else is
already gone, then snap away.

## Fix

The two names are gone — `CommunityImageCard.astro` (frame and name link),
`MemberWork.astro` (figure) and `[slug].astro` (h1) — and with them `MemberWork`'s and
`MemberProject`'s `memberId` prop. The member page now arrives exactly as the 2026-10-20
decision describes: a 500 ms pause, then one fade, in every engine.

Re-timing the morph into the fade (delaying the `::view-transition-group` animations by the
pause) was considered and dropped: WebKit would still show the old picture and name popping
back to full strength at the start of the transition, and Chromium would show no morph at all.

## How to check

`npm run lint`, `npm run check`, `npm run test:unit`; `npx astro build` and `astro preview`,
then the WebKit probe in the session scratchpad (`probe/arrive.mjs`) records the card →
member page change at iPhone 13 size. The judge is Josh's iPhone.
