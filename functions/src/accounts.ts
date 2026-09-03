import { onCall, HttpsError } from "firebase-functions/v2/https";
import { logger } from "firebase-functions/v2";
import { FieldValue, Timestamp } from "firebase-admin/firestore";
import { db } from "./admin";
import { cancelDeletion, scheduleDeletion } from "./lifecycle";
import { purgeAccount } from "./purge";
import { dispatchRebuild, githubRebuildToken } from "./rebuild";
import { requireRecentLogin, requireUser } from "./util";

/**
 * Member-facing delete. Immediate, and there is no way back from it.
 *
 * (2026-09-04, Josh: "scheduled deletion is unnecessary. just make it delete
 * accounts straight away".) The 30-day grace period is gone from THIS path —
 * an admin can still schedule one through adminOps, which is why
 * cancelDeletion, purgeExpiredAccounts and the banner all stay.
 *
 * The job record is still opened first, and that is not ceremony:
 * purgeAccount reads it to know which images and files belong to the account,
 * and its `steps` are what make the purge resumable when one stage fails
 * halfway. `purgeAfter` is NOW rather than now + GRACE_DAYS, so a job that
 * does fail is already due and purgeExpiredAccounts finishes it on its next
 * pass instead of waiting a month.
 *
 * The client reauthenticates first; auth_time is how the server knows it did.
 */
export const requestAccountDeletion = onCall({ secrets: [githubRebuildToken] }, async (req) => {
  const uid = requireUser(req);
  requireRecentLogin(req);
  await scheduleDeletion(uid, "member", Timestamp.now());
  await purgeAccount(uid);
  await dispatchRebuild();
  logger.info("Account deleted", { uid });
  return { deleted: true };
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
