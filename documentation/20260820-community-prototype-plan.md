# Community Page Visual Prototype — Implementation Plan

> **For agentic workers:** REQUIRED SUB-SKILL: Use superpowers:subagent-driven-development (recommended) or superpowers:executing-plans to implement this plan task-by-task. Steps use checkbox (`- [ ]`) syntax for tracking.

**Goal:** Build a throwaway-but-graduatable visual prototype of the VSCN community page from the 2026-08-20 hand sketch: an irregular offset card grid where cards scale up as they rise toward the top of the viewport, and each card flips through a member's gallery images with per-image captions.

**Architecture:** A standalone `noindex` route at `/proto/community` fed by deterministic mock data, built from the real design tokens in `src/styles/global.css`. Placeholder imagery is generated locally by a Node script into `public/proto/img/` with a build-time manifest, so the prototype has zero Firebase, network, or Admin-SDK dependency. Motion is split by what each tool is good at: the looping image crossfade is pure CSS, while the scroll-linked scale and the per-column parallax are GSAP ScrollTrigger, dynamic-imported on desktop only so mobile ships none of it.

**Tech Stack:** Astro 6, plain CSS with `@custom-media` via PostCSS, Archivo (self-hosted variable), GSAP 3.15 + ScrollTrigger (already a dependency), Node 22+ for the image generator.

**Spec:** The hand sketch supplied 2026-08-20 (desktop + mobile + card anatomy). Sketch reading, from the annotations verbatim:

- Card = `NAME` above the image, `IMAGE` in the middle, `TAGS` at the image's top-right, `TITLE` + `DESCRIPTION` below it.
- `FLIPS THROUGH` — the image area cycles through images.
- `IRREGULAR GRID` on desktop, `OFFSET GRID` on mobile — staggered columns, varying card sizes.
- `CARDS GROW AS THEY GET TO THE TOP` — scale is a function of viewport position: small at the bottom, large at the top.
- The repeating `VSCNVSCNVSCN` band at the top of both sketches **already exists** as `.brand-ticker` in `src/layouts/Layout.astro` (Archivo 800, 8rem, `transition:persist`, outside the scroll container). Nothing to build for it.

## Global Constraints

- **Design tokens only.** Colours, radii and breakpoints come from `src/styles/global.css`: `--color-dark #000000`, `--color-bg #fcfbfa`, `--color-border #e0e0e0`, `--color-muted #888`, `--radius-xs 2px` … `--radius-xl 16px`, `--font-size-base 13px` (mobile) / `15px` (desktop). No new hex values outside the generated placeholder art.
- **Breakpoints are the existing custom-media aliases only:** `@media (--bp-mobile)` = `width <= 767px`, `@media (--bp-desktop)` = `767px < width`. Do not invent new pixel breakpoints. These resolve through `@csstools/postcss-global-data` + `postcss-custom-media` and already work inside scoped Astro `<style>` blocks (see `CommunityGrid.astro`).
- **Typefaces: Archivo only.** `"Archivo", sans-serif` throughout — name, tags, caption, structure. Weight and size carry the hierarchy; there is no second family. Do **not** use `var(--font-space-mono)`. Space Mono is registered in `astro.config.mjs` but referenced nowhere in `src`, and it stays that way.
- **Every animation must be gated.** CSS animations honour `@media (prefers-reduced-motion: reduce)`, matching `ScrollingBanner.astro` and the `body::before` noise layer. The GSAP layer is gated twice — on desktop width *and* on reduced motion — before it is even downloaded.
- **No new dependencies.** `gsap@3.15.0` is already in `package.json` and already ships `ScrollTrigger.js`, so nothing is added. But be honest about the cost: GSAP currently ships **nothing to the browser**, because no component imports it any more (`GsapTextHeadline.astro` still exists but is referenced nowhere). Using it here is a real **+44 KB gzip** (27 KB core + 17 KB ScrollTrigger) on the pages that opt in.
- **Desktop-only JS, and mobile must download zero bytes of it.** Gate the `import()` on `window.matchMedia("(min-width: 768px)")` — the JS mirror of `--bp-desktop` — never a static top-level import.
- **The scroller is `.page-wrap`, not the window.** Any ScrollTrigger must pass `scroller: ".page-wrap"` explicitly. `body` is `overflow: hidden; height: 100dvh`.
- **Astro's `ClientRouter` is active.** Client scripts initialise on `astro:page-load` and must tear down on `astro:before-swap`, or triggers leak across navigations. `MemberCard.astro` is the existing precedent for the `astro:page-load` half.
- **The prototype must not leak.** The route passes `noindex` to `Layout`, and `/proto` is added to the sitemap filter in `astro.config.mjs`.
- **No Firebase.** No import of `firebase`, `firebase-admin`, `src/lib/firebase.ts` or `src/lib/firestore.ts` anywhere in the prototype. It must render with no `.env` present.
- **There is no test framework in this repo** and this plan does not add one. Verification is `npm run lint`, `npm run build`, `npx tsc --noEmit`, and browser-pane inspection (clean console, computed styles, screenshots at both breakpoints). Every task ends with a named pass/fail gate, not "looks fine".

## File Structure

| File | Responsibility |
|---|---|
| `scripts/gen-proto-images.mjs` | **Create.** Deterministic placeholder-art generator. Standalone Node, never imported by the app. |
| `public/proto/img/*.svg` | **Generated.** 96 placeholder images, 6 motifs × 6 aspect ratios. Served statically. |
| `src/lib/proto-images.json` | **Generated.** Manifest — `{src, width, height, motif}` per image, so layout knows ratios at build time. |
| `src/lib/proto-data.ts` | **Create.** 24 mock members: name, role, tags, 4 captioned images each. Pure data + types. |
| `src/components/proto/ProtoMemberCard.astro` | **Create.** One card: name, flipping image stack, tag rail, flipping caption. Owns the flip and grow animations. |
| `src/components/proto/ProtoGrid.astro` | **Create.** Column distribution, offsets, width variance and jitter — plus the desktop GSAP layer (scroll-linked scale + column parallax), which lives here because it needs the scroller and per-column context. Knows nothing about card internals. |
| `src/pages/proto/community.astro` | **Create.** The route. Wires mock data into the grid inside `Layout`. |
| `astro.config.mjs` | **Modify** (sitemap `filter`, ~line 25–30). Exclude `/proto`. |
| `.claude/launch.json` | **Create.** Dev-server config so the browser pane can drive `astro dev`. It is **not** gitignored in this repo (checked), and it is useful to anyone running the preview, so it **is** committed. |

Card internals and grid layout are split deliberately: the flip/grow behaviour is the risky part and must be reviewable before a grid exists to hide it, and the column offsets should be tunable without touching animation code.

## Decisions taken, with the reasoning (correct any of these and I'll adjust)

