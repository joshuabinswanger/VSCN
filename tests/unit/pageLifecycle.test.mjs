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

// ── The carousel, against a fake DOM and a fake scroller ──────────────
// The engine is native scroll-snap (2026-10-15): the index is the track's
// scrollLeft over its width, the chevrons scroll by one width, the ends
// wrap. Just enough DOM for initCarousels(): the frame, its track and
// slides, the arrows and the card's dot row with server-rendered
// chevrons — the nodes that SURVIVE a re-init on the editor's preview frame.
class El extends EventTarget {
  constructor(parts = {}, up = {}) {
    super();
    this.parts = parts;
    this.up = up;
    this.dataset = {};
    this.attrs = {};
    this.tabIndex = 0;
    this.title = "";
    this.textContent = "";
    const classes = new Set();
    this.classList = {
      toggle(c, on) { if (on ?? !classes.has(c)) classes.add(c); else classes.delete(c); },
      add(c) { classes.add(c); },
      contains(c) { return classes.has(c); },
    };
    this.style = { props: {}, setProperty(n, v) { this.props[n] = v; } };
    this.clientWidth = 300;
    this.scrollLeft = 0;
    this.scrolls = [];
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
  scrollTo(o) { this.scrolls.push(o); this.scrollLeft = o.left; }
  focus() {}
  prepend() {}
  append() {}
  before() {}
  replaceChildren() {}
}

function carouselHarness() {
  const document = {
    documentElement: { lang: "en" },
    addEventListener() {},
    activeElement: null,
    createElement: () => new El(),
  };
  const window = { matchMedia: () => ({ matches: false }) };
  const pager = loadTs("src/lib/pager.ts", {}, { document });
  const carouselDots = loadTs("src/lib/carouselDots.ts", {}, { document });
  const keys = loadTs("src/lib/keys.ts", {});
  const carousel = loadTs(
    "src/lib/communityCarousel.ts",
    { "./carouselDots.ts": carouselDots, "./pager.ts": pager, "./keys.ts": keys },
    { document, window, requestAnimationFrame: (fn) => fn(), ResizeObserver: undefined },
  );

  const slides = [new El(), new El(), new El()];
  slides.forEach((s, i) => { s.dataset.workUrl = `u${i}`; });
  const images = slides.map(() => new El());
  const track = new El({ "[data-carousel-slide]": slides, "[data-carousel-img]": images });
  const chevPrev = new El();
  const chevNext = new El();
  const dots = [new El(), new El(), new El()];
  const strip = new El();
  strip.parentElement = new El();
  const dotRow = new El({ ".cdots__strip": strip, ".pager-chev--prev": chevPrev, ".pager-chev--next": chevNext });
  const card = new El({ "[data-carousel-dots] .cdot": dots, "[data-carousel-dots]": dotRow });
  const prev = new El();
  const next = new El();
  const live = new El();
  const frame = new El(
    {
      "[data-carousel-track]": track,
      "[data-carousel-img]": images,
      "[data-carousel-slide]": slides,
      "[data-carousel-prev]": prev,
      "[data-carousel-next]": next,
      "[data-carousel-live]": live,
    },
    { "[data-carousel-scope]": card },
  );
  frame.dataset.positionLabel = "Image {n} of {total}";
  const root = new El({ "[data-carousel]": frame });
  return { ...carousel, root, frame, track, slides, prev, next, chevPrev, chevNext, dots, live };
}

test("carousel: chevrons page by one width and wrap at the ends", () => {
  const h = carouselHarness();
  h.initCarousels(h.root);
  assert.equal(h.frame.dataset.ready, "true");
  assert.equal(h.frame.dataset.index, "0");
  assert.equal(h.slides[0].tabIndex, 0);
  assert.equal(h.slides[1].tabIndex, -1);
  h.chevNext.dispatchEvent(new Event("click"));
  assert.equal(h.track.scrolls.at(-1).left, 300);
  assert.equal(h.frame.dataset.index, "1");
  assert.deepEqual(h.dots.map((d) => d.classList.contains("cdot--on")), [false, true, false]);
  assert.equal(h.live.textContent, "Image 2 of 3");
  assert.equal(h.slides[1].tabIndex, 0);
  assert.equal(h.slides[0].tabIndex, -1);
  assert.equal(h.slides[0].getAttribute("aria-hidden"), "true");
  assert.equal(h.slides[1].getAttribute("aria-hidden"), null);
  h.chevPrev.dispatchEvent(new Event("click"));
  h.chevPrev.dispatchEvent(new Event("click"));
  assert.equal(h.track.scrolls.at(-1).left, 600, "prev from the first slide wraps to the last");
  assert.equal(h.track.scrolls.at(-1).behavior, "smooth", "a wrap slides back (2026-10-15)");
  // A finger swipe moves the track; the scroll event is how the engine learns.
  h.track.scrollLeft = 310;
  h.track.dispatchEvent(new Event("scroll"));
  assert.equal(h.frame.dataset.index, "1");
  assert.deepEqual(h.dots.map((d) => d.classList.contains("cdot--on")), [false, true, false]);
});

test("carousel: a show event jumps to that slide; destroy releases the frame", () => {
  const h = carouselHarness();
  h.initCarousels(h.root);
  const ev = new Event("vscn:carousel-show");
  Object.defineProperty(ev, "target", { value: h.slides[2] });
  h.frame.dispatchEvent(ev);
  assert.equal(h.track.scrolls.at(-1).left, 600);
  assert.equal(h.frame.dataset.index, "2");
  h.destroyCarousel(h.frame);
  assert.equal(h.frame.dataset.ready, undefined);
  const before = h.track.scrolls.length;
  h.chevNext.dispatchEvent(new Event("click"));
  h.next.dispatchEvent(new Event("click"));
  assert.equal(h.track.scrolls.length, before, "no handler left after destroy");
});

test("a re-inited carousel holds one set of listeners, not one per init", () => {
  const h = carouselHarness();
  // What the editor's preview does on every rebuild of the same frame.
  for (let i = 0; i < 20; i++) {
    h.destroyCarousel(h.frame);
    h.initCarousels(h.root);
  }
  const right = key("ArrowRight");
  h.frame.dispatchEvent(right);
  assert.equal(h.track.scrolls.length, 1, "one ArrowRight, one move");
  h.next.dispatchEvent(new Event("click"));
  h.chevNext.dispatchEvent(new Event("click"));
  assert.equal(h.track.scrolls.length, 3, "each arrow and chevron press moves once");

  // After the navigation sweep nothing is left listening at all.
  h.destroyAllCarousels();
  h.frame.dispatchEvent(key("ArrowRight"));
  h.chevNext.dispatchEvent(new Event("click"));
  assert.equal(h.track.scrolls.length, 3);
});

test("carousel keys leave Alt/Ctrl/Meta/Shift+arrow to the browser", () => {
  const h = carouselHarness();
  h.initCarousels(h.root);
  for (const mod of ["altKey", "ctrlKey", "metaKey", "shiftKey"]) {
    const e = key("ArrowLeft", { [mod]: true });
    h.frame.dispatchEvent(e);
    assert.equal(e.defaultPrevented, false, mod);
  }
  assert.equal(h.track.scrolls.length, 0);
  const bare = key("ArrowLeft");
  h.frame.dispatchEvent(bare);
  assert.equal(bare.defaultPrevented, true);
  assert.equal(h.track.scrolls.length, 1);
});
