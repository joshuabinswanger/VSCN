import { logger } from "firebase-functions/v2";
import { FieldValue, Timestamp } from "firebase-admin/firestore";
import { randomUUID } from "node:crypto";
import { HttpsError } from "firebase-functions/v2/https";
import { adminAuth, db, getBucket } from "./admin";
import { imageRefsFor } from "./lifecycle";
import type { DeletionJob } from "./types";
import { deleteRefs } from "./util";

type Step = keyof DeletionJob["steps"];

/**
 * The hard delete. Every step is idempotent and recorded on the job as it
 * completes, so a crash mid-way resumes on the next run instead of starting
 * over — and so the job record afterwards is proof of what happened.
 * The job doc itself survives (completedAt set); that is the tracked part of
 * "hard delete, tracked".
 */
export async function purgeAccount(uid: string): Promise<void> {
  const jobRef = db.doc(`deletions/${uid}`);
  const leaseOwner = randomUUID();
  const job = await db.runTransaction(async (tx) => {
    const snap = await tx.get(jobRef);
    if (!snap.exists) throw new Error(`No deletion job for ${uid}`);
    const data = snap.data() as DeletionJob;
    if (data.completedAt) return null;
    if ((data.leaseUntil?.toMillis() ?? 0) > Date.now()) {
      throw new HttpsError("aborted", "Account cleanup is already running.");
    }
    // Longer than a function invocation. A crashed worker can be retried, but
    // restoration remains forbidden permanently once destructive work starts.
    tx.update(jobRef, { state: "purging", leaseOwner, leaseUntil: Timestamp.fromMillis(Date.now() + 15 * 60_000) });
    return data;
  });
  if (!job) return;

  const done = { ...job.steps };
  const tick = async (step: Step) => {
    done[step] = true;
    await jobRef.update({ [`steps.${step}`]: true });
  };

  try {
    try { await adminAuth.updateUser(uid, { disabled: true }); }
    catch (err) { if ((err as { code?: string }).code !== "auth/user-not-found") throw err; }
    if (!done.imagesDeleted) {
      const images = await imageRefsFor(uid);
      const bucket = getBucket();
      for (const d of images) {
        await bucket.file(d.data().storagePath as string).delete({ ignoreNotFound: true });
      }
      await deleteRefs(images.map((d) => d.ref));
      await tick("imagesDeleted");
    }
    if (!done.filesDeleted) {
      // Belt to the records' braces: anything under the prefix the records
      // did not know about (a legacy object, an interrupted upload).
      await getBucket().deleteFiles({ prefix: `users/${uid}/` });
      await getBucket().deleteFiles({ prefix: `pending/${uid}/` });
      await tick("filesDeleted");
    }
    if (!done.docsDeleted) {
      const slugs = await db.collection("slugs").where("uid", "==", uid).get();
      const permits = await db.collection("uploadPermits").where("ownerUid", "==", uid).get();
      await deleteRefs([
        ...slugs.docs.map((d) => d.ref),
        ...permits.docs.map((d) => d.ref),
        db.doc(`uploadLimits/${uid}`),
        db.doc(`rebuildMembers/${uid}`),
        db.doc(`publicProfiles/${uid}`),
        db.doc(`users/${uid}`),
        db.doc(`onboardingRequests/${uid}`),
      ]);
      await tick("docsDeleted");
    }
    if (!done.authDeleted) {
      try {
        await adminAuth.deleteUser(uid);
      } catch (err) {
        if ((err as { code?: string }).code !== "auth/user-not-found") throw err;
      }
      await tick("authDeleted");
    }
    await jobRef.update({ completedAt: FieldValue.serverTimestamp(), state: "completed", lastError: null,
      leaseOwner: FieldValue.delete(), leaseUntil: FieldValue.delete() });
    logger.info("Account purged", { uid });
  } catch (err) {
    const message = err instanceof Error ? err.message : String(err);
    await jobRef.update({ lastError: message, leaseOwner: FieldValue.delete(), leaseUntil: FieldValue.delete() });
    throw err;
  }
}
