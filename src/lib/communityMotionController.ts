// ────────────────────────────────────────────────────────────────────────
// Motion layer: the Images wall's desktop fade-in — tiles fade in at
// their final size, left to right. THE WALL ONLY (2026-10-15): the
// Portfolios view is the pages now, whose motion is CSS on view timelines
// (CommunityGrid.astro, "THE FLOURISH"); the spread's GSAP parallax went
// with the spread.
// Width is checked BEFORE the import, so mobile downloads no GSAP at all
// (~44 KB gzip). This page is the only importer of gsap in production —
// a deliberate, recorded cost (design doc, conflict 3).
// ────────────────────────────────────────────────────────────────────────
const DESKTOP = "(767px < width) and ((not (pointer: coarse)) or (500px < height))";
const REDUCED = "(prefers-reduced-motion: reduce)";


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
  // The pages animate themselves in CSS; a ScrollTrigger per card there
  // would only fight the snap.
  if (document.getElementById("member-grid")?.dataset.pattern !== "grid") return;
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
        .filter((card) => !card.closest(".cgrid__cell[hidden]"))
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
