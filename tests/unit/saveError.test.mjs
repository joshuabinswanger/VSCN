// What the Save footer says (T2-4): an SDK error becomes a sentence naming
// the remedy, an error written for the member is shown as it was written.
import { test } from "node:test";
import assert from "node:assert/strict";
import { saveErrorKind, saveErrorMessage } from "../../src/lib/saveError.ts";
import { ui } from "../../src/i18n/translations.ts";

const sdk = (code, message = "Missing or insufficient permissions.") => Object.assign(new Error(message), { code });

test("a rules refusal is no longer shown as the SDK's permission text", () => {
  const text = saveErrorMessage(sdk("permission-denied"), ui.en);
  assert.equal(text, ui.en["profile.save.error.refused"]);
  assert.doesNotMatch(text, /insufficient permissions/);
});

test("network codes, with or without the functions/ prefix, say the connection dropped", () => {
  assert.equal(saveErrorKind(sdk("unavailable")), "network");
  assert.equal(saveErrorKind(sdk("functions/deadline-exceeded")), "network");
  assert.equal(saveErrorMessage(sdk("unavailable"), ui.de), ui.de["profile.save.error.network"]);
});

test("an expired session says to sign in again", () => {
  assert.equal(saveErrorMessage(sdk("unauthenticated"), ui.en), ui.en["profile.save.error.session"]);
});

test("an error this codebase wrote for the member is shown as written", () => {
  assert.equal(saveErrorMessage(new Error("Project “Atlas” could not be saved."), ui.en), "Project “Atlas” could not be saved.");
});

test("anything else falls back to the generic sentence", () => {
  assert.equal(saveErrorMessage(sdk("internal"), ui.en), ui.en["profile.save.error"]);
  assert.equal(saveErrorMessage("boom", ui.en), ui.en["profile.save.error"]);
  assert.equal(saveErrorMessage(new Error(""), ui.en), ui.en["profile.save.error"]);
});
