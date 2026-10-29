import { test } from "node:test";
import assert from "node:assert/strict";
import { WORK_SIZE_PX, workSize, workSizeWidth } from "../../src/lib/workSize.ts";

test("S and L are CSS pixel widths, L the desktop works column", () => {
  assert.deepEqual(WORK_SIZE_PX, { s: 200, l: 624 });
});

test("a work without a stored size is L; the retired M draws as S", () => {
  assert.equal(workSize({}), "l");
  assert.equal(workSize({ size: "l" }), "l");
  assert.equal(workSize({ size: "bogus" }), "l");
  assert.equal(workSize({ size: "s" }), "s");
  assert.equal(workSize({ size: "m" }), "s");
  assert.equal(workSizeWidth({ size: "m" }), "200px");
  assert.equal(workSizeWidth({}), "624px");
});
