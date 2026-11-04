// THE PROJECT PAGES (2026-10-27, Josh, on the desktop editor mock: "having a
// project view and then a project edit page it is very nice. but we forgot
// to add a preview button it should be fairly prominent on the bottom and
// nicely animate between edit and preview").
//
// Two levels on the Works tab, kept on the stage as data-level:
//   "list"    — every project as a card (its title and first pictures,
//               no words beyond the title since 2026-11-02) with its keys, and
//               + Project after the last. The bar holds Edit | Preview
//               (the whole page) and Save.
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
// Three across, so each is big enough to tell apart (2026-11-02, Josh: "images bigger on project overview").
const CARD_THUMBS = 3;

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
  const blockKey = (block: HTMLElement, which: string) =>
    block.querySelector<HTMLButtonElement>(which === "delete" ? "[data-project-delete]" : `[data-project-move="${which}"]`);
  // A key pressed on a card: the list re-renders under it, so the same key
  // on the same card takes the focus back once the cards are redrawn.
  let refocus: { id: string; which: string } | null = null;

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
    card.dataset.projectId = block.dataset.projectId;

    card.querySelector("[data-pp-card-title]")!.textContent = title;

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

    const edit = card.querySelector<HTMLButtonElement>("[data-pp-card-edit]")!;
    edit.setAttribute("aria-label", (strings.editOne ?? "").replace("{name}", title));

    // ↑ ↓ and Remove mirror the block's hidden keys: their names, their
    // tooltips and where the edges disable them.
    card.querySelectorAll<HTMLButtonElement>("[data-pp-card-key]").forEach((key) => {
      const own = blockKey(block, key.dataset.ppCardKey ?? "");
      if (!own) return;
      key.disabled = own.disabled;
      key.title = own.title;
      const name = own.getAttribute("aria-label");
      if (name) key.setAttribute("aria-label", `${name}: ${title}`);
    });
    return card;
  };

  // + Project, the list's last line. With no project yet the "first
  // project" prompt is the way in, so it waits.
  const addKey = cards.querySelector<HTMLElement>("[data-pp-add]");
  const drawCards = () => {
    const present = blocks();
    if (addKey) addKey.hidden = present.length === 0;
    cards.replaceChildren(...present.flatMap((b) => drawCard(b) ?? []), ...(addKey ? [addKey] : []));
    if (refocus) {
      const card = cards.querySelector<HTMLElement>(`[data-pp-card][data-project-id="${CSS.escape(refocus.id)}"]`);
      const key = card?.querySelector<HTMLButtonElement>(`[data-pp-card-key="${refocus.which}"]`);
      if (key && !key.disabled) key.focus();
      else card?.querySelector<HTMLButtonElement>("[data-pp-card-edit]")?.focus();
      refocus = null;
    }
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
      const id = card?.dataset.projectId;
      if (!id) return;
      const key = (e.target as Element).closest<HTMLButtonElement>("[data-pp-card-key]");
      if (key) {
        const which = key.dataset.ppCardKey ?? "";
        const block = blocks().find((b) => b.dataset.projectId === id);
        const own = block && blockKey(block, which);
        if (own && !own.disabled) {
          // Remove hands the focus on itself (to + Project) when it goes.
          if (which !== "delete") refocus = { id, which };
          own.click();
        }
        return;
      }
      open(id);
    },
    { signal },
  );
  top.querySelector("[data-pp-back]")?.addEventListener("click", () => open(null), { signal });
  // The controller asks for a project when a Save error names a field in it
  // (a refused work, an untitled project): set aside, it could not take the focus.
  stage.addEventListener(
    "works:open",
    (e) => {
      const id = e instanceof CustomEvent ? (e.detail as { projectId?: string } | null)?.projectId : undefined;
      if (id && ids().includes(id)) open(id);
    },
    { signal },
  );

  // Add project (+ Project under the cards, or the first-project prompt): the
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
      // Synchronous: the controller fits the fields and re-anchors the scroll
      // inside the click while .pp-switching is on. Waiting frames here held
      // the switch to the 4 s update timeout, since no frame runs until this
      // callback is done.
      const transition = document.startViewTransition(() => {
        replaying = true;
        btn.click();
        replaying = false;
      });
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
