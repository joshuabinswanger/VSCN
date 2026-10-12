// ────────────────────────────────────────────────────────────────────────
// Motion layer: desktop-only scroll effects, two jobs.
//   1. Cards fade in at their final size, left to right in the grid.
//   2. The parallax: every card drifts linearly from +amp below its slot
//      to -amp above it across its own viewport crossing — a constant
//      scroll-speed offset, nothing more. Every card runs the SAME motion
//      law (a lane-keyed version read as the columns misbehaving
//      differently, not as depth); the depth comes from amplitude alone,
//      cycling through three values in row order — a cycle of 3 over 2
//      alternating lanes, so depth never lines up with a lane.
//      Transform-only, so it cannot disturb the placement the slot table
//      fixed.
// Width is checked BEFORE the import, so mobile downloads no GSAP at all
// (~44 KB gzip). This page is the only importer of gsap in production —
// a deliberate, recorded cost (design doc, conflict 3).
// ────────────────────────────────────────────────────────────────────────
const DESKTOP = "(min-width: 768px)";
const REDUCED = "(prefers-reduced-motion: reduce)";

// The parallax amplitudes, in px of vertical offset from the slot: a card
// starts +amp below it entering the scrollport and exits -amp above it, so
// amp sets the card's constant speed relative to the page. Three depths,
// dealt in row order; all well under the spread's same-lane spacing (~35
// rows), and scroll progress only ever pulls a card AWAY from the one
// beneath it (the lower card always trails, so it always sits deeper), so
// even the deepest neighbours cannot collide. The interlocked opposite
// lane can't either: it never shares columns. Drift is vertical only, so
// no amount of it can push a card out of its lane.
const AMPS = [70, 130, 100];

/** Full amplitude everywhere but the wall. (There used to be a tag-card
 *  exception for the shelved strip mode's index ladder; both galleries are
 *  artwork only since 2026-09-03, so there is no second kind of card left to
 *  damp.) */
function flowScale(_cell: HTMLElement, mode: string | undefined): number {
  // The amplitudes above were drawn for the spread, where a beat has
  // hundreds of pixels of drawn whitespace under it and a card is 500px
  // wide. On the wall a 130px travel is most of a 200px card sliding past
  // its neighbours, which reads as slosh rather than depth — and it eats
  // into a 30px row gap. Two rows never quite collide even undamped (they
  // cross their triggers 0.28 apart, so the worst a row can close on the one
  // below is ~21px of the 30), but a third of the amplitude turns that into
  // ~7px and makes the motion proportionate to the card carrying it.
  // Scaling is the whole change — the per-row deal above is untouched, so a
  // row still moves as one flat edge.
  // STATIC since 2026-10-12 (Josh: "a static grid 2 wide"): no travel at all.
  if (mode === "grid") return 0;
  return 1;
}

// Loose type: gsap's global namespace types are not reliably in scope
// inside a scoped Astro script, and revert() is all we need off it.
let mm: gsap.MatchMedia | null = null;

// Re-entry guard for the async gap. `mm` alone is not a mutex: it is read
// before the dynamic import but only assigned after it, so two overlapping
// build() calls would both pass the `if (mm)` check and the second would
// orphan the first context's ScrollTriggers. `building` closes that window
// synchronously, and `epoch` — bumped by every teardown — lets a build that
// was in flight when a teardown happened detect that its DOM is stale and
// abandon itself instead of assigning a context over dead nodes.
let building = false;
let epoch = 0;