1. **The caption is the *member's*, and it does not flip.** `NAME` on top, the flipping image below it, then the member's `role` and short `description` — static while the images cycle above. A stable identity anchor under moving imagery, and it means this page needs nothing from the per-image caption field that `ProfileForm` currently lacks. The image `alt` stays empty (decorative); the member's name is the accessible label.
2. **Three unequal columns, then jitter the cards out of them.** Free 2D placement is achievable but brittle, and CSS masonry is not safely shippable across browsers yet. So: three columns of *unequal width*, each with its own vertical offset, and every card given a deterministic `translate` nudge in x and y on top of a width variance. Because `translate` does not affect layout, cards can lean into a neighbour's gutter and overlap slightly with zero reflow risk and no gaps to fill. It composes cleanly with the scroll animation, which animates the `scale` longhand — a different property, so the two never fight.
3. **One image minimum, three maximum — a real per-member count, no padding and no sampling.** The crossfade needs each slot visible for precisely 1/N of the cycle, and N has to appear in the keyframe stops as literal percentages, which CSS cannot compute from a variable. But across a range of only 1–3 that is **two keyframe blocks** (`pcard-flip-2`, `pcard-flip-3`) and one static rule, so this stays pure CSS — no JS, and it keeps working on mobile and with scripting off. The `animation-delay` is shared across all counts by dividing the cycle by a `--slots` custom property. A one-image card simply does not flip, which is the honest presentation of a member who has uploaded one thing.
4. **The frame keeps the *first* image's aspect ratio; every slot is `object-fit: cover`.** If the frame resized per slot, the whole grid would reflow on every flip. Irregularity comes from cards differing *from each other*, never from a card differing from itself.
5. **GSAP ScrollTrigger owns the desktop scroll motion; CSS keeps the flip.** JS is permitted on desktop, and the right split is: ScrollTrigger for anything tied to scroll position, CSS for the looping crossfade. Three reasons. (a) It **removes the plan's only real unknown** — `animation-timeline: view()` had to guess right about `.page-wrap`; ScrollTrigger is *told* the scroller. (b) It buys per-column **parallax**, which pure CSS cannot express and which does more to destroy the grid feel than any amount of static jitter. (c) The flip stays in CSS because a looping opacity crossfade is compositor work that JS would only make heavier, and keeping it in CSS is what lets it survive on mobile and with scripting off. Consequence: **mobile has no grow/parallax at all.** The sketch only annotates "cards grow" on the desktop half, and this keeps one implementation of the effect rather than two.
6. **96 placeholders generated, ~57 actually used.** The surplus is deliberate: it is what keeps motif repetition low once the stride picks images for 24 members holding 1–3 each. Not a leftover from the old fixed-four scheme.
7. **Generated SVG placeholders, not photos.** Deterministic, offline, zero licensing, in-palette — six science-illustration motifs (contour, cells, lattice, hatch, spectrum, strata). Swapping the manifest for Lorem Picsum URLs is a one-line change if you want photographic realism; the comfy-cloud MCP can generate real scientific illustrations as a later pass at credit cost.

---

### Task 1: Checkpoint the existing gallery work

The working tree holds ~2 months of uncommitted gallery work (10 modified files, plus untracked `src/lib/gallery.ts` and `src/pages/styleguide.astro`). The prototype must not be stacked on unsaved changes.

**Files:**
- Modify: none (version control only)

- [ ] **Step 1: Confirm what is uncommitted**

```bash
git status --short
```

Expected: 10 ` M` entries plus `?? src/lib/gallery.ts` and `?? src/pages/styleguide.astro`.

- [ ] **Step 2: Verify it lints before committing it**

```bash
npm run lint
```

Expected: exit 0. If it fails, fix the errors first — do not commit a broken tree.

- [ ] **Step 3: Commit the gallery feature**

```bash
git add -A
git commit -m "feat: member gallery — client-side WebP pipeline, profile editor, card strip

Adds up-to-8-image galleries: client-side resize and WebP re-encode with EXIF
stripping, resumable Storage upload, a thumb editor in ProfileForm, and an
Embla drag strip with a PhotoSwipe lightbox on MemberCard. Firestore and
Storage rules validate the gallery field; thumbnails are optimised at build
time via getImage against the Firebase remote pattern.

Co-Authored-By: Claude Opus 5 <noreply@anthropic.com>"
```

- [ ] **Step 4: Confirm a clean tree**

```bash
git status --short
```

Expected: empty output.

---

### Task 2: Placeholder image generator

**Files:**
- Create: `scripts/gen-proto-images.mjs`
- Generated: `public/proto/img/*.svg`, `src/lib/proto-images.json`

**Interfaces:**
- Consumes: nothing.
- Produces: `src/lib/proto-images.json` — `Array<{ src: string; width: number; height: number; motif: string }>`, exactly 96 entries, stable across runs. `src` is root-absolute, e.g. `/proto/img/contour-03.svg`.

- [ ] **Step 1: Write the generator**

Create `scripts/gen-proto-images.mjs`:

