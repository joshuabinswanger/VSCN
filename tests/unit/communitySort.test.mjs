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

test("the four sorts, and nothing else, are sorts", () => {
  assert.deepEqual(WORK_SORTS, ["date", "member", "project", "field"]);
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

test("field: the tag sections come in the order the random source deals, untagged last", () => {
  const items = [
    W("a", { field: { key: "3d", label: "3D" } }),
    W("b"),
    W("c", { field: { key: "sem", label: "SEM" } }),
    W("d", { field: { key: "ink", label: "Ink" } }),
    W("e", { field: { key: "3d", label: "3D" } }),
  ];
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
});

test("field with the tag filter set: one section, named for the filtered tag", () => {
  const items = [
    W("a", { field: { key: "3d", label: "3D" } }),
    W("b", { field: { key: "sem", label: "SEM" } }),
  ];
  const out = sectionWorks(items, "field", { ...OPTS, filtered: { key: "sem", label: "SEM" } });
  assert.deepEqual(
    out.map((s) => [s.key, s.label, ids(s)]),
    [["sem", "SEM", ["a", "b"]]]
  );
});

test("empty input is an empty list for every sort", () => {
  for (const sort of WORK_SORTS) assert.deepEqual(sectionWorks([], sort, OPTS), []);
});
