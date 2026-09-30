// Listener hygiene across ClientRouter navigations (review 2026-09-29, T2-5,
// T2-6, T2-21, T2-24): one signal per page visit, carousels that take their
// listeners back on re-init, and key handlers that leave modified keys alone.
import { test } from "node:test";
import assert from "node:assert/strict";
import { pageLifetime, releaseWith } from "../../src/lib/pageLifecycle.ts";
import { hasKeyModifier } from "../../src/lib/keys.ts";
import { bindTabKeys } from "../../src/lib/uiTabs.ts";
import { loadTs } from "../helpers/load-ts.mjs";

const key = (k, mods = {}) =>
  Object.assign(new Event("keydown", { cancelable: true }), {
    key: k, altKey: false, ctrlKey: false, metaKey: false, shiftKey: false, ...mods,
  });

test("pageLifetime aborts on the next before-swap, once", () => {
  const doc = new EventTarget();
  const signal = pageLifetime(doc);
  assert.equal(signal.aborted, false);
  doc.dispatchEvent(new Event("astro:before-swap"));
  assert.equal(signal.aborted, true);
  // A later visit gets a signal of its own, untouched by the first swap.
  const next = pageLifetime(doc);
  assert.equal(next.aborted, false);
  doc.dispatchEvent(new Event("astro:before-swap"));
  assert.equal(next.aborted, true);
});

test("releaseWith runs on abort, and at once for a signal that already aborted", () => {
  const live = new AbortController();
  let released = 0;
  releaseWith(live.signal, () => released++);
  assert.equal(released, 0);
  live.abort();
  live.abort();
  assert.equal(released, 1);
  // The case a bare addEventListener("abort") misses: it never fires.
  const gone = new AbortController();
  gone.abort();
  releaseWith(gone.signal, () => released++);
  assert.equal(released, 2);
});

test("hasKeyModifier sees each modifier and nothing else", () => {
  assert.equal(hasKeyModifier(key("ArrowLeft")), false);
  for (const mod of ["altKey", "ctrlKey", "metaKey", "shiftKey"]) {
    assert.equal(hasKeyModifier(key("ArrowLeft", { [mod]: true })), true, mod);
  }
});

test("tab keys page with bare arrows/Home/End and leave modified ones to the browser", () => {
  const tabs = [0, 1, 2].map(() => Object.assign(new EventTarget(), { focus() {} }));
  const picked = [];
  bindTabKeys(tabs, (tab) => picked.push(tabs.indexOf(tab)));

  const bare = key("ArrowLeft");
  tabs[0].dispatchEvent(bare);
  assert.equal(bare.defaultPrevented, true);
  tabs[1].dispatchEvent(key("End"));
  assert.deepEqual(picked, [2, 2]);

  for (const [k, mod] of [["ArrowLeft", "altKey"], ["ArrowRight", "altKey"], ["Home", "ctrlKey"], ["End", "metaKey"], ["ArrowLeft", "shiftKey"]]) {
    const e = key(k, { [mod]: true });
    tabs[1].dispatchEvent(e);
    assert.equal(e.defaultPrevented, false, `${mod}+${k}`);
  }
  assert.deepEqual(picked, [2, 2]);
});

// ── The carousel, against a fake DOM and a fake Embla ─────────────────
// Just enough of each for initCarousels(): the frame, its two slides, the
// arrows and the card's count row with server-rendered chevrons — the nodes
// that SURVIVE a re-init on the editor's preview frame.
class El extends EventTarget {
  constructor(parts = {}, up = {}) {
    super();
    this.parts = parts;
    this.up = up;
    this.dataset = {};
    this.attrs = {};
    this.tabIndex = 0;
    this.title = "";
    this.classList = { toggle() {} };
  }
  querySelector(sel) {
    const v = this.parts[sel];
    return (Array.isArray(v) ? v[0] : v) ?? null;
  }
  querySelectorAll(sel) {
    const v = this.parts[sel];
    return v ? (Array.isArray(v) ? v : [v]) : [];
  }
  closest(sel) { return this.up[sel] ?? null; }
  getAttribute(n) { return this.attrs[n] ?? null; }
  setAttribute(n, v) { this.attrs[n] = String(v); }
  removeAttribute(n) { delete this.attrs[n]; }
  hasAttribute(n) { return n in this.attrs; }
  prepend() {}
  append() {}
}