```js
// Deterministic placeholder art for the community-page prototype.
// Run: node scripts/gen-proto-images.mjs
// Writes public/proto/img/*.svg and src/lib/proto-images.json.
// Deterministic by design: re-running must not churn git.
import { mkdirSync, rmSync, writeFileSync } from "node:fs";
import { join } from "node:path";

const IMG_DIR = join(process.cwd(), "public", "proto", "img");
const MANIFEST = join(process.cwd(), "src", "lib", "proto-images.json");

const RATIOS = [
  [1000, 1000],
  [1000, 1250],
  [1250, 1000],
  [1000, 1500],
  [1500, 1000],
  [1000, 1778],
];
const INKS = ["#15171a", "#1d2b2d", "#26331f", "#3a2b1f", "#1c2436", "#2f1f2b"];
const PAPERS = ["#f4f1ec", "#eef0ea", "#f2efe9", "#eceff1", "#f3efe8", "#e9ecea"];
const MOTIFS = ["contour", "cells", "lattice", "hatch", "spectrum", "strata"];
const PER_MOTIF = 16;

/** mulberry32 — small seeded PRNG, so output is stable run to run. */
function rng(seed) {
  let a = seed;
  return () => {
    a |= 0;
    a = (a + 0x6d2b79f5) | 0;
    let t = Math.imul(a ^ (a >>> 15), 1 | a);
    t = (t + Math.imul(t ^ (t >>> 7), 61 | t)) ^ t;
    return ((t ^ (t >>> 14)) >>> 0) / 4294967296;
  };
}

const r2 = (n) => Math.round(n * 100) / 100;

function contour(w, h, ink, rand) {
  const cx = w * (0.35 + rand() * 0.3);
  const cy = h * (0.35 + rand() * 0.3);
  const rings = 7 + Math.floor(rand() * 5);
  let out = "";
  for (let i = 0; i < rings; i++) {
    const f = (i + 1) / rings;
    const pts = [];
    for (let a = 0; a < 24; a++) {
      const th = (a / 24) * Math.PI * 2;
      const wob = 1 + (rand() - 0.5) * 0.18;
      pts.push(
        `${r2(cx + Math.cos(th) * w * 0.42 * f * wob)},${r2(cy + Math.sin(th) * h * 0.34 * f * wob)}`,
      );
    }
    out += `<polygon points="${pts.join(" ")}" fill="none" stroke="${ink}" stroke-width="${r2(1.1 + f * 1.6)}" opacity="${r2(0.3 + f * 0.5)}"/>`;
  }
  return out;
}

function cells(w, h, ink, rand) {
  let out = "";
  const n = 16 + Math.floor(rand() * 14);
  for (let i = 0; i < n; i++) {
    const cx = rand() * w;
    const cy = rand() * h;
    const rr = Math.min(w, h) * (0.04 + rand() * 0.12);
    out += `<circle cx="${r2(cx)}" cy="${r2(cy)}" r="${r2(rr)}" fill="none" stroke="${ink}" stroke-width="1.6" opacity="0.75"/>`;
    out += `<circle cx="${r2(cx + rr * 0.2)}" cy="${r2(cy - rr * 0.15)}" r="${r2(rr * 0.28)}" fill="${ink}" opacity="0.5"/>`;
  }
  return out;
}

function lattice(w, h, ink, rand) {
  const cols = 4 + Math.floor(rand() * 3);
  const rows = Math.max(3, Math.round((cols * h) / w));
  const nodes = [];
  for (let y = 0; y <= rows; y++) {
    for (let x = 0; x <= cols; x++) {
      nodes.push([
        (x / cols) * w * 0.8 + w * 0.1 + (rand() - 0.5) * (w / cols) * 0.35,
        (y / rows) * h * 0.8 + h * 0.1 + (rand() - 0.5) * (h / rows) * 0.35,
      ]);
    }
  }
  let out = "";
  for (let i = 0; i < nodes.length; i++) {
    for (let j = i + 1; j < nodes.length; j++) {
      const d = Math.hypot(nodes[i][0] - nodes[j][0], nodes[i][1] - nodes[j][1]);
      if (d < Math.max(w, h) / cols) {
        out += `<line x1="${r2(nodes[i][0])}" y1="${r2(nodes[i][1])}" x2="${r2(nodes[j][0])}" y2="${r2(nodes[j][1])}" stroke="${ink}" stroke-width="1.1" opacity="0.45"/>`;
      }
    }
  }
  for (const [x, y] of nodes) {
    out += `<circle cx="${r2(x)}" cy="${r2(y)}" r="${r2(Math.min(w, h) * 0.014)}" fill="${ink}" opacity="0.85"/>`;
  }
  return out;
}

function hatch(w, h, ink, rand) {
  const step = Math.min(w, h) / (18 + Math.floor(rand() * 14));
  const ang = -0.5 + rand();
  let out = `<g opacity="0.55">`;
  for (let i = -h; i < w + h; i += step) {
    out += `<line x1="${r2(i)}" y1="0" x2="${r2(i + h * ang)}" y2="${h}" stroke="${ink}" stroke-width="${r2(0.7 + rand() * 1.1)}"/>`;
  }
  out += `</g>`;
  const bx = w * (0.18 + rand() * 0.3);
  const by = h * (0.2 + rand() * 0.3);
  out += `<ellipse cx="${r2(bx)}" cy="${r2(by)}" rx="${r2(w * 0.26)}" ry="${r2(h * 0.2)}" fill="${ink}" opacity="0.82"/>`;
  return out;
}

function spectrum(w, h, ink, rand) {
  const n = 22 + Math.floor(rand() * 20);
  let out = "";
  for (let i = 0; i < n; i++) {
    const bw = w / n;
    const bh = h * (0.08 + Math.pow(rand(), 2) * 0.86);
    out += `<rect x="${r2(i * bw + bw * 0.18)}" y="${r2(h - bh)}" width="${r2(bw * 0.64)}" height="${r2(bh)}" fill="${ink}" opacity="${r2(0.35 + rand() * 0.5)}"/>`;
  }
  out += `<line x1="0" y1="${r2(h - 1)}" x2="${w}" y2="${r2(h - 1)}" stroke="${ink}" stroke-width="2"/>`;
  return out;
}

function strata(w, h, ink, rand) {
  const bands = 5 + Math.floor(rand() * 5);
  let out = "";
  let y = 0;
  for (let i = 0; i < bands; i++) {
    const bh = (h / bands) * (0.55 + rand() * 0.9);
    const pts = [`0,${r2(y)}`];
    for (let x = 0; x <= 10; x++) {
      pts.push(`${r2((x / 10) * w)},${r2(y + (rand() - 0.5) * h * 0.05)}`);
    }
    pts.push(`${w},${r2(y + bh)}`, `0,${r2(y + bh)}`);
    out += `<polygon points="${pts.join(" ")}" fill="${ink}" opacity="${r2(0.14 + (i / bands) * 0.55)}"/>`;
    y += bh;
  }
  return out;
}

const DRAW = { contour, cells, lattice, hatch, spectrum, strata };

rmSync(IMG_DIR, { recursive: true, force: true });
mkdirSync(IMG_DIR, { recursive: true });

const manifest = [];
let seed = 1;
for (const motif of MOTIFS) {
  for (let i = 0; i < PER_MOTIF; i++) {
    const rand = rng(seed++ * 2654435761);
    const [w, h] = RATIOS[(i + MOTIFS.indexOf(motif)) % RATIOS.length];
    const ink = INKS[Math.floor(rand() * INKS.length)];
    const paper = PAPERS[Math.floor(rand() * PAPERS.length)];
    const name = `${motif}-${String(i).padStart(2, "0")}.svg`;
    const svg =
      `<svg xmlns="http://www.w3.org/2000/svg" viewBox="0 0 ${w} ${h}" width="${w}" height="${h}">` +
      `<rect width="${w}" height="${h}" fill="${paper}"/>` +
      DRAW[motif](w, h, ink, rand) +
      `</svg>`;
    writeFileSync(join(IMG_DIR, name), svg, "utf8");
    manifest.push({ src: `/proto/img/${name}`, width: w, height: h, motif });
  }
}

writeFileSync(MANIFEST, JSON.stringify(manifest, null, 2) + "\n", "utf8");
console.log(
  `Wrote ${manifest.length} SVGs to public/proto/img and the manifest to src/lib/proto-images.json`,
);
```

- [ ] **Step 2: Run it**

```bash
node scripts/gen-proto-images.mjs
```

Expected: `Wrote 96 SVGs to public/proto/img and the manifest to src/lib/proto-images.json`

- [ ] **Step 3: Verify count, uniqueness and ratio spread**

```bash
node -e "const m=require('./src/lib/proto-images.json');console.log(m.length,new Set(m.map(i=>i.src)).size,new Set(m.map(i=>i.width+'x'+i.height)).size)"
```

Expected: `96 96 6` — 96 entries, all unique, spanning all six ratios.

- [ ] **Step 4: Verify determinism**

```bash
node scripts/gen-proto-images.mjs && git status --short public/proto src/lib/proto-images.json
```

Expected: no diff on the second run. If files show as modified, a `Math.random` leaked in — find it.

- [ ] **Step 5: Eyeball three of them**

Open `public/proto/img/contour-00.svg`, `cells-04.svg` and `spectrum-08.svg` in the browser pane. Expected: recognisable, visually distinct, in-palette art — not blank, not solid rectangles.

- [ ] **Step 6: Commit**

```bash
git add scripts/gen-proto-images.mjs public/proto/img src/lib/proto-images.json
git commit -m "chore: deterministic placeholder art generator for community prototype

Co-Authored-By: Claude Opus 5 <noreply@anthropic.com>"
```

---

### Task 3: Mock member data

**Files:**
- Create: `src/lib/proto-data.ts`

**Interfaces:**
- Consumes: `src/lib/proto-images.json` from Task 2.
- Produces:

```ts
export interface ProtoImage { src: string; width: number; height: number; }
export interface ProtoMember { id: string; name: string; role: string; description: string; tags: string[]; images: ProtoImage[]; }
export const PROTO_MIN_IMAGES = 1;         // a member with one image does not flip
export const PROTO_MAX_IMAGES = 3;         // the CSS has keyframes for 2 and 3 only
export const PROTO_MEMBERS: ProtoMember[]; // 24 members, 1–3 images each
```

`role` and `description` are the member-level caption that sits under the image and does **not** flip. Images carry no text. `images.length` is 1, 2 or 3 — never 0, never 4 — and the card reads that length to pick its keyframe.

- [ ] **Step 1: Write the data module**

Create `src/lib/proto-data.ts`:

