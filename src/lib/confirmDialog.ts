export interface ConfirmDialogOptions {
  signal?: AbortSignal;
  /** The accepting button. Default: Leave / Verlassen. */
  confirm?: string;
  /** The declining button, focused first. Default: Stay / Bleiben. */
  cancel?: string;
}

/** Accessible modal confirmation: Escape cancels, focus returns to the trigger. */
export function confirmDialog(message: string, options: ConfirmDialogOptions = {}): Promise<boolean> {
  const { signal } = options;
  if (signal?.aborted) return Promise.resolve(false);
  return new Promise(resolve => {
    const de = document.documentElement.lang === 'de';
    const dialog = document.createElement('dialog'); dialog.className = 'ui-dialog';
    const title = document.createElement('p'); title.id = `confirm-${crypto.randomUUID()}`;
    title.textContent = message; dialog.setAttribute('aria-labelledby', title.id);
    const form = document.createElement('form'); form.method = 'dialog';
    const cancel = document.createElement('button'); cancel.className = 'btn-outline'; cancel.value = 'cancel';
    cancel.textContent = options.cancel ?? (de ? 'Bleiben' : 'Stay');
    const accept = document.createElement('button'); accept.className = 'btn-solid'; accept.value = 'accept';
    accept.textContent = options.confirm ?? (de ? 'Verlassen' : 'Leave');
    form.append(cancel, accept); dialog.append(title, form); document.body.append(dialog);
    const abort = () => dialog.close('cancel');
    dialog.addEventListener('close', () => { signal?.removeEventListener('abort', abort); const accepted = dialog.returnValue === 'accept'; dialog.remove(); resolve(accepted); }, { once: true });
    signal?.addEventListener('abort', abort, { once: true });
    dialog.showModal(); cancel.focus();
  });
}
