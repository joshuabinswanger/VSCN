import { test } from "node:test";
import assert from "node:assert/strict";
import { loadTs } from "../helpers/load-ts.mjs";

const { nextStop, swipeStep, freshSwipe, nearestStop } = loadTs(
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

test("the showing card is the stop nearest the scroll offset", () => {
  assert.equal(nearestStop(stops, 0), 0);
  assert.equal(nearestStop(stops, 700), 1);
  assert.equal(nearestStop(stops, 1000), 1);
  assert.equal(nearestStop(stops, 1600), 2);
  assert.equal(nearestStop([900, 0, 1800], 850), 0, "unsorted tops: the index is the cell's");
  assert.equal(nearestStop([], 10), 0);
});

test("a swipe on the picture steps only when it is clearly vertical", () => {
  assert.equal(swipeStep(0, -120), 1); // finger up: next card
  assert.equal(swipeStep(10, 90), -1);
  assert.equal(swipeStep(80, -60), 0); // sideways-leaning: the carousel's
  assert.equal(swipeStep(30, -45), 1); // a thumb's arcing flick still counts
  assert.equal(swipeStep(3, -15), 0); // a tap
});

test("a new trackpad swipe inside a momentum tail is a new gesture", () => {
  assert.equal(freshSwipe(60, 2, 30), true); // tail decayed to 2, finger back at 30
  assert.equal(freshSwipe(60, 2, 4), false); // the tail's own wobble
  assert.equal(freshSwipe(60, 40, 70), false); // still the first swipe, not decayed
  assert.equal(freshSwipe(100, 100, 100), false); // a mouse wheel spun at one speed
});