```ts
// Mock data for the /proto/community visual prototype. No Firebase, no network.
// Deliberately deterministic so screenshots are comparable between runs.
import images from "./proto-images.json";

export interface ProtoImage {
  src: string;
  width: number;
  height: number;
}

export interface ProtoMember {
  id: string;
  name: string;
  /** Member-level caption line 1. Static — does not flip with the images. */
  role: string;
  /** Member-level caption line 2. Static — does not flip with the images. */
  description: string;
  tags: string[];
  images: ProtoImage[];
}

/** A member with one image does not flip at all. */
export const PROTO_MIN_IMAGES = 1;
/** ProtoMemberCard only has keyframes for 2 and 3 slots — do not exceed this. */
export const PROTO_MAX_IMAGES = 3;

/**
 * How many images each member has, cycled deterministically. Weighted toward
 * 3 but with real 1s and 2s in the mix, because a directory where every card
 * behaves identically would hide exactly the case most likely to look wrong.
 */
const IMAGE_COUNTS = [3, 2, 3, 1, 2, 3, 3, 2];

const NAMES = [
  "Anna Vogel", "Luca Bernasconi", "Mira Steinmann", "Jonas Fehr",
  "Sophie Rüegg", "Elias Brunner", "Nadia Kaufmann", "Timo Bachmann",
  "Lea Zimmermann", "Rafael Moser", "Ines Hofmann", "Samuel Grob",
  "Clara Wyss", "Nico Ammann", "Yara Frei", "Dominik Suter",
  "Elena Baumgartner", "Fabio Lüthi", "Hanna Widmer", "Ruben Achermann",
  "Marta Egli", "Silvan Hurni", "Nora Blattmann", "Aaron Studer",
];

const ROLES = [
  "Scientific illustrator", "Molecular animator", "Data designer",
  "Medical illustrator", "Research group", "Science journalist",
  "Infographic designer", "Museum exhibit designer",
];

const TAGS = [
  "molecular", "anatomy", "botany", "data viz", "editorial", "3D",
  "animation", "microscopy", "geology", "neuroscience", "print", "exhibition",
  "immunology", "climate", "cartography", "patient education",
];

/** Member-level caption line 2 — realistic length matters more than the words. */
const DESCRIPTIONS = [
  "Ink and digital colour for journals and museums",
  "Molecular and cellular processes, Blender and Cycles",
  "Figures and data graphics for peer-reviewed work",
  "Surgical and anatomical illustration, Zürich",
  "Cryo-EM structures redrawn for teaching",
  "Long-form science reporting and explainers",
  "Editorial infographics, print and screen",
  "Exhibition graphics and interpretive panels",
  "Botanical plates, watercolour and graphite",
  "Climate and Earth-system visualisation",
  "Patient-facing material in plain language",
  "Cartography for field research",
];

/** Deterministic index helper — no Math.random, so output is stable. */
const pick = <T>(arr: T[], n: number): T => arr[n % arr.length];

export const PROTO_MEMBERS: ProtoMember[] = NAMES.map((name, i) => ({
  id: `proto-${String(i).padStart(2, "0")}`,
  name,
  role: pick(ROLES, i * 3 + 1),
  description: pick(DESCRIPTIONS, i * 5 + 2),
  tags: [pick(TAGS, i * 5), pick(TAGS, i * 5 + 3), pick(TAGS, i * 5 + 7)],
  // Stride by a co-prime of the manifest length so members get varied motifs.
  images: Array.from({ length: pick(IMAGE_COUNTS, i) }, (_, s) => {
    const img = images[(i * 7 + s * 23) % images.length];
    return { src: img.src, width: img.width, height: img.height };
  }),
}));
```

- [ ] **Step 2: Typecheck**

```bash
npx tsc --noEmit -p tsconfig.json
```

Expected: exit 0, no errors mentioning `proto-data.ts`. If it complains about importing JSON, add `"resolveJsonModule": true` to `tsconfig.json` — Astro's base config normally sets it already.

- [ ] **Step 3: Commit**

Image-distinctness is verified from the DOM in Task 5, where it is easier to check reliably than through a TypeScript entry point.

```bash
npm run lint
git add src/lib/proto-data.ts
git commit -m "chore: mock member data for community prototype

Co-Authored-By: Claude Opus 5 <noreply@anthropic.com>"
```

---

### Task 4: The card — flip and grow

This is the risky task. Build and review it against a plain single column, before the grid exists to hide problems.

**Files:**
- Create: `src/components/proto/ProtoMemberCard.astro`
- Create: `src/pages/proto/card.astro` (scratch harness — deleted in Task 6)
- Create: `.claude/launch.json`

**Interfaces:**
- Consumes: `ProtoMember` from `src/lib/proto-data.ts`.
- Produces: `<ProtoMemberCard member={ProtoMember} index={number} />`. `index` drives the deterministic flip-phase offset so cards do not flip in lockstep. Default `0`.

- [ ] **Step 1: Write the component**

Create `src/components/proto/ProtoMemberCard.astro`:

