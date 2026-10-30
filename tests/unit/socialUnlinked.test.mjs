// The editors' hint for a social row that will not become a link
// (2026-10-23: "compostdiv4" printed as a dead chip on the People card).
import { test } from "node:test";
import assert from "node:assert/strict";
import { socialUnlinked } from "../../src/lib/links.ts";

test("a bare handle is unlinked, with or without @", () => {
  assert.equal(socialUnlinked("compostdiv4"), true);
  assert.equal(socialUnlinked("@compostdiv4"), true);
});

test("an address, scheme or not, is linked", () => {
  assert.equal(socialUnlinked("instagram.com/compostdiv4"), false);
  assert.equal(socialUnlinked("https://www.instagram.com/compostdiv4/"), false);
  assert.equal(socialUnlinked("ada.ch"), false);
});

test("an empty row is not flagged", () => {
  assert.equal(socialUnlinked(""), false);
  assert.equal(socialUnlinked("   "), false);
});
