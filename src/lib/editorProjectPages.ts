// THE PROJECT PAGES (2026-10-27, Josh, on the desktop editor mock: "having a
// project view and then a project edit page it is very nice. but we forgot
// to add a preview button it should be fairly prominent on the bottom and
// nicely animate between edit and preview").
//
// Two levels on the Works tab, kept on the stage as data-level:
//   "list"    — every project as a card (its title, description, first
//               pictures, work count and tags) with an Edit key. Nothing to
//               preview here, so the bar holds + Project and Save.
//   "project" — ONE project as the whole page (data-focus = its id): the
//               other blocks are set aside, the profile's column goes, and
//               the bar's Edit | Preview switches the page between the form
//               and what a visitor gets (the controller narrows Preview to
//               the project on the stage's "works:focus" event).
//
// It changes no editor code: the list stays what
// profileEditorController renders. The cards are DRAWN FROM the blocks, and
// a MutationObserver on the list redraws them and re-applies the level after
// every re-render (moves, uploads and saves all replace the list's children).
import { pageLifetime } from "./pageLifecycle.ts";

const FOCUS_KEY = "vscn-works-project";
const CARD_THUMBS = 4;

const remembered = (): string | null => {
  try {
    return sessionStorage.getItem(FOCUS_KEY);
  } catch {
    return null;
  }
};
const remember = (id: string | null) => {
  try {
    if (id) sessionStorage.setItem(FOCUS_KEY, id);
    else sessionStorage.removeItem(FOCUS_KEY);
  } catch {
    /* private mode: the choice lasts the page */
  }
};