```astro
---
import type { ProtoMember } from "../../lib/proto-data.ts";

interface Props {
  member: ProtoMember;
  index?: number;
}

const { member, index = 0 } = Astro.props;

// The frame keeps the FIRST image's ratio for the whole cycle; every slot is
// object-fit: cover. If the frame resized per slot, the grid would reflow on
// every flip.
const frame = member.images[0];

// 1, 2 or 3 — drives both the keyframe choice and the per-slot delay.
// A one-image card is static; the CSS has no 1-slot keyframe by design.
const slots = member.images.length;

// Negative, deterministic phase so cards start mid-cycle and out of step with
// each other. 9.2s over 3 slots ≈ 3.1s per image; over 2 slots, 4.6s.
const CYCLE = 9.2;
const phase = -((index * 1.37) % CYCLE);
---

<article class="pcard" data-slots={slots} style={`--phase:${phase.toFixed(2)}s;--slots:${slots}`}>
  <p class="pcard__name">{member.name}</p>

  <div class="pcard__body">
    <div class="pcard__frame" style={`aspect-ratio:${frame.width} / ${frame.height}`}>
      {
        member.images.map((img, i) => (
          <img
            class="pcard__img"
            style={`--i:${i}`}
            src={img.src}
            width={img.width}
            height={img.height}
            alt=""
            loading="lazy"
            decoding="async"
          />
        ))
      }
    </div>

    <ul class="pcard__tags">
      {member.tags.map((tag) => <li class="pcard__tag">{tag}</li>)}
    </ul>
  </div>

  <div class="pcard__caption">
    <span class="pcard__role">{member.role}</span>
    <span class="pcard__desc">{member.description}</span>
  </div>
</article>

<style>
  .pcard {
    --flip-cycle: 9.2s;
    display: flex;
    flex-direction: column;
    gap: 0.5rem;
    /* Pivot for the GSAP scale in ProtoGrid. Declared here so the effect is
       identical whoever drives the transform. */
    transform-origin: 50% 50%;
  }

  /* ── Name ─────────────────────────────────────────────── */
  .pcard__name {
    margin: 0;
    font-family: "Archivo", sans-serif;
    font-size: 0.95rem;
    font-weight: 700;
    letter-spacing: -0.01em;
    color: var(--color-dark);
  }

  /* ── Image + tag rail ─────────────────────────────────── */
  .pcard__body {
    display: flex;
    align-items: flex-start;
    gap: 0.5rem;
  }

  .pcard__frame {
    position: relative;
    flex: 1 1 auto;
    min-width: 0;
    overflow: hidden;
    border: 1.5px solid var(--color-border);
    border-radius: var(--radius-sm);
    /* Token, not raw #fff — the token-only constraint applies here too. */
    background: var(--color-bg);
  }

  .pcard__img {
    position: absolute;
    inset: 0;
    width: 100%;
    height: 100%;
    object-fit: cover;
    opacity: 0;
    /* Default is the 2-slot keyframe; 1 and 3 override below. The delay is
       shared across every count by dividing the cycle by --slots. */
    animation: pcard-flip-2 var(--flip-cycle) linear infinite;
    animation-delay: calc(var(--phase) - (var(--flip-cycle) / var(--slots)) * var(--i));
  }

  /* One image: nothing to flip to. Show it and stop. */
  .pcard[data-slots="1"] .pcard__img {
    animation: none;
    opacity: 1;
  }

  .pcard[data-slots="3"] .pcard__img {
    animation-name: pcard-flip-3;
  }

  .pcard__tags {
    flex: 0 0 auto;
    display: flex;
    flex-direction: column;
    gap: 3px;
    margin: 0;
    padding: 0;
    list-style: none;
  }

  .pcard__tag {
    font-family: "Archivo", sans-serif;
    font-size: 0.62rem;
    font-weight: 500;
    line-height: 1;
    letter-spacing: 0.04em;
    text-transform: uppercase;
    padding: 4px 3px;
    color: var(--color-muted);
    border: 1px solid var(--color-border);
    border-radius: var(--radius-xs);
    white-space: nowrap;
    writing-mode: vertical-rl;
  }

  /* ── Member caption — static, does not flip ───────────── */
  .pcard__caption {
    display: flex;
    flex-direction: column;
    gap: 1px;
    font-family: "Archivo", sans-serif;
  }

  .pcard__role {
    font-size: 0.78rem;
    font-weight: 600;
    line-height: 1.3;
    color: var(--color-dark);
  }

  .pcard__desc {
    font-size: 0.74rem;
    font-weight: 400;
    line-height: 1.35;
    color: var(--color-muted);
    /* Two lines then ellipsis, so varying description lengths cannot make the
       grid rhythm ragged. */
    display: -webkit-box;
    -webkit-line-clamp: 2;
    -webkit-box-orient: vertical;
    overflow: hidden;
  }

  /* Each slot is visible for 1/N of the cycle, then fades out over the last
     ~16% of its own window. Slot i is offset by -cycle/N * i, which lines its
     fade-out up exactly with slot i+1's fade-in — that overlap IS the
     crossfade, and it guarantees exactly one slot at full opacity at any
     instant. The stop percentages are the only thing that cannot be
     parameterised, hence one block per count.

     N=2 → window 50%, fade 8%.  N=3 → window 33.333%, fade 5.333%. */
  @keyframes pcard-flip-2 {
    0% { opacity: 1; }
    42% { opacity: 1; }
    50% { opacity: 0; }
    92% { opacity: 0; }
    100% { opacity: 1; }
  }

  @keyframes pcard-flip-3 {
    0% { opacity: 1; }
    28% { opacity: 1; }
    33.333% { opacity: 0; }
    94.667% { opacity: 0; }
    100% { opacity: 1; }
  }

  /* NO hover pause. `animation-play-state: paused` can freeze the crossfade
     mid-ramp and hold two images at partial opacity for as long as the pointer
     rests there — a persistent double exposure, which is the one invariant this
     component exists to guarantee. Reachable on ~16% of the cycle. A transient
     blend during a ramp is normal; an indefinitely held one is a defect, and
     CSS cannot express "pause only outside the ramps". */

  /* ── Grow on approach to the top ──────────────────────── */
  /* Deliberately NOT here. The scale is driven by GSAP ScrollTrigger in
     ProtoGrid.astro, which needs the scroller and the per-column context.
     This component only declares the pivot, so the scale is predictable no
     matter what writes the transform. Cards render at full size with no JS —
     that is the correct mobile and no-JS state, not a broken one. */

  @media (prefers-reduced-motion: reduce) {
    /* Media queries add NO specificity, so this has to out-rank the
       `.pcard[data-slots="3"] .pcard__img` rule above on its own merits or
       `animation-name` stays `pcard-flip-3`. Count it as served, after Astro
       appends its `[data-astro-cid-…]` scope attribute to every compound:
         .pcard[data-slots="3"] .pcard__img  ->  2 classes + 1 attr + 2 scope = (0,5,0)
         .pcard__img                         ->  1 class  +          1 scope = (0,2,0)  loses
         .pcard .pcard__img                  ->  2 classes +         2 scope = (0,4,0)  STILL loses
         .pcard[data-slots] .pcard__img      ->  2 classes + 1 attr + 2 scope = (0,5,0)  ties, wins on source order
       Hence the attribute selector. Verified in the CSSOM, not reasoned about:
       `animation-name` computes to `none` on a data-slots="3" card. */
    .pcard[data-slots] .pcard__img {
      animation: none;
    }
    /* Bare selector is fine here and matches what shipped: served (0,3,0)
       beats the base `opacity: 0` at (0,2,0), and the only higher-specificity
       opacity rule sets 1 anyway. */
    .pcard__img:first-of-type {
      opacity: 1;
    }
  }
</style>
```

- [ ] **Step 2: Write the scratch harness**

Create `src/pages/proto/card.astro`:

```astro
---
import Layout from "../../layouts/Layout.astro";
import ProtoMemberCard from "../../components/proto/ProtoMemberCard.astro";
import { PROTO_MEMBERS } from "../../lib/proto-data.ts";
---

<Layout title="Proto card" noindex={true}>
  <div style="display:flex;flex-direction:column;gap:3rem;max-width:360px;margin:0 auto;padding:4rem 0;">
    {/* First six deliberately: their image counts run 3, 2, 3, 1, 2, 3 — so
        every flip branch, including the static one-image card, is on screen. */}
    {PROTO_MEMBERS.slice(0, 6).map((m, i) => <ProtoMemberCard member={m} index={i} />)}
  </div>
</Layout>
```

- [ ] **Step 3: Add the dev-server config and open the page**

Create `.claude/launch.json`:

```json
{
  "version": "0.0.1",
  "configurations": [
    {
      "name": "vscn-dev",
      "runtimeExecutable": "npm",
      "runtimeArgs": ["run", "dev"],
      "port": 4321
    }
  ]
}
```

Start the `vscn-dev` preview and navigate to `/proto/card`.

- [ ] **Step 4: Five explicit gates — each is pass/fail, do not proceed on "looks fine"**

**4a. Console is clean.** `read_console_messages` with `onlyErrors: true` → empty.

**4b. Exactly one image visible per card at any instant.**

```js
[...document.querySelectorAll('.pcard')].map(c =>
  [...c.querySelectorAll('.pcard__img')]
    .filter(i => +getComputedStyle(i).opacity > 0.5).length)
```

Expected: every entry `1` — for 1-, 2- and 3-image cards alike. A `0` means the phase maths is wrong or `--slots` is not reaching the CSS. Sample repeatedly over ~10 s.

**Know what this gate can and cannot prove.** Because the ramps are complementary, the pair sums to ~1 at every instant, so **at most one slot can ever exceed 0.5 by construction** — running, paused, or frozen mid-ramp. This metric therefore proves there is no *gap* in the cycle (never zero visible images), and it can never report a `2`. It is **not** evidence about double exposure: a held blend at 0.6 / 0.4 would score `1` just the same. To test for a held blend you need a different check — confirm no rule can pause the animation, and read `animationPlayState` directly.

Then confirm the static case specifically:

```js
const one = document.querySelector('.pcard[data-slots="1"] .pcard__img');
[getComputedStyle(one).animationName, getComputedStyle(one).opacity]
```

Expected: `["none", "1"]`. A single-image card must never fade.

**4c. The frame does not resize while flipping.**

```js
const f = document.querySelector('.pcard__frame');
const a = f.getBoundingClientRect().height;
setTimeout(() => console.log(a, f.getBoundingClientRect().height), 3000);
```

Expected: two identical values. If they differ, `aspect-ratio` / `object-fit` is not holding the box.

**4d. No scroll motion yet — and that is correct.** This task ships the card alone; the grow arrives in Task 5. Confirm the baseline is clean rather than accidentally animated:

```js
getComputedStyle(document.querySelectorAll('.pcard')[3]).transform
```

