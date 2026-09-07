// Pure: no Firebase import, so it can be unit-tested with plain `node --test`.
// auth.ts re-exports friendlyError, which is where the form has always
// imported it from.
const FRIENDLY_ERRORS: Record<string, string> = {
  "auth/email-already-in-use": "An account with this email already exists. Try logging in instead.",
  "auth/invalid-email":        "Please enter a valid email address.",
  "auth/weak-password":        "Password must be at least 6 characters.",
  "auth/user-not-found":       "Invalid email or password.",
  "auth/wrong-password":       "Invalid email or password.",
  "auth/invalid-credential":   "Invalid email or password.",
  "auth/too-many-requests":    "Too many attempts. Please wait and try again.",
};

/**
 * Map an error code to something a member can act on.
 *
 * Codes we recognise get a specific sentence. Anything else gets the caller's
 * localized generic sentence WITH THE CODE APPENDED — because a bare "Something
 * went wrong" is unreportable. A member who sees
 * "(auth/network-request-failed)" or "(permission-denied)" can paste it into an
 * email and the cause is known without asking them to open DevTools.
 */
export function friendlyError(code: string, generic: string): string {
  if (!code) return generic;
  return FRIENDLY_ERRORS[code] ?? `${generic} (${code})`;
}

// The codes that mean "the email/password pair was wrong" — the one family a
// form should keep reporting with its own localized sentence rather than a
// code, because the member can fix those without telling anyone.
const CREDENTIAL_CODES = new Set([
  "auth/user-not-found",
  "auth/wrong-password",
  "auth/invalid-credential",
]);

export function isCredentialError(code: string): boolean {
  return CREDENTIAL_CODES.has(code);
}
