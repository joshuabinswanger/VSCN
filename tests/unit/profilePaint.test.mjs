import test from "node:test";
import assert from "node:assert/strict";
import { loadTs } from "../helpers/load-ts.mjs";

// The member page paints in after its pause (src/lib/profilePaint.ts): the
// name word by word, then every text line in page order, then the first
// picture. paintSchedule() is the pure timetable the DOM stamping reads.
const { paintSchedule, PAINT } = loadTs("src/lib/profilePaint.ts", { "./entrance.ts": {} });

test("the name's words follow one another a beat apart", () => {
  const s = paintSchedule(3, 0);
  assert.equal(s.words.length, 3);
  assert.equal(s.words[0], PAINT.nameStart);
  assert.ok(Math.abs(s.words[1] - s.words[0] - PAINT.nameStep) < 1e-9);
  assert.ok(Math.abs(s.words[2] - s.words[1] - PAINT.nameStep) < 1e-9);
});

test("the lines start after the last word and the picture after the last line", () => {
  const s = paintSchedule(2, 4);
  const lastWord = s.words[s.words.length - 1];
  assert.ok(s.lines[0] > lastWord);
  assert.ok(Math.abs(s.lines[0] - (lastWord + PAINT.lineGap)) < 1e-9);
  for (let i = 1; i < s.lines.length; i++) assert.ok(Math.abs(s.lines[i] - s.lines[i - 1] - PAINT.lineStep) < 1e-9);
  assert.ok(s.picture > s.lines[s.lines.length - 1]);
});

test("a page with no name words and no lines still has a picture time", () => {
  const s = paintSchedule(0, 0);
  assert.deepEqual(s.words, []);
  assert.deepEqual(s.lines, []);
  assert.ok(s.picture >= 0);
});

test("the head reaches its picture in about a second for a typical page", () => {
  // Two-word name, role, affiliation, place, two bio paragraphs, three tag rows.
  const s = paintSchedule(2, 8);
  assert.ok(s.picture > 0.6 && s.picture < 1.3, `picture at ${s.picture}s`);
});

// ── A carousel first on the page (2026-10-23, work carousels) ─────────
// preparePaint() stamps the first work as "the picture" and returns the
// image the play waits for. When that first work is a carousel, the image
// is the LEAD slide's (the first [data-carousel-slide]'s .mprof__img).
class Node {
  constructor(parts = {}) {
    this.parts = parts;
    this.dataset = {};
    this.attrs = {};
    this.style = { props: {}, setProperty(n, v) { this.props[n] = v; } };
    this.textContent = "";
    this.classes = new Set();
  }
  querySelector(sel) { return this.parts[sel] ?? null; }
  querySelectorAll(sel) { const v = this.parts[sel]; return v ? (Array.isArray(v) ? v : [v]) : []; }
  closest() { return null; }
  matches(sel) { return this.classes.has(sel.replace(/^\./, "")); }
  setAttribute(n, v) { this.attrs[n] = String(v); }
}

test("a carousel first in the works makes the lead slide's image the picture", () => {
  const { preparePaint } = loadTs(
    "src/lib/profilePaint.ts",
    { "./entrance.ts": { splitWords() {} } },
    { document: { querySelector: () => null } },
  );
  const leadImg = new Node();
  const carousel = new Node({ "[data-carousel-slide] .mprof__img": leadImg });
  carousel.classes.add("mprof__work").add("mprof__carousel");
  const root = new Node({ ".mprof__works .mprof__work": carousel });
  assert.equal(preparePaint(root), leadImg);
  assert.equal(carousel.dataset.paint, "picture");
  assert.ok(carousel.style.props["--d"], "the picture's delay is stamped on the carousel");
});

test("a plain work first in the works is the picture, as before", () => {
  const { preparePaint } = loadTs(
    "src/lib/profilePaint.ts",
    { "./entrance.ts": { splitWords() {} } },
    { document: { querySelector: () => null } },
  );
  const img = new Node();
  const work = new Node({ ".mprof__img": img });
  work.classes.add("mprof__work");
  const root = new Node({ ".mprof__works .mprof__work": work });
  assert.equal(preparePaint(root), img);
});