Expected: `none` or `matrix(1, 0, 0, 1, 0, 0)`. Cards must sit at **full** size — the no-JS and mobile state has to look finished, not shrunken.

**4e. Reduced motion.** Emulate `prefers-reduced-motion: reduce`, reload, and confirm: the first image is visible, nothing flips, cards render at full scale and full opacity.

- [ ] **Step 5: Screenshot and commit**

Take a screenshot for the record. `.claude/launch.json` is **not** gitignored in this repo, so commit it rather than leaving it as standing untracked noise.

```bash
npm run lint
git add src/components/proto/ProtoMemberCard.astro src/pages/proto/card.astro .claude/launch.json
git commit -m "feat(proto): community card with image flip and scroll-driven grow

Co-Authored-By: Claude Opus 5 <noreply@anthropic.com>"
```

---

### Task 5: The irregular offset grid

**Files:**
- Create: `src/components/proto/ProtoGrid.astro`
- Modify: `src/pages/proto/card.astro`

**Interfaces:**
- Consumes: `ProtoMemberCard` (Task 4), `ProtoMember` (Task 3).
- Produces: `<ProtoGrid members={ProtoMember[]} cols={number} />`, `cols` defaulting to `3`.

- [ ] **Step 1: Write the grid**

Create `src/components/proto/ProtoGrid.astro`:

```astro
---
import type { ProtoMember } from "../../lib/proto-data.ts";
import ProtoMemberCard from "./ProtoMemberCard.astro";

interface Props {
  members: ProtoMember[];
  cols?: number;
}

const { members, cols = 3 } = Astro.props;

// Round-robin into fixed columns. Flex columns (rather than grid auto-flow or
// CSS multicol at desktop) are what let each column carry its own vertical
// offset while each card stays a single transformable box for the scroll
// animation.
//
// Caveat: DOM order then runs down each column, so visual reading order and
// DOM order diverge on desktop. Acceptable for a visual prototype; the real
// page wants either a masonry grid or an ordered single column. Noted in the
// plan's out-of-scope list.
const columns: ProtoMember[][] = Array.from({ length: cols }, () => []);
members.forEach((m, i) => columns[i % cols].push(m));

// Unequal column widths, so the underlying grid is already off-square before
// any card moves.
const TEMPLATES: Record<number, string> = {
  2: "1.08fr 0.92fr",
  3: "1.12fr 0.82fr 1.06fr",
  4: "1fr 0.86fr 1.1fr 0.9fr",
};
const template = TEMPLATES[cols] ?? `repeat(${cols}, minmax(0, 1fr))`;

// Deterministic irregularity, as one table rather than three so the pairings
// stay sane: `w` changes the card's footprint, `dx`/`dy` move it off the
// column axis. Because `translate` does not affect layout, a card can lean
// into a gutter or overlap a neighbour with no reflow and no gap left behind.
// dx is a percentage of the card's OWN width, so wide cards are deliberately
// paired with small nudges — every combination here stays inside ±11% of the
// column, which reads as hand-placed rather than broken.
const VARIANTS = [
  { w: "100%", dx: "0%", dy: "0rem" },
  { w: "78%", dx: "16%", dy: "1.5rem" },
  { w: "92%", dx: "-6%", dy: "-1rem" },
  { w: "68%", dx: "26%", dy: "2.75rem" },
  { w: "100%", dx: "0%", dy: "0.5rem" },
  { w: "84%", dx: "-13%", dy: "-1.75rem" },
  { w: "72%", dx: "12%", dy: "2rem" },
  { w: "96%", dx: "3%", dy: "-0.5rem" },
];
---

<div class="pgrid" style={`--pcols:${cols};--ptemplate:${template}`}>
  {
    columns.map((col, ci) => (
      <div class="pgrid__col">
        {
          col.map((m, ri) => {
            const v = VARIANTS[(ci * 3 + ri * 5) % VARIANTS.length];
            return (
              <div class="pgrid__cell" style={`--cw:${v.w};--dx:${v.dx};--dy:${v.dy}`}>
                <ProtoMemberCard member={m} index={ci * 8 + ri} />
              </div>
            );
          })
        }
      </div>
    ))
  }
</div>

<style>
  .pgrid {
    --pgap: 2.5rem;
    display: grid;
    grid-template-columns: var(--ptemplate);
    gap: var(--pgap);
    align-items: start;
    padding-block: 2.5rem 6rem;
    /* Cards nudged outward must not create a horizontal scrollbar. `clip`
       rather than `hidden` on purpose: `hidden` would make this a scroll
       container, which ScrollTrigger would then have to reason about when
       resolving positions against .page-wrap. `clip` does not. */
    overflow-x: clip;
  }

  .pgrid__col {
    display: flex;
    flex-direction: column;
    gap: var(--pgap);
    min-width: 0;
  }

  .pgrid__cell {
    min-width: 0;
    width: var(--cw);
    /* Layout-free displacement. Separate longhand from the `scale` the card
       animates, so the two compose instead of overwriting each other. */
    translate: var(--dx) var(--dy);
  }

  /* Staggered column starts — deliberately not a linear multiple, so the
     rhythm reads as irregular rather than mechanical. */
  .pgrid__col:nth-child(2) {
    margin-top: 7rem;
  }
  .pgrid__col:nth-child(3) {
    margin-top: 2.5rem;
  }

  /* Mobile: two offset columns. `display: contents` lifts every cell out of
     its flex column into a single multicol flow, so all members appear in a
     2-up arrangement with no member dropped and no DOM change. Cards remain
     single boxes, so the scroll animation is unaffected. */
  @media (--bp-mobile) {
    .pgrid {
      --pgap: 1.25rem;
      display: block;
      columns: 2;
      column-gap: var(--pgap);
      padding-block: 1.5rem 4rem;
    }
    .pgrid__col {
      display: contents;
    }
    .pgrid__cell {
      width: 100%;
      /* Jitter off on mobile — two narrow columns have no room for it. The
         offset look comes for free from cards of differing height in the
         multicol flow, which is what the sketch's mobile half shows. */
      translate: none;
      break-inside: avoid;
      margin-bottom: var(--pgap);
    }
  }
</style>
```

- [ ] **Step 2: Add the desktop GSAP scroll layer**

Append this `<script>` to `src/components/proto/ProtoGrid.astro`, after the `<style>` block:

