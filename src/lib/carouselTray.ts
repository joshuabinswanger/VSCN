// THE EDITOR'S CAROUSEL TRAY (2026-10-23, the DOM half of
// documentation/20261023-work-carousels-design.md "Editor"; the decisions are
// in carouselEditor.ts and carousels.ts).
//
// In Edit mode a carousel opens out into a dashed tray of thumbnails with a
// + slot at the end (Josh, option A of the mockups). Clicking a thumbnail
// selects that slide and the controller builds its row underneath in slide
// mode. This module clones WorkEditor.astro's `carousel` template, fills it
// and wires its controls; the controller owns the gallery array and commits
// every move through `hooks.commit`, which re-renders and persists the order
// the way reorders do today.
//
// Drag is desktop pointer only (HTML5 drag-and-drop, bound once per page on
// the editor root, so it survives the re-render every move causes): a work
// row's picture dropped on a tray joins at the drop position; a thumbnail
// dragged within its tray reorders; a thumbnail dropped on the project line
// outside any tray is Take out. The dropdown and the arrows do the same jobs
// on touch. The drop position and the reorder arithmetic are pure functions
// below, unit-tested in tests/unit/carouselTray.test.mjs.
import type { GalleryItem } from "./gallery.ts";
import { carouselSettings } from "./carousels.ts";
import { dissolve, moveCarousel, moveCarouselToProject } from "./carouselEditor.ts";
import { WORK_SIZE_PX, workSize, workSizeWidth, type WorkSize } from "./workSize.ts";

/** The same two queries as custom-media.css; a drag needs a pointer that can drag. */
export const DESKTOP_QUERY = "(767px < width) and (not (pointer: coarse))";

/** The drag's own MIME type, so the editor's FILE drops (dragover checks for "Files") stay untouched. */
const WORK_DRAG_TYPE = "application/x-vscn-work";

export interface TrayUnit {
  carouselId: string;
  projectId: string;
  /** Gallery indices of the slides, in slide order; empty for a carousel no work names yet. */
  indices: readonly number[];
  /** 1-based, among the project's carousels: the "Carousel 2" of the labels. */
  number: number;
}

/** What buildRow needs to draw a slide instead of a plain work. */
export interface SlideInfo {
  carouselId: string;
  /** 0-based within the run. */
  position: number;
  count: number;
  /** The carousel's number in its project, for "Slide 2 of 4 in carousel 1". */
  number: number;
}

export type TrayFocus =
  | { carouselId: string; control: "up" | "down" | "project" | "add" | "text" }
  | { imageId: string; control: "thumb" };

export interface TrayHooks {
  s: Readonly<Record<string, string>>;
  template: HTMLTemplateElement;
  /** A getter, like DragHooks': a handler writes to the gallery as it is at event time, not as it was at render. */
  gallery: () => GalleryItem[];
  /** The projects a carousel can move to; the select hides while there is no second one. */
  projects: readonly { projectId: string; label: string }[];
  /** UI-only: which slide each carousel shows (carouselId → imageId). */
  selected: Map<string, string>;
  /** UI-only: which carousels have their Edit panel open (carouselId → open). */
  panelOpen: Map<string, boolean>;
  /** UI-only: text blocks added this session; a carousel's key is "c:" + carouselId. */
  textOpen: Set<string>;
  /** The bar's language: which text-after pane takes focus. */
  lang: "en" | "de";
  /** Whether the + slot can take files (the gallery cap); the note is the controller's. */
  uploadFull: boolean;
  maxTextAfter: number;
  buildRow(index: number, slide: SlideInfo): HTMLElement | null;
  /** A carousel move: the controller normalises, re-renders and persists. */
  commit(next: GalleryItem[] | null, focus?: TrayFocus): void;
  /** Re-render only (a selection changed). */
  rerender(focus?: TrayFocus): void;
  addFiles(files: File[], target: { projectId: string; carouselId: string }): void;
  /** An empty (local) carousel moved to another project, or dissolved. */
  moveLocal(carouselId: string, projectId: string): void;
  dissolveLocal(carouselId: string): void;
  /** A lead field changed (size, text after): the preview follows. */
  syncPreview(): void;
  fitInline(el: HTMLTextAreaElement): void;
}

