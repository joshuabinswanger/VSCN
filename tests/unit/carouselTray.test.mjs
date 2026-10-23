// The tray's drop geometry, pure: where a dragged work lands among the
// thumbnails, and what a thumbnail's own reorder comes to once it has left
// the list. The DOM half (carouselTray.ts) cannot be walked without a
// session, so the arithmetic a drop depends on is proven here.
import { test } from "node:test";
import assert from "node:assert/strict";
import { dropIndex, reorderPosition } from "../../src/lib/carouselTray.ts";

// Two rows of three 60px thumbnails, 6px apart: row 1 at y 0-60, row 2 at y 66-126.
const rect = (col, row) => ({ left: col * 66, right: col * 66 + 60, top: row * 66, bottom: row * 66 + 60 });
const rects = [rect(0, 0), rect(1, 0), rect(2, 0), rect(0, 1), rect(1, 1), rect(2, 1)];

test("dropIndex: before a thumbnail's centre is its slot, after it the next", () => {
  assert.equal(dropIndex(rects, 10, 30), 0);
  assert.equal(dropIndex(rects, 50, 30), 1, "right of the first centre");
  assert.equal(dropIndex(rects, 100, 30), 2);
  assert.equal(dropIndex(rects, 200, 30), 3, "past the row's last thumbnail");
});

test("dropIndex: a lower row counts the rows above it", () => {
  assert.equal(dropIndex(rects, 10, 96), 3, "the second row's first slot");
  assert.equal(dropIndex(rects, 120, 96), 5);
  assert.equal(dropIndex(rects, 500, 96), 6, "after everything");
});

test("dropIndex: between rows is the upper row's end; above everything is the start", () => {
  assert.equal(dropIndex(rects, 10, 63), 3);
  assert.equal(dropIndex(rects, 300, -10), 0);
  assert.equal(dropIndex([], 10, 10), 0, "an empty tray");
});

test("reorderPosition: a drop on either side of the thumbnail itself changes nothing", () => {
  assert.equal(reorderPosition(2, 2), null);
  assert.equal(reorderPosition(2, 3), null);
  assert.equal(reorderPosition(2, 0), 0, "earlier: the slot is the position");
  assert.equal(reorderPosition(2, 5), 4, "later: one less, since the thumbnail has left the list");
  assert.equal(reorderPosition(0, 1), null);
  assert.equal(reorderPosition(0, 2), 1);
});
