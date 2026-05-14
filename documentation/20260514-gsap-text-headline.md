# GSAP Text Headline

## Purpose

`src/components/GsapTextHeadline.astro` renders the animated VSCN masthead used in the persistent brand ticker. It starts from the repeated acronym:

```text
VSCNVSCNVSCNVSCN
```

Then cycles through:

```text
Visual
Science
Communication
Network
```

The headline ends each cycle by animating into another `VSCNVSCNVSCNVSCN` row, then instantly resets to the first row while the visible text is identical. This makes the animation feel infinite without a visible reverse spin.

## Column-Based Animation Model

The component does not rewrite whole words during the animation. Instead, it builds 16 fixed character columns, one for each character position in `VSCNVSCNVSCNVSCN`.

Each column contains a vertical stack of characters from every headline row:

```text
VSCNVSCNVSCNVSCN
Visual
Science
Communication
Network
VSCNVSCNVSCNVSCN
```

For example:

```text
Column 1: V V S C N V
Column 2: S i c o e S
Column 3: C s i m t C
```

Missing characters in shorter words render as empty strings. This lets every row keep the same 16-column layout while still showing shorter words.

## DOM Structure

The rendered runtime structure is:

```text
.gsap-text-headline__text
  .gsap-text-headline__slot
    .gsap-text-headline__column
      .gsap-text-headline__char
      .gsap-text-headline__char
      ...
```

Key CSS:

- `.gsap-text-headline__slot` is `1ch` wide, `1em` tall, and `overflow: hidden`.
- `.gsap-text-headline__column` is the moving vertical stack.
- `.gsap-text-headline__char` is one visible row inside the column.

Because each slot clips overflow, the animation can move vertically without stacked words showing outside the line.

## Timeline

The GSAP timeline repeats forever:

1. Hold on the initial acronym.
2. Move all columns to the `Visual` row.
3. Hold.
4. Move to `Science`.
5. Hold.
6. Move to `Communication`.
7. Hold.
8. Move to `Network`.
9. Hold.
10. Move to the final duplicate acronym row.
11. Instantly reset all columns back to row `0`.

The reset is invisible because both the final row and row `0` show the same text.

## Props

The component accepts optional timing props:

```ts
interface Props {
  holdDuration?: number;
  replaceDuration?: number;
  collapseDuration?: number;
  ease?: string;
}
```

Defaults:

```ts
holdDuration = 1.65;
replaceDuration = 1.15;
collapseDuration = 0.75;
ease = "expo.inOut";
```

`replaceDuration` controls movement between acronym and word rows, and between word rows.

`collapseDuration` controls the final movement from `Network` to the duplicate acronym row.

## Sizing

The component uses:

```css
font-size: var(--gsap-text-headline-size, clamp(2.5rem, 10.4vw, 8rem));
```

The persistent ticker overrides this in `src/layouts/Layout.astro`.

On mobile, the ticker currently sets:

```css
--gsap-text-headline-size: calc(100vw * 0.11);
```

The animated text span uses `width: 100vw` so the acronym can occupy the full viewport width.

## Reduced Motion

If the user prefers reduced motion, the component skips GSAP animation and renders the static base acronym:

```text
VSCNVSCNVSCNVSCN
```

## Maintenance Notes

- Keep `baseText` at 16 characters unless you also review sizing and `slotCount` behavior.
- To add or remove words, update the `words` array. The component will automatically create matching rows.
- Do not animate by appending new character elements on every cycle; that causes accumulation. The current column model creates the full static stack once, then only moves columns.
- The duplicate final acronym row is intentional. It is what makes the loop restart without showing a reverse transition.
