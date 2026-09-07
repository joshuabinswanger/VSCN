// The auth forms used to collapse every unmapped Firebase error into
// "Something went wrong" and throw the code away, so a member who hit
// auth/network-request-failed had nothing to report. Codes we recognise now
// get a localized sentence; everything else gets the generic sentence with
// the code appended, which is the part a member can paste into an email.
import { test } from "node:test";
import assert from "node:assert/strict";
import { friendlyError, isCredentialError, errorParts, SECURITY_CHECK_BLOCKED } from "../../src/lib/authErrors.ts";
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
  // startsWith: the network sentence carries the code suffix (see below).
  assert.ok(msg.startsWith(de["auth.error.code.network"]));
  assert.ok(!msg.startsWith(en["auth.error.code.network"]));
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
    "auth/firebase-app-check-token-is-invalid.",
    "permission-denied",
  ]) {
    for (const [name, table] of [["en", en], ["de", de]]) {
      const msg = friendlyError(code, table);
      // "Did not fall back to the generic sentence" — the network sentence now
      // legitimately carries parentheses (the institution note, the code suffix).
      assert.ok(!msg.startsWith(table["auth.error.generic"]), `${code} still falls back on ${name}`);
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

test("the app-check code is mapped WITH its trailing dot", () => {
  // The SDK builds this code from the server's own sentence, "Firebase App
  // Check token is invalid.", so the period is part of the code. Mapping only
  // the tidy-looking spelling leaves the real one falling through to the
  // generic sentence, which is exactly how it was first seen in the wild.
  const dotted = "auth/firebase-app-check-token-is-invalid.";
  for (const [name, table] of [["en", en], ["de", de]]) {
    const msg = friendlyError(dotted, table);
    assert.equal(msg, table["auth.error.code.appCheck"], `unmapped on ${name}`);
    assert.ok(!msg.startsWith(table["auth.error.generic"]), `${name} still falls back to the raw code`);
  }
  // The dot-less spelling is mapped too, so a future SDK that tidies the code
  // up does not silently regress the message.
  assert.equal(
    friendlyError("auth/firebase-app-check-token-is-invalid", en),
    en["auth.error.code.appCheck"]
  );
});

test("the app-check message names something the member can change", () => {
  // Unlike operation-not-allowed, this one is usually fixable on their side,
  // so a message that only apologises would waste the one chance to say so.
  assert.match(en["auth.error.code.appCheck"], /ad blocker|extension|VPN/i);
  assert.match(en["auth.error.code.appCheck"], /reload/i);
  assert.match(de["auth.error.code.appCheck"], /Adblocker|Erweiterung|VPN/i);
  assert.match(de["auth.error.code.appCheck"], /neu/i);
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

test("the network code carries the SDK's detail, because the detail IS the diagnosis", () => {
  // Reproduced 2026-09-07 against prod: a blocked identitytoolkit host fails in
  // 0.2 s with customData.message "TypeError: Failed to fetch"; a blocked
  // reCAPTCHA script hangs App Check and fails after 30 s with NO detail. Same
  // code, same sentence, two different hosts for an IT department to allow.
  // The sentence alone could not tell them apart; the suffix can.
  const withDetail = friendlyError("auth/network-request-failed", en, "TypeError: Failed to fetch");
  assert.ok(withDetail.startsWith(en["auth.error.code.network"]));
  assert.match(withDetail, /\(auth\/network-request-failed: TypeError: Failed to fetch\)$/);
  const without = friendlyError("auth/network-request-failed", en);
  assert.match(without, /\(auth\/network-request-failed\)$/);
});

test("other mapped codes do not grow a suffix", () => {
  assert.equal(
    friendlyError("auth/invalid-credential", en, "some detail"),
    en["auth.error.code.invalidCredential"]
  );
});

test("an unmapped code carries the detail too", () => {
  assert.equal(
    friendlyError("auth/internal-error", en, "boom"),
    `${en["auth.error.generic"]} (auth/internal-error: boom)`
  );
});

test("errorParts reads the code and the SDK's customData.message off whatever was thrown", () => {
  assert.deepEqual(
    errorParts({ code: "auth/network-request-failed", customData: { message: "TypeError: Failed to fetch" } }),
    { code: "auth/network-request-failed", detail: "TypeError: Failed to fetch" }
  );
  assert.deepEqual(errorParts({ code: "auth/user-disabled" }), { code: "auth/user-disabled", detail: "" });
  assert.deepEqual(errorParts(new Error("plain")), { code: "", detail: "" });
  assert.deepEqual(errorParts(undefined), { code: "", detail: "" });
  assert.deepEqual(errorParts("string"), { code: "", detail: "" });
});

test("the security-check-blocked pre-flight has its own sentence in both locales", () => {
  // Not an SDK code: appCheckTurnstile.ts raises it when the Turnstile script
  // tag fires its error event, so the forms can refuse BEFORE the 30 s hang.
  // It names the check and the host an IT department must allow, because the
  // members most likely to hit it sit on institutional networks.
  for (const [name, table] of [["en", en], ["de", de]]) {
    const msg = friendlyError(SECURITY_CHECK_BLOCKED, table);
    assert.equal(msg, table["auth.error.code.securityCheckBlocked"], `unmapped on ${name}`);
    assert.match(msg, /Turnstile/, `${name} does not name Turnstile`);
  }
});

test("the network-ish sentences all tell an institutional member what to ask IT for", () => {
  // Most members are expected to sit at ETH, UZH or another institution whose
  // web filter blocks Google APIs by category. Each message names the one host
  // that failure needs allowed, so the ticket to IT writes itself.
  const cases = [
    ["auth.error.code.network", /identitytoolkit\.googleapis\.com/],
    ["auth.error.code.appCheck", /challenges\.cloudflare\.com/],
    ["auth.error.code.securityCheckBlocked", /challenges\.cloudflare\.com/],
  ];
  for (const [key, host] of cases) {
    for (const [name, table] of [["en", en], ["de", de]]) {
      assert.match(table[key], /ETH/, `${key} on ${name} does not mention institutions`);
      assert.match(table[key], host, `${key} on ${name} does not name its host`);
    }
  }
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
    "auth/firebase-app-check-token-is-invalid.",
    "auth/firebase-app-check-token-is-invalid",
    "permission-denied",
    SECURITY_CHECK_BLOCKED,
  ];
}