```astro
<script>
  // Desktop-only scroll motion, two jobs:
  //   1. Cards scale up as they rise toward the top of the scrollport.
  //   2. Columns drift at different rates — the parallax is what actually
  //      destroys the grid feel; static jitter alone still reads as columns.
  //
  // Width is checked BEFORE the import, so mobile downloads no GSAP at all
  // (~44 KB gzip saved). gsap and ScrollTrigger are already dependencies.
  const DESKTOP = "(min-width: 768px)";
  const REDUCED = "(prefers-reduced-motion: reduce)";

  // Per-column drift in px across the whole scroll. Mixed signs and unequal
  // magnitudes on purpose — matching speeds would just look like a slow page.
  const DRIFT = [-70, 45, -28, 60];

  // Loose type: gsap's global namespace types are not reliably in scope inside
  // a scoped Astro script, and revert() is all we need off it.
  let mm: { revert: () => void } | null = null;

  async function build() {
    if (mm) return;
    if (!document.querySelector(".pgrid")) return;
    if (!window.matchMedia(DESKTOP).matches) return;
    if (window.matchMedia(REDUCED).matches) return;

    const [{ default: gsap }, { ScrollTrigger }] = await Promise.all([
      import("gsap"),
      import("gsap/ScrollTrigger"),
    ]);
    gsap.registerPlugin(ScrollTrigger);

    // The scroll container is .page-wrap, never the window — body is
    // overflow:hidden. Telling ScrollTrigger explicitly is the whole reason
    // this is more robust than a CSS view() timeline.
    const scroller = ".page-wrap";

    mm = gsap.matchMedia();
    // Tweens and ScrollTriggers created inside a matchMedia context are
    // reverted and killed automatically, so no manual cleanup is needed here.
    mm.add(DESKTOP, () => {
      // 1. Grow on approach. Starts when the card's top enters at the bottom
      //    of the scrollport, completes when its top reaches 38% from the top,
      //    so cards are already full size in the upper region rather than
      //    still swelling as they leave. scrub ties progress to scroll
      //    position instead of to elapsed time.
      gsap.utils.toArray<HTMLElement>(".pcard").forEach((card) => {
        gsap.fromTo(
          card,
          { scale: 0.84, opacity: 0.5 },
          {
            scale: 1,
            opacity: 1,
            ease: "none",
            scrollTrigger: { scroller, trigger: card, start: "top bottom", end: "top 38%", scrub: true },
          },
        );
      });

      // 2. Column parallax. Drives .pgrid__col, while the per-card jitter sets
      //    `translate` on .pgrid__cell — different elements, so they compose.
      gsap.utils.toArray<HTMLElement>(".pgrid__col").forEach((col, i) => {
        gsap.to(col, {
          y: DRIFT[i % DRIFT.length],
          ease: "none",
          scrollTrigger: { scroller, trigger: ".pgrid", start: "top bottom", end: "bottom top", scrub: true },
        });
      });
    });

    // Archivo is a self-hosted variable font; if it lands after first paint,
    // every measured trigger position is stale.
    document.fonts?.ready.then(() => ScrollTrigger.refresh());
  }

  function teardown() {
    mm?.revert();
    mm = null;
  }

  document.addEventListener("astro:page-load", build);
  document.addEventListener("astro:before-swap", teardown);

  // Crossing the breakpoint on resize starts or stops the whole layer.
  window.matchMedia(DESKTOP).addEventListener("change", () => {
    teardown();
    build();
  });
</script>
```

- [ ] **Step 3: Point the harness at the grid**

Replace `src/pages/proto/card.astro` entirely:

```astro
---
import Layout from "../../layouts/Layout.astro";
import ProtoGrid from "../../components/proto/ProtoGrid.astro";
import { PROTO_MEMBERS } from "../../lib/proto-data.ts";
---

<Layout title="Proto grid" noindex={true} wide={true}>
  <ProtoGrid members={PROTO_MEMBERS} />
</Layout>
```

- [ ] **Step 4: Verify layout on desktop (1280×800)**

All four must pass:

```js
document.querySelectorAll('.pcard').length
```
Expected: `24` — no member dropped.

```js
document.documentElement.scrollWidth <= window.innerWidth
```
Expected: `true` — no horizontal page scroll.

```js
new Set([...document.querySelectorAll('.pcard__img')].map(i => i.getAttribute('src'))).size
```
Expected: `40` or more. This is the deferred check from Task 3 — total rendered images is now ~57, not 96, because counts vary. Under 40 means members are sharing too many pictures; change the `i * 7 + s * 23` stride in `proto-data.ts` and re-run.

```js
[...document.querySelectorAll('.pcard')].reduce((a, c) => {
  const n = c.dataset.slots; a[n] = (a[n] || 0) + 1; return a; }, {})
```
Expected: keys `1`, `2` and `3` all present, and **no key `0` or `4`**. This proves the variable-count path is real and that every branch of the flip CSS is actually being exercised on the page.

```js
new Set([...document.querySelectorAll('.pgrid__cell')]
  .map(c => Math.round(c.getBoundingClientRect().left))).size
```
Expected: **more than `3`** — this is the whole point of the jitter. Exactly `3` means every card is still sitting flush on its column axis, so `--dx` is not being applied: check that `translate` on `.pgrid__cell` is not being overwritten by the card's `scale` animation (they are separate longhands and must not have been merged into a `transform`).

- [ ] **Step 5: Verify the GSAP layer on desktop**

Four gates. The first replaces the assumption the earlier CSS-only version had to make:

**5a. ScrollTrigger bound to the right scroller and is actually live.**

**Do not probe a card that is high on the page.** An earlier version of this gate named `.pcard[8]`, which is the *head of a column* — already past its animation end at `scrollTop 0`, so it reports the identity matrix at both sample points even when everything works. That gate could not fail. Pick a card that is genuinely mid-viewport, and assert the trigger's own state rather than inferring it from a transform delta:

```js
// 1. Name the scroller instead of inferring it.
const sts = ScrollTrigger.getAll();
console.log(sts.length, new Set(sts.map(t => t.scroller?.className)).size,
            sts.every(t => t.scroller === document.querySelector('.page-wrap')));

// 2. Prove liveness on a card that is actually mid-range. Pick it against the
//    SCROLLER's clientHeight, not innerHeight — same reason as the note below.
const wrap = document.querySelector('.page-wrap');
const c = [...document.querySelectorAll('.pcard')]
  .find(el => el.getBoundingClientRect().top > wrap.clientHeight * 0.6);
const before = getComputedStyle(c).transform;
wrap.scrollTop += 600;
requestAnimationFrame(() => console.log(before, getComputedStyle(c).transform));
```

Expected: every trigger's `scroller` **is** the `.page-wrap` element, and the two matrices differ. Note that with a custom `scroller`, ScrollTrigger resolves percentage offsets such as `top 38%` against the **scroller's** `clientHeight`, not the window's — so do not check the arithmetic against `innerHeight`.

**5b. Columns drift independently.** This is the parallax, and it is the thing CSS could not do:

```js
document.querySelector('.page-wrap').scrollTop += 900;
requestAnimationFrame(() =>
  console.log([...document.querySelectorAll('.pgrid__col')]
    .map(c => getComputedStyle(c).transform)));
```

Expected: three **different** transforms. Three identical values means `DRIFT` is not being applied per index.

**5c. Console clean, and no duplicate triggers after navigation.** Navigate away and back (the ClientRouter swap), then:

```js
document.querySelectorAll('.pcard').length
```

Expected: `24`, not `48`. A doubled count means `teardown` is not firing on `astro:before-swap` and triggers are leaking.

**5d. The effect reads at a glance.** Scroll to the middle and screenshot. Cards low in the viewport should be visibly smaller and paler than cards near the top. If the difference is imperceptible, drop `scale: 0.84` to `0.78`; if it is nauseating, raise it.

- [ ] **Step 6: Verify mobile is untouched and GSAP-free (375×812)**

Resize to the mobile preset, reload, then:

```js
document.querySelectorAll('.pcard').length
```
Expected: `24` — no member dropped by the multicol reflow.

```js
performance.getEntriesByType('resource').filter(r => /gsap|ScrollTrigger/i.test(r.name)).length
```
Expected: `0`. **This is the gate that proves the width check runs before the import.** A non-zero result means mobile is paying 44 KB for motion it never sees.

```js
getComputedStyle(document.querySelectorAll('.pcard')[3]).transform
```
Expected: `none` or the identity matrix — cards at full size, since mobile has no grow by design.

- [ ] **Step 7: Verify reduced motion kills the whole layer**

Emulate `prefers-reduced-motion: reduce` at desktop width, reload, then re-run the resource check from Step 6. Expected: `0` GSAP resources, cards at full size, images not flipping. Reduced motion must prevent the *download*, not just the animation.

- [ ] **Step 8: Commit**

```bash
npm run lint
git add src/components/proto/ProtoGrid.astro src/pages/proto/card.astro
git commit -m "feat(proto): irregular offset card grid, 3-up desktop / 2-up mobile

Co-Authored-By: Claude Opus 5 <noreply@anthropic.com>"
```

