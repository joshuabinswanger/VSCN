// WHAT AN ENTRANCE WAITS FOR, AND HOW WORDS RISE — shared by the Portfolios
// cards (pagesEntrance.ts) and the member page (profilePaint.ts), so the two
// pages stay one motion language (2026-10-20).

/** Splits el's text into word masks once (`.cw` > `.cw__i`); stamps each
 *  word's `--d` from `delays[i]`; marks the element `data-words`. */
export function splitWords(el: HTMLElement | null, delays: readonly number[]): HTMLElement[] {
  if (!el) return [];
  if (!el.hasAttribute("data-words")) {
    const words = (el.textContent ?? "").trim().split(/\s+/).filter(Boolean);
    el.textContent = "";
    words.forEach((word, i) => {
      if (i) el.append(" ");
      const mask = document.createElement("span");
      mask.className = "cw";
      const inner = document.createElement("span");
      inner.className = "cw__i";
      inner.textContent = word;
      mask.append(inner);
      el.append(mask);
    });
    el.setAttribute("data-words", "");
  }
  const words = Array.from(el.querySelectorAll<HTMLElement>(".cw__i"));
  words.forEach((w, i) => {
    const delay = delays[i] ?? delays[delays.length - 1] ?? 0;
    w.style.setProperty("--d", `${delay.toFixed(3)}s`);
  });
  return words;
}

/** Resolves once the intro loader, if this is a full load with one, has
 *  finished (body.page-loaded). At once on a swap. */
export function whenIntroDone(): Promise<void> {
  if (!document.getElementById("page-loader")) return Promise.resolve();
  return new Promise((resolve) => {
    const check = () => {
      if (!document.body.classList.contains("page-loaded")) return;
      observer.disconnect();
      resolve();
    };
    const observer = new MutationObserver(check);
    observer.observe(document.body, { attributes: true, attributeFilter: ["class"] });
    check();
  });
}

/** Resolves once <html> no longer carries data-arrive-hold (Layout.astro's
 *  pause after a swap). At once when there is no hold. */
export function whenHoldDone(): Promise<void> {
  const root = document.documentElement;
  if (!root.hasAttribute("data-arrive-hold")) return Promise.resolve();
  return new Promise((resolve) => {
    const check = () => {
      if (root.hasAttribute("data-arrive-hold")) return;
      observer.disconnect();
      resolve();
    };
    const observer = new MutationObserver(check);
    observer.observe(root, { attributes: true, attributeFilter: ["data-arrive-hold"] });
    check();
  });
}

/** Resolves once the picture has loaded and decoded (or failed). */
export async function whenImageReady(img: HTMLImageElement | null): Promise<void> {
  if (!img) return;
  if (!img.complete) {
    await new Promise<void>((resolve) => {
      img.addEventListener("load", () => resolve(), { once: true });
      img.addEventListener("error", () => resolve(), { once: true });
    });
  }
  await img.decode().catch(() => {});
}

/** `ready`, or `capMs` later, whichever comes first — a picture that never
 *  comes still lets the page in. */
export function capped(ready: Promise<void>, capMs: number): Promise<void> {
  return Promise.race([ready, new Promise<void>((resolve) => setTimeout(resolve, capMs))]);
}
