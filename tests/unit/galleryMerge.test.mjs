// The three-way merge every gallery write goes through (T2-3): a stale tab's
// Save must neither drop a work another session added nor resurrect one it
// removed, and ours keeps its order.
import { test } from "node:test";
import assert from "node:assert/strict";
import { mergeGalleryIds } from "../../src/lib/galleryMerge.ts";

test("nothing changed elsewhere: ours is written as is, in our order", () => {
  const m = mergeGalleryIds(["a", "b"], ["b", "a"], ["a", "b"]);
  assert.deepEqual(m, { merged: ["b", "a"], added: [], dropped: [] });
});

test("a work another session added since load is appended, not dropped", () => {
  const m = mergeGalleryIds(["x"], ["x"], ["x", "y"]);
  assert.deepEqual(m.merged, ["x", "y"]);
  assert.deepEqual(m.added, ["y"]);
  assert.deepEqual(m.dropped, []);
});

test("a work THIS tab removed stays removed even though it is still stored", () => {
  const m = mergeGalleryIds(["x", "y"], ["x"], ["x", "y"]);
  assert.deepEqual(m, { merged: ["x"], added: [], dropped: [] });
});

test("a work another session removed leaves ours: its record is pendingDeletion", () => {
  const m = mergeGalleryIds(["x", "y"], ["y", "x"], ["x"]);
  assert.deepEqual(m.merged, ["x"]);
  assert.deepEqual(m.dropped, ["y"]);
});

test("a work this tab added is kept although the server has never seen it", () => {
  const m = mergeGalleryIds(["x"], ["n", "x"], ["x", "y"]);
  assert.deepEqual(m.merged, ["n", "x", "y"]);
  assert.deepEqual(m.added, ["y"]);
});

test("the same id arriving on both sides (the unverified slot) is not doubled", () => {
  const m = mergeGalleryIds([], ["u-gallery"], ["u-gallery"]);
  assert.deepEqual(m.merged, ["u-gallery"]);
  assert.deepEqual(m.added, []);
});

test("a stored value that is not an id list is ignored: ours stands", () => {
  assert.deepEqual(mergeGalleryIds(["a"], ["a", "b"], undefined).merged, ["a", "b"]);
  assert.deepEqual(mergeGalleryIds(["a"], ["a"], [{ imageId: "legacy" }]).merged, ["a"]);
});

test("duplicates in the stored array are appended once", () => {
  const m = mergeGalleryIds([], [], ["y", "y"]);
  assert.deepEqual(m.merged, ["y"]);
});
