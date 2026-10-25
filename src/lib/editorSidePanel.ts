// THE SIDE-PANEL EDITOR (2026-10-25, trial route /profile-panel). Josh: "edit
// fields in a separate right panel (settings for image, changing captions,
// title etc., add carousel images etc. all in a right side panel on desktop)
// and on mobile in a separate frame on the bottom". On a phone the panel is
// a full-screen page since the same day: a bottom sheet zoomed on iOS and
// fought the keyboard.
//
// It changes no editor code. The list stays what profileEditorController
// renders; picking a work, a project or a carousel MOVES that unit's fields
// and keys (the very nodes, so every listener the controller bound on them
// keeps working) into #epanel, and leaves a stand-in where its words were.
// Picking another unit, Done, or Preview puts them back.
//
// The controller re-renders the list on most edits (moves, sizes, uploads,
// carousel slides) with replaceChildren, which orphans whatever the panel
// holds. A MutationObserver on the list notices, drops the orphans and moves
// the new rendering's fields in, so the panel follows the unit through every
// re-render as long as its id survives.
import { pageLifetime } from "./pageLifecycle.ts";

type Kind = "work" | "project" | "carousel";
interface Pick {
  kind: Kind;
  id: string;
}
interface Borrowed {
  part: HTMLElement;
  // Where the part goes back: a stand-in showing its words, or a bare marker.
  stand: HTMLElement | Comment;
  words: boolean;
}