function named<T extends HTMLElement>(control: T, label: string): T {
  control.setAttribute("aria-label", label);
  return control;
}

/**
 * Where a drop lands among the thumbnails: the number of thumbnails that come
 * before the pointer in reading order. A thumbnail counts when its row is
 * above the pointer, or when it shares the pointer's row and its centre is
 * left of the pointer. Between two rows, the upper row's end.
 */
export function dropIndex(
  rects: readonly { top: number; bottom: number; left: number; right: number }[],
  x: number,
  y: number,
): number {
  let n = 0;
  for (const r of rects) {
    if (r.bottom < y) n++;
    else if (r.top <= y && (r.left + r.right) / 2 <= x) n++;
  }
  return n;
}

/**
 * A thumbnail at `from` dropped at insertion point `to` (counted with the
 * thumbnail itself still in the list): its position once it has left the
 * list, or null when the drop would change nothing.
 */
export function reorderPosition(from: number, to: number): number | null {
  if (to === from || to === from + 1) return null;
  return to > from ? to - 1 : to;
}

/** The tray's own + input is a picker like a block's: disabled at the cap. */
export function setTrayPickersDisabled(root: ParentNode, full: boolean): void {
  for (const picker of root.querySelectorAll<HTMLInputElement>("[data-carousel-files]")) {
    picker.disabled = full;
    picker.closest("[data-carousel-add]")?.setAttribute("aria-disabled", String(full));
  }
}

