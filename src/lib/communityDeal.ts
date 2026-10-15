// THE DEAL, BEFORE THE FIRST PAINT (2026-10-15, Josh: "when navigating to the
// portfolio page on mobile the initial images flutter").
//
// The directory deals its members in a random order within score bands. That
// deal used to run on astro:page-load — after the browser had already painted
// the server's rank order — so the first card on screen was replaced by a
// different member a moment after arriving, its picture resized and the page
// re-snapped. Now the deal runs where nothing has been painted yet:
//   - on an in-site navigation, in astro:before-swap, on the INCOMING document
//     (communityDirectoryController.ts);
//   - on a full load, in a tiny inline script right after the grid
//     (CommunityGrid.astro), which inlines THESE TWO FUNCTIONS as source text.
// The controller's own deal calls shuffleBands too, so all three agree on the
// order for the same seed.
//
// BOTH FUNCTIONS MUST STAY SELF-CONTAINED: CommunityGrid serialises them with
// Function.prototype.toString, so they may reference nothing outside their own
// bodies (no imports, no module constants) and dealPagesInto may call only
// shuffleBands, which is inlined beside it under the same name.

/**
 * Random within an equal-score band, bands highest first. `items` must arrive
 * in rank order; `seed` drives mulberry32, so one seed always gives one order.
 */
export function shuffleBands<T extends { dataset: DOMStringMap }>(items: T[], seed: number): T[] {
  let a = seed >>> 0;
  const random = () => {
    a = (a + 0x6d2b79f5) >>> 0;
    let t = a;
    t = Math.imul(t ^ (t >>> 15), t | 1);
    t ^= t + Math.imul(t ^ (t >>> 7), t | 61);
    return ((t ^ (t >>> 14)) >>> 0) / 4294967296;
  };
  const bands = new Map<number, T[]>();
  for (const item of items) {
    // A cell with no readable score bands with the other unscored ones at 0.
    const raw = Number(item.dataset.score);
    const key = Number.isFinite(raw) ? raw : 0;
    const band = bands.get(key);
    if (band) band.push(item);
    else bands.set(key, [item]);
  }
  return [...bands.keys()]
    .sort((x, y) => y - x)
    .flatMap((key) => {
      const out = bands.get(key) as T[];
      for (let i = out.length - 1; i > 0; i--) {
        const j = Math.floor(random() * (i + 1));
        [out[i], out[j]] = [out[j], out[i]];
      }
      return out;
    });
}

/**
 * Deals the pages view's member cells into `grid`: shuffled, the ones a tag
 * filters out hidden and moved to the end, the first shown card's first
 * picture loading eagerly. Stamps `data-dealt` so a second caller on the same
 * document leaves it alone.
 */
export function dealPagesInto(grid: HTMLElement, seed: number, tag: string): void {
  const cells = Array.from(grid.querySelectorAll<HTMLElement>('.cgrid__cell[data-slot="image"]')).sort(
    (x, y) => Number(x.dataset.rank) - Number(y.dataset.rank),
  );
  const ordered = shuffleBands(cells, seed);
  const hidden: HTMLElement[] = [];
  let first: HTMLElement | null = null;
  for (const cell of ordered) {
    const show = !tag || (cell.dataset.tags ?? "").includes(`|${tag}|`);
    cell.hidden = !show;
    if (!show) {
      hidden.push(cell);
      continue;
    }
    grid.appendChild(cell);
    if (!first) first = cell;
  }
  for (const cell of hidden) grid.appendChild(cell);
  const img = first?.querySelector<HTMLImageElement>("img.ccard__img");
  if (img) {
    img.loading = "eager";
    img.setAttribute("fetchpriority", "high");
  }
  grid.dataset.dealt = String(seed);
}
