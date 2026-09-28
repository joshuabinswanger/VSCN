/** Accessible modal confirmation: Escape cancels, focus returns to the trigger. */
export function confirmDialog(message: string, signal?: AbortSignal): Promise<boolean> {
  if (signal?.aborted) return Promise.resolve(false);
  return new Promise(resolve => {
    const de = document.documentElement.lang === 'de';
    const dialog = document.createElement('dialog'); dialog.className = 'ui-dialog';
    const title = document.createElement('p'); title.id = `confirm-${crypto.randomUUID()}`;
    title.textContent = message; dialog.setAttribute('aria-labelledby', title.id);
    const form = document.createElement('form'); form.method = 'dialog';
    const cancel = document.createElement('button'); cancel.className = 'btn-outline'; cancel.value = 'cancel'; cancel.textContent = de ? 'Bleiben' : 'Stay';
    const leave = document.createElement('button'); leave.className = 'btn-solid'; leave.value = 'leave'; leave.textContent = de ? 'Verlassen' : 'Leave';
    form.append(cancel, leave); dialog.append(title, form); document.body.append(dialog);
    const abort = () => dialog.close('cancel');
    dialog.addEventListener('close', () => { signal?.removeEventListener('abort', abort); const accepted = dialog.returnValue === 'leave'; dialog.remove(); resolve(accepted); }, { once: true });
    signal?.addEventListener('abort', abort, { once: true });
    dialog.showModal(); cancel.focus();
  });
}
