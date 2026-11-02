// The website and link fields print "https://" in a grey prefix, so a scheme
// in the value read twice (2026-11-02, board 07's link row).
import { test } from "node:test";
import assert from "node:assert/strict";
import { stripScheme, stripSchemeInPlace, socialLinks, href } from "../../src/lib/links.ts";

test("drops a leading http(s)://, any case", () => {
  assert.equal(stripScheme("https://www.instagram.com/rhizome.ch/"), "www.instagram.com/rhizome.ch/");
  assert.equal(stripScheme("HTTP://ada.ch"), "ada.ch");
  assert.equal(stripScheme("  https://ada.ch"), "ada.ch");
});

test("leaves a bare value, a handle and an inner scheme alone", () => {
  assert.equal(stripScheme("rhizome.ch"), "rhizome.ch");
  assert.equal(stripScheme("@compostdiv4"), "@compostdiv4");
  assert.equal(stripScheme("ada.ch/?u=https://x.ch"), "ada.ch/?u=https://x.ch");
  assert.equal(stripScheme(""), "");
});

test("the bare form renders the same link", () => {
  const full = "https://www.instagram.com/rhizome.ch/";
  assert.deepEqual(socialLinks(stripScheme(full)), socialLinks(full));
  assert.equal(href(stripScheme("https://rhizome.ch")), "https://rhizome.ch");
});

function field(value, caret) {
  return {
    value,
    selectionStart: caret,
    setSelectionRange(a) { this.selectionStart = a; },
  };
}

test("in place: a paste loses the scheme, the caret stays at the end", () => {
  const f = field("https://ada.ch/me", 17);
  assert.equal(stripSchemeInPlace(f), "ada.ch/me");
  assert.equal(f.value, "ada.ch/me");
  assert.equal(f.selectionStart, 9);
});

test("in place: a value without a scheme is not touched", () => {
  const f = field("ada.ch", 3);
  assert.equal(stripSchemeInPlace(f), "ada.ch");
  assert.equal(f.selectionStart, 3);
});
