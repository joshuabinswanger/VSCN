import { confirmDialog } from './confirmDialog';
/** A recoverable, per-account tab draft. Never stores passwords or file bytes. */
export function editorDraft<T>(options: {
  key: string; readDirty?: () => unknown; read: () => T; restore: (value: T) => void; root: HTMLElement;
  labels: { found: string; restore: string; discard: string; leave: string };
}) {
  const { key, read, restore, root, labels } = options;
  const controller = new AbortController();
  const signal = controller.signal;
  const readDirty = options.readDirty ?? read;
  let baseline = JSON.stringify(readDirty());
  let timer: ReturnType<typeof setTimeout> | undefined;
  let offered = false;
  const dirty = () => JSON.stringify(readDirty()) !== baseline;
  const remove = () => { try { sessionStorage.removeItem(key); } catch { /* Storage may be unavailable. */ } };
  const persist = () => {
    if (!dirty()) { if (!offered) remove(); return; }
    try { sessionStorage.setItem(key, JSON.stringify({ version: 1, at: Date.now(), value: read() })); } catch { /* Navigation protection still works. */ }
  };
  const banner = document.createElement('div');
  banner.className = 'editor-recovery';
  banner.setAttribute('role', 'status');
  try {
    const saved = JSON.parse(sessionStorage.getItem(key) ?? 'null');
    if (saved?.version === 1 && Date.now() - saved.at < 86_400_000) {
      offered = true;
      const message = document.createElement('p'); message.textContent = labels.found;
      banner.append(message);
      for (const [label, action] of [[labels.restore, () => restore(saved.value)], [labels.discard, remove]] as const) {
        const button = document.createElement('button');
        button.type = 'button'; button.className = 'btn-outline'; button.textContent = label;
        button.addEventListener('click', () => { offered = false; action(); banner.remove(); persist(); }, { signal });
        banner.append(button);
      }
      root.prepend(banner);
    } else remove();
  } catch { remove(); }
  const changed = () => { clearTimeout(timer); timer = setTimeout(persist, 150); };
  root.addEventListener('input', changed, { signal });
  root.addEventListener('change', changed, { signal });
  root.addEventListener('click', changed, { signal });
  window.addEventListener('beforeunload', (event) => {
    persist();
    if (dirty()) { event.preventDefault(); }
  }, { signal });
  document.addEventListener('astro:before-preparation', (event) => {
    if (!dirty()) { persist(); return; }
    const navigation = event as Event & { loader: () => Promise<void>; signal: AbortSignal };
    const load = navigation.loader;
    navigation.loader = async () => {
      const accepted = await confirmDialog(labels.leave, AbortSignal.any([signal, navigation.signal]));
      if (!accepted) { event.preventDefault(); return; }
      persist(); await load();
    };
  }, { signal });
  return {
    hasChanges: dirty,
    discard() { baseline = JSON.stringify(readDirty()); remove(); controller.abort(); },
    saved() { offered = false; baseline = JSON.stringify(readDirty()); remove(); banner.remove(); },
    dispose() { persist(); clearTimeout(timer); controller.abort(); banner.remove(); },
  };
}
