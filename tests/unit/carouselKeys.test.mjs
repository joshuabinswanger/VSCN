import { test } from "node:test";
import assert from "node:assert/strict";
import { loadTs } from "../helpers/load-ts.mjs";

// ← → on the member page step the carousel nearest the middle of the
// viewport (src/lib/carouselKeys.ts). nearestToMiddle() is the pure choice;
// the key binding around it is DOM.
const { nearestToMiddle } = loadTs("src/lib/carouselKeys.ts", { "./pageLifecycle.ts": {}, "./keys.ts": {} });

const r = (top, bottom) => ({ top, bottom });

test("the rect that overlaps the middle of the viewport wins", () => {
  // Viewport 0..800, middle 400.
  assert.equal(nearestToMiddle([r(-500, 100), r(200, 600), r(700, 1200)], 0, 800), 1);
  assert.equal(nearestToMiddle([r(300, 500)], 0, 800), 0);
});

test("with none over the middle, the visible rect nearest it wins", () => {
  assert.equal(nearestToMiddle([r(0, 100), r(600, 900)], 0, 800), 1, "600 is nearer 400 than 100 is");
  assert.equal(nearestToMiddle([r(50, 350), r(700, 1100)], 0, 800), 0);
});

test("a tie goes to the earlier rect", () => {
  assert.equal(nearestToMiddle([r(0, 200), r(600, 800)], 0, 800), 0);
});

test("−1 when no rect is in the viewport", () => {
  assert.equal(nearestToMiddle([r(-900, -100), r(900, 1400)], 0, 800), -1);
  assert.equal(nearestToMiddle([], 0, 800), -1);
});

test("the viewport may start below zero: .page-wrap's own rect on a desktop", () => {
  assert.equal(nearestToMiddle([r(60, 300), r(500, 900)], 56, 856), 1, "middle 456");
});
