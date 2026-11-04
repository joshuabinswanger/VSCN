/**
 * THE MOVE KEY (2026-11-04, Josh: "instead of having a drop down for which
 * project the carousels, the images and so on are ... all of this should move
 * to a move button. When you click on it, you can select other carousels, you
 * can select other projects ... next to the remove button").
 *
 * The project and carousel <select>s stay in the DOM as the engine: their
 * change handlers are the one place that moves a work, a slide or a carousel,
 * and this menu only picks an option and fires `change` on them. They are
 * never shown (profile-editor.css); a select's wrap being `hidden` still says
 * whether that kind of move applies, as it did when the select was on screen.
 *
 * The menu is a popover in the top layer, so the side card and the folds
 * cannot clip it, and light dismiss and Escape come with it.
 */

export interface MoveGroup {
  label: string;
  select: HTMLSelectElement;
  /** The select's wrap: `hidden` = this kind of move does not apply here. */
  wrap: HTMLElement | null;
}

let menu: HTMLElement | null = null;
let owner: HTMLButtonElement | null = null;
/** Light dismiss closes the menu on pointerdown, before its own key's click: that click must not reopen it. */
let lastClosed: { button: HTMLButtonElement | null; at: number } = { button: null, at: 0 };

function menuEl(): HTMLElement {
  if (menu?.isConnected) return menu;
  menu = document.createElement("div");
  menu.className = "move-menu";
  menu.setAttribute("popover", "auto");
  menu.setAttribute("role", "menu");
  menu.addEventListener("toggle", (event) => {
    if ((event as ToggleEvent).newState === "closed") {
      owner?.setAttribute("aria-expanded", "false");
      lastClosed = { button: owner, at: performance.now() };
      owner = null;
    }
  });
  document.body.append(menu);
  return menu;
}

/** The groups that have somewhere to go: a shown wrap and an option other than the current one. */
function liveGroups(groups: MoveGroup[]): MoveGroup[] {
  return groups.filter(
    (g) => g.wrap && !g.wrap.hidden && Array.from(g.select.options).some((o) => o.value !== g.select.value),
  );
}

/** Show the key only when there is a move to make. Call after the selects are filled. */
export function syncMoveKey(button: HTMLButtonElement, groups: MoveGroup[]): void {
  button.hidden = liveGroups(groups).length === 0;
}

function place(m: HTMLElement, button: HTMLElement): void {
  const r = button.getBoundingClientRect();
  const vw = document.documentElement.clientWidth;
  const vh = window.visualViewport?.height ?? window.innerHeight;
  const w = m.offsetWidth;
  const h = m.offsetHeight;
  const left = Math.max(8, Math.min(r.right - w, vw - w - 8));
  const below = r.bottom + 6;
  const top = below + h > vh - 8 && r.top - 6 - h > 8 ? r.top - 6 - h : below;
  m.style.left = `${Math.round(left)}px`;
  m.style.top = `${Math.round(top)}px`;
}

/** Wire one Move key to its groups (built per render, like the row it sits in). */
export function bindMoveKey(button: HTMLButtonElement, groups: MoveGroup[]): void {
  button.setAttribute("aria-haspopup", "menu");
  button.setAttribute("aria-expanded", "false");
  syncMoveKey(button, groups);
  button.addEventListener("click", () => {
    const m = menuEl();
    const wasMine =
      (owner === button && m.matches(":popover-open")) ||
      (lastClosed.button === button && performance.now() - lastClosed.at < 400);
    if (m.matches(":popover-open")) m.hidePopover();
    if (wasMine) return;

    m.replaceChildren();
    for (const g of liveGroups(groups)) {
      const head = document.createElement("p");
      head.className = "move-menu__lbl t-label";
      head.textContent = g.label;
      m.append(head);
      for (const opt of Array.from(g.select.options)) {
        if (opt.value === g.select.value) continue;
        const item = document.createElement("button");
        item.type = "button";
        item.className = "move-menu__item";
        item.setAttribute("role", "menuitem");
        item.textContent = opt.textContent;
        item.addEventListener("click", () => {
          m.hidePopover();
          g.select.value = opt.value;
          g.select.dispatchEvent(new Event("change", { bubbles: true }));
        });
        m.append(item);
      }
    }
    owner = button;
    button.setAttribute("aria-expanded", "true");
    m.showPopover();
    place(m, button);
    m.querySelector<HTMLElement>(".move-menu__item")?.focus({ preventScroll: true });
  });
}
