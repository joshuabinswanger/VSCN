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
/** Pseudo-code for "the reCAPTCHA script never loaded", raised on our side. */
export const RECAPTCHA_BLOCKED = "vscn/recaptcha-blocked";

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
  // App Check could not mint a token, so Auth refused the call. Note the
  // TRAILING DOT: the SDK derives this code from the server's own sentence
  // ("Firebase App Check token is invalid."), so the period is part of the
  // code string, not punctuation we added. Both spellings are mapped because
  // that derivation is not a documented contract.
  //
  // It means the reCAPTCHA Enterprise script never ran. In practice that is a
  // blocker, a privacy extension or a locked-down network on the member's
  // side, which they CAN fix - so it earns a sentence. It is also what every
  // Hosting PREVIEW channel does, because preview domains are not on the
  // reCAPTCHA key's allow-list; auth cannot be tested on a preview at all.
  "auth/firebase-app-check-token-is-invalid.": "auth.error.code.appCheck",
  "auth/firebase-app-check-token-is-invalid":  "auth.error.code.appCheck",
  // NOT an Auth code — Firestore's. It reaches the same catch because the
  // sign-up path reads the profile inside the same try block, so a rules
  // denial surfaces in the auth form. Its message must not say "try again":
  // the retry runs the same denied read.
  "permission-denied":          "auth.error.code.permissionDenied",
  // OURS, not the SDK's. firebase.ts raises it when the reCAPTCHA Enterprise
  // script tag fires its error event, and the forms refuse to call Auth at all.
  // Without it a blocked script costs the member a 30 s wait and then the
  // NETWORK sentence (see friendlyError below), because the SDK's loader
  // registers onload but no onerror and Auth times out waiting for App Check.
  [RECAPTCHA_BLOCKED]:          "auth.error.code.recaptchaBlocked",
};

/**
 * Turn an error code into something to put in front of a member.
 *
 * `strings` is the caller's locale table (`ui[lang]`). A code we recognise
 * gets its own sentence. Anything else gets the locale's generic sentence
 * WITH THE CODE APPENDED — because a bare "Something went wrong" is
 * unreportable. A member who sees "(auth/internal-error)" can paste that to
 * us and the cause is known without asking them to open DevTools.
 *
 * `detail` is the SDK's own note on what went wrong (errorParts pulls it off
 * the thrown error). It rides along in the suffix for unmapped codes, and for
 * ONE mapped code: auth/network-request-failed. Reproduced 2026-09-07 against
 * prod, that code has two faces that the sentence alone cannot tell apart —
 * a blocked identitytoolkit.googleapis.com fails in 0.2 s with the detail
 * "TypeError: Failed to fetch", while a blocked reCAPTCHA script hangs App
 * Check and fails after 30 s with no detail at all. Which face it is decides
 * which host an IT department has to allow, so the member's screenshot has
 * to carry it.
 */
export function friendlyError(code: string, strings: Record<string, string>, detail = ""): string {
  const generic = strings["auth.error.generic"];
  if (!code) return generic;
  const key = ERROR_KEYS[code];
  const suffix = detail ? `${code}: ${detail}` : code;
  if (!key) return `${generic} (${suffix})`;
  if (code === "auth/network-request-failed") return `${strings[key]} (${suffix})`;
  return strings[key];
}

/**
 * The two things worth reading off whatever the SDK threw: its code, and its
 * `customData.message`, which is where FirebaseError keeps the underlying
 * cause (for a failed fetch, the browser's own TypeError text). Anything that
 * is not shaped like that yields empty strings, and friendlyError turns an
 * empty code into the bare generic sentence.
 */
export function errorParts(err: unknown): { code: string; detail: string } {
  if (typeof err !== "object" || err === null) return { code: "", detail: "" };
  const e = err as { code?: unknown; customData?: { message?: unknown } };
  const code = typeof e.code === "string" ? e.code : "";
  const detail = typeof e.customData?.message === "string" ? e.customData.message : "";
  return { code, detail };
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
