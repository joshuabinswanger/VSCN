/**
 * DOM helpers for the admin console.
 *
 * SECURITY: every member-entered string rendered by the console goes through
 * `el()`, which only ever uses `textContent` / `createTextNode`. Nothing in
 * this directory may use `innerHTML`, `insertAdjacentHTML` or `outerHTML` —
 * the console shows strangers' free text (bios, captions, display names) to
 * an account holding the `admin` claim, so a stored script there would be
 * the worst possible place for one to run.
 */

/** Arrays nest, so a view can pass `cond ? [a, b] : c` as one child. */
export type Child = Node | string | number | null | undefined | false | Child[];

export function el<K extends keyof HTMLElementTagNameMap>(
  tag: K,
  attrs: Record<string, string> = {},
  ...children: Child[]
): HTMLElementTagNameMap[K] {
  const node = document.createElement(tag);
  for (const [k, v] of Object.entries(attrs)) node.setAttribute(k, v);
  append(node, ...children);
  return node;
}

/** Append children, skipping the falsy ones so callers can write `cond && el(...)`. */
export function append(node: ParentNode, ...children: Child[]): void {
  for (const c of children) {
    if (c === null || c === undefined || c === false) continue;
    if (Array.isArray(c)) append(node, ...c);
    else node.append(typeof c === "string" || typeof c === "number" ? document.createTextNode(String(c)) : c);
  }
}

/** A `.btn-link` button — the console's in-page link, since destinations are hashes it owns. */
export function linkBtn(label: string, onClick: () => void, cls = "btn-link"): HTMLButtonElement {
  const b = el("button", { type: "button", class: cls }, label);
  b.addEventListener("click", onClick);
  return b;
}

/**
 * Definition list. A value that is already a Node is placed as-is (anchors,
 * tags, lists); anything else is stringified, with empty rendered as a dash.
 * Formatting that knows about field TYPES lives in fields.ts — this only
 * knows about empty.
 */
export function dl(rows: [string, unknown][]): HTMLDListElement {
  const out = el("dl");
  for (const [k, v] of rows) {
    out.append(el("dt", {}, k));
    const dd = el("dd");
    if (v instanceof Node) dd.append(v);
    else dd.textContent = v == null || v === "" ? "—" : String(v);
    out.append(dd);
  }
  return out;
}

/** ISO (or RFC 2822, which Auth's metadata uses) → local date-time, or a dash. */
export const fmt = (iso: string | null | undefined): string => {
  if (!iso) return "—";
  const d = new Date(iso);
  return Number.isNaN(d.getTime()) ? String(iso) : d.toLocaleString("en-GB");
};

/**
 * Copy-to-clipboard button. Shows the outcome ON the button for a moment
 * rather than in the status line, because the status line is for the
 * console's own work and a copy is not that.
 */
export function copyButton(value: string, label = "Copy"): HTMLButtonElement {
  const b = el("button", { type: "button", class: "copybtn", title: `Copy ${value}`, "aria-label": `Copy ${value}` }, label);
  let timer: ReturnType<typeof setTimeout> | undefined;
  b.addEventListener("click", async (e) => {
    e.stopPropagation();
    const ok = await navigator.clipboard.writeText(value).then(() => true, () => false);
    b.textContent = ok ? "Copied" : "Copy failed";
    b.classList.toggle("copybtn--done", ok);
    clearTimeout(timer);
    timer = setTimeout(() => {
      b.textContent = label;
      b.classList.remove("copybtn--done");
    }, 1400);
  });
  return b;
}

/** A value with a copy button after it, kept on one line. */
export function copyable(value: string, cls = ""): HTMLSpanElement {
  return el("span", { class: `copyable ${cls}`.trim() }, el("span", { class: "copyable__val" }, value), copyButton(value));
}

/** Tone of a status-line message. The console maps these to classes on the live region. */
export type Tone = "info" | "success" | "error";

/** The console's status + busy callbacks, passed into every view instead of reached for as globals. */
export interface Reporter {
  say(msg: string, tone?: Tone): void;
  /**
   * Run `work` with `label` on the status line. Resolves undefined on failure
   * (the error is shown, not thrown). On success shows `done` if given,
   * otherwise clears the line — loads pass nothing, mutations pass a sentence.
   */
  busy<T>(label: string, work: () => Promise<T>, done?: string): Promise<T | undefined>;
}
