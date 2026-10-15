// DEAL THE INCOMING COMMUNITY PAGE BEFORE IT IS SWAPPED IN (2026-10-15, the
// Portfolios flutter). Imported by Layout.astro so it listens on EVERY page:
// the directory's own controller is only loaded once /community is on screen,
// so a navigation from Info or a profile into /community had nobody to deal
// the incoming document, and the inline fallback in CommunityGrid re-used the
// seed stored for that history position — the same order every visit.
//
// The new document is still off screen here, so the visitor's first frame is
// already the dealt order. A Back onto an entry re-uses its stored seed (the
// router has already moved history.state to the target on a traverse); any
// other arrival gets a fresh one. The seed is handed to the controller on
// window, which adopts and stores it on page-load, so its own deal reproduces
// the order on screen. See communityDeal.ts.
import { dealPagesInto } from "./communityDeal.ts";
import { viewFromParam } from "./communityLayout.ts";

const DEAL_KEY = "vscn:deal:";

function storedSeed(): number {
  try {
    const index = (history.state as { index?: number } | null)?.index;
    if (typeof index !== "number") return 0;
    const saved = Number(sessionStorage.getItem(DEAL_KEY + index));
    return Number.isFinite(saved) ? saved : 0;
  } catch {
    return 0;
  }
}

document.addEventListener("astro:before-swap", (e) => {
  const ev = e as unknown as { newDocument: Document; to: URL; navigationType: string };
  const grid = ev.newDocument.getElementById("member-grid");
  if (!grid) return;
  const params = ev.to.searchParams;
  if (viewFromParam(params.get("pattern")) !== "pages") return;
  const asked = params.get("tag") ?? "";
  const tag =
    asked && ev.newDocument.querySelector(`.tag-filter__option[data-tag="${CSS.escape(asked)}"]`)
      ? asked
      : "";
  const seed =
    (ev.navigationType === "traverse" && storedSeed()) ||
    (Math.floor(Math.random() * 0xffffffff) || 1) >>> 0;
  (window as unknown as { __vscnDeal?: number }).__vscnDeal = seed;
  dealPagesInto(grid, seed, tag);
});
