// The profile editor's bar (ProfileForm.astro, 2026-10-13): its animated size
// and the Plus button's pull-down menu. Kept out of profileEditorController.ts
// because neither knows anything about profiles — the controller decides WHAT
// the bar holds; this makes the bar follow smoothly and makes the menu behave
// like a menu.

/**
 * THE BAR FOLLOWS ITS CONTENT, SMOOTHLY (Josh: "add smooth animation when its
 * width changes"). CSS cannot transition `width: auto`, and
 * `interpolate-size` is not in every Safari yet, so the bar gets explicit
 * pixel sizes measured from its inner box, and transitions those. The inner
 * box is `width: max-content` capped by the window, so its size never depends
 * on the bar's — no feedback loop, and a ResizeObserver on it sees every
 * change: a tab switch, the card hiding the mode switch, a wrap to two rows,
 * the Save label turning into "Saving…".
 *
 * The first measurement is applied without a transition (the bar must not
 * grow in from nothing on page load); `is-sized` arms the transition after.
 * Returns the teardown.
 */
export function followContentSize(bar: HTMLElement, inner: HTMLElement): () => void {
  let armed = false;
  const apply = () => {
    const r = inner.getBoundingClientRect();
    if (r.width === 0 && r.height === 0) return;
    bar.style.width = `${Math.ceil(r.width)}px`;
    bar.style.height = `${Math.ceil(r.height)}px`;
    if (!armed) {
      armed = true;
      // Two frames: the first paints the measured size, the second arms the
      // transition, so the initial size is never animated.
      requestAnimationFrame(() => requestAnimationFrame(() => bar.classList.add("is-sized")));
    }
  };
  const ro = new ResizeObserver(apply);
  ro.observe(inner);
  apply();
  return () => ro.disconnect();
}

/**
 * A PULL-DOWN MENU (HIG pull-down-buttons): a button that opens a short list
 * of commands, closes when one is chosen, on Escape, on a click outside and on
 * Tab away. Arrow keys move between the enabled items, Home/End jump. Items
 * carry role="menuitem" and tabindex="-1"; the menu manages focus itself.
 *
 * `onChoose` runs before the item's own click handlers do their work (it is a
 * capturing listener), so the caller can prepare the page — here, switch the
 * Works tab to Edit — before the item acts.
 */
export function bindMenuButton(
  button: HTMLButtonElement,
  menu: HTMLElement,
  options: { signal: AbortSignal; onChoose?: (item: HTMLElement) => void; onOpen?: () => void },
): { close: (refocus?: boolean) => void } {
  const { signal } = options;
  const items = () =>
    Array.from(menu.querySelectorAll<HTMLButtonElement>('[role="menuitem"]')).filter((el) => !el.disabled && !el.hidden);

  const isOpen = () => !menu.hidden;
  const open = () => {
    if (isOpen()) return;
    options.onOpen?.();
    menu.hidden = false;
    button.setAttribute("aria-expanded", "true");
    items()[0]?.focus();
  };
  const close = (refocus = false) => {
    if (!isOpen()) return;
    menu.hidden = true;
    button.setAttribute("aria-expanded", "false");
    if (refocus) button.focus();
  };

  button.addEventListener("click", () => (isOpen() ? close() : open()), { signal });
  button.addEventListener(
    "keydown",
    (e) => {
      if (e.key === "ArrowUp" || e.key === "ArrowDown") {
        e.preventDefault();
        open();
      }
    },
    { signal },
  );

  menu.addEventListener(
    "click",
    (e) => {
      const item = (e.target as Element | null)?.closest<HTMLElement>('[role="menuitem"]');
      if (!item || (item as HTMLButtonElement).disabled) return;
      close();
      options.onChoose?.(item);
    },
    { signal, capture: true },
  );

  menu.addEventListener(
    "keydown",
    (e) => {
      const list = items();
      const at = list.indexOf(document.activeElement as HTMLButtonElement);
      const go = (i: number) => list[(i + list.length) % list.length]?.focus();
      if (e.key === "ArrowDown") go(at + 1);
      else if (e.key === "ArrowUp") go(at - 1);
      else if (e.key === "Home") go(0);
      else if (e.key === "End") go(list.length - 1);
      else if (e.key === "Escape") close(true);
      else if (e.key === "Tab") {
        close();
        return;
      } else return;
      e.preventDefault();
    },
    { signal },
  );

  document.addEventListener(
    "pointerdown",
    (e) => {
      const t = e.target as Node | null;
      if (isOpen() && t && !menu.contains(t) && !button.contains(t)) close();
    },
    { signal },
  );

  return { close };
}
