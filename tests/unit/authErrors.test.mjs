// The auth forms used to collapse every unmapped Firebase error into
// "Something went wrong" and throw the code away, so a member who hit
// auth/network-request-failed had nothing to report. Codes we recognise now
// get a localized sentence; everything else gets the generic sentence with
// the code appended, which is the part a member can paste into an email.
import { test } from "node:test";
import assert from "node:assert/strict";
import { friendlyError, isCredentialError } from "../../src/lib/authErrors.ts";
import { ui } from "../../src/i18n/translations.ts";

const en = ui.en;
const de = ui.de;

test("a mapped code resolves through the locale table", () => {
  assert.equal(
    friendlyError("auth/email-already-in-use", en),
    en["auth.error.code.emailInUse"]
  );
});

test("a mapped code is German on the German table", () => {
  const msg = friendlyError("auth/network-request-failed", de);
  assert.equal(msg, de["auth.error.code.network"]);
  assert.notEqual(msg, en["auth.error.code.network"]);
});

test("an unmapped code appends itself to the locale's generic sentence", () => {
  assert.equal(
    friendlyError("auth/internal-error", en),
    `${en["auth.error.generic"]} (auth/internal-error)`
  );
  assert.equal(
    friendlyError("auth/internal-error", de),
    `${de["auth.error.generic"]} (auth/internal-error)`
  );
});

test("no code at all yields the bare generic sentence, no empty parentheses", () => {
  assert.equal(friendlyError("", en), en["auth.error.generic"]);
});

test("the four codes worth a sentence of their own all have one", () => {
  for (const code of [
    "auth/network-request-failed",
    "auth/operation-not-allowed",
    "auth/user-disabled",
    "permission-denied",
  ]) {
    for (const [name, table] of [["en", en], ["de", de]]) {
      const msg = friendlyError(code, table);
      assert.doesNotMatch(msg, /\(/, `${code} still falls back on ${name}`);
      assert.ok(msg.length > 0, `${code} is empty on ${name}`);
    }
  }
});

test("permission-denied never tells the member to try again", () => {
  // It is a Firestore denial reached through the sign-up path's profile read.
  // Retrying re-runs the same denied read, so "try again" is a lie.
  assert.doesNotMatch(friendlyError("permission-denied", en), /try again/i);
  assert.doesNotMatch(friendlyError("permission-denied", de), /erneut|nochmal/i);
});

test("email-already-in-use points at logging in, not at trying again", () => {
  // The wizard reports this code only after its own recovery sign-in has
  // failed on credentials, i.e. the address is taken and the typed password is
  // not its password. Retrying is guaranteed to fail the same way, so the
  // message has to name the account and the way back into it.
  const en_ = friendlyError("auth/email-already-in-use", en);
  const de_ = friendlyError("auth/email-already-in-use", de);
  assert.doesNotMatch(en_, /try again/i);
  assert.doesNotMatch(de_, /erneut|nochmal/i);
  assert.match(en_, /log in/i);
  assert.match(en_, /reset/i);
  assert.match(de_, /anmelden|melde dich/i);
  assert.match(de_, /zurücksetzen/i);
});

test("every mapped code has a string in BOTH locales", () => {
  // A key present in en and missing in de renders as undefined on /de.
  for (const code of mappedCodes()) {
    assert.equal(typeof friendlyError(code, en), "string");
    const deMsg = friendlyError(code, de);
    assert.equal(typeof deMsg, "string");
    assert.doesNotMatch(deMsg, /undefined/, `${code} has no German string`);
  }
});

test("only the wrong-email-or-password family counts as a credential error", () => {
  assert.equal(isCredentialError("auth/wrong-password"), true);
  assert.equal(isCredentialError("auth/invalid-credential"), true);
  assert.equal(isCredentialError("auth/user-not-found"), true);
  assert.equal(isCredentialError("auth/network-request-failed"), false);
  assert.equal(isCredentialError("auth/email-already-in-use"), false);
  assert.equal(isCredentialError(""), false);
});

function mappedCodes() {
  return [
    "auth/email-already-in-use",
    "auth/invalid-email",
    "auth/weak-password",
    "auth/user-not-found",
    "auth/wrong-password",
    "auth/invalid-credential",
    "auth/too-many-requests",
    "auth/network-request-failed",
    "auth/operation-not-allowed",
    "auth/user-disabled",
    "permission-denied",
  ];
}
