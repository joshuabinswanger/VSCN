import { HttpsError, type CallableRequest } from "firebase-functions/v2/https";
import { Timestamp, type DocumentReference } from "firebase-admin/firestore";
import { db } from "./admin";
import { REAUTH_WINDOW_SECONDS } from "./constants";

export function requireUser(req: CallableRequest): string {
  if (!req.auth) throw new HttpsError("unauthenticated", "Sign-in required.");
  return req.auth.uid;
}

/**
 * A server-side reauthentication check: the client must have signed in (or
 * reauthenticated) within REAUTH_WINDOW_SECONDS. `auth_time` is set by Auth
 * itself, so unlike a client-side reauth flow it cannot be skipped.
 */
export function requireRecentLogin(req: CallableRequest): void {
  const authTime = Number(req.auth?.token.auth_time ?? 0);
  if (!authTime || Date.now() / 1000 - authTime > REAUTH_WINDOW_SECONDS) {
    throw new HttpsError("failed-precondition", "recent-login-required");
  }
}

export function requireAdmin(req: CallableRequest): string {
  const uid = requireUser(req);
  if (req.auth?.token.admin !== true) throw new HttpsError("permission-denied", "Admin only.");
  return uid;
}

/** Deletes in batches of 500 (the Firestore batch limit). Missing docs are no-ops. */
export async function deleteRefs(refs: DocumentReference[]): Promise<void> {
  for (let i = 0; i < refs.length; i += 500) {
    const batch = db.batch();
    for (const ref of refs.slice(i, i + 500)) batch.delete(ref);
    await batch.commit();
  }
}

/** Timestamps → ISO strings, recursively, so callable results serialise cleanly. */
export function plain(value: unknown): unknown {
  if (value instanceof Timestamp) return value.toDate().toISOString();
  if (Array.isArray(value)) return value.map(plain);
  if (value && typeof value === "object") {
    return Object.fromEntries(
      Object.entries(value as Record<string, unknown>).map(([k, v]) => [k, plain(v)])
    );
  }
  return value;
}
