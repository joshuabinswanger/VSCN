import { test } from "node:test";
import assert from "node:assert/strict";
import { loadTs } from "../helpers/load-ts.mjs";

const { nextStop } = loadTs(
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