function carouselHarness() {
  const calls = { next: 0, prev: 0 };
  const instances = [];
  const EmblaCarousel = () => {
    const api = {
      destroyed: false,
      on() {},
      destroy() { api.destroyed = true; },
      scrollNext() { calls.next++; },
      scrollPrev() { calls.prev++; },
      scrollTo() {},
      selectedScrollSnap: () => 0,
      slidesInView: () => [],
    };
    instances.push(api);
    return api;
  };
  const document = { documentElement: { lang: "en" }, addEventListener() {} };
  const pager = loadTs("src/lib/pager.ts", {}, { document });
  const keys = loadTs("src/lib/keys.ts", {});
  const carousel = loadTs(
    "src/lib/communityCarousel.ts",
    { "embla-carousel": { default: EmblaCarousel }, "./pager.ts": pager, "./keys.ts": keys },
    { document, window: { matchMedia: () => ({ matches: false }) } },
  );

  const chevPrev = new El();
  const chevNext = new El();
  const dotRow = new El({ ".ccard__count": new El(), ".pager-chev--prev": chevPrev, ".pager-chev--next": chevNext });
  const card = new El({ ".ccard__dot": [], ".ccard__dots": dotRow });
  const prev = new El();
  const next = new El();
  const frame = new El(
    {
      ".ccard__img": [new El(), new El()],
      ".ccard__slide": [new El(), new El()],
      "[data-carousel-prev]": prev,
      "[data-carousel-next]": next,
    },
    { ".ccard": card },
  );
  const root = new El({ "[data-carousel]": frame });
  return { ...carousel, calls, instances, root, frame, prev, next, chevNext };
}

test("a re-inited carousel holds one set of listeners, not one per init", () => {
  const h = carouselHarness();
  // What the editor's preview does on every rebuild of the same frame.
  for (let i = 0; i < 20; i++) {
    h.destroyCarousel(h.frame);
    h.initCarousels(h.root);
  }
  assert.equal(h.instances.length, 20);
  assert.equal(h.instances.filter((e) => !e.destroyed).length, 1);

  const right = key("ArrowRight");
  h.frame.dispatchEvent(right);
  assert.equal(h.calls.next, 1, "one ArrowRight, one move");
  h.next.dispatchEvent(new Event("click"));
  h.chevNext.dispatchEvent(new Event("click"));
  assert.equal(h.calls.next, 3, "each arrow and chevron press moves once");

  // After the navigation sweep nothing is left listening at all.
  h.destroyAllCarousels();
  h.frame.dispatchEvent(key("ArrowRight"));
  h.chevNext.dispatchEvent(new Event("click"));
  assert.equal(h.calls.next, 3);
  assert.equal(h.instances.every((e) => e.destroyed), true);
});

test("carousel keys leave Alt/Ctrl/Meta/Shift+arrow to the browser", () => {
  const h = carouselHarness();
  h.initCarousels(h.root);
  for (const mod of ["altKey", "ctrlKey", "metaKey", "shiftKey"]) {
    const e = key("ArrowLeft", { [mod]: true });
    h.frame.dispatchEvent(e);
    assert.equal(e.defaultPrevented, false, mod);
  }
  assert.equal(h.calls.prev, 0);
  const bare = key("ArrowLeft");
  h.frame.dispatchEvent(bare);
  assert.equal(bare.defaultPrevented, true);
  assert.equal(h.calls.prev, 1);
});
