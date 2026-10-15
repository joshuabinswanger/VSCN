// The intro's choreography, planned as data (src/lib/introCascade.ts): four
// rows of flap slots, one word each, initials aligned in a column. The
// initials arrive, each row writes its word, the name holds, the words fold
// back to the column, and the column travels into the header. 2026-10-15,
// Josh: "make the animation vertical again but then smoothly transition into
// the bar on the top left".
import { test } from "node:test";
import assert from "node:assert/strict";
import { diffLine, planStack, INTRO_WORDS } from "../../src/lib/introCascade.ts";

const timing = {
  beat: 0.2,
  stagger: 0.02,
  lead: 0.3,
  arriveStagger: 0.07,
  hold: 0.15,
  rowOffset: 0.22,
  holdName: 0.6,
  foldStagger: 0.06,
  rest: 0.15,
};
const flip = 2 * timing.beat;
const landed = (event) => event.at + flip + (event.changes.at(-1)?.delay ?? 0);

test("the words are Visual, Science, Communication, Network", () => {
  assert.deepEqual(INTRO_WORDS, ["Visual", "Science", "Communication", "Network"]);
});

test("a step changes only the slots whose glyph differs, staggered from the first change", () => {
  assert.deepEqual(diffLine("V", "Visual", 13, 0.02), [
    { index: 1, char: "i", delay: 0 },
    { index: 2, char: "s", delay: 0.02 },
    { index: 3, char: "u", delay: 0.04 },
    { index: 4, char: "a", delay: 0.06 },
    { index: 5, char: "l", delay: 0.08 },
  ]);
});

test("folding a word back clears every slot past its initial", () => {
  const changes = diffLine("Network", "N", 13, 0.02);
  assert.deepEqual(
    changes.map((c) => c.index + c.char),
    ["1", "2", "3", "4", "5", "6"],
  );
});

test("the stack has one row per word and enough slots for the longest", () => {
  const plan = planStack(INTRO_WORDS, timing);
  assert.equal(plan.rows, 4);
  assert.equal(plan.slotsPerRow, 13);
});

test("the initials arrive top to bottom after the lead", () => {
  const plan = planStack(INTRO_WORDS, timing);
  const arrivals = plan.events.filter((e) => e.phase === "arrive");
  assert.deepEqual(
    arrivals.map((e) => [e.row, e.at, e.changes]),
    [
      [0, 0.3, [{ index: 0, char: "V", delay: 0 }]],
      [1, 0.37, [{ index: 0, char: "S", delay: 0 }]],
      [2, 0.44, [{ index: 0, char: "C", delay: 0 }]],
      [3, 0.51, [{ index: 0, char: "N", delay: 0 }]],
    ],
  );
});

test("each row writes its word, one row after another, once the column has landed", () => {
  const plan = planStack(INTRO_WORDS, timing);
  const arrivals = plan.events.filter((e) => e.phase === "arrive");
  const writes = plan.events.filter((e) => e.phase === "write");
  const start = landed(arrivals.at(-1)) + timing.hold;
  assert.deepEqual(
    writes.map((e) => [e.row, e.at]),
    [0, 1, 2, 3].map((row) => [row, Math.round((start + row * timing.rowOffset) * 1000) / 1000]),
  );
  assert.equal(writes[2].changes.map((c) => c.char).join(""), "ommunication");
});

test("the words fold back together once the whole name has been readable", () => {
  const plan = planStack(INTRO_WORDS, timing);
  const writes = plan.events.filter((e) => e.phase === "write");
  const folds = plan.events.filter((e) => e.phase === "fold");
  const nameComplete = Math.max(...writes.map(landed));
  assert.deepEqual(
    folds.map((e) => [e.row, e.at]),
    [0, 1, 2, 3].map((row) => [
      row,
      Math.round((nameComplete + timing.holdName + row * timing.foldStagger) * 1000) / 1000,
    ]),
  );
  assert.equal(folds[0].changes.every((c) => c.char === ""), true);
});

test("the travel waits for the last letter to fold, plus the rest", () => {
  const plan = planStack(INTRO_WORDS, timing);
  const folds = plan.events.filter((e) => e.phase === "fold");
  const folded = Math.max(...folds.map(landed));
  assert.ok(Math.abs(plan.travelAt - (folded + timing.rest)) < 1e-9);
});
