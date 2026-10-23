// A CAROUSEL'S POSITION AS DOTS, THE INSTAGRAM WAY (2026-10-16, Josh: "the
// carousel should get dots below the images instead of the numbers … model
// the dots after instagram (with the fading smaller dots) but highlight color
// should be black"). Shared by the directory card (communityCarousel.ts) and
// a project's carousel on the member page (projectCarousel.ts).
//
// At most WINDOW dots show. A dot shrinks with its distance from the current
// one — three away to MID 0.66, four to SMALL 0.4 — so the first slide of
// five reads "● • • · ·", as on Instagram (Josh, same day: "the 4th and 5th
// are smaller dots"). With more works than five, the row is a sliding window
// over all of them: the strip moves so the current dot stays off the
// window's edges, and an edge dot with works beyond it shrinks too (the
// outermost to SMALL, its neighbour to MID), which says "there is more this
// way". The current dot is never shrunk. The look (grey, black when current) is `.cdots` in
// global.css; the size and gap are the --carousel-dot tokens in type.css.
//
// The "2 / 7" count it replaced is recorded in
// documentation/20261016-carousel-count-design.md — and since 2026-10-23
// stands beside the card's dots again (.ccard__count, communityCarousel.ts),
// where the dots are buttons too.

const WINDOW = 5;

/**
 * Wraps the row's dots in the sliding window (once — a re-init finds the
 * window already there) and returns the function that shows position `i`.
 * The dots are whatever elements the caller made; this sets their classes
 * and the strip's offset only.
 */
export function mountDots(row: HTMLElement, dots: HTMLElement[]): (i: number) => void {
  const total = dots.length;
  let strip = row.querySelector<HTMLElement>(".cdots__strip");
  let view = strip?.parentElement ?? null;
  if (!strip || !view) {
    view = document.createElement("span");
    view.className = "cdots";
    view.setAttribute("aria-hidden", "true");
    strip = document.createElement("span");
    strip.className = "cdots__strip";
    view.append(strip);
    // Between the row's chevrons when it has them: "‹ ••• ›".
    const nextChevron = row.querySelector(".pager-chev--next");
    if (nextChevron) nextChevron.before(view);
    else row.append(view);
  }
  strip.replaceChildren(...dots);
  view.style.setProperty("--cdots-n", String(Math.min(total, WINDOW)));

  let start = 0;
  return (i: number) => {
    if (total > WINDOW) {
      // Keep the current dot one in from either edge while there is more
      // beyond it; at the true ends it may reach the edge.
      if (i > start + WINDOW - 2) start = i - (WINDOW - 2);
      if (i < start + 1) start = i - 1;
      start = Math.max(0, Math.min(total - WINDOW, start));
    }
    const end = start + Math.min(total, WINDOW) - 1;
    const moreLeft = start > 0;
    const moreRight = end < total - 1;
    dots.forEach((dot, n) => {
      // 0 full, 1 mid, 2 small: the smaller of the two rules wins.
      let rank = 0;
      if (n !== i) {
        const away = Math.abs(n - i);
        if (away >= 4) rank = 2;
        else if (away === 3) rank = 1;
        if ((moreLeft && n === start) || (moreRight && n === end)) rank = 2;
        else if ((moreLeft && n === start + 1) || (moreRight && n === end - 1)) rank = Math.max(rank, 1);
      }
      const size = n < start || n > end ? "out" : ["", "md", "sm"][rank];
      dot.classList.toggle("cdot--on", n === i);
      dot.classList.toggle("cdot--md", size === "md");
      dot.classList.toggle("cdot--sm", size === "sm");
      dot.classList.toggle("cdot--out", size === "out");
    });
    strip.style.setProperty("--cdots-start", String(start));
  };
}
