// THE PAGE'S INDEX (2026-10-14, Josh: "can we maybe add a small scroller on
// the right that lists the projects (or image title if it stands alone)").
// On a desktop the member page has three tracks (profile.css): the person,
// the works, and an empty one balancing the first. This fills the empty one
// with a short list of what the works column holds, top to bottom: each
// project by its title, each work that stands outside a project by its own.
// A work with no title is left out; a list of "Untitled" says nothing.
//
// Built from the DOM rather than printed by the page, so the editor's
// Preview (profilePreview.ts), which renders the same works in the browser,
// gets the same list from the same call. The list follows the reading: the
// entry whose item is crossing the upper part of the window is marked
// (aria-current), and a click scrolls that item into view. Hidden on a phone
// and wherever the third track is too narrow to hold it (profile.css).

const live = new Map<HTMLElement, () => void>();

document.addEventListener("astro:before-swap", () => {
  live.forEach((release) => release());
  live.clear();
});

const REDUCED = window.matchMedia("(prefers-reduced-motion: reduce)");

/** The label an item is listed by, or "" to leave it out. */
function labelOf(item: HTMLElement): string {
  const el = item.matches(".mprof__project")
    ? item.querySelector(".mprof__project-title")
    : item.querySelector(".mprof__caption-line");
  return (el?.textContent ?? "").replace(/\s+/g, " ").trim();
}

/**
 * (Re)builds the index of `profile` (an `.mprof` element). Idempotent: an
 * earlier index of the same profile is removed with its observer first, so
 * the editor's preview can call it after every render.
 */
export function initProfileIndex(profile: HTMLElement | null): void {
  if (!profile) return;
  live.get(profile)?.();
  live.delete(profile);
  profile.querySelector(":scope > .mprof__index")?.remove();

  const works = profile.querySelector<HTMLElement>(":scope > .mprof__works");
  if (!works || works.hidden) return;
  const items = Array.from(works.children).filter(
    (el): el is HTMLElement => el instanceof HTMLElement && el.matches(".mprof__project, .mprof__work"),
  );
  const entries = items
    .map((item, n) => ({ item, label: labelOf(item), n }))
    .filter((e) => e.label);
  // One entry is no index: there is nothing to choose between.
  if (entries.length < 2) return;

  const nav = document.createElement("nav");
  nav.className = "mprof__index prail";
  nav.style.setProperty("--prail-n", String(entries.length));
  nav.setAttribute("aria-label", works.dataset.indexLabel ?? "");
  const list = document.createElement("ol");
  list.className = "mprof__index-list";
  const links = new Map<HTMLElement, HTMLAnchorElement>();
  entries.forEach(({ item, label, n }) => {
    if (!item.id) item.id = `mprof-item-${n + 1}`;
    const li = document.createElement("li");
    const a = document.createElement("a");
    a.className = "mprof__index-link prail__tick";
    a.href = `#${item.id}`;
    const name = document.createElement("span");
    name.className = "prail__name";
    name.textContent = label;
    a.append(name);
    a.addEventListener("click", (e) => {
      e.preventDefault();
      item.scrollIntoView({ behavior: REDUCED.matches ? "auto" : "smooth", block: "start" });
    });
    li.append(a);
    list.append(li);
    links.set(item, a);
  });
  nav.append(list);
  profile.append(nav);

  // The marked entry: the last item whose top has passed 40% of the window.
  // An observer on a thin band there tells us when an item crosses it.
  const scroller = profile.closest<HTMLElement>(".page-wrap");
  const mark = () => {
    const line = (scroller?.getBoundingClientRect().top ?? 0) + window.innerHeight * 0.4;
    let on: HTMLElement | null = entries[0].item;
    for (const item of links.keys()) {
      if (item.getBoundingClientRect().top <= line) on = item;
    }
    links.forEach((a, item) => {
      a.classList.toggle("is-current", item === on);
      if (item === on) a.setAttribute("aria-current", "true");
      else a.removeAttribute("aria-current");
    });
  };
  const observer = new IntersectionObserver(mark, {
    root: scroller,
    rootMargin: "-40% 0px -59% 0px",
  });
  links.forEach((_, item) => observer.observe(item));
  mark();

  live.set(profile, () => {
    observer.disconnect();
    nav.remove();
  });
}
