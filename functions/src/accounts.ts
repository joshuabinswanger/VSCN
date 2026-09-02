import { onCall, HttpsError } from "firebase-functions/v2/https";
import { logger } from "firebase-functions/v2";
import { FieldValue, Timestamp } from "firebase-admin/firestore";
import { db } from "./admin";
import { GRACE_DAYS } from "./constants";
import { cancelDeletion, scheduleDeletion } from "./lifecycle";
import { dispatchRebuild, githubRebuildToken } from "./rebuild";
import { requireRecentLogin, requireUser } from "./util";

/**
 * Member-facing soft delete. The client reauthenticates first; auth_time is
 * how the server knows it did. Nothing is destroyed here — see lifecycle.ts.
 */
export const requestAccountDeletion = onCall({ secrets: [githubRebuildToken] }, async (req) => {
  const uid = requireUser(req);
  requireRecentLogin(req);
  const purgeAfter = Timestamp.fromMillis(Date.now() + GRACE_DAYS * 86_400_000);
  await scheduleDeletion(uid, "member", purgeAfter);
  await dispatchRebuild();
  logger.info("Account deletion scheduled", { uid, purgeAfter: purgeAfter.toDate().toISOString() });
  return { purgeAfter: purgeAfter.toDate().toISOString() };
});

export const cancelAccountDeletion = onCall({ secrets: [githubRebuildToken] }, async (req) => {
  const uid = requireUser(req);
  await cancelDeletion(uid);
  await dispatchRebuild();
  logger.info("Account deletion cancelled", { uid });
  return { ok: true };
});

/**
 * Writes the email mirror on users/{uid} from the ID token — the one source
 * that cannot be forged by the caller. The client calls this after sign-up
 * and whenever it notices user.email differs from the stored copy;
 * reconcileEmails sweeps up anything it missed.
 */
export const syncEmail = onCall(async (req) => {
  const uid = requireUser(req);
  const email = req.auth?.token.email;
  if (!email) throw new HttpsError("failed-precondition", "Token carries no email.");
  await db.doc(`users/${uid}`).set({ email, updatedAt: FieldValue.serverTimestamp() }, { merge: true });
  return { email };
});
