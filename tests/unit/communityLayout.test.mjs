import { test } from "node:test";
import assert from "node:assert/strict";
import {
  DEFAULT_VIEW,
  TAG_CHIP_VIEW,
  VIEWS,
  layOutWall,
  viewFromParam,
} from "../../src/lib/communityLayout.ts";

test("the default and the tag-chip view are the pages view", () => {
  assert.equal(DEFAULT_VIEW, "pages");
  assert.equal(TAG_CHIP_VIEW, "pages");
  assert.deepEqual([...VIEWS], ["pages", "grid", "index"]);
});

test("viewFromParam reads the three views, maps the old spread/strip links, defaults the rest", () => {
  assert.equal(viewFromParam("pages"), "pages");
  assert.equal(viewFromParam("grid"), "grid");
  assert.equal(viewFromParam("index"), "index");
  assert.equal(viewFromParam("spread"), "pages");
  assert.equal(viewFromParam("strip"), "pages");
  assert.equal(viewFromParam(null), DEFAULT_VIEW);
  assert.equal(viewFromParam(undefined), DEFAULT_VIEW);
  assert.equal(viewFromParam(""), DEFAULT_VIEW);
  assert.equal(viewFromParam("wall"), DEFAULT_VIEW);
});

test("layOutWall still bricks N and N-1 per row", () => {
  const rows = layOutWall(7, 3).map((s) => s.rowStart);
  assert.deepEqual(rows, [1, 1, 1, 2, 2, 3, 3]);
  const flat = layOutWall(4, 2, false).map((s) => s.rowStart);
  assert.deepEqual(flat, [1, 1, 2, 2]);
});
