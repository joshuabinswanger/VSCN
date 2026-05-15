# GSAP Text Headline — 2026-05-15 Updates

Supersedes the sizing and animation sections of [20260514-gsap-text-headline.md](20260514-gsap-text-headline.md). The component file is still [src/components/GsapTextHeadline.astro](../src/components/GsapTextHeadline.astro); the brand ticker wrapper is in [src/layouts/Layout.astro](../src/layouts/Layout.astro).

## Summary of Changes

1. **Pixel-perfect width** — the 16 characters now span exactly `900px` on desktop and `100vw - 10px` on mobile, regardless of which monospace fallback the OS picks.
2. **New rotation sequence** — `VSCN…VSCN → Visual → VScience → VSCommunication → VSCNetwork → VSCN → VSCN…VSCN`. Each successive word preserves more of the `V/S/C/N` prefix from the base.
3. **Static prefix columns** — columns whose character does not change between consecutive rows no longer animate. The visible `V`, `S`, `C`, `N` glyphs hold still while only the trailing characters morph.
4. **1.6× faster playback** — applied globally via `timeline.timeScale(1.6)`; individual `holdDuration` / `replaceDuration` / `collapseDuration` props are unchanged.

## Width Strategy — Runtime `ch` Measurement

The previous viewport-based formula (`font-size: 8vh` desktop, `calc(100vw * 0.107)` mobile) could not match an exact pixel width: the `1ch` unit equals the advance of the `"0"` glyph in whatever monospace font fallback the browser chose, which differs between platforms (Consolas / Menlo / DejaVu / `ui-monospace`). Sixteen `ch` slots therefore drifted a few pixels off the target width.

The new approach computes `font-size` from the measured `ch` ratio:

```ts
function measureChRatio(target: HTMLElement): number {
  // Width of "0" rendered at font-size: 100px in the same font stack,
  // divided by 100 → ch as a fraction of em.
  ...
}

function applyHeadlineSize(root: HTMLElement, slotCount: number) {
  const targetWidthPx = target.getBoundingClientRect().width;
  const chRatio = measureChRatio(target);
  const fontSizePx = targetWidthPx / slotCount / chRatio;
  target.style.fontSize = `${fontSizePx}px`;
}
```

`16 × (chRatio × fontSize) = targetWidthPx` by construction, so the glyphs always fill the box exactly.

### CSS Variables

[src/layouts/Layout.astro](../src/layouts/Layout.astro) sets only the target width — font-size is no longer a CSS variable:

```css
:global(.brand-ticker .gsap-text-headline) {
  --gsap-text-headline-width: 900px;
}
@media (--bp-mobile) {
  :global(.brand-ticker .gsap-text-headline) {
    --gsap-text-headline-width: calc(100vw - 10px);
  }
}
```

The component CSS keeps a `clamp(2.5rem, 10.4vw, 8rem)` fallback on the outer container as a no-JS safety net; the inline `font-size` set by `applyHeadlineSize` overrides it once the script runs.

### Recompute Triggers

`applyHeadlineSize` runs on:

- `initHeadline` (before `renderCharacterColumns`, so the first paint is correct)
- `astro:page-load`
- `document.fonts.ready` (catches any late font swap)
- A `requestAnimationFrame`-debounced `window` `resize` listener

Height is left to derive automatically from the chosen font-size × `line-height: 0.95`.

## Per-Column Distinct-Character Sequences

Previously, every column rendered one `.gsap-text-headline__char` per row (6 chars per column for 6 rows), and every column translated by `-rowIndex × 1em` in lockstep. Identical characters at adjacent rows still slid through the slot, producing visible motion even when the glyph should have appeared static.

The new model collapses consecutive duplicates per column:

```ts
function buildColumnSequences(rows: string[], slotCount: number): string[][] {
  // For each column, walk rows top-to-bottom and append the character only
  // if it differs from the previously appended one.
}
```

Example for the current rotation (rows padded to 16 chars with spaces):

