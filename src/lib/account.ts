import { httpsCallable } from "firebase/functions";
import type { User } from "firebase/auth";
import { functions } from "./firebase.ts";

/**
 * Opens the deletion grace period. PRECONDITION: the callable re-checks the
 * token's `auth_time` server-side and requires it to be within 5 minutes, so
 * the caller must run `reauthenticateWithCredential` immediately before this
 * call. Without that, it throws `failed-precondition` — a stale session cannot
 * schedule the destruction of an account.
 */
export async function requestAccountDeletion(): Promise<{ deleted: boolean }> {
  const fn = httpsCallable<void, { deleted: boolean }>(functions, "requestAccountDeletion");
  return (await fn()).data;
}

export async function cancelAccountDeletion(): Promise<void> {
  await httpsCallable(functions, "cancelAccountDeletion")();
}

export async function syncEmail(): Promise<string> {
  const fn = httpsCallable<void, { email: string }>(functions, "syncEmail");
  return (await fn()).data.email;
}

/**
 * users/{uid}.email is a server-written mirror of Auth. Call after sign-up
 * and whenever the token's address differs from the stored one — which is
 * what happens after verifyBeforeUpdateEmail completes on the next sign-in.
 * Best-effort: reconcileEmails sweeps nightly for anything missed here.
 */
export async function ensureEmailSynced(user: User, storedEmail: string | undefined): Promise<void> {
  if (!user.email || user.email === storedEmail) return;
  try {
    await syncEmail();
  } catch (err) {
    console.warn("[account] email sync skipped:", err);
  }
}
