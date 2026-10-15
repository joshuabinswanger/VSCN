// THE CARD MOVES IN (2026-10-15, Josh: "add a smooth animation where it
// moves in satisfyingly. motion design style").
//
// A TIMED entrance, not a scroll-linked one: when a card has come more than
// half into view it gets `.is-in`, and CommunityGrid's CSS plays the reveal —
// the picture opens out of an inset and settles from a slight zoom, the name
// and role rise out of their own line, then the count, the links and PROFILE.
// Leaving the screen entirely takes the class off again (instantly — the
// reveal's transitions live on the `.is-in` state only), so every arrival
// plays it, Back and forth.
//
// Only while the grid carries `data-motion`, which is set before the first
// paint by the same code that deals the cards (communityDealSwap.ts, the
// inline script in CommunityGrid) and never under reduced motion — so the
// hidden starting state can never show without this script to end it, and a
// visitor without JavaScript sees the cards plainly.

const SHOWN = 0.55;
const GONE = 0.02;
let io: IntersectionObserver | null = null;

export function setPagesEntrance(on: boolean): void {
  io?.disconnect();
  io = null;
  if (!on) return;
  const grid = document.getElementById("member-grid");
  if (!grid || !grid.hasAttribute("data-motion")) return;
  io = new IntersectionObserver(
    (entries) => {
      for (const entry of entries) {
        const cell = entry.target as HTMLElement;
        if (entry.isIntersecting && entry.intersectionRatio >= SHOWN) cell.classList.add("is-in");
        // Gone, or all but gone — a card resting edge to edge with the one
        // on screen still "intersects" by its border.
        else if (entry.intersectionRatio < GONE) cell.classList.remove("is-in");
      }
    },
    { threshold: [0, GONE, SHOWN] },
  );
  grid.querySelectorAll<HTMLElement>('.cgrid__cell[data-slot="image"]').forEach((cell) => io?.observe(cell));
}

document.addEventListener("astro:before-swap", () => setPagesEntrance(false));
