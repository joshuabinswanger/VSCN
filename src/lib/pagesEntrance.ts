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

// THE WORDS TAKE AS LONG AS THEY ARE (2026-10-15, Josh: "make the text
// animate in according to its length"): the name and the role are split into
// words, each rising out of its own mask a beat after the one before, so a
// long role simply takes longer — and the count and links wait for the last
// word (--t-rest on the cell).
const NAME_START = 0.2;
const NAME_STEP = 0.05;
const ROLE_GAP = 0.06;
const ROLE_STEP = 0.035;

/** Splits el's text into word masks once; stamps each word's delay from
 *  `start`; returns when the last word starts. */
function stagger(el: HTMLElement | null, start: number, step: number): number {
  if (!el) return start;
  if (!el.hasAttribute("data-words")) {
    const words = (el.textContent ?? "").trim().split(/\s+/).filter(Boolean);
    el.textContent = "";
    words.forEach((word, i) => {
      if (i) el.append(" ");
      const mask = document.createElement("span");
      mask.className = "cw";
      const inner = document.createElement("span");
      inner.className = "cw__i";
      inner.textContent = word;
      mask.append(inner);
      el.append(mask);
    });
    el.setAttribute("data-words", "");
  }
  const words = el.querySelectorAll<HTMLElement>(".cw__i");
  words.forEach((w, i) => w.style.setProperty("--d", `${(start + i * step).toFixed(3)}s`));
  return start + Math.max(0, words.length - 1) * step;
}

function prepare(cell: HTMLElement) {
  let t = stagger(cell.querySelector<HTMLElement>(".ccard__name-link"), NAME_START, NAME_STEP);
  t = stagger(cell.querySelector<HTMLElement>(".ccard__role"), t + ROLE_GAP + NAME_STEP, ROLE_STEP);
  cell.style.setProperty("--t-rest", `${(t + 0.14).toFixed(3)}s`);
  cell.setAttribute("data-words", "");
}

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
  grid.querySelectorAll<HTMLElement>('.cgrid__cell[data-slot="image"]').forEach((cell) => {
    prepare(cell);
    io?.observe(cell);
  });
}

document.addEventListener("astro:before-swap", () => setPagesEntrance(false));