document.addEventListener("astro:page-load", () => {
  const panel = document.getElementById("epanel");
  const stage = document.getElementById("works-stage");
  const list = document.getElementById("gallery-editor");
  if (!panel || !stage || !list) return;
  const signal = pageLifetime();
  const body = panel.querySelector<HTMLElement>("[data-epanel-body]")!;
  const title = panel.querySelector<HTMLElement>("[data-epanel-title]")!;
  const thumb = panel.querySelector<HTMLImageElement>("[data-epanel-thumb]")!;
  const save = panel.querySelector<HTMLButtonElement>("[data-epanel-save]")!;
  const formSave = document.getElementById("save-button") as HTMLButtonElement | null;
  const editLabel = title.textContent ?? "";

  stage.append(panel);
  stage.classList.add("has-epanel");
  panel.hidden = false;

  let pick: Pick | null = null;
  let borrowed: Borrowed[] = [];
  let picked: HTMLElement | null = null;

  const unitOf = (p: Pick): HTMLElement | null => {
    if (p.kind === "work") return list.querySelector(`.gallery-item[data-image-id="${CSS.escape(p.id)}"]:not([data-carousel-slide-row] *)`);
    if (p.kind === "carousel") return list.querySelector(`[data-carousel-block][data-carousel-id="${CSS.escape(p.id)}"]`);
    return list.querySelector(`[data-project-block][data-project-id="${CSS.escape(p.id)}"]`);
  };

  // The parts of a unit that go to the panel, in the panel's order.
  const partsOf = (p: Pick, unit: HTMLElement): HTMLElement[] => {
    const q = (sel: string) => Array.from(unit.querySelectorAll<HTMLElement>(sel));
    if (p.kind === "work") return q(":scope > .gallery-fields");
    if (p.kind === "project") return q(":scope > .gallery-project-fields");
    return q(
      ":scope > [data-carousel-label], :scope > [data-carousel-tray], :scope > [data-carousel-slide-row] .gallery-fields, :scope > [data-carousel-details]",
    );
  };

  // A stand-in in the page's type: title over description, in the bar's
  // language, refreshed as the panel is typed in.
  const paintWords = (b: Borrowed) => {
    if (!b.words || !(b.stand instanceof HTMLElement)) return;
    const lang = stage.dataset.lang === "de" ? "de" : "en";
    const pane = b.part.querySelector(`[data-gallery-lang-pane="${lang}"]`) ?? b.part;
    const values = Array.from(pane.querySelectorAll<HTMLInputElement | HTMLTextAreaElement>(".gallery-inline")).map((f) => f.value.trim());
    const classes = b.part.classList.contains("gallery-project-fields")
      ? ["mprof__project-title", "mprof__project-desc"]
      : ["mprof__caption-line", "mprof__desc"];
    b.stand.replaceChildren(
      ...values.slice(0, 2).flatMap((v, i) => {
        if (!v) return [];
        const el = document.createElement("p");
        el.className = classes[i];
        el.textContent = v;
        return [el];
      }),
    );
  };

  const borrow = (part: HTMLElement) => {
    const words = part.matches(".gallery-fields, .gallery-project-fields");
    let stand: HTMLElement | Comment;
    if (words) {
      stand = document.createElement("div");
      stand.className = `epanel-ghost ${part.classList.contains("gallery-project-fields") ? "mprof__project-head" : "mprof__caption"}`;
    } else {
      stand = document.createComment("epanel");
    }
    part.replaceWith(stand);
    body.append(part);
    // In the panel every fold of the unit's own stands open.
    part.querySelectorAll<HTMLDetailsElement>("details.gallery-details").forEach((d) => (d.open = true));
    if (part.matches("details.gallery-details")) (part as HTMLDetailsElement).open = true;
    part.querySelectorAll<HTMLTextAreaElement>("textarea").forEach(fit);
    const b = { part, stand, words };
    paintWords(b);
    borrowed.push(b);
  };

  const giveBack = () => {
    for (const b of borrowed) {
      if (b.stand.isConnected) b.stand.replaceWith(b.part);
      else b.part.remove();
      // Back in the list the folds close, so the Edit key reads as a key.
      b.part.querySelectorAll<HTMLDetailsElement>("details.gallery-details").forEach((d) => (d.open = false));
      if (b.part instanceof HTMLDetailsElement) b.part.open = false;
    }
    borrowed = [];
  };

  const fit = (area: HTMLTextAreaElement) => {
    area.style.height = "auto";
    area.style.height = `${area.scrollHeight}px`;
  };

  const markPicked = (unit: HTMLElement | null) => {
    picked?.classList.remove("is-epicked");
    picked = null;
    if (!unit || !pick) return;
    picked = pick.kind === "project"
      ? (borrowed.find((b) => b.words)?.stand as HTMLElement | undefined) ?? unit
      : unit;
    picked.classList.add("is-epicked");
  };

  // Bring the panel in line with the list: drop what a re-render orphaned,
  // move in what the unit's new rendering offers. Idempotent, so it can run
  // after every mutation, its own included.
  // ONE EDIT KEY at the top right of every work's picture, of a carousel's
  // shown slide and of a project's heading (Josh: "top right of images").
  // The key only picks, through the list's click handler. Re-added after
  // every re-render; adding it is a no-op where one stands.
  const keyHtml = `<svg viewBox="0 0 24 24" aria-hidden="true"><path d="M12 20h9"/><path d="M16.5 3.5a2.1 2.1 0 0 1 3 3L7 19l-4 1 1-4Z"/></svg><span>${editLabel}</span>`;
  const addKey = (host: Element | null, kind: Kind) => {
    if (!host || host.querySelector(":scope > .epanel-edit")) return;
    const key = document.createElement("button");
    key.type = "button";
    key.className = "epanel-edit t-label";
    key.dataset.epanelEdit = kind;
    key.innerHTML = keyHtml;
    host.append(key);
  };
  const addKeys = () => {
    list.querySelectorAll(".gallery-item[data-image-id]:not(.gallery-task) > .gallery-thumb").forEach((thumb) => {
      addKey(thumb, thumb.closest("[data-carousel-slide-row]") ? "carousel" : "work");
    });
    list.querySelectorAll("[data-project-block]").forEach((block) => addKey(block, "project"));
  };

  const sync = () => {
    addKeys();
    const unit = pick ? unitOf(pick) : null;
    if (!pick || !unit) {
      if (pick) setPick(null);
      return;
    }
    borrowed = borrowed.filter((b) => {
      if (b.stand.isConnected) return true;
      b.part.remove();
      return false;
    });
    const fresh = partsOf(pick, unit);
    if (fresh.length) {
      // Keep the panel in the template's order: put back and borrow anew.
      giveBack();
      partsOf(pick, unit).forEach(borrow);
    }
    markPicked(unit);
  };

  const setPick = (next: Pick | null) => {
    if (pick && next && pick.kind === next.kind && pick.id === next.id) return;
    giveBack();
    pick = next;
    body.replaceChildren();
    panel.classList.toggle("is-open", !!next);
    stage.classList.toggle("is-picking", !!next);
    title.textContent = next ? panel.dataset[`label${next.kind[0].toUpperCase()}${next.kind.slice(1)}`] ?? editLabel : editLabel;
    thumb.hidden = true;
    if (!next) {
      markPicked(null);
      return;
    }
    const unit = unitOf(next);
    if (!unit) return;
    // The phone page shows what it edits: the work's picture, or a project's
    // first. A carousel shows its tray instead.
    const img = next.kind === "carousel" ? null : unit.querySelector<HTMLImageElement>(".mprof__img[src]");
    if (img) {
      thumb.src = img.currentSrc || img.src;
      thumb.hidden = false;
    }
    partsOf(next, unit).forEach(borrow);
    markPicked(unit);
    panel.scrollTop = 0;
  };

  const pickFrom = (target: Element): Pick | null => {
    const slideRow = target.closest("[data-carousel-slide-row]");
    const carousel = target.closest<HTMLElement>("[data-carousel-block]");
    if (slideRow && carousel?.dataset.carouselId) return { kind: "carousel", id: carousel.dataset.carouselId };
    const work = target.closest<HTMLElement>(".gallery-item[data-image-id]");
    if (work?.dataset.imageId && !work.classList.contains("gallery-task")) return { kind: "work", id: work.dataset.imageId };
    if (carousel?.dataset.carouselId) return { kind: "carousel", id: carousel.dataset.carouselId };
    const project = target.closest<HTMLElement>("[data-project-block]");
    // The project is picked by its heading (or its stand-in), not by the
    // space between its works.
    if (project?.dataset.projectId && target.closest(".gallery-project-fields, .epanel-ghost, [data-epanel-edit='project']")) return { kind: "project", id: project.dataset.projectId };
    return null;
  };

  list.addEventListener(
    "click",
    (e) => {
      if (!(e.target instanceof Element)) return;
      // The text block after a work is typed where it stands.
      if (e.target.closest(".gallery-text")) return;
      // An Edit key in the list picks; it does not unfold in place.
      if (e.target.closest("summary.gallery-details-summary")) e.preventDefault();
      const next = pickFrom(e.target);
      if (next) setPick(next);
    },
    { signal },
  );

  panel.querySelector("[data-epanel-done]")!.addEventListener("click", () => setPick(null), { signal });
  panel.querySelector("[data-epanel-back]")!.addEventListener("click", () => setPick(null), { signal });

  // The phone page's Save is the form's own, pressed: the bar is hidden while
  // the page is up. It mirrors that button: disabled while saving, and with
  // autosave its word and its quiet "Saved" look (profileEditorController).
  save.addEventListener("click", () => formSave?.click(), { signal });
  const mirrorSave = () => {
    save.disabled = !formSave || formSave.disabled;
    save.classList.toggle("is-clean", !!formSave?.classList.contains("is-clean"));
    const word = formSave?.querySelector(".ebar__label")?.textContent;
    if (word) save.textContent = word;
  };
  mirrorSave();
  const saveObserver = new MutationObserver(mirrorSave);
  if (formSave) {
    saveObserver.observe(formSave, { attributes: true, attributeFilter: ["disabled", "class"], subtree: true, childList: true, characterData: true });
  }
  document.addEventListener(
    "keydown",
    (e) => {
      if (e.key === "Escape" && pick && panel.contains(document.activeElement)) setPick(null);
    },
    { signal },
  );

  panel.addEventListener(
    "input",
    (e) => {
      if (e.target instanceof HTMLTextAreaElement) fit(e.target);
      borrowed.forEach(paintWords);
    },
    { signal },
  );

  let queued = false;
  const observer = new MutationObserver(() => {
    if (queued) return;
    queued = true;
    queueMicrotask(() => {
      queued = false;
      sync();
    });
  });
  observer.observe(list, { childList: true, subtree: true });
  addKeys();

  // Language and mode come from the bar: repaint the stand-ins in the new
  // language, and hand everything back when Edit is left.
  const stageObserver = new MutationObserver(() => {
    if (stage.dataset.mode !== "edit" || stage.dataset.view !== "profile") setPick(null);
    else borrowed.forEach(paintWords);
  });
  stageObserver.observe(stage, { attributes: true, attributeFilter: ["data-lang", "data-mode", "data-view"] });

  signal.addEventListener(
    "abort",
    () => {
      observer.disconnect();
      saveObserver.disconnect();
      stageObserver.disconnect();
    },
    { once: true },
  );
});
