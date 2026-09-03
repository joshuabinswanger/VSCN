import { auth } from "./firebase.ts";
import { onAuthStateChanged, type User } from "firebase/auth";

const FRIENDLY_ERRORS: Record<string, string> = {
  "auth/email-already-in-use": "An account with this email already exists. Try logging in instead.",
  "auth/invalid-email":        "Please enter a valid email address.",
  "auth/weak-password":        "Password must be at least 6 characters.",
  "auth/user-not-found":       "Invalid email or password.",
  "auth/wrong-password":       "Invalid email or password.",
  "auth/invalid-credential":   "Invalid email or password.",
  "auth/too-many-requests":    "Too many attempts. Please wait and try again.",
};

export function friendlyError(code: string): string {
  return FRIENDLY_ERRORS[code] ?? "Something went wrong. Please try again.";
}

/**
 * Is this account verified AS THE RULESETS WILL SEE IT?
 *
 * "Am I verified" has TWO answers in a Firebase client, and they disagree for
 * up to an hour after the link is clicked:
 *
 *   - `user.emailVerified` is read off the cached account record. The SDK
 *     reloads that record on every page init, so it flips to true almost as
 *     soon as the member verifies.
 *   - `request.auth.token.email_verified` is read off the ID TOKEN, and it is
 *     the ONLY one firestore.rules and storage.rules can see. The token is
 *     minted at sign-in and reused until it expires (~1h) or something forces
 *     a refresh — verifying an email does not refresh it.
 *
 * Every gate that decides what to WRITE must use the second one, because the
 * second one is what will judge the write. Using the first is what sent a
 * just-verified member down the verified upload path (a random uuid image id)
 * while both rulesets still saw an unverified token and rejected it — a
 * `permission-denied` with nothing in the UI but "something went wrong".
 *
 * One forced refresh closes the gap: if the record says verified and the token
 * does not, the token is merely stale and a refresh will agree with it. Read
 * the cached token first so the common case stays free, exactly as the admin
 * claim is read in ProfileForm.
 */
export async function hasVerifiedClaim(user: User): Promise<boolean> {
  try {
    if ((await user.getIdTokenResult()).claims.email_verified === true) return true;
    // The record is the only hint that a refresh would tell us anything new.
    // Without it a genuinely unverified member would force a token refresh on
    // every upload for nothing.
    if (!user.emailVerified) return false;
    return (await user.getIdTokenResult(true)).claims.email_verified === true;
  } catch {
    // Offline, or a token that will not refresh. Fall back to the record: the
    // slot path it selects is legal for verified and unverified members alike,
    // so being wrong here costs a reused slot, never a permission error.
    return user.emailVerified;
  }
}

/** Redirects to /signup if not logged in, /verify-email if not yet verified. */
export function requireVerifiedAuth(onUser: (user: User) => void): () => void {
  return onAuthStateChanged(auth, async (user) => {
    if (!user) { window.location.href = "/signup"; return; }
    if (!user.emailVerified) { window.location.href = "/verify-email"; return; }
    await user.getIdToken(true);
    onUser(user);
  });
}

/**
 * Redirects to /signup if not logged in.
 *
 * Unlike requireVerifiedAuth this lets an unverified member through — the
 * pages behind it (the profile editor) are meant to work before the link is
 * clicked. It still settles the verification claim FIRST, because those pages
 * write: /profile picks an image id, a gallery cap and a publish flag from the
 * verification state, and all three are judged against the token. Settling it
 * here means the page never runs against a token that contradicts the account
 * record it is reading. Failure is not fatal — hasVerifiedClaim falls back to
 * the record — so the page always mounts.
 */
export function requireAuth(onUser: (user: User) => void): () => void {
  return onAuthStateChanged(auth, async (user) => {
    if (!user) { window.location.href = "/signup"; return; }
    await hasVerifiedClaim(user);
    onUser(user);
  });
}