---

### Task 6: The real route, sitemap exclusion, full-build verification

**Files:**
- Create: `src/pages/proto/community.astro`
- Delete: `src/pages/proto/card.astro`
- Modify: `astro.config.mjs` (sitemap `filter`)

- [ ] **Step 1: Write the route**

Create `src/pages/proto/community.astro`:

```astro
---
import Layout from "../../layouts/Layout.astro";
import ProtoGrid from "../../components/proto/ProtoGrid.astro";
import { PROTO_MEMBERS } from "../../lib/proto-data.ts";
---

<Layout
  title="Community — VSCN (prototype)"
  description="Visual prototype of the VSCN community page. Mock data."
  noindex={true}
  wide={true}
>
  <div class="proto-head">
    <span>{PROTO_MEMBERS.length} members</span>
    <span>prototype — mock data</span>
  </div>

  <ProtoGrid members={PROTO_MEMBERS} />
</Layout>

<style>
  .proto-head {
    display: flex;
    justify-content: space-between;
    align-items: baseline;
    gap: 1rem;
    padding-top: 1.25rem;
    border-top: 1px solid var(--color-border);
    font-family: "Archivo", sans-serif;
    font-weight: 500;
    font-size: 0.7rem;
    letter-spacing: 0.04em;
    text-transform: uppercase;
    color: var(--color-muted);
  }
</style>
```

- [ ] **Step 2: Remove the scratch harness**

```bash
rm src/pages/proto/card.astro
```

- [ ] **Step 3: Exclude the prototype from the sitemap**

The sitemap `filter` in `astro.config.mjs` is a blocklist, so `/proto/*` would be indexed by default. Add one clause so it reads:

```js
    sitemap({
      filter: (page) =>
        !page.includes('/proto') &&
        !page.includes('/profile') &&
        !page.includes('/verify-email') &&
        !page.includes('/auth/') &&
        !page.includes('/signup'),
    }),
```

- [ ] **Step 4: Full production build**

```bash
npm run build
```

Expected: exit 0. This is the real gate for the no-Firebase constraint: `community.astro` swallows its own Admin-SDK failure, but any accidental Firebase import inside the proto tree surfaces here.

- [ ] **Step 5: Confirm the page is genuinely non-indexed**

```bash
grep -c "proto" dist/sitemap-0.xml || echo "0 — correctly excluded"
```

Expected: `0 — correctly excluded` (grep exits non-zero on no match).

```bash
grep -o 'content="noindex, nofollow"' dist/proto/community/index.html
```

Expected: one match.

- [ ] **Step 6: Re-verify the built page in the browser**

Navigate to `/proto/community`. Re-run gates 4a–4e from Task 4 and Steps 4–7 from Task 5 — in particular the mobile "zero GSAP resources" check, since a production build could plausibly hoist the dynamic import into a shared chunk. Screenshot desktop (1280×800) and mobile (375×812) for the record.

- [ ] **Step 7: Commit**

```bash
npm run lint
git add astro.config.mjs src/pages/proto
git commit -m "feat(proto): /proto/community route, excluded from sitemap

Co-Authored-By: Claude Opus 5 <noreply@anthropic.com>"
```

---

## Out of scope — deliberately absent

Named so nobody mistakes their absence for an oversight:

- **Filtering, sorting, tagging.** Your own framing: only fully usable with these. They need the real data layer and a decision on URL state.
- **Artist / portfolio detail pages.** The cards link nowhere. Needs the slug decision first.
- **Real Firestore data and `getStaticPaths`.** Mock data only.
- **Dark mode.** Cheap now that tokens are centralised, expensive after two more pages of hand-written CSS — worth deciding before this graduates.
- **The View Transition morph** from card to artist page. Needs the artist page to exist.
- **Accessible DOM order on desktop.** The round-robin columns diverge visual and DOM order; flagged in `ProtoGrid.astro`.
- **The card's own accessibility.** Every image carries `alt=""` (decorative) and the member name is a `<p>`, not a heading — so the card's primary content is invisible to assistive technology and the page has no heading structure. Acceptable for a throwaway visual prototype; **must not survive into the real component.** Graduation needs a real heading level and either meaningful `alt` text or the caption wired up as an accessible name.
- **Nav headroom is a residual, not a reservation.** `.pgrid`'s `padding-block` top (2.5rem) minus column 1's drift-at-rest happens to leave roughly 27px of clearance below the sticky nav. It works only because no first-in-column card draws a negative `dy`, and because the drift at rest is a fraction of its target. At `cols=4` the columns halve in height, the at-rest drift roughly doubles, and clearance falls to about 16px. Nothing reserves the nav's space deliberately — if the nav or the column count changes, re-check it.
- **Column drift is not accounted for in the card triggers.** Each card's `start`/`end` is cached from its untransformed position, while its column is translated by up to 70px on scroll — so `end: "top 38%"` is only nominally where the grow completes, diverging by up to 70px of a ~450px range. Cosmetic; GSAP reverts scrubbed tweens before measuring, so the baseline is correct.
- **Crossfade luminance dip.** Two stacked images with complementary opacity ramps sum to opacity 1 but not to constant perceived luminance, so the blend dips roughly 25% toward the frame background at the ramp midpoint — about 0.74s at N=2, 0.49s at N=3. Invisible on these flat placeholders; if it reads as a flash on real artwork, the fix is a hard cut (`steps(1)`) or animating `z-index` so the incoming image covers an opaque outgoing one instead of dissolving through it.
- **i18n.** English-only; strings are inline, not in `translations.ts`.
- **`getImage` optimisation.** The placeholders are SVG, which Astro's image pipeline does not process anyway.
- **Removing the dead Space Mono registration** from `astro.config.mjs`. It is downloaded and served but referenced nowhere in `src`, and this prototype no longer plans to use it — so it is now unambiguously dead weight. A separate one-line commit, not part of this plan.

## Graduation path

When the look is signed off, the prototype becomes the real page by:

1. Replacing `PROTO_MEMBERS` with the Admin-SDK fetch already written in `src/pages/[...lang]/community.astro`.
2. Mapping `role` → `PublicProfileDoc.role` and `description` → `bio` (truncated), since the caption is member-level. **No new Firestore field is needed** — this is the payoff of decision 1.
3. Swapping `<img src>` for build-time `getImage`, exactly as `MemberCard.astro` already does for gallery thumbs.
4. Clamping real galleries to the 1–3 range the CSS supports. `MAX_GALLERY_IMAGES` in `src/lib/gallery.ts` is 8, so the card must either take the first three or gain a third keyframe block per additional count. Members with zero images need a decision too — the prototype has no such case, so `member.images[0]` would throw on one.
5. Moving the route under `[...lang]` with the existing `getStaticPaths` pair, and adding the i18n strings.
6. **Hardening the reduced-motion override to win outright.** As shipped, `.pcard[data-slots] .pcard__img` only *ties* the slot rules at (0,5,0) and wins on source order — and `[data-slots]` is load-bearing purely as a specificity counter, not semantically. Two ways that breaks silently, with no visible symptom because the shorthand's other longhands keep faking a static state: renaming or dropping the attribute during the gallery rework in step 4, or any reorganisation that groups media queries above the slot rules. `.pcard.pcard .pcard__img.pcard__img` serves at (0,6,0) and removes both dependencies at once. Verified safe for this prototype — Tasks 5 and 6 touch neither selector — so it is deferred, not ignored.
7. Deleting `scripts/gen-proto-images.mjs`, `public/proto/`, `src/lib/proto-images.json` and `src/lib/proto-data.ts` in one commit.
