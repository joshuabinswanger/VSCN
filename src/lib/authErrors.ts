// Pure: no Firebase import, so plain `node --test` can exercise it.
// auth.ts re-exports friendlyError, which is where the forms have always
// imported it from.

/**
 * Code → translation key. The SENTENCES live in translations.ts, so /de gets
 * German ones; this file only decides which key a code maps to.
 *
 * Deliberately short. Our auth surface is email and password only — no social
 * sign-in, no phone, no multi-factor — so of the ~108 codes the Auth SDK
 * defines, about a dozen are reachable at all, and only these are worth a
 * sentence a member can act on. Everything else is a configuration fault that
 * no wording can help with, and those are better served by the raw code.
 */
const ERROR_KEYS: Record<string, string> = {
  "auth/email-already-in-use":  "auth.error.code.emailInUse",
  "auth/invalid-email":         "auth.error.code.invalidEmail",
  "auth/weak-password":         "auth.error.code.weakPassword",
  "auth/user-not-found":        "auth.error.code.invalidCredential",
  "auth/wrong-password":        "auth.error.code.invalidCredential",
  "auth/invalid-credential":    "auth.error.code.invalidCredential",
  "auth/too-many-requests":     "auth.error.code.tooManyRequests",
  // Far and away the most common one in the wild: offline, an ad blocker, or
  // a corporate proxy eating identitytoolkit.googleapis.com. It reached us as
  // a bare "Something went wrong", which is unreportable and unfixable.
  "auth/network-request-failed": "auth.error.code.network",
  // The email/password provider switched off in the Firebase console. Nothing
  // the member can do, but telling them so beats letting them retry forever.
  "auth/operation-not-allowed": "auth.error.code.operationNotAllowed",
  "auth/user-disabled":         "auth.error.code.userDisabled",
  // NOT an Auth code — Firestore's. It reaches the same catch because the
  // sign-up path reads the profile inside the same try block, so a rules
  // denial surfaces in the auth form. Its message must not say "try again":
  // the retry runs the same denied read.
  "permission-denied":          "auth.error.code.permissionDenied",
};

/**
 * Turn an error code into something to put in front of a member.
 *
 * `strings` is the caller's locale table (`ui[lang]`). A code we recognise
 * gets its own sentence. Anything else gets the locale's generic sentence
 * WITH THE CODE APPENDED — because a bare "Something went wrong" is
 * unreportable. A member who sees "(auth/internal-error)" can paste that to
 * us and the cause is known without asking them to open DevTools.
 */
export function friendlyError(code: string, strings: Record<string, string>): string {
  const generic = strings["auth.error.generic"];
  if (!code) return generic;
  const key = ERROR_KEYS[code];
  return key ? strings[key] : `${generic} (${code})`;
}

// The codes that mean "the email/password pair was wrong" — the one family a
// form may want to report in its own wording rather than through the map,
// because the member can fix those without telling anyone.
const CREDENTIAL_CODES = new Set([
  "auth/user-not-found",
  "auth/wrong-password",
  "auth/invalid-credential",
]);

export function isCredentialError(code: string): boolean {
  return CREDENTIAL_CODES.has(code);
}
