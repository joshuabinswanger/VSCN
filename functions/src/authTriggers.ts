import * as functionsV1 from "firebase-functions/v1";
import { logger } from "firebase-functions/v2";
import { Timestamp } from "firebase-admin/firestore";
import { db } from "./admin";
import { scheduleDeletion } from "./lifecycle";
import { purgeAccount } from "./purge";

/**
 * Backstop for a user deleted straight from the Firebase console (or by any
 * path other than purgeAccount): open an immediate, no-grace job and run it.
 * Auth triggers are still v1-only; v1 and v2 coexist in one codebase.
 *
 * When purgeAccount itself deletes the Auth user this fires too — the job
 * already exists then (open or completed), so it returns without touching it.
 */
export const onAuthUserDeleted = functionsV1.auth.user().onDelete(async (user) => {
  const existing = await db.doc(`deletions/${user.uid}`).get();
  if (existing.exists) {
    logger.info("Auth user deleted; job already present", { uid: user.uid });
    return;
  }
  await scheduleDeletion(user.uid, "auth-delete", Timestamp.now());
  await purgeAccount(user.uid);
  logger.info("Auth user deleted out-of-band; data purged", { uid: user.uid });
});
