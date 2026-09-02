import { onSchedule } from "firebase-functions/v2/scheduler";
import { logger } from "firebase-functions/v2";
import { Timestamp } from "firebase-admin/firestore";
import { bucket, db } from "./admin";
import { STALE_UPLOAD_HOURS } from "./constants";
import { findEmailMismatches } from "./emails";
import { purgeAccount } from "./purge";
import type { DeletionJob } from "./types";

const ZURICH = "Europe/Zurich";

/** Open jobs whose grace period has ended. One failure does not stop the rest. */
export const purgeExpiredAccounts = onSchedule(
  { schedule: "every day 03:00", timeZone: ZURICH },
  async () => {
    const open = await db.collection("deletions").where("completedAt", "==", null).get();
    const now = Timestamp.now().toMillis();
    let purged = 0;
    for (const d of open.docs) {
      const job = d.data() as DeletionJob;
      if (job.purgeAfter.toMillis() > now) continue;
      try {
        await purgeAccount(job.uid);
        purged += 1;
      } catch (err) {
        logger.error("Purge failed", { uid: job.uid, err: String(err) });
      }
    }
    logger.info("purgeExpiredAccounts", { open: open.size, purged });
  }
);

/**
 * Deletes bytes+record for images members have marked, and for uploads whose
 * record never reached `live`. Images of an account in its grace period are
 * skipped: they are pendingDeletion so the profile hides them, but a cancel
 * needs them back. purgeAccount takes those when the grace period ends.
 */
export const sweepImages = onSchedule(
  { schedule: "every 6 hours", timeZone: ZURICH },
  async () => {
    const open = await db.collection("deletions").where("completedAt", "==", null).get();
    const inGrace = new Set(open.docs.map((d) => d.id));
    const cutoff = Date.now() - STALE_UPLOAD_HOURS * 3_600_000;

    const [pending, uploading] = await Promise.all([
      db.collection("images").where("status", "==", "pendingDeletion").get(),
      db.collection("images").where("status", "==", "uploading").get(),
    ]);
    const targets = [
      ...pending.docs.filter((d) => !inGrace.has(d.data().ownerUid as string)),
      ...uploading.docs.filter((d) => (d.data().createdAt as Timestamp).toMillis() < cutoff),
    ];
    for (const d of targets) {
      await bucket.file(d.data().storagePath as string).delete({ ignoreNotFound: true });
      await d.ref.delete();
    }
    logger.info("sweepImages", {
      swept: targets.length,
      skippedInGrace: pending.size - pending.docs.filter((d) => !inGrace.has(d.data().ownerUid as string)).length,
    });
  }
);

/** Auth is the truth; every mirror that disagrees is rewritten. */
export const reconcileEmails = onSchedule(
  { schedule: "every day 04:00", timeZone: ZURICH },
  async () => {
    const mismatches = await findEmailMismatches();
    for (const m of mismatches) {
      await db.doc(`users/${m.uid}`).update({ email: m.authEmail });
    }
    logger.info("reconcileEmails", { fixed: mismatches.length, uids: mismatches.map((m) => m.uid) });
  }
);
