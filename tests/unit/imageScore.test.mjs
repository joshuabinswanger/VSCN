// The one arithmetic the console shows an admin and the build orders the site
// by. It exists twice on disk — see the identity test at the bottom, which is
// what stops the two copies drifting.
import { test } from "node:test";
import assert from "node:assert/strict";
import { readFileSync } from "node:fs";
import {
  completenessChecks, computedCompleteness, imageScore, isHidden, WEIGHTS,
} from "../../src/lib/imageScore.ts";

const BARE = {};
const FULL = {
  caption: "a", captionDe: "a", description: "b", descriptionDe: "b",
  tags: ["neuron"], link: "example.com/x",
};

test("the weights are the ones the design fixed", () => {
  assert.deepEqual(WEIGHTS, {
    aesthetics: 0.35, professional: 0.25, knowledge: 0.25, completeness: 0.15,
  });
});

test("completeness counts the five checks off the record", () => {
  assert.equal(computedCompleteness(BARE), 0);
  assert.equal(computedCompleteness(FULL), 5);
  assert.deepEqual(completenessChecks(BARE), {
    caption: false, description: false, german: false, tags: false, link: false,
  });
});

test("a German caption alone is not the German check — it needs both", () => {
  assert.equal(computedCompleteness({ captionDe: "a" }), 0);
  assert.equal(computedCompleteness({ captionDe: "a", descriptionDe: "b" }), 1);
});

test("siteLink satisfies the link check on its own", () => {
  assert.equal(computedCompleteness({ siteLink: "example.com/x" }), 1);
});

test("blank strings are not content", () => {
  assert.equal(computedCompleteness({ caption: "   ", description: "" }), 0);
});

test("an unrated image sits in the middle, nudged only by its completeness", () => {
  assert.equal(imageScore(BARE, null), 43);   // 100 * (0.85*2.5 + 0.15*0) / 5
  assert.equal(imageScore(FULL, null), 58);   // 100 * (0.85*2.5 + 0.15*5) / 5
  assert.equal(imageScore(FULL, { ratings: {} }), 58);
});

test("one admin's ratings are the score", () => {
  const rated = { ratings: { a1: { professional: 5, knowledge: 5, aesthetics: 5, completeness: null } } };
  assert.equal(imageScore(FULL, rated), 100);
  assert.equal(imageScore(BARE, rated), 85);  // auto completeness 0 → 0.85*5
});

test("a null completeness follows the record, an override does not", () => {
  const auto = { ratings: { a1: { professional: 0, knowledge: 0, aesthetics: 0, completeness: null } } };
  const over = { ratings: { a1: { professional: 0, knowledge: 0, aesthetics: 0, completeness: 0 } } };
  assert.equal(imageScore(FULL, auto), 15);   // 0.15 * 5 / 5 * 100
  assert.equal(imageScore(FULL, over), 0);
});

test("admins are averaged, and an auto rater still tracks the record", () => {
  const two = {
    ratings: {
      a1: { professional: 5, knowledge: 5, aesthetics: 5, completeness: null },
      a2: { professional: 0, knowledge: 0, aesthetics: 0, completeness: null },
    },
  };
  assert.equal(imageScore(FULL, two), 58);    // means 2.5/2.5/2.5, completeness 5
});

test("out-of-range input is clamped rather than trusted", () => {
  const wild = { ratings: { a1: { professional: 99, knowledge: -4, aesthetics: 5, completeness: 12 } } };
  // 99→5, -4→0, 5, 12→5 → 0.25*5 + 0.25*0 + 0.35*5 + 0.15*5 = 3.75 → 75.
  // The -4 is the point: clamping holds the FLOOR as well as the ceiling, so a
  // hostile caller cannot lift a criterion by underflowing it.
  assert.equal(imageScore(FULL, wild), 75);
});

test("hidden is a separate question from the score", () => {
  assert.equal(isHidden(null), false);
  assert.equal(isHidden({ hidden: false }), false);
  assert.equal(isHidden({ hidden: true }), true);
});

test("the two copies of the module are identical, or the site and the console disagree", () => {
  assert.equal(
    readFileSync(new URL("../../src/lib/imageScore.ts", import.meta.url), "utf8"),
    readFileSync(new URL("../../functions/src/imageScore.ts", import.meta.url), "utf8"),
  );
});
