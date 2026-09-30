import { httpsCallable } from 'firebase/functions';
import { functions } from './firebase.ts';
import { triggerRebuild } from './profile.ts';

const status = httpsCallable<void, { state: 'published' | 'queued' | 'delayed' | 'unknown' }>(functions, 'getPublicationStatus');
const running = new WeakMap<HTMLElement, AbortController>();
export function watchPublication(root: HTMLElement, lang: 'en' | 'de', queued: boolean, parent: AbortSignal) {
  // A Save that finishes after the page has gone: an abort listener added to
  // an already-aborted signal never fires, so the poll would run from a dead page.
  if (parent.aborted) return;
  running.get(root)?.abort();
  const controller = new AbortController(); running.set(root, controller);
  parent.addEventListener('abort', () => controller.abort(), { once: true });
  const labels = lang === 'de' ? {
    queued: 'Gespeichert. Veröffentlichung vorgemerkt.', published: 'Gespeichert und veröffentlicht.',
    delayed: 'Gespeichert. Veröffentlichung verzögert.', unknown: 'Gespeichert. Veröffentlichung noch nicht bestätigt.',
    failed: 'Gespeichert. Veröffentlichung konnte nicht angefordert werden.', retry: 'Erneut prüfen',
  } : { queued: 'Saved. Publication queued.', published: 'Saved and published.', delayed: 'Saved. Publication delayed.',
    unknown: 'Saved. Publication not yet confirmed.', failed: 'Saved. Publication could not be requested.', retry: 'Check again' };
  let timer: ReturnType<typeof setTimeout> | undefined;
  controller.signal.addEventListener('abort', () => clearTimeout(timer), { once: true });
  let shown: keyof typeof labels | undefined;
  let retry: HTMLButtonElement | undefined;
  const show = (state: keyof typeof labels) => {
    // The root is a live region: rewriting it with the same words every poll
    // (15 s while queued) would have some readers announce it every time.
    // Unchanged state touches nothing but the retry button's availability.
    if (state === shown) { if (retry) retry.disabled = false; return; }
    shown = state; retry = undefined;
    root.replaceChildren(document.createTextNode(labels[state]));
    if (['failed', 'delayed', 'unknown'].includes(state)) {
      const button = document.createElement('button'); button.type = 'button'; button.className = 'btn-outline'; button.textContent = labels.retry;
      button.addEventListener('click', async () => { button.disabled = true; await triggerRebuild(); void poll(); }); root.append(button);
      retry = button;
    }
  };
  const poll = async () => {
    if (controller.signal.aborted) return;
    try {
      const { data } = await status();
      if (controller.signal.aborted) return;
      show(data.state);
      if (data.state === 'queued') timer = setTimeout(poll, 15_000);
    } catch { if (!controller.signal.aborted) show('unknown'); }
  };
  show(queued ? 'queued' : 'failed');
  if (queued) void poll();
}