async function build() {
  if (building || mm) return;
  if (!document.querySelector(".cgrid")) return;
  // The index view hides the grid entirely: every cell is display:none, so
  // triggers would be measured against nothing. The selector's
  // layout-changed event rebuilds when a gallery comes back.
  if (document.getElementById("member-grid")?.hidden) return;
  if (!window.matchMedia(DESKTOP).matches) return;
  if (window.matchMedia(REDUCED).matches) return;

  building = true;
  const startedIn = epoch;

  // Everything from the import onward can reject — a hashed chunk 404ing
  // after a redeploy while ClientRouter keeps the session alive, a flaky
  // network. Without recovery, a rejection would leave `building` latched
  // true with `mm` null: a silently dead motion layer until a full reload.
  try {
    const [{ default: gsap }, { ScrollTrigger }] = await Promise.all([
      import("gsap"),
      import("gsap/ScrollTrigger"),
    ]);

    // A teardown ran while the import was in flight: this build's DOM is
    // gone, and teardown already reset `building` so a fresh build for the
    // new page can proceed. Abandon without touching either flag.
    if (epoch !== startedIn) return;

    gsap.registerPlugin(ScrollTrigger);

    // The scroll container is .page-wrap, never the window — body is
    // overflow:hidden (see Layout.astro).
    const scroller = ".page-wrap";

    mm = gsap.matchMedia();
    // Tweens and ScrollTriggers created inside a matchMedia context are
    // reverted and killed automatically on revert().
    mm.add(DESKTOP, () => {
      // 1. Fade on arrival without rescaling the artwork. Grid columns
      //    enter 90ms apart, restarting the sequence on each row.
      //    Cards inside the horizontal strip are skipped in both jobs: the
      //    strip scrolls on its own axis, and a scroll-linked transform
      //    would fight the hover growth that layout owns.
      gsap.utils
        .toArray<HTMLElement>(".ccard, .cwork")
        // The view the deal did NOT build is still in the DOM, hidden — the
        // spread's member cards while the wall is up, and the wall's tiles
        // otherwise. A trigger measured against a display:none box is
        // meaningless, and there are now more of those than of the real
        // ones. The switch fires community:layout-changed, which rebuilds
        // this layer, so nothing is missed by skipping them.
        .filter((card) => !card.closest(".cgrid__strip, .cgrid__cell[hidden]"))
        .forEach((card) => {
          const cell = card.closest<HTMLElement>(".cgrid__cell");
          const isGrid = cell?.closest<HTMLElement>(".cgrid")?.dataset.pattern === "grid";
          const column = Number.parseInt(cell?.dataset.col ?? "1", 10) || 1;
          gsap.fromTo(
            card,
            { opacity: 0.2 },
            {
              opacity: 1,
              duration: 0.65,
              delay: isGrid ? Math.min(column - 1, 8) * 0.09 : 0,
              ease: "power1.out",
              scrollTrigger: {
                scroller,
                trigger: cell ?? card,
                start: "top 95%",
                once: true,
              },
            }
          );
        });

      // 2. The parallax: one linear tween per cell, +amp to -amp, scrubbed
      //    across the cell's own viewport crossing (a page-long trigger
      //    dilutes any amplitude to invisibility — learned the hard way).
      //    ease:none, because a constant offset in scroll terms IS the
      //    effect: the cell simply travels at a slightly different speed
      //    than the page, and neighbours at different amplitudes separate
      //    — that separation is the depth. The cells are in row order
      //    after the deal's DOM re-sort, so cycling AMPS by index deals
      //    the depths down the page, never along a lane. Drives the CELL
      //    while the fade drives the card inside it, so the two
      //    transforms cannot fight over one element's property.
      const cells = gsap.utils
        .toArray<HTMLElement>(".cgrid__cell:not([hidden])")
        .filter((cell) => !cell.closest(".cgrid__strip"));
      // In the aligned-rows grid, the amplitude is dealt per ROW, not per
      // cell: a row's cards share a rowStart because the drawing says they
      // start level, and per-cell depths would shear that flat edge apart
      // the moment the page moves. Depth still alternates — row to row
      // instead of card to card. The spread keeps the per-cell deal.
      const grid = document.getElementById("member-grid");
      const perRow = grid?.dataset.pattern === "grid";
      const rowOf = (cell: HTMLElement) => Number(cell.dataset.row) || 0;
      const rows = [...new Set(cells.map(rowOf))].sort((a, b) => a - b);
      cells.forEach((cell, i) => {
        const beat = perRow ? rows.indexOf(rowOf(cell)) : i;
        const amp = AMPS[beat % AMPS.length] * flowScale(cell, grid?.dataset.pattern);
        gsap.fromTo(
          cell,
          { y: amp },
          {
            y: -amp,
            ease: "none",
            scrollTrigger: {
              scroller,
              trigger: cell,
              start: "top bottom",
              end: "bottom top",
              // Smoothed because
              // raw scrub turns wheel steps into visible ticking.
              scrub: 0.5,
            },
          }
        );
      });
    });

    // Archivo is self-hosted; if it lands after first paint, card heights
    // change, rows that were sized to fit a card resize with them, and every
    // measured trigger position is stale. Epoch-guarded so a refresh queued
    // by a page that has since been swapped away cannot fire against dead
    // nodes.
    document.fonts?.ready.then(() => {
      if (epoch === startedIn) ScrollTrigger.refresh();
    });

    building = false;
  } catch (err) {
    // Release the latch only if this build still owns it — after a
    // teardown, `building` belongs to whatever comes next.
    if (epoch === startedIn) building = false;
    // Swallow rather than re-throw: the page is fully usable without the
    // motion layer, and the next astro:page-load retries cleanly.
    console.error("[community-grid] scroll motion layer failed to build:", err);
  }
}

function teardown() {
  // Bumping the epoch marks any in-flight build as stale; clearing
  // `building` here is what lets the next page's build start immediately.
  epoch++;
  mm?.revert();
  mm = null;
  building = false;
}

document.addEventListener("astro:page-load", build);
document.addEventListener("astro:before-swap", teardown);

// The view selector re-dealt the cells: every measured trigger position is
// stale, and the parallax keying (per row vs per cell) may have changed
// with the pattern. Same recovery as a page swap — tear down and rebuild.
document.addEventListener("community:layout-changed", () => {
  teardown();
  build();
});

// Crossing the breakpoint on resize starts or stops the whole layer. The
// wall's own re-deal on that crossing lives in the behaviour layer (a
// separate module — nothing here can call applyLayout) and arrives as a
// community:layout-changed, handled above.
window.matchMedia(DESKTOP).addEventListener("change", () => {
  teardown();
  build();
});

window.matchMedia(REDUCED).addEventListener("change", () => {
  teardown();
  build();
});
