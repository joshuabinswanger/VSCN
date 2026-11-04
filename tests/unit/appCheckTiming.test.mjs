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
  FIRESTORE_FIRST_CONNECT_MS,
  PROFILE_AUTH_WATCHDOG_MS,
  PROFILE_READ_TIMEOUT_MS,
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

// The profile editor's first Firestore read races the SDK's own 10 s
// "online state" timer, which is armed in the same statement as the watch
// stream that then AWAITS the App Check token. A cold attestation slower than
// those 10 s made getDoc reject "client is offline" on a working network
// (2026-10-31, "opening the profile for the first time gives a timeout").
// So the editor awaits the token before its read clock starts, and its
// auth watchdog allows for a full attestation on top of the reads.
test("the profile editor's clocks allow for a cold attestation before the first read", () => {
  assert.equal(FIRESTORE_FIRST_CONNECT_MS, 10_000, "firestore ONLINE_STATE_TIMEOUT_MS");
  assert.ok(ATTESTATION_BUDGET_MS > FIRESTORE_FIRST_CONNECT_MS, "the token must be awaited before the read, not during it");
  assert.ok(PROFILE_READ_TIMEOUT_MS > FIRESTORE_FIRST_CONNECT_MS);
  assert.ok(PROFILE_AUTH_WATCHDOG_MS >= ATTESTATION_BUDGET_MS + PROFILE_READ_TIMEOUT_MS);
});