/** One carousel as the editor draws it: tools, label, tray, the selected slide's row, the text after. */
export function buildTray(hooks: TrayHooks, unit: TrayUnit): HTMLElement | null {
  const { s } = hooks;
  const gallery = hooks.gallery();
  const el = hooks.template.content.firstElementChild?.cloneNode(true);
  if (!(el instanceof HTMLElement)) return null;
  const slides = unit.indices.map((i) => gallery[i]);
  const lead = unit.indices.length ? gallery[unit.indices[0]] : undefined;
  const settings = carouselSettings(slides);
  el.dataset.carouselId = unit.carouselId;
  el.dataset.projectId = unit.projectId;
  named(el, s["profile.carousel.n"].replace("{n}", String(unit.number)));

  const tray = el.querySelector<HTMLElement>("[data-carousel-tray]");
  const add = el.querySelector<HTMLLabelElement>("[data-carousel-add]");
  const picker = el.querySelector<HTMLInputElement>("[data-carousel-files]");
  const label = el.querySelector<HTMLElement>("[data-carousel-label]");
  const slideRow = el.querySelector<HTMLElement>("[data-carousel-slide-row]");
  const up = el.querySelector<HTMLButtonElement>('[data-carousel-move="up"]');
  const down = el.querySelector<HTMLButtonElement>('[data-carousel-move="down"]');
  const dissolveBtn = el.querySelector<HTMLButtonElement>("[data-carousel-dissolve]");
  const sizeSeg = el.querySelector<HTMLElement>("[data-carousel-size]");
  const projectSelect = el.querySelector<HTMLSelectElement>("[data-carousel-project]");
  const text = el.querySelector<HTMLElement>("[data-carousel-text]");
  if (!tray || !add || !picker || !label || !slideRow || !up || !down || !dissolveBtn || !projectSelect) return null;

  // The Edit panel (2026-10-23): a fold remembered per carousel across
  // re-renders, as a work's is (galleryDetailsOpenUI).
  const panel = el.querySelector<HTMLDetailsElement>("[data-carousel-details]");
  if (panel) {
    panel.open = hooks.panelOpen.get(unit.carouselId) ?? false;
    panel.addEventListener("toggle", () => hooks.panelOpen.set(unit.carouselId, panel.open));
  }

  // The frame's shape and width, as a work row carries them, so the block
  // reads like the unit it is on the page.
  if (lead && lead.width > 0 && lead.height > 0) el.style.setProperty("--work-ar", String(lead.width / lead.height));
  el.style.setProperty("--size-w", workSizeWidth(settings));

  label.textContent = (slides.length === 1 ? s["profile.carousel.label.one"] : s["profile.carousel.label"]).replace(
    "{n}",
    String(slides.length),
  );

  // ↑ ↓ move the whole run (found by its first index, not its id: two runs can share one id) past the neighbouring unit; disabled at the
  // project's edge, and for a carousel with nothing in it yet.
  const wireMove = (button: HTMLButtonElement, delta: -1 | 1, control: "up" | "down") => {
    const next = lead ? moveCarousel(gallery, unit.indices[0], delta) : null;
    const text = s[delta < 0 ? "profile.carousel.moveUp" : "profile.carousel.moveDown"];
    named(button, text).title = text;
    button.disabled = next === null;
    button.addEventListener("click", () => hooks.commit(next, { carouselId: unit.carouselId, control }));
  };
  wireMove(up, -1, "up");
  wireMove(down, 1, "down");

  // ✕ dissolves: the slides return to the line in order, nothing is deleted,
  // so nothing to confirm.
  named(dissolveBtn, s["profile.carousel.dissolve"]).title = s["profile.carousel.dissolve"];
  dissolveBtn.addEventListener("click", () => {
    if (!lead) return hooks.dissolveLocal(unit.carouselId);
    hooks.commit(dissolve(hooks.gallery(), unit.indices[0]));
  });

  // S M L: the carousel's one size, on the lead's record (carousels.ts).
  // Hidden until there is a lead to hold it.
  if (sizeSeg) {
    sizeSeg.hidden = !lead;
    named(sizeSeg, s["profile.gallery.size"]);
    const paint = () => {
      const current = workSize(lead ? gallery[unit.indices[0]] : {});
      el.style.setProperty("--size-w", workSizeWidth(lead ? gallery[unit.indices[0]] : {}));
      sizeSeg.querySelectorAll<HTMLButtonElement>("[data-size]").forEach((b) => {
        b.setAttribute("aria-pressed", String(b.dataset.size === current));
      });
    };
    sizeSeg.querySelectorAll<HTMLButtonElement>("[data-size]").forEach((b) => {
      const key = b.dataset.size as WorkSize;
      const text = `${s[`profile.gallery.size.${key}`]} · ${WORK_SIZE_PX[key]} px`;
      named(b, text).title = text;
      b.addEventListener("click", () => {
        if (!lead) return;
        const record = hooks.gallery()[unit.indices[0]];
        if (key === "l") delete record.size;
        else record.size = key;
        paint();
        hooks.syncPreview();
      });
    });
    paint();
  }

  // The project select moves every slide together (moveCarouselToProject),
  // or re-homes an empty carousel. Hidden without a second project.
  const projectWrap = projectSelect.closest<HTMLElement>("[data-carousel-project-wrap]");
  if (projectWrap) projectWrap.hidden = hooks.projects.length < 2;
  named(projectSelect, s["profile.project.select"]).title = s["profile.project.select"];
  projectSelect.replaceChildren(...hooks.projects.map((p) => new Option(p.label, p.projectId)));
  projectSelect.value = unit.projectId;
  projectSelect.addEventListener("change", () => {
    const target = projectSelect.value;
    if (!target || target === unit.projectId) return;
    if (!lead) return hooks.moveLocal(unit.carouselId, target);
    hooks.commit(moveCarouselToProject(hooks.gallery(), unit.indices[0], target), { carouselId: unit.carouselId, control: "project" });
  });

  // THE TRAY: a thumbnail button per slide, the selected one pressed, then
  // the + slot. The first slide is selected unless the member picked another.
  const chosen = hooks.selected.get(unit.carouselId);
  const selectedIndex = unit.indices.find((i) => gallery[i].imageId === chosen) ?? unit.indices[0];
  const desktop = window.matchMedia(DESKTOP_QUERY).matches;
  unit.indices.forEach((index, position) => {
    const item = gallery[index];
    const thumb = document.createElement("button");
    thumb.type = "button";
    thumb.className = "gallery-tray-thumb";
    thumb.dataset.trayThumb = "";
    thumb.dataset.dragWork = "";
    thumb.dataset.imageId = item.imageId;
    thumb.draggable = desktop;
    thumb.setAttribute("aria-pressed", String(index === selectedIndex));
    const text = s["profile.carousel.slide"]
      .replace("{i}", String(position + 1))
      .replace("{n}", String(unit.indices.length))
      .replace("{k}", String(unit.number));
    named(thumb, text).title = text;
    const img = document.createElement("img");
    img.src = item.url;
    img.alt = "";
    img.loading = "lazy";
    img.draggable = false;
    thumb.append(img);
    thumb.addEventListener("click", () => {
      if (index === selectedIndex) return;
      hooks.selected.set(unit.carouselId, item.imageId);
      hooks.rerender({ imageId: item.imageId, control: "thumb" });
    });
    tray.insertBefore(thumb, add);
  });

  // The + uploads straight into this carousel (addGalleryFiles carries the
  // id onto the item). The cap: updateGalleryControls disables it with the
  // blocks' pickers and writes the existing note.
  add.title = s["profile.carousel.add"];
  named(picker, s["profile.carousel.add"]);
  picker.disabled = hooks.uploadFull;
  add.setAttribute("aria-disabled", String(hooks.uploadFull));
  picker.addEventListener("change", () => {
    hooks.addFiles(Array.from(picker.files ?? []), { projectId: unit.projectId, carouselId: unit.carouselId });
    picker.value = "";
  });

  // The selected slide, as a work row in slide mode (buildRow in the controller).
  if (selectedIndex !== undefined) {
    const position = unit.indices.indexOf(selectedIndex);
    const row = hooks.buildRow(selectedIndex, {
      carouselId: unit.carouselId,
      position,
      count: unit.indices.length,
      number: unit.number,
    });
    if (row) slideRow.append(row);
  }
  slideRow.hidden = selectedIndex === undefined;

  // The text block after the carousel, on the lead's record. Hidden until
  // there is a lead, and then until it holds words or was ADDED (through the
  // project's + Add → Text since 2026-10-29; the block's ✕ clears and hides
  // it again).
  const textKey = `c:${unit.carouselId}`;
  const textRemove = el.querySelector<HTMLButtonElement>("[data-carousel-text-remove]");
  const paintText = (open: boolean) => {
    if (text) text.hidden = !lead || !open;
  };
  paintText(Boolean(settings.textAfter?.trim() || settings.textAfterDe?.trim()) || hooks.textOpen.has(textKey));
  if (textRemove) {
    named(textRemove, s["profile.gallery.textRemove"]).title = s["profile.gallery.textRemove"];
    textRemove.addEventListener("click", () => {
      if (lead) {
        const record = hooks.gallery()[unit.indices[0]];
        delete record.textAfter;
        delete record.textAfterDe;
      }
      el.querySelectorAll<HTMLTextAreaElement>("[data-carousel-field]").forEach((a) => (a.value = ""));
      hooks.textOpen.delete(textKey);
      paintText(false);
      hooks.syncPreview();
    });
  }
  const wireText = (key: "textAfter" | "textAfterDe", labelKey: string) => {
    const area = el.querySelector<HTMLTextAreaElement>(`[data-carousel-field="${key}"]`);
    if (!area) return;
    area.value = settings[key] ?? "";
    area.maxLength = hooks.maxTextAfter;
    area.placeholder = s["profile.works.textAfter.ph"];
    named(area, s[labelKey]);
    area.addEventListener("input", () => {
      if (!lead) return;
      const record = hooks.gallery()[unit.indices[0]];
      if (area.value.trim()) record[key] = area.value;
      else delete record[key];
      hooks.fitInline(area);
      hooks.syncPreview();
    });
  };
  wireText("textAfter", "profile.gallery.textAfter");
  wireText("textAfterDe", "profile.gallery.textAfter.de");

  return el;
}

