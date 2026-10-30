// The Images view's sort (2026-10-15, Josh: "sort by: date, member, project,
// field/tags ... the name of the member and a horizontal line separating the
// images from member to member"). Pure: the controller hands it the cells'
// data and gets sections back, so the grouping is testable without a DOM.
import { test } from "node:test";
import assert from "node:assert/strict";
import { sectionWorks, WORK_SORTS, isWorkSort } from "../../src/lib/communitySort.ts";

const W = (id, extra = {}) => ({ id, member: { key: "m-" + id, label: "Member " + id }, ...extra });
const seq = (...vals) => {
  let i = 0;
  return () => vals[i++ % vals.length];
};
const OPTS = { random: () => 0.5, noProject: "Without project", noField: "Untagged" };
const ids = (section) => section.items.map((w) => w.id);

test("the five sorts, and nothing else, are sorts", () => {
  assert.deepEqual(WORK_SORTS, ["date", "random", "member", "project", "field"]);
  assert.equal(isWorkSort("member"), true);
  assert.equal(isWorkSort("score"), false);
  assert.equal(isWorkSort(null), false);
});

test("date: one unlabelled section, newest first, undated last, stable", () => {
  const items = [
    W("a", { date: "2026-01-05T00:00:00.000Z" }),
    W("b"),
    W("c", { date: "2026-03-01T00:00:00.000Z" }),
    W("d", { date: "2026-01-05T00:00:00.000Z" }),
    W("e"),
  ];
  const out = sectionWorks(items, "date", OPTS);
  assert.equal(out.length, 1);
  assert.equal(out[0].label, "");
  assert.deepEqual(ids(out[0]), ["c", "a", "d", "b", "e"]);
});

test("random: one unlabelled section, the whole wall shuffled by the caller's source", () => {
  const items = [W("a"), W("b"), W("c"), W("d")];
  const out = sectionWorks(items, "random", { ...OPTS, random: seq(0, 0.4, 0.5) });
  assert.equal(out.length, 1);
  assert.equal(out[0].label, "");
  assert.deepEqual([...ids(out[0])].sort(), ["a", "b", "c", "d"]);
  assert.notDeepEqual(ids(out[0]), ["a", "b", "c", "d"]);
  // The input is untouched.
  assert.deepEqual(items.map((w) => w.id), ["a", "b", "c", "d"]);
});

test("member: one section per member, A to Z by name, items keep their order", () => {
  const items = [
    { id: 1, member: { key: "zoe", label: "Zoë", href: "/members/zoe" } },
    { id: 2, member: { key: "anna", label: "Anna", href: "/members/anna" } },
    { id: 3, member: { key: "zoe", label: "Zoë", href: "/members/zoe" } },
    { id: 4, member: { key: "bo", label: "bo", href: "/members/bo" } },
  ];
  const out = sectionWorks(items, "member", OPTS);
  assert.deepEqual(
    out.map((s) => [s.key, s.label, s.href]),
    [
      ["anna", "Anna", "/members/anna"],
      ["bo", "bo", "/members/bo"],
      ["zoe", "Zoë", "/members/zoe"],
    ]
  );
  assert.deepEqual(ids(out[2]), [1, 3]);
});

test("project: by project title, works without a project close the list", () => {
  const items = [
    W("a"),
    W("b", { project: { key: "p2", label: "Zebra atlas" } }),
    W("c", { project: { key: "p1", label: "Cell wall" } }),
    W("d", { project: { key: "p2", label: "Zebra atlas" } }),
  ];
  const out = sectionWorks(items, "project", OPTS);
  assert.deepEqual(
    out.map((s) => s.label),
    ["Cell wall", "Zebra atlas", "Without project"]
  );
  assert.deepEqual(ids(out[1]), ["b", "d"]);
  assert.deepEqual(ids(out[2]), ["a"]);
  assert.equal(out[2].href, undefined);
});

const F = (...keys) => ({ fields: keys.map((k) => ({ key: k, label: k.toUpperCase() })) });

test("field: the tag sections come in the order the random source deals, untagged last", () => {
  const items = [W("a", F("3d")), W("b"), W("c", F("sem")), W("d", F("ink")), W("e", F("3d"))];
  // A random source that always returns 0 swaps each slot with index 0 in
  // a Fisher-Yates walk: a fixed, non-identity permutation.
  const zero = sectionWorks(items, "field", { ...OPTS, random: () => 0 });
  const half = sectionWorks(items, "field", { ...OPTS, random: seq(0.99, 0.5, 0.1) });
  for (const out of [zero, half]) {
    assert.equal(out.length, 4);
    assert.equal(out[3].label, "Untagged");
    assert.deepEqual(ids(out[3]), ["b"]);
    assert.deepEqual(new Set(out.slice(0, 3).map((s) => s.key)), new Set(["3d", "sem", "ink"]));
  }
  assert.notDeepEqual(
    zero.slice(0, 3).map((s) => s.key),
    half.slice(0, 3).map((s) => s.key)
  );
  assert.deepEqual(ids(zero.find((s) => s.key === "3d")), ["a", "e"]);
  assert.equal(zero.find((s) => s.key === "sem").label, "SEM");
});

test("field: a work with several tags is in every one of their sections, once each", () => {
  const items = [W("a", F("3d", "sem", "3d")), W("b", F("sem")), W("c", F("ink", "3d"))];
  const out = sectionWorks(items, "field", { ...OPTS, random: () => 0 });
  const by = Object.fromEntries(out.map((s) => [s.key, ids(s)]));
  assert.deepEqual(by, { "3d": ["a", "c"], sem: ["a", "b"], ink: ["c"] });
  // The same object, not a copy — the caller tells a repeat by identity.
  assert.equal(out.find((s) => s.key === "sem").items[0], items[0]);
  assert.equal(out.some((s) => s.label === "Untagged"), false);
});

test("field with the tag filter set: one section, named for the filtered tag", () => {
  const items = [W("a", F("3d", "sem")), W("b", F("sem"))];
  const out = sectionWorks(items, "field", { ...OPTS, filtered: { key: "sem", label: "SEM" } });
  assert.deepEqual(
    out.map((s) => [s.key, s.label, ids(s)]),
    [["sem", "SEM", ["a", "b"]]]
  );
});

test("empty input is an empty list for every sort", () => {
  for (const sort of WORK_SORTS) assert.deepEqual(sectionWorks([], sort, OPTS), []);
});
