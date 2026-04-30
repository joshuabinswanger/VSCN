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

/** Redirects to /signup if not logged in, /verify-email if not yet verified. */
export function requireVerifiedAuth(onUser: (user: User) => void): () => void {
  return onAuthStateChanged(auth, async (user) => {
    if (!user) { window.location.href = "/signup"; return; }
    if (!user.emailVerified) { window.location.href = "/verify-email"; return; }
    await user.getIdToken(true);
    onUser(user);
  });
}

/** Redirects to /signup if not logged in. */
export function requireAuth(onUser: (user: User) => void): () => void {
  return onAuthStateChanged(auth, (user) => {
    if (!user) { window.location.href = "/signup"; return; }
    onUser(user);
  });
}
