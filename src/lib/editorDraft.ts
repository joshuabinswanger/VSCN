import { navigate } from 'astro:transitions/client';
import { confirmDialog } from './confirmDialog';
import { draftOffer, guardedLinkHref, leaveCopy, type StoredDraft } from './draftMerge';

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
 *
 * A click the guard takes reaches NO other click listener — it is stopped at
 * the document's capture phase, and on Leave the navigation is the guard's
 * own navigate(). Anything that must happen when a link is followed listens
 * for `astro:before-preparation` and reads its `sourceElement`, which the
 * guard passes exactly as the router would (2026-09-29: the EN / DE switch's
 * side effects sat on a click listener, so with unsaved edits Leave landed
 * on the other locale with no session choice recorded and /profile bounced
 * the member straight back).
 *
 * WHAT THE DIALOG MAY PROMISE (2026-09-29). The draft holds the words Save
 * would write and nothing else (see draftMerge.ts), so `persist()` reports
 * whether it actually stored them: false when only fields it never holds
 * changed (account settings, a chosen file) or when storage refused the
 * write. Only a true gets the "your draft stays in this tab" sentence. Work
 * in flight (`busy`) is asked about with its own sentence, because the
 * navigation cancels it and no draft brings an upload back.
 */
export function editorDraft<T>(options: {
  key: string;
  /** Bump when the shape of `read()` changes; older drafts are ignored. */
  version?: number;
  /** Everything that counts as unsaved; a superset of `read()`. */
  readDirty?: () => unknown;
  /** What the draft stores: the part of `readDirty()` that Save would still write. */
  read: () => T;
  /** Work still in flight that leaving abandons (an upload, a poster restore). Asked about before a link is followed; blocks a real unload as unsaved edits do. */
  busy?: () => boolean;
  /** Applies a draft; may return the element focus should land on afterwards. */
  restore: (value: T) => HTMLElement | null | void;
  /** Where focus lands after Discard (the banner it was on is gone). */
  discardFocus?: () => HTMLElement | null;
  root: HTMLElement;
  /** When the loaded copy was saved (ms). A draft written before a later save elsewhere is offered as older, not as current — within two seconds of clock slack, since updatedAt comes from whichever client saved. */
  serverUpdatedAt?: number;
  labels: {
    found: string;
    foundNewer?: string;
    /** Only edits the draft never holds were unsaved: a reminder, nothing to restore. */
    foundUnkept?: string;
    restore: string;
    discard: string;
    /** The single button under `foundUnkept`; defaults to `discard`. */
    dismiss?: string;
    /** Unsaved edits and the draft was written. */
    leave: string;
    /** Unsaved edits and NO draft was written: only unkept fields changed, or storage refused it. */
    leaveUnkept?: string;
    /** `busy()` was true. */
    leaveBusy?: string;
    stay?: string;
    go?: string;
  };
}) {
  const { key, read, restore, root, labels } = options;
  const version = options.version ?? 1;
  const controller = new AbortController();
  const signal = controller.signal;
  const readDirty = options.readDirty ?? read;
  const busy = options.busy ?? (() => false);
  let baseline = JSON.stringify(readDirty());
  let wordsBaseline = JSON.stringify(read());
  // The server copy this page's edits are based on: the loaded stamp, then
  // this tab's clock at each Save. Stored with the draft so a return can tell
  // whether the profile was saved elsewhere SINCE, whatever was typed after.
  let loadedAt: number | null = typeof options.serverUpdatedAt === 'number' ? options.serverUpdatedAt : null;
  let timer: ReturnType<typeof setTimeout> | undefined;
  let offered = false;
  // Set while the member has chosen Leave and the navigation is ours.
  let leaving = false;
  const dirty = () => JSON.stringify(readDirty()) !== baseline;
  // The part of dirty() the draft can hold.
  const draftable = () => JSON.stringify(read()) !== wordsBaseline;
  const remove = () => { try { sessionStorage.removeItem(key); } catch { /* Storage may be unavailable. */ } };
  /** Writes the draft; true when the member's words are now in storage. */
  const persist = (): boolean => {
    if (!dirty()) { if (!offered) remove(); return false; }
    const words = draftable();
    const stored: StoredDraft<T> = { version, at: Date.now(), loadedAt, value: words ? read() : null };
    try { sessionStorage.setItem(key, JSON.stringify(stored)); return words; } catch { return false; }
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
    const offer = draftOffer(saved, { version, now: Date.now(), serverUpdatedAt: options.serverUpdatedAt, current: wordsBaseline });
    if (offer.kind === 'none') remove();
    else {
      offered = true;
      const message = document.createElement('p');
      message.textContent = offer.kind === 'unkept' ? (labels.foundUnkept ?? labels.found)
        : offer.newer ? (labels.foundNewer ?? labels.found) : labels.found;
      const discard = () => { remove(); return options.discardFocus?.() ?? null; };
      const actions: ReadonlyArray<readonly [string, () => HTMLElement | null | void]> = offer.kind === 'unkept'
        ? [[labels.dismiss ?? labels.discard, discard]]
        : [[labels.restore, () => restore(saved.value)], [labels.discard, discard]];
      const buttons: HTMLButtonElement[] = [];
      for (const [label, action] of actions) {
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
    }
  } catch { remove(); }
  const changed = () => { clearTimeout(timer); timer = setTimeout(persist, 150); };
  root.addEventListener('input', changed, { signal });
  root.addEventListener('change', changed, { signal });
  root.addEventListener('click', changed, { signal });
  window.addEventListener('beforeunload', (event) => {
    persist();
    if ((dirty() || busy()) && !leaving) { event.preventDefault(); }
  }, { signal });
  // Every route out of the page that the router takes — a link the guard let
  // through or followed itself, Back, Forward, a programmatic navigate() —
  // passes here, and none is cancelled.
  document.addEventListener('astro:before-preparation', () => { persist(); }, { signal });
  document.addEventListener('click', (event) => {
    if (leaving) return;
    const inFlight = busy();
    if (!inFlight && !dirty()) return;
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
    // Written before asking: whether storage took the words decides what the
    // dialog may promise.
    const kept = persist();
    void (async () => {
      const accepted = await confirmDialog(leaveCopy({ busy: inFlight, kept }, labels), { signal, confirm: labels.go, cancel: labels.stay });
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
    /** Writes the draft now; true when the member's words are in storage — what a dialog may promise. */
    keep: persist,
    discard() { baseline = JSON.stringify(readDirty()); wordsBaseline = JSON.stringify(read()); remove(); controller.abort(); },
    /** After a Save: the page holds the server's copy now, written at `at` (this tab's clock, which is at or after the stamp the save wrote). */
    saved(at: number = Date.now()) { offered = false; baseline = JSON.stringify(readDirty()); wordsBaseline = JSON.stringify(read()); loadedAt = at; remove(); banner.remove(); },
    dispose() { persist(); clearTimeout(timer); controller.abort(); banner.remove(); },
  };
}
