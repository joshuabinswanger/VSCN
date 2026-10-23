// Work carousels, the pure grouping rules: how a project's works split into
// page units, where a carousel's settings come from, and how they are moved
// onto the first slide.
import { test } from "node:test";
import assert from "node:assert/strict";
import { CAROUSEL_LEAD_FIELDS, carouselSettings, groupCarousels, normaliseLeads } from "../../src/lib/carousels.ts";

const w = (id, carouselId, extra = {}) => ({ id, ...(carouselId ? { carouselId } : {}), ...extra });
const shape = (units) =>
  units.map((u) => (u.kind === "work" ? `work ${u.work.id}` : `carousel ${u.carouselId} [${u.works.map((x) => x.id).join(",")}]`));

test("the lead fields are size and the two text blocks", () => {
  assert.deepEqual([...CAROUSEL_LEAD_FIELDS], ["size", "textAfter", "textAfterDe"]);
});

test("groupCarousels (page, minRun 2): a run of two or more is a carousel", () => {
  assert.deepEqual(shape(groupCarousels([w("a"), w("b", "c1"), w("c", "c1"), w("d")], 2)), [
    "work a",
    "carousel c1 [b,c]",
    "work d",
  ]);
});

test("groupCarousels (page): a run of one prints as a plain work", () => {
  assert.deepEqual(shape(groupCarousels([w("a", "c1")], 2)), ["work a"]);
});

test("groupCarousels (page): a split id is not one carousel", () => {
  assert.deepEqual(shape(groupCarousels([w("a", "c1"), w("b"), w("c", "c1")], 2)), ["work a", "work b", "work c"]);
});

test("groupCarousels: two neighbouring ids are two carousels", () => {
  assert.deepEqual(shape(groupCarousels([w("a", "c1"), w("b", "c1"), w("c", "c2"), w("d", "c2")], 2)), [
    "carousel c1 [a,b]",
    "carousel c2 [c,d]",
  ]);
});

test("groupCarousels (editor, minRun 1): a run of one is a carousel, a split id two runs", () => {
  assert.deepEqual(shape(groupCarousels([w("a", "c1")], 1)), ["carousel c1 [a]"]);
  assert.deepEqual(shape(groupCarousels([w("a", "c1"), w("b"), w("c", "c1")], 1)), [
    "carousel c1 [a]",
    "work b",
    "carousel c1 [c]",
  ]);
});

test("groupCarousels: no works, no units", () => {
  assert.deepEqual(groupCarousels([], 1), []);
});

test("carouselSettings: each field comes from the first slide that carries it", () => {
  assert.deepEqual(carouselSettings([{}, { size: "s", textAfter: "T" }, { size: "m" }]), { size: "s", textAfter: "T" });
});

test("carouselSettings: a field no slide carries has no key at all", () => {
  const s = carouselSettings([{ size: "s" }, { textAfter: "T" }]);
  assert.equal("textAfterDe" in s, false);
  assert.deepEqual(carouselSettings([]), {});
});

test("normaliseLeads: the run's settings move onto the first slide", () => {
  const x = w("x", undefined, { size: "l", textAfter: "own" });
  const a = w("a", "c1");
  const b = w("b", "c1", { size: "s", textAfter: "T" });
  const out = normaliseLeads([x, a, b]);
  assert.deepEqual(out[0], x);
  assert.equal(out[1].size, "s");
  assert.equal(out[1].textAfter, "T");
  assert.equal("size" in out[2], false);
  assert.equal("textAfter" in out[2], false);
});

test("normaliseLeads: works with no carouselId keep their own fields", () => {
  const items = [w("a", undefined, { size: "s", textAfter: "A" }), w("b", undefined, { textAfterDe: "B" })];
  assert.deepEqual(normaliseLeads(items), items);
});

test("normaliseLeads: a run of one keeps its fields", () => {
  const items = [w("a", "c1", { size: "m", textAfter: "A" })];
  assert.deepEqual(normaliseLeads(items), items);
});

test("normaliseLeads: two runs of the same id are normalised separately", () => {
  const out = normaliseLeads([w("a", "c1"), w("b", "c1", { size: "s" }), w("x"), w("c", "c1", { size: "l" })]);
  assert.equal(out[0].size, "s");
  assert.equal("size" in out[1], false);
  assert.equal(out[3].size, "l");
});

test("normaliseLeads never mutates its input", () => {
  const items = [w("a", "c1"), w("b", "c1", { size: "s", textAfter: "T" })];
  const before = structuredClone(items);
  const out = normaliseLeads(items);
  assert.deepEqual(items, before);
  assert.notEqual(out, items);
});

test("normaliseLeads: a stale lead (settings on the second slide) ends with the settings source and the write target on one slide", () => {
  // Gallery order is published before Save, so a load can hold [B, A] with the
  // carousel's settings still on A. The tray reads settings from the first
  // slide carrying them and writes to the first slide: after normalising, both
  // are the lead.
  const stale = [w("B", "c1"), w("A", "c1", { size: "m", textAfter: "foo" })];
  const source = (slides) => slides.find((s) => CAROUSEL_LEAD_FIELDS.some((f) => s[f]))?.id;
  assert.equal(source(stale), "A");
  const fixed = normaliseLeads(stale);
  assert.equal(source(fixed), "B");
  assert.equal(fixed[0].id, "B");
  assert.deepEqual(carouselSettings(fixed), { size: "m", textAfter: "foo" });
  assert.equal(fixed[1].size, undefined);
  assert.equal(fixed[1].textAfter, undefined);
});
