// The legal pages' prose mentions the contact address inline; the renderer
// turns that mention into a mailto link and leaves the rest alone.
import { test } from "node:test";
import assert from "node:assert/strict";
import { splitOnEmail } from "../../src/lib/legalParagraph.ts";

test("the email inside a sentence becomes its own segment, text around it intact", () => {
  assert.deepEqual(splitOnEmail("Write to info@vscn.ch with a link.", "info@vscn.ch"), [
    { kind: "text", value: "Write to " },
    { kind: "email", value: "info@vscn.ch" },
    { kind: "text", value: " with a link." },
  ]);
});

test("a paragraph without the address is one text segment", () => {
  assert.deepEqual(splitOnEmail("Nothing to link here.", "info@vscn.ch"), [
    { kind: "text", value: "Nothing to link here." },
  ]);
});

test("an address at the very end leaves no empty trailing segment", () => {
  assert.deepEqual(splitOnEmail("Contact: info@vscn.ch", "info@vscn.ch"), [
    { kind: "text", value: "Contact: " },
    { kind: "email", value: "info@vscn.ch" },
  ]);
});
