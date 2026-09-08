// App Check attestation runs INSIDE Firebase Auth's request timeout: Auth
// awaits the App Check token in the same 30 s race as the network call, and
// reports the timeout as auth/network-request-failed with no detail. On mobile
// a Turnstile challenge alone can take 15-25 s (Cloudflare community, Sep 2025,
// same widget configuration as ours), so the whole attestation needs one
// budget that fits under Auth's clock, whatever the individual steps do.
import { test } from "node:test";
import assert from "node:assert/strict";
import {
  AUTH_REQUEST_TIMEOUT_MS,
  ATTESTATION_BUDGET_MS,
  SPARE_MAX_AGE_MS,
  TURNSTILE_TOKEN_TTL_MS,
  spareIsUsable,
} from "../../src/lib/appCheckTiming.ts";

test("the whole attestation fits under Auth's request timeout with margin", () => {
  assert.equal(AUTH_REQUEST_TIMEOUT_MS, 30_000, "firebase-js-sdk auth DEFAULT_API_TIMEOUT_MS");
  // Margin for the identitytoolkit round trip itself after the token arrives.
  assert.ok(ATTESTATION_BUDGET_MS <= AUTH_REQUEST_TIMEOUT_MS - 5_000);
});

test("a late Turnstile token is kept as a spare only while Cloudflare still accepts it", () => {
  // Turnstile tokens are valid for five minutes; siteverify rejects older ones.
  assert.ok(SPARE_MAX_AGE_MS < TURNSTILE_TOKEN_TTL_MS);
  const at = 1_000_000;
  assert.equal(spareIsUsable(at, at + 1_000), true);
  assert.equal(spareIsUsable(at, at + SPARE_MAX_AGE_MS - 1), true);
  assert.equal(spareIsUsable(at, at + SPARE_MAX_AGE_MS), false);
  assert.equal(spareIsUsable(at, at + TURNSTILE_TOKEN_TTL_MS), false);
});