export interface DragHooks {
  gallery(): readonly GalleryItem[];
  /** A work joins a carousel at `position` (its place once it has left wherever it was). */
  join(imageId: string, target: { carouselId: string; projectId: string }, position: number): void;
  /** A slide dropped on a project's line, outside any tray: Take out, into that project. */
  takeOutTo(imageId: string, projectId: string): void;
}

/**
 * Binds the work drag once on the editor root: delegated, so the rows and
 * trays renderGallery() rebuilds keep working. Anything with [data-drag-work]
 * and a data-image-id can be dragged (a row's picture, a tray's thumbnail);
 * trays and project blocks take the drop. Desktop only: draggable is set per
 * element by the renderers from DESKTOP_QUERY.
 */
export function bindWorkDrag(root: HTMLElement, hooks: DragHooks, signal: AbortSignal): void {
  let dragging: { imageId: string; el: HTMLElement } | null = null;
  const indicator = document.createElement("span");
  indicator.className = "gallery-tray-drop";
  indicator.setAttribute("aria-hidden", "true");
  let litTray: HTMLElement | null = null;
  let litBlock: HTMLElement | null = null;

  const clearTargets = () => {
    indicator.remove();
    litTray?.classList.remove("is-drop-target");
    litTray = null;
    litBlock?.classList.remove("is-drop-target");
    litBlock = null;
  };
  const trayUnder = (event: DragEvent) =>
    event.target instanceof Element ? event.target.closest<HTMLElement>("[data-carousel-tray]") : null;
  const blockUnder = (event: DragEvent) =>
    event.target instanceof Element ? event.target.closest<HTMLElement>("[data-project-block]") : null;
  const thumbsOf = (tray: HTMLElement) => Array.from(tray.querySelectorAll<HTMLElement>("[data-tray-thumb]"));
  const indexIn = (tray: HTMLElement, event: DragEvent) =>
    dropIndex(
      thumbsOf(tray).map((t) => t.getBoundingClientRect()),
      event.clientX,
      event.clientY,
    );
  const inCarousel = (imageId: string) => Boolean(hooks.gallery().find((g) => g.imageId === imageId)?.carouselId);

  root.addEventListener(
    "dragstart",
    (event) => {
      const el = event.target instanceof Element ? event.target.closest<HTMLElement>("[data-drag-work]") : null;
      const imageId = el?.dataset.imageId;
      if (!el || !imageId || !event.dataTransfer) return;
      dragging = { imageId, el };
      event.dataTransfer.setData(WORK_DRAG_TYPE, imageId);
      event.dataTransfer.effectAllowed = "move";
      el.classList.add("is-dragging");
    },
    { signal },
  );

  root.addEventListener(
    "dragover",
    (event) => {
      if (!dragging) return;
      const tray = trayUnder(event);
      if (tray) {
        event.preventDefault();
        if (event.dataTransfer) event.dataTransfer.dropEffect = "move";
        if (litTray !== tray) {
          clearTargets();
          litTray = tray;
          tray.classList.add("is-drop-target");
        }
        const at = indexIn(tray, event);
        const thumbs = thumbsOf(tray);
        const before = thumbs[at] ?? tray.querySelector("[data-carousel-add]");
        if (indicator.nextSibling !== before || indicator.parentElement !== tray) tray.insertBefore(indicator, before);
        return;
      }
      const block = blockUnder(event);
      if (block && inCarousel(dragging.imageId)) {
        event.preventDefault();
        if (event.dataTransfer) event.dataTransfer.dropEffect = "move";
        if (litBlock !== block) {
          clearTargets();
          litBlock = block;
          block.classList.add("is-drop-target");
        }
        return;
      }
      clearTargets();
    },
    { signal },
  );

  root.addEventListener(
    "dragleave",
    (event) => {
      if (!(event.relatedTarget instanceof Node) || !root.contains(event.relatedTarget)) clearTargets();
    },
    { signal },
  );

  root.addEventListener(
    "drop",
    (event) => {
      if (!dragging) return;
      const { imageId } = dragging;
      const tray = trayUnder(event);
      const block = blockUnder(event);
      if (!tray && !block) return;
      event.preventDefault();
      if (tray) {
        const unit = tray.closest<HTMLElement>("[data-carousel-block]");
        const carouselId = unit?.dataset.carouselId;
        const projectId = unit?.dataset.projectId;
        if (!carouselId || !projectId) return clearTargets();
        const at = indexIn(tray, event);
        const from = thumbsOf(tray).findIndex((t) => t.dataset.imageId === imageId);
        clearTargets();
        const position = from === -1 ? at : reorderPosition(from, at);
        if (position === null) return;
        hooks.join(imageId, { carouselId, projectId }, position);
        return;
      }
      clearTargets();
      const projectId = block?.dataset.projectId;
      if (projectId && inCarousel(imageId)) hooks.takeOutTo(imageId, projectId);
    },
    { signal },
  );

  root.addEventListener(
    "dragend",
    () => {
      dragging?.el.classList.remove("is-dragging");
      dragging = null;
      clearTargets();
    },
    { signal },
  );
}
