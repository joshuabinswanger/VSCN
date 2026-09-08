// Pure: no Firebase, no DOM, so plain `node --test` can exercise it.
//
// The clocks that App Check attestation has to respect. Firebase Auth awaits
// the App Check token INSIDE its own request timeout (firebase-js-sdk auth,
// DEFAULT_API_TIMEOUT_MS = 30 s, `_performFetchWithErrorHandling` races the
// fetch, headers included, against a NetworkTimeout), and reports that
// timeout as auth/network-request-failed with no detail. So an attestation
// that takes longer than 30 s is shown to the member as "could not reach the
// login server", which is wrong on every count.
//
// Why it matters: on mobile browsers a Turnstile challenge in our widget
// configuration (Managed, `execution: "execute"`, `appearance:
// "interaction-only"`) intermittently takes 15-25 s where desktop takes under
// 3 s (Cloudflare community, September 2025, reproduced by others on iOS and
// Android). Script load and the mint call come on top. Reported 2026-09-08
// from Chrome on iOS as "server not reached".

/** firebase-js-sdk auth's request timeout in a browser (60 s only in Cordova). */
export const AUTH_REQUEST_TIMEOUT_MS = 30_000;

/**
 * One budget for the WHOLE attestation — script, challenge, mint — measured
 * from the moment App Check asks. Anything slower is reported as what it is
 * (the App Check sentence, which names challenges.cloudflare.com) instead of
 * letting Auth's clock run out first. The 6 s margin is for the
 * identitytoolkit round trip that follows the token.
 */
export const ATTESTATION_BUDGET_MS = 24_000;

/** Turnstile tokens are single-use and valid for five minutes after issue. */
export const TURNSTILE_TOKEN_TTL_MS = 300_000;

/**
 * A token that arrives AFTER its attempt gave up (a late checkbox click, or
 * Turnstile's own refresh-expired cycle) is kept as a spare for the next
 * attempt, but only while siteverify will still accept it, with a margin for
 * the mint round trip.
 */
export const SPARE_MAX_AGE_MS = 240_000;

export function spareIsUsable(issuedAt: number, now: number): boolean {
  return now - issuedAt < SPARE_MAX_AGE_MS;
}
