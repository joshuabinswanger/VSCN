# TickerBackground Component

> Last updated: 2026-05-12

---

## Overview

`TickerBackground` is a fullscreen fixed background of horizontally scrolling "VSCN" text rows. It is used as a decorative layer beneath page content and is placed in `src/components/TickerBackground.astro`.

---

## Usage

Wrap any page's content with the component. Everything inside the slot renders above the ticker.

```astro
---
import TickerBackground from "../components/TickerBackground.astro";
---

<TickerBackground>
  <main>Your page content here</main>
</TickerBackground>
```

---

## How it works

### Rows and speed

Eight rows are rendered, each scrolling at a different speed (60 s – 116 s). The speed variation creates a subtle parallax effect without any JavaScript-driven parallax logic.

### Seamless looping

The CSS animation moves each row's track by `translateX(-50%)`. For this to loop without a visible gap, the track must be at least **2× the viewport width** — otherwise empty space appears before the animation resets.

Because the font size is `12vh` (viewport-height relative), the actual pixel width of each span varies by screen shape. A fixed span count would break on wide/short viewports (e.g. ultrawide monitors, landscape phones).

**Solution:** each track starts with 4 seed spans. On `astro:page-load` and on debounced `resize`, a script clones the existing spans in batches until `scrollWidth ≥ 3× window.innerWidth`. The 3× target gives a 50% buffer over the required 2×, eliminating any edge-case gap regardless of viewport shape or font rendering differences.

### Gradient overlay

A vertical CSS gradient fades the ticker from nearly transparent at the top to fully opaque (`--color-bg`) at the bottom. This softens the transition between the decorative background and the page content above it.

### Astro view transitions

The wrapper `div` carries `transition:animate="none"`. This prevents Astro from applying a fade-in/out animation to the ticker during client-side navigation, which would cause a distracting flash on every page change.

**Why this matters for components with CSS animations:** Astro view transitions work by swapping the old page's DOM for the new page's DOM. For elements that are *not* persisted with `transition:persist`, this means the element is destroyed and re-created on every navigation. Any in-progress CSS animation (like the ticker scroll) is simply restarted from the beginning on the new page — which is fine and imperceptible here.

For `transition:persist` elements (like `Navbar`), the DOM node is physically moved from the old document into the new one during the swap. This move cancels any running CSS transition mid-frame. The practical consequence seen in `Navbar` was that the active-link underline animation was interrupted on every navigation: the click handler started the animation, the view transition moved the element (cancelling it), and `astro:page-load` then restarted it — producing a choppy two-step effect. The fix was to remove the click handler and let `astro:page-load` be the sole trigger, so the animation only starts after the DOM move is complete.

---

## Customisation

| What | Where |
|---|---|
| Row speeds | Array of durations on line 8 of the component |
| Font size | `.ticker-track span` — `font-size: 12vh` (mobile override: `8vh`) |
| Gradient strength | `.ticker-gradient` background stops |
| Text content | Seed `<span>` elements in the template |
