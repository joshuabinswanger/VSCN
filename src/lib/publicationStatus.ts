import { httpsCallable } from 'firebase/functions';
import { functions } from './firebase.ts';
import { ui } from '../i18n/translations.ts';
import { triggerRebuild } from './profile.ts';

// THE LINE UNDER SAVE. The save itself has landed by the time this runs;
// what is reported here is only whether the site has caught up with it.
//
// `queued` is what requestRebuild answered. False does NOT mean the change
// will not publish: the Firestore triggers on the profile and image records
// queue the build regardless (functions/src/slugs.ts, rebuildQueue.ts), so a
// failed callable is asked about, not announced — getPublicationStatus is
// polled first and its answer is the wording (review T3-4). Only when that
// call fails too does the line say "not yet confirmed", with Check again.
//
// `listed` is the member's own Account toggle. Off, their page is not
// built, so "published" would overstate it: the bare "Saved." and the hidden
// banner above the form say the rest (review T3-25).

type State = 'published' | 'queued' | 'delayed' | 'unknown';
type Label = State | 'saved';
const status = httpsCallable<void, { state: State }>(functions, 'getPublicationStatus');
const running = new WeakMap<HTMLElement, AbortController>();
/** From 15 s up to a minute: the server says "delayed" after 30 min, so the poll ends there on its own. */
const POLL_MS = { first: 15_000, max: 60_000 };

export function watchPublication(
  root: HTMLElement, lang: 'en' | 'de', queued: boolean, parent: AbortSignal, options: { listed?: boolean } = {},
) {
  // A Save that finishes after the page has gone: an abort listener added to
  // an already-aborted signal never fires, so the poll would run from a dead page.
  if (parent.aborted) return;
  running.get(root)?.abort();
  const controller = new AbortController(); running.set(root, controller);
  parent.addEventListener('abort', () => controller.abort(), { once: true });
  const t = (key: string) => ui[lang][key] ?? ui.en[key] ?? key;
  let timer: ReturnType<typeof setTimeout> | undefined;
  controller.signal.addEventListener('abort', () => clearTimeout(timer), { once: true });
  let shown: Label | undefined;
  let retry: HTMLButtonElement | undefined;
  const show = (state: Label) => {
    // The root is a live region: rewriting it with the same words every poll
    // would have some readers announce it every time. Unchanged state touches
    // nothing but the retry button's availability.
    if (state === shown) { if (retry) retry.disabled = false; return; }
    shown = state; retry = undefined;
    root.replaceChildren(document.createTextNode(t(`profile.publication.${state}`)));
    // Green only for what is actually on the site; the rest is neutral.
    const settled = state === 'published' || state === 'saved';
    root.classList.toggle('msg-ok', settled);
    root.classList.toggle('msg-note', !settled);
    if (state === 'delayed' || state === 'unknown') {
      const button = document.createElement('button'); button.type = 'button'; button.className = 'btn-outline'; button.textContent = t('profile.publication.retry');
      // A re-request is a no-op on an unchanged fingerprint; what it does do
      // is give a member from before generations a generation to be read by.
      button.addEventListener('click', async () => { button.disabled = true; await triggerRebuild(); void poll(); }); root.append(button);
      retry = button;
    }
  };
  let wait = POLL_MS.first;
  const poll = async () => {
    if (controller.signal.aborted) return;
    try {
      const { data } = await status();
      if (controller.signal.aborted) return;
      show(data.state);
      if (data.state === 'queued') { timer = setTimeout(poll, wait); wait = Math.min(wait * 2, POLL_MS.max); }
    } catch { if (!controller.signal.aborted) show('unknown'); }
  };
  if (options.listed === false) { show('saved'); return; }
  show(queued ? 'queued' : 'unknown');
  void poll();
}
