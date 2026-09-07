// The auth form used to collapse every unmapped Firebase error into
// "Something went wrong" and throw the code away, so a member who hit
// auth/network-request-failed had nothing to report. The code now rides
// along in the fallback text.
import { test } from "node:test";
import assert from "node:assert/strict";
import { friendlyError, isCredentialError } from "../../src/lib/authErrors.ts";

const GENERIC = "Something went wrong. Please try again.";

test("a mapped code gets its friendly message, without the code", () => {
  assert.equal(
    friendlyError("auth/email-already-in-use", GENERIC),
    "An account with this email already exists. Try logging in instead."
  );
});

test("an unmapped code appends the code to the caller's generic text", () => {
  assert.equal(
    friendlyError("auth/network-request-failed", GENERIC),
    "Something went wrong. Please try again. (auth/network-request-failed)"
  );
});

test("the generic text is the caller's, so the German page stays German", () => {
  const de = "Etwas ist schiefgelaufen. Bitte versuche es erneut.";
  assert.equal(
    friendlyError("permission-denied", de),
    `${de} (permission-denied)`
  );
});

test("no code at all yields the bare generic text, no empty parentheses", () => {
  assert.equal(friendlyError("", GENERIC), GENERIC);
});

test("only the wrong-email-or-password family counts as a credential error", () => {
  assert.equal(isCredentialError("auth/wrong-password"), true);
  assert.equal(isCredentialError("auth/invalid-credential"), true);
  assert.equal(isCredentialError("auth/user-not-found"), true);
  assert.equal(isCredentialError("auth/network-request-failed"), false);
  assert.equal(isCredentialError("auth/email-already-in-use"), false);
  assert.equal(isCredentialError(""), false);
});