document.addEventListener("astro:page-load", () => {
  const stage = document.getElementById("works-stage");
  const list = document.getElementById("gallery-editor");
  const cards = document.querySelector<HTMLElement>("[data-pp-cards]");
  const top = document.querySelector<HTMLElement>("[data-pp-top]");
  const tpl = document.querySelector<HTMLTemplateElement>('template[data-pp-tpl="card"]');
  const form = document.getElementById("profile-form");
  if (!stage || !list || !cards || !top || !tpl || !form) return;
  const signal = pageLifetime();
  const strings = document.querySelector<HTMLElement>("[data-pp-strings]")?.dataset ?? {};
  const reduced = window.matchMedia("(prefers-reduced-motion: reduce)");

  let focus: string | null = remembered();
  // Set while a new project is being added: the ids that were there before,
  // so the block that appears is the one to open.
  let adding: Set<string> | null = null;

  const blocks = () => Array.from(list.querySelectorAll<HTMLElement>("[data-project-block][data-project-id]"));
  const ids = () => blocks().map((b) => b.dataset.projectId ?? "");

  // ── THE CARDS ────────────────────────────────────────────
  const field = (block: HTMLElement, name: string) =>
    block.querySelector<HTMLTextAreaElement>(`[data-project-field="${name}"]`)?.value.trim() ?? "";

  const drawCard = (block: HTMLElement): HTMLElement | null => {
    const card = tpl.content.firstElementChild?.cloneNode(true);
    if (!(card instanceof HTMLElement)) return null;
    const de = stage.dataset.lang === "de";
    const title =
      (de ? field(block, "titleDe") || field(block, "title") : field(block, "title")) ||
      block.querySelector("[data-project-name]")?.textContent?.trim() ||
      strings.untitled ||
      "";
    const desc = de ? field(block, "descriptionDe") || field(block, "description") : field(block, "description");
    card.dataset.projectId = block.dataset.projectId;

    card.querySelector("[data-pp-card-title]")!.textContent = title;
    const descEl = card.querySelector<HTMLElement>("[data-pp-card-desc]")!;
    descEl.textContent = desc;
    descEl.hidden = !desc;

    // The block's own pictures, in its order: a work row's and a carousel
    // tray's share the URL, so each counts once.
    const srcs = [...new Set(Array.from(block.querySelectorAll<HTMLImageElement>("img[src]")).map((img) => img.getAttribute("src") ?? ""))]
      .filter(Boolean)
      .slice(0, CARD_THUMBS);
    card.querySelector("[data-pp-card-thumbs]")!.replaceChildren(
      ...srcs.map((src) => {
        const img = document.createElement("img");
        img.className = "pp-card__thumb";
        img.src = src;
        img.alt = "";
        img.loading = "lazy";
        return img;
      }),
    );

    const count = new Set(
      Array.from(block.querySelectorAll<HTMLElement>("[data-image-id]")).map((el) => el.dataset.imageId),
    ).size;
    const works = count === 1 ? strings.work ?? "" : (strings.works ?? "").replace("{n}", String(count));
    // One chip per tag: read them one by one, or their words run together.
    const picked = block.querySelector("[data-project-tags-picked]");
    const tags = Array.from(picked?.children ?? [], (chip) => chip.textContent?.trim() ?? "")
      .filter(Boolean)
      .join(" · ");
    card.querySelector("[data-pp-card-meta]")!.textContent = [works, tags].filter(Boolean).join("  ·  ");

    const edit = card.querySelector<HTMLButtonElement>("[data-pp-card-edit]")!;
    edit.setAttribute("aria-label", (strings.editOne ?? "").replace("{name}", title));
    return card;
  };

  const drawCards = () => {
    cards.replaceChildren(...blocks().flatMap((b) => drawCard(b) ?? []));
  };

  // ── THE LEVEL ────────────────────────────────────────────
  const scrollTop = () => {
    // .page-wrap scrolls on a desktop, the document on a phone (Layout.astro).
    document.querySelector(".page-wrap")?.scrollTo({ top: 0, behavior: "instant" });
    document.scrollingElement?.scrollTo({ top: 0, behavior: "instant" });
  };

  let applied: string | null | undefined;
  const apply = () => {
    const present = ids();
    // A new project's block has arrived: open it.
    if (adding) {
      const fresh = present.find((id) => !adding!.has(id));
      if (fresh) {
        adding = null;
        focus = fresh;
        remember(focus);
      }
    }
    // The open project is gone (deleted, or a stale id from the session).
    // An empty list may only mean the editor has not loaded yet; the "first
    // project" prompt showing says it has.
    const loaded = present.length > 0 || !document.getElementById("gallery-first")?.hidden;
    if (focus && loaded && !present.includes(focus)) {
      focus = null;
      remember(null);
    }

    const level = focus ? "project" : "list";
    stage.dataset.level = level;
    form.dataset.ppLevel = level;
    if (focus) stage.dataset.focus = focus;
    else delete stage.dataset.focus;
    top.hidden = !focus;
    cards.hidden = !!focus;
    for (const child of Array.from(list.children)) {
      const own = child instanceof HTMLElement && child.dataset.projectId === focus && child.matches("[data-project-block]");
      child.classList.toggle("pp-off", !!focus && !own);
    }
    if (!focus) drawCards();

    if (applied !== focus) {
      const first = applied === undefined;
      applied = focus;
      // Nothing to preview on the list: it is always the form.
      if (!focus && stage.dataset.mode === "preview") pressMode("edit");
      stage.dispatchEvent(new CustomEvent("works:focus"));
      if (!first) scrollTop();
    }
  };

  const open = (id: string | null) => {
    if (id === focus) return;
    const was = focus;
    focus = id;
    remember(id);
    apply();
    // Back on the list, the project just left is where the eye goes.
    if (!id && was) {
      cards.querySelector<HTMLElement>(`[data-project-id="${CSS.escape(was)}"]`)?.scrollIntoView({ block: "center", behavior: "instant" });
    }
  };

  cards.addEventListener(
    "click",
    (e) => {
      const card = e.target instanceof Element ? e.target.closest<HTMLElement>("[data-pp-card]") : null;
      if (card?.dataset.projectId) open(card.dataset.projectId);
    },
    { signal },
  );
  top.querySelector("[data-pp-back]")?.addEventListener("click", () => open(null), { signal });
  top.querySelector("[data-pp-done]")?.addEventListener("click", () => open(null), { signal });

  // Add project (the bar's Plus menu, or the first-project prompt): the
  // controller appends the block; apply() opens it when it appears.
  form.addEventListener(
    "click",
    (e) => {
      if (e.target instanceof Element && e.target.closest("#gallery-new-project, #gallery-first-project")) {
        adding = new Set(ids());
      }
    },
    { capture: true, signal },
  );

  // ── EDIT | PREVIEW, ANIMATED ─────────────────────────────
  // The controller's own click handlers do the switch. Where the browser has
  // view transitions, the click is held back a moment and replayed inside
  // one: the page crossfades from the form to the visitor's view (the
  // controller keeps the picture under the eye in place, so the pictures
  // hold still while the editing chrome fades), and the bar's black thumb,
  // which carries its own view-transition-name, slides across. Without them
  // the thumb's CSS transition still slides it and the page swaps.
  let replaying = false;
  // A switch made for the member, not by them: no transition.
  const pressMode = (mode: string) => {
    replaying = true;
    form.querySelector<HTMLButtonElement>(`[data-works-mode="${mode}"]`)?.click();
    replaying = false;
  };

  form.addEventListener(
    "click",
    (e) => {
      if (replaying || !(e.target instanceof Element)) return;
      const btn = e.target.closest<HTMLButtonElement>("[data-works-mode]");
      if (!btn || btn.dataset.worksMode === stage.dataset.mode) return;
      if (!("startViewTransition" in document) || reduced.matches) return;
      e.preventDefault();
      e.stopImmediatePropagation();
      const root = document.documentElement;
      root.classList.add("pp-switching");
      const transition = document.startViewTransition(
        () =>
          new Promise<void>((resolve) => {
            replaying = true;
            btn.click();
            replaying = false;
            // Two frames: the controller re-anchors the scroll in the frame
            // after the switch, and the new view must be captured after it.
            requestAnimationFrame(() => requestAnimationFrame(() => resolve()));
          }),
      );
      transition.finished.finally(() => root.classList.remove("pp-switching"));
    },
    { capture: true, signal },
  );

  // ── KEEPING UP ───────────────────────────────────────────
  let queued = false;
  const observer = new MutationObserver(() => {
    if (queued) return;
    queued = true;
    queueMicrotask(() => {
      queued = false;
      apply();
    });
  });
  observer.observe(list, { childList: true, subtree: true });
  const firstPrompt = document.getElementById("gallery-first");
  if (firstPrompt) observer.observe(firstPrompt, { attributes: true, attributeFilter: ["hidden"] });

  // The cards speak the bar's language.
  const stageObserver = new MutationObserver(() => {
    if (!focus) drawCards();
  });
  stageObserver.observe(stage, { attributes: true, attributeFilter: ["data-lang"] });

  apply();

  signal.addEventListener(
    "abort",
    () => {
      observer.disconnect();
      stageObserver.disconnect();
    },
    { once: true },
  );
});
