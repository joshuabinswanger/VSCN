import { test } from "node:test";
import assert from "node:assert/strict";
import { WORK_SIZE_PX, workSize, workSizeWidth } from "../../src/lib/workSize.ts";

test("S M L are CSS pixel widths, L the desktop works column", () => {
  assert.deepEqual(WORK_SIZE_PX, { s: 288, m: 456, l: 624 });
});

test("a work without a stored size is L", () => {
  assert.equal(workSize({}), "l");
  assert.equal(workSize({ size: "l" }), "l");
  assert.equal(workSize({ size: "bogus" }), "l");
  assert.equal(workSize({ size: "s" }), "s");
  assert.equal(workSizeWidth({ size: "m" }), "456px");
  assert.equal(workSizeWidth({}), "624px");
});
