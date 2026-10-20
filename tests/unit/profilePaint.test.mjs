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
