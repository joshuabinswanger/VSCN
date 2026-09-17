/**
 * Native <dialog> replacements for window.confirm / window.prompt.
 *
 * Both return a Promise and both are keyboard-complete: Esc cancels (the
 * dialog's own `cancel` event), Enter confirms — the buttons live in a
 * `<form method="dialog">`, so Enter in the prompt's input submits the form
 * and closes the dialog with the confirm button's value. `showModal()` moves
 * focus into the dialog; on close, focus is handed back to whatever had it
 * before, which is the button that opened the dialog.
 *
 * The dialog is appended to a HOST element rather than to <body>, so the
 * console's `:global()` styles reach it: a modal dialog renders in the top
 * layer regardless of where it sits in the tree, so the host is purely a
 * styling scope.
 */
import { el } from "./dom.ts";

export interface ConfirmOptions {
  message: string;
  /** Optional short heading above the message. */
  title?: string;
  confirmLabel?: string;
  cancelLabel?: string;
  /** Styles the confirm button as destructive. */
  danger?: boolean;
}

export interface PromptOptions {
  message: string;
  title?: string;
  defaultValue?: string;
  placeholder?: string;
  confirmLabel?: string;
  cancelLabel?: string;
  /** `<input type>`; defaults to "text". */
  inputType?: string;
}

export interface Dialogs {
  confirm(opts: ConfirmOptions): Promise<boolean>;
  prompt(opts: PromptOptions): Promise<string | null>;
  /** True while a dialog is open — used to keep page-level shortcuts out of the way. */
  isOpen(): boolean;
}

const CONFIRM = "confirm";

export function makeDialogs(host: HTMLElement): Dialogs {
  let open: HTMLDialogElement | null = null;

  function show(
    build: (form: HTMLFormElement) => { focus?: HTMLElement; read: () => string | null },
    opts: { title?: string; message: string; confirmLabel?: string; cancelLabel?: string; danger?: boolean },
  ): Promise<string | null> {
    return new Promise((resolve) => {
      const previous = document.activeElement as HTMLElement | null;
      const form = el("form", { method: "dialog", class: "admin-dialog__form" });
      const dialog = el("dialog", { class: "admin-dialog" }, form);
      const titleId = `admin-dialog-title-${Date.now()}`;
      if (opts.title) {
        form.append(el("h2", { id: titleId, class: "admin-dialog__title" }, opts.title));
        dialog.setAttribute("aria-labelledby", titleId);
      }
      form.append(el("p", { class: "admin-dialog__msg" }, opts.message));
      const { focus, read } = build(form);

      const cancel = el("button", { type: "button", class: "btn-ghost" }, opts.cancelLabel ?? "Cancel");
      const confirm = el(
        "button",
        { type: "submit", value: CONFIRM, class: opts.danger ? "btn-solid btn-danger" : "btn-solid" },
        opts.confirmLabel ?? "OK",
      );
      form.append(el("div", { class: "admin-dialog__actions" }, cancel, confirm));

      // ONE exit, reached from every way out, idempotent. The outcome is
      // decided at the moment of the gesture — Escape, Cancel, Enter/submit —
      // rather than read back off the `close` event afterwards: the `close`
      // event is asynchronous and, in at least one embedded Chromium (the
      // Claude Code browser pane, 2026-09-17), never delivered at all. Nothing
      // here waits on the UA to tell us what we already know.
      let settled = false;
      const finish = (value: string | null) => {
        if (settled) return;
        settled = true;
        if (dialog.open) dialog.close(value ?? "");
        dialog.remove();
        open = null;
        // Return focus to the trigger; the trigger may have been re-rendered
        // away, in which case there is nothing sensible to focus.
        if (previous && previous.isConnected) previous.focus();
        resolve(value);
      };

      cancel.addEventListener("click", () => finish(null));
      // Enter in the input or on the confirm button submits the form; with
      // method="dialog" the UA would close it for us, but we settle first.
      form.addEventListener("submit", (e) => {
        e.preventDefault();
        finish(read());
      });
      // Escape, handled HERE rather than left to the browser: the UA's own
      // Escape-closes-a-modal path runs through Chrome's close-watcher, which
      // measurably did nothing for a dialog opened without user activation.
      dialog.addEventListener("keydown", (e) => {
        if (e.key !== "Escape") return;
        e.preventDefault();
        finish(null);
      });
      // Reached only if the UA gets there first (e.g. a back gesture on
      // Android) — same answer as Escape.
      dialog.addEventListener("cancel", (e) => {
        e.preventDefault();
        finish(null);
      });
      // Fallback for any other way the UA might close it.
      dialog.addEventListener("close", () => finish(dialog.returnValue === CONFIRM ? read() : null));

      host.append(dialog);
      open = dialog;
      dialog.showModal();
      // The prompt focuses its input; the confirm focuses its confirm button,
      // so Enter answers yes — the same keyboard contract window.confirm had.
      const target = focus ?? confirm;
      target.focus();
      if (target instanceof HTMLInputElement) target.select();
    });
  }

  return {
    async confirm(opts) {
      const out = await show(
        () => ({ read: () => CONFIRM }),
        { ...opts, confirmLabel: opts.confirmLabel ?? "Confirm" },
      ).catch(() => null);
      return out === CONFIRM;
    },
    prompt(opts) {
      return show(
        (form) => {
          const input = el("input", {
            class: "input",
            type: opts.inputType ?? "text",
            value: opts.defaultValue ?? "",
            placeholder: opts.placeholder ?? "",
            "aria-label": opts.message,
            autocomplete: "off",
          });
          form.append(input);
          return { focus: input, read: () => input.value };
        },
        { ...opts, confirmLabel: opts.confirmLabel ?? "Save" },
      );
    },
    isOpen: () => open !== null,
  };
}