| Column | Raw characters across rows | Deduplicated sequence |
| ------ | -------------------------- | --------------------- |
| 0      | V V V V V V V              | `[V]`                 |
| 1      | S i S S S S S              | `[S, i, S]`           |
| 2      | C s C C C C C              | `[C, s, C]`           |
| 3      | N u i o N N N              | `[N, u, i, o, N]`     |
| 4      | V a e m e (sp) V           | `[V, a, e, m, e, ' ', V]` |

Column 0 has a single child — it can never move, so the leading `V` is rock-solid through the entire loop.

### Step-by-Step Transitions

`transitionText` no longer animates all columns to a shared `y`. Instead, for each row transition it:

1. Compares `rows[rowIndex - 1][col]` with `rows[rowIndex][col]`.
2. If the characters differ, increments that column's `columnPositions[col]` counter and queues the column with `y: -columnPositions[col] em`.
3. If no columns change, inserts a plain `timeline.to({}, { duration })` to preserve the timing slot.

GSAP's per-target function form drives the staggered tween:

```ts
timeline.to(changing, {
  duration,
  y: (i) => `${targetYs[i]}em`,
  stagger: 0.026,
  ease,
});
```

`columnPositions` is mutated only during timeline construction; once the timeline is recorded, the `repeat: -1` loop replays the exact same tweens without any JS state.

## Rotation Sequence and Prefix Preservation

`words` is now:

```ts
const words = ["Visual", "VScience", "VSCommunication", "VSCNetwork", "VSCN"];
```

Combined with `padToSlot`, the rows are:

```
0  VSCNVSCNVSCNVSCN
1  Visual          
2  VScience        
3  VSCommunication 
4  VSCNetwork      
5  VSCN            
6  VSCNVSCNVSCNVSCN
```

Static columns per transition:

- `→ Visual`: col 0 (`V`) stays.
- `→ VScience`: cols 0–1 (`V`, `S`) stay.
- `→ VSCommunication`: cols 0–2 (`V`, `S`, `C`) stay.
- `→ VSCNetwork`: cols 0–3 (`V`, `S`, `C`, `N`) stay.
- `→ VSCN`: cols 0–3 stay; cols 4–15 collapse to blank.
- `→ base`: cols 0–3 stay; cols 4–15 re-form into the repeating pattern.

The trailing `VSCN` row added on 2026-05-15 gives a brief acronym-only beat before the strip re-fills with the full repeating `VSCN…` block, so the loop feels like the network is gathering itself back to its full form rather than snapping.

## Global Speed Multiplier

```ts
timeline.timeScale(1.6);
```

Applied once after the timeline is built. The recorded hold/replace/collapse durations stay at their semantic values (`1.65 / 1.15 / 0.75 s`), so future tuning of the props remains intuitive; the multiplier is the single knob for overall pace.

## Reduced Motion

The reduced-motion path still short-circuits GSAP, but it now also adds the root to the `roots` set so the resize listener keeps the static text at the exact pixel width on viewport changes.

## Maintenance Notes

- `applyHeadlineSize` reads the resolved width from `getBoundingClientRect()`, so the CSS variable can be any value (e.g. `clamp()`, `calc()`, `min()`). To change the target widths, edit the `--gsap-text-headline-width` declarations in [Layout.astro](../src/layouts/Layout.astro).
- Adding a word: append it to `words` and pad logic + sequence building handle the rest. The prefix-preservation behavior emerges automatically — any leading characters identical to the previous row will not animate.
- Changing the global pace: adjust the argument to `timeline.timeScale(...)` rather than rewriting individual durations.
- The deduplicated per-column sequences depend on the *order* of `rows`. Reordering the rotation changes which columns dedupe and how far each column has to travel; verify visually after any structural change.
- Do not call `target.textContent = ...` after `renderCharacterColumns` outside the reduced-motion path — it would wipe out the slot DOM and break the timeline.
