import { test } from "node:test";
import assert from "node:assert/strict";
import { loadTs } from "../helpers/load-ts.mjs";

const { nextStop, swipeStep } = loadTs(
  "src/lib/pagesPager.ts",
  {},
  { document: { addEventListener() {} }, window: {} },
);

const stops = [0, 844, 1688];
const end = 1900;

test("a step down lands on the next card, however small the gesture", () => {
  assert.equal(nextStop(stops, 0, 1, end), 844);
  assert.equal(nextStop(stops, 120, 1, end), 844);
  assert.equal(nextStop(stops, 844, 1, end), 1688);
});

test("a step up lands on the previous card", () => {
  assert.equal(nextStop(stops, 844, -1, end), 0);
  assert.equal(nextStop(stops, 900, -1, end), 844);
  assert.equal(nextStop(stops, 0, -1, end), 0);
});

test("past the last card a step goes to the footer, and back up to the last card", () => {
  assert.equal(nextStop(stops, 1688, 1, end), end);
  assert.equal(nextStop(stops, end, -1, end), 1688);
  assert.equal(nextStop(stops, end, 1, end), end);
});

test("a stop within the slack of the current offset is the current card", () => {
  assert.equal(nextStop(stops, 843, 1, end), 1688);
  assert.equal(nextStop(stops, 845, -1, end), 0);
});

test("a swipe on the picture steps only when it is clearly vertical", () => {
  assert.equal(swipeStep(0, -120), 1); // finger up: next card
  assert.equal(swipeStep(10, 90), -1);
  assert.equal(swipeStep(80, -60), 0); // sideways-leaning: the carousel's
  assert.equal(swipeStep(3, -20), 0); // a tap
});
