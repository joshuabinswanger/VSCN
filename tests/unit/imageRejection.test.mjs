// Why a file is turned away before decoding, and so which sentence it gets.
// A HEIC photo whose File.type is empty (Windows without the HEIF extension,
// dragged in) used to get the generic "Only JPEG, PNG..." sentence instead of
// the "export it as JPEG" hint written for exactly that file. See image.ts.
import { test } from "node:test";
import assert from "node:assert/strict";
import { rejectionCode } from "../../src/lib/image.ts";

test("a HEIC file is named by its MIME type or, when that is empty, by its extension", () => {
  assert.equal(rejectionCode({ name: "IMG_0001.jpg", type: "image/heic" }), "heic");
  assert.equal(rejectionCode({ name: "IMG_0001.HEIC", type: "" }), "heic");
  assert.equal(rejectionCode({ name: "photo.heif", type: "application/octet-stream" }), "heic");
});

test("the name never changes what is accepted", () => {
  // An accepted type wins over a misleading name.
  assert.equal(rejectionCode({ name: "IMG_0001.heic", type: "image/jpeg" }), null);
  assert.equal(rejectionCode({ name: "notes.txt", type: "" }), "type");
  assert.equal(rejectionCode({ name: "drawing.svg", type: "image/svg+xml" }), "svg");
  assert.equal(rejectionCode({ name: "heic", type: "" }), "type");
});
