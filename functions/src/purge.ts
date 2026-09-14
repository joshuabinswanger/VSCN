import { logger } from "firebase-functions/v2";
import { FieldValue } from "firebase-admin/firestore";
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
  const snap = await jobRef.get();
  if (!snap.exists) throw new Error(`No deletion job for ${uid}`);
  const job = snap.data() as DeletionJob;
  if (job.completedAt) return;

  const done = { ...job.steps };
  const tick = async (step: Step) => {
    done[step] = true;
    await jobRef.update({ [`steps.${step}`]: true });
  };

  try {
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
      // Remove public objects and private interrupted uploads, including any
      // objects whose image record disappeared before this purge.
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
    await jobRef.update({ completedAt: FieldValue.serverTimestamp(), lastError: null });
    logger.info("Account purged", { uid });
  } catch (err) {
    const message = err instanceof Error ? err.message : String(err);
    await jobRef.update({ lastError: message });
    throw err;
  }
}
