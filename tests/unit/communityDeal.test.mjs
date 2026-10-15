import { test } from "node:test";
import assert from "node:assert/strict";
import { shuffleBands, dealPagesInto } from "../../src/lib/communityDeal.ts";

const items = (scores) => scores.map((score, rank) => ({ id: rank, dataset: { score: String(score), rank: String(rank) } }));

test("one seed, one order; bands stay highest first", () => {
  const a = shuffleBands(items([60, 60, 60, 50, 50, 50, 50, 40]), 12345).map((x) => x.id);
  const b = shuffleBands(items([60, 60, 60, 50, 50, 50, 50, 40]), 12345).map((x) => x.id);
  assert.deepEqual(a, b);
  assert.deepEqual(a.slice(0, 3).sort(), [0, 1, 2]);
  assert.deepEqual(a.slice(3, 7).sort(), [3, 4, 5, 6]);
  assert.equal(a[7], 7);
  const c = shuffleBands(items([60, 60, 60, 50, 50, 50, 50, 40]), 999).map((x) => x.id);
  assert.notDeepEqual(a, c, "another seed, another order (for this input)");
});

test("the source text CommunityGrid inlines is self-contained and deals the same order", () => {
  // Exactly what the inline script does: both functions as text, then a call.
  const src = `${shuffleBands.toString()};${dealPagesInto.toString()};return { shuffleBands, dealPagesInto };`;
  const inlined = new Function(src)();
  for (const seed of [1, 42, 3141592653]) {
    const mod = shuffleBands(items([55, 55, 55, 55, 48, 48, 48]), seed).map((x) => x.id);
    const txt = inlined.shuffleBands(items([55, 55, 55, 55, 48, 48, 48]), seed).map((x) => x.id);
    assert.deepEqual(txt, mod, `seed ${seed}`);
  }
});

test("dealPagesInto orders the grid, hides a tag's misses at the end, and marks the first picture eager", () => {
  class Img { constructor() { this.loading = "lazy"; this.attrs = {}; } setAttribute(k, v) { this.attrs[k] = v; } }
  const cells = [0, 1, 2, 3].map((rank) => ({
    rank, hidden: false, img: new Img(),
    dataset: { rank: String(rank), score: "50", tags: rank % 2 ? "|ink|" : "|paint|" },
    querySelector() { return this.img; },
  }));
  const appended = [];
  const grid = { dataset: {}, querySelectorAll: () => [...cells].reverse(), appendChild: (c) => appended.push(c) };
  dealPagesInto(grid, 7, "ink");
  assert.deepEqual(appended.slice(0, 2).map((c) => c.rank).sort(), [1, 3]);
  assert.ok(appended.slice(2).every((c) => c.hidden));
  assert.equal(appended[0].img.loading, "eager");
  assert.equal(appended[0].img.attrs.fetchpriority, "high");
  assert.equal(grid.dataset.dealt, "7");
});
