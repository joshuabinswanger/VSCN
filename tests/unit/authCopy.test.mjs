// The login form and the wizard's signup step are the two doors into an
// account, and both need every string they render to exist in both locales.
//
// Two ways this has already gone wrong in this file:
//   - a key present in en and missing in de renders as "undefined";
//   - a key present but EMPTY in both (auth.alreadyHave, auth.noAccount) sent
//     the component down a `|| "Don't have an account? "` fallback, i.e.
//     hardcoded English on the German page.
// Both are invisible until someone loads /de and reads it.
import { test } from "node:test";
import assert from "node:assert/strict";
import { readFileSync } from "node:fs";
import { ui } from "../../src/i18n/translations.ts";

const LOCALES = ["en", "de"];

// Every string the login form renders.
const LOGIN_KEYS = [
  "auth.title.login",
  "auth.title.reset",
  "auth.submit.login",
  "auth.submit.loginLoading",
  "auth.status.login",
  "auth.status.redirecting",
  "auth.forgot",
  "auth.noAccount",
  "auth.cta.signup",
];

// Every string the wizard's signup step renders.
const SIGNUP_STEP_KEYS = [
  "onboarding.auth.title",
  "onboarding.auth.sub",
  "onboarding.auth.cta",
  "onboarding.auth.email",
  "onboarding.auth.password",
  "onboarding.auth.passwordConfirm",
  "onboarding.auth.haveAccount",
  "onboarding.auth.cta.login",
];

for (const locale of LOCALES) {
  test(`every login-form string exists and is non-empty in ${locale}`, () => {
    for (const key of LOGIN_KEYS) {
      const value = ui[locale][key];
      assert.equal(typeof value, "string", `${key} missing in ${locale}`);
      assert.ok(value.trim().length > 0, `${key} is empty in ${locale}`);
    }
  });

  test(`every signup-step string exists and is non-empty in ${locale}`, () => {
    for (const key of SIGNUP_STEP_KEYS) {
      const value = ui[locale][key];
      assert.equal(typeof value, "string", `${key} missing in ${locale}`);
      assert.ok(value.trim().length > 0, `${key} is empty in ${locale}`);
    }
  });
}

test("no auth or signup-step key is an empty string in either locale", () => {
  // An empty string is worse than a missing one: it renders as nothing, or
  // sends the component to an English fallback, and never throws.
  for (const locale of LOCALES) {
    for (const [key, value] of Object.entries(ui[locale])) {
      if (!key.startsWith("auth.") && !key.startsWith("onboarding.auth.")) continue;
      assert.ok(value.trim().length > 0, `${key} is empty in ${locale}`);
    }
  }
});

test("the German copy is actually German, not the English string", () => {
  // Catches a de block that was filled by copy-pasting en.
  for (const key of [...LOGIN_KEYS, ...SIGNUP_STEP_KEYS]) {
    if (key === "auth.forgot") continue; // legitimately short, may coincide
    assert.notEqual(ui.de[key], ui.en[key], `${key} is identical in en and de`);
  }
});

test("en and de define the same set of keys", () => {
  // A key added to one block and forgotten in the other renders as
  // "undefined" on that locale's pages, silently.
  const enKeys = new Set(Object.keys(ui.en));
  const deKeys = new Set(Object.keys(ui.de));
  const missingInDe = [...enKeys].filter((k) => !deKeys.has(k));
  const missingInEn = [...deKeys].filter((k) => !enKeys.has(k));
  assert.deepEqual(missingInDe, [], "keys missing from the de block");
  assert.deepEqual(missingInEn, [], "keys missing from the en block");
});

test("no locale block declares the same key twice", () => {
  // Object literals silently keep the LAST duplicate, so a stale empty entry
  // above a good one still type-errors while every runtime read looks fine.
  // astro check does flag it (ts 1117), but it lands among ~54 pre-existing
  // errors where a new one is easy to miss. Read the source, not the object.
  const src = readFileSync(
    new URL("../../src/i18n/translations.ts", import.meta.url),
    "utf8"
  );
  for (const locale of LOCALES) {
    const block = new RegExp(`\n  ${locale}: \{(.*?)\n  \},`, "s").exec(src);
    assert.ok(block, `could not find the ${locale} block`);
    const keys = [...block[1].matchAll(/\n    "([^"]+)":/g)].map((m) => m[1]);
    const seen = new Set();
    const dupes = new Set();
    for (const k of keys) (seen.has(k) ? dupes : seen).add(k);
    assert.deepEqual([...dupes], [], `duplicate keys in the ${locale} block`);
  }
});
