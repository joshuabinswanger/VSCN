import { hasKeyModifier } from './keys.ts';

/** Roving keyboard focus for tabs; the owner controls panel activation. */
export function bindTabKeys(tabs: HTMLButtonElement[], select: (tab: HTMLButtonElement) => void, signal?: AbortSignal) {
  tabs.forEach((tab, index) => tab.addEventListener('keydown', event => {
    // A modified key keeps its browser meaning (Alt+Left = Back); see keys.ts.
    if (hasKeyModifier(event)) return;
    const target = event.key === 'Home' ? 0 : event.key === 'End' ? tabs.length - 1
      : event.key === 'ArrowRight' ? (index + 1) % tabs.length
      : event.key === 'ArrowLeft' ? (index + tabs.length - 1) % tabs.length : -1;
    if (target < 0) return;
    event.preventDefault(); select(tabs[target]); tabs[target].focus();
  }, { signal }));
}
