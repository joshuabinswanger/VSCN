// The intro's choreography, planned as data (src/lib/introCascade.ts): the
// line is a row of flap slots, each state of the chain is a string, and a
// step is the set of slots whose glyph changes between two states, each with
// the delay that sends the flip across the line left to right. 2026-10-15,
// Josh: "Visual -> VScience -> VSCommunication -> VSCNetwork -> VSCN".
import { test } from "node:test";
import assert from "node:assert/strict";
import { diffLine, planCascade, INTRO_STATES } from "../../src/lib/introCascade.ts";

const timing = { beat: 0.2, stagger: 0.03, holds: [0.4, 0.3, 0.25, 0.25, 0.2], lead: 0.6, rest: 0.25 };

test("the chain reads VSCN, Visual, VScience, VSCommunication, VSCNetwork, VSCN", () => {
  assert.deepEqual(INTRO_STATES, [
    "VSCN",
    "Visual",
    "VScience",
    "VSCommunication",
    "VSCNetwork",
    "VSCN",
  ]);
});

test("a step changes only the slots whose glyph differs, staggered from the first change", () => {
  const changes = diffLine("VSCN", "Visual", 15, 0.03);
  assert.deepEqual(changes, [
    { index: 1, char: "i", delay: 0 },
    { index: 2, char: "s", delay: 0.03 },
    { index: 3, char: "u", delay: 0.06 },
    { index: 4, char: "a", delay: 0.09 },
    { index: 5, char: "l", delay: 0.12 },
  ]);
});

test("a shorter state clears the slots past its end", () => {
  const changes = diffLine("VSCommunication", "VSCNetwork", 15, 0.03);
  assert.deepEqual(
    changes.map((c) => c.index + c.char),
    ["3N", "4e", "5t", "6w", "7o", "8r", "9k", "10", "11", "12", "13", "14"],
  );
  // The clearing flips are part of the same left-to-right sweep.
  assert.equal(changes[11].delay, 0.33);
});

test("the step order over an unchanged slot keeps counting from the first change", () => {
  // "VScience" -> "VSCommunication": slot 2 flips c->C, the rest follow.
  const changes = diffLine("VScience", "VSCommunication", 15, 0.03);
  assert.equal(changes[0].index, 2);
  assert.equal(changes[0].delay, 0);
  assert.equal(changes.at(-1).index, 14);
});

test("the plan holds each word only once its last letter has landed", () => {
  const plan = planCascade(INTRO_STATES, timing);
  assert.equal(plan.slots, 15);
  assert.equal(plan.steps.length, 6);
  // Arrival: VSCN from nothing, four flips, starts after the lead.
  assert.equal(plan.steps[0].at, 0.6);
  assert.equal(plan.steps[0].changes.length, 4);
  // A flip is two beats; the last letter lands at start + flip + its delay.
  const flip = 0.4;
  const land = (s) => s.at + flip + s.changes.at(-1).delay;
  for (let i = 1; i < plan.steps.length; i += 1) {
    const expected = land(plan.steps[i - 1]) + timing.holds[i - 1];
    assert.ok(
      Math.abs(plan.steps[i].at - expected) < 1e-9,
      `step ${i} starts at ${plan.steps[i].at}, expected ${expected}`,
    );
  }
});

test("the travel waits for the final fold plus its rest", () => {
  const t = timing;
  const plan = planCascade(INTRO_STATES, t);
  const last = plan.steps[5];
  const landed = last.at + 2 * t.beat + last.changes.at(-1).delay;
  assert.ok(Math.abs(plan.travelAt - (landed + 0.25)) < 1e-9);
});
