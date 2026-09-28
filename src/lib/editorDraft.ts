import { navigate } from 'astro:transitions/client';
import { confirmDialog } from './confirmDialog';
import { guardedLinkHref } from './draftMerge';

/**
 * A recoverable, per-account tab draft. Never stores passwords or file bytes.
 *
 * THE LEAVE GUARD INTERCEPTS THE CLICK, NOT THE NAVIGATION (2026-09-28). The
 * first version wrapped `astro:before-preparation`'s loader and called
 * preventDefault() when the member chose Stay — but Astro 7's router treats
 * a prevented preparation as "fall back to a full page load"
 * (transitions/router.js: `location.href = to.href`), so Stay hard-navigated
 * and then beforeunload raised the native prompt on top. Now a capture-phase
 * click listener takes the link BEFORE the ClientRouter sees it, asks, and
 * on Leave calls navigate() itself. `astro:before-preparation` only persists:
 * Back/Forward ("traverse") cannot be cancelled, and the draft is what makes
 * that safe. `beforeunload` stays for real unloads only.
 */
export function editorDraft<T>(options: {
  key: string;
  /** Bump when the shape of `read()` changes; older drafts are ignored. */
  version?: number;
  readDirty?: () => unknown;
  read: () => T;
  /** Applies a draft; may return the element focus should land on afterwards. */
  restore: (value: T) => HTMLElement | null | void;
  /** Where focus lands after Discard (the banner it was on is gone). */
  discardFocus?: () => HTMLElement | null;
  root: HTMLElement;
  /** When the loaded copy was saved (ms). A draft older than it is offered as such, not as current. */
  serverUpdatedAt?: number;
  labels: { found: string; foundNewer?: string; restore: string; discard: string; leave: string; stay?: string; go?: string };
}) {
  const { key, read, restore, root, labels } = options;
  const version = options.version ?? 1;
  const controller = new AbortController();
  const signal = controller.signal;
  const readDirty = options.readDirty ?? read;
  let baseline = JSON.stringify(readDirty());
  let timer: ReturnType<typeof setTimeout> | undefined;
  let offered = false;
  // Set while the member has chosen Leave and the navigation is ours.
  let leaving = false;
  const dirty = () => JSON.stringify(readDirty()) !== baseline;
  const remove = () => { try { sessionStorage.removeItem(key); } catch { /* Storage may be unavailable. */ } };
  const persist = () => {
    if (!dirty()) { if (!offered) remove(); return; }
    try { sessionStorage.setItem(key, JSON.stringify({ version, at: Date.now(), value: read() })); } catch { /* Navigation protection still works. */ }
  };
  const focusAfter = (target: HTMLElement | null | undefined) => {
    const fallback = root.querySelector<HTMLElement>('[role="tab"][aria-selected="true"]');
    const el = target ?? fallback ?? root;
    if (el === root && !root.hasAttribute('tabindex')) root.tabIndex = -1;
    el.focus({ preventScroll: el !== target });
  };
  const banner = document.createElement('div');
  banner.className = 'editor-recovery';
  banner.setAttribute('role', 'status');
  try {
    const saved = JSON.parse(sessionStorage.getItem(key) ?? 'null');
    if (saved?.version === version && typeof saved.at === 'number' && Date.now() - saved.at < 86_400_000) {
      offered = true;
      // The server copy was saved after this draft was last touched — from
      // another tab or device. Said so, rather than offering the older text
      // as if it were the newer one. (Two seconds of slack for the clocks:
      // updatedAt is written from whichever client saved.)
      const newer = typeof options.serverUpdatedAt === 'number' && options.serverUpdatedAt - saved.at > 2000;
      const message = document.createElement('p');
      message.textContent = newer ? (labels.foundNewer ?? labels.found) : labels.found;
      const buttons: HTMLButtonElement[] = [];
      for (const [label, action] of [
        [labels.restore, () => restore(saved.value)],
        [labels.discard, () => { remove(); return options.discardFocus?.() ?? null; }],
      ] as const) {
        const button = document.createElement('button');
        button.type = 'button'; button.className = 'btn-outline'; button.textContent = label;
        button.addEventListener('click', () => {
          offered = false;
          const target = action();
          banner.remove();
          persist();
          focusAfter(target ?? null);
        }, { signal });
        buttons.push(button);
      }
      // The live region goes into the document EMPTY and is filled a frame
      // later: a role=status inserted with its text already inside is not
      // reliably announced.
      root.prepend(banner);
      requestAnimationFrame(() => { if (banner.isConnected) banner.append(message, ...buttons); });
    } else remove();
  } catch { remove(); }
  const changed = () => { clearTimeout(timer); timer = setTimeout(persist, 150); };
  root.addEventListener('input', changed, { signal });
  root.addEventListener('change', changed, { signal });
  root.addEventListener('click', changed, { signal });
  window.addEventListener('beforeunload', (event) => {
    persist();
    if (dirty() && !leaving) { event.preventDefault(); }
  }, { signal });
  // Every route out of the page that the router takes — a link, Back,
  // Forward, a programmatic navigate() — passes here, and none is cancelled.
  document.addEventListener('astro:before-preparation', () => { persist(); }, { signal });
  document.addEventListener('click', (event) => {
    if (leaving || !dirty()) return;
    let node: EventTarget | null = event.composed ? event.composedPath()[0] ?? event.target : event.target;
    if (node instanceof Element) node = node.closest('a, area');
    if (!(node instanceof HTMLAnchorElement) && !(node instanceof HTMLAreaElement) && !(node instanceof SVGAElement)) return;
    const link = node;
    const href = guardedLinkHref(
      {
        href: link instanceof SVGAElement ? link.href.baseVal : link.href,
        target: link instanceof SVGAElement ? link.target.baseVal : link.target,
        download: link.hasAttribute('download'),
        reload: link.dataset.astroReload !== undefined,
      },
      event,
      location.href,
    );
    if (!href) return;
    // Taken here, at the document's capture phase, so the ClientRouter's own
    // bubble-phase listener never sees the click; there is nothing to cancel later.
    event.preventDefault();
    event.stopPropagation();
    void (async () => {
      const accepted = await confirmDialog(labels.leave, { signal, confirm: labels.go, cancel: labels.stay });
      if (!accepted || signal.aborted) return;
      persist();
      leaving = true;
      try {
        await navigate(href, {
          history: link.dataset.astroHistory === 'replace' ? 'replace' : 'auto',
          sourceElement: link,
        });
      } finally {
        leaving = false;
      }
    })();
  }, { capture: true, signal });
  return {
    hasChanges: dirty,
    discard() { baseline = JSON.stringify(readDirty()); remove(); controller.abort(); },
    saved() { offered = false; baseline = JSON.stringify(readDirty()); remove(); banner.remove(); },
    dispose() { persist(); clearTimeout(timer); controller.abort(); banner.remove(); },
  };
}
