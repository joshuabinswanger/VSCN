import { HttpsError } from "firebase-functions/v2/https";
import {
  FieldValue,
  Timestamp,
  type DocumentReference,
  type QueryDocumentSnapshot,
} from "firebase-admin/firestore";
import { db } from "./admin";
import type { DeletionJob, DeletionRequester, ImageStatus } from "./types";

/** Every image record owned by `uid`, optionally only those in one status. */
export async function imageRefsFor(uid: string, status?: ImageStatus): Promise<QueryDocumentSnapshot[]> {
  // Single-field query + in-memory filter: a composite (ownerUid, status)
  // index would need firestore.indexes.json for a collection that is dozens
  // of documents per member.
  const snap = await db.collection("images").where("ownerUid", "==", uid).get();
  return snap.docs.filter((d) => !status || d.data().status === status);
}

export async function setImagesStatus(refs: DocumentReference[], status: ImageStatus): Promise<void> {
  for (let i = 0; i < refs.length; i += 500) {
    const batch = db.batch();
    for (const ref of refs.slice(i, i + 500)) {
      batch.update(ref, { status, updatedAt: FieldValue.serverTimestamp() });
    }
    await batch.commit();
  }
}

/**
 * Soft delete. Hides the member (publicProfiles.active = false — the one flag
 * the directory already filters on), marks the private doc, parks every live
 * image, and opens a deletions/{uid} job. Deletes NO bytes: the grace period
 * exists so a cancel can restore everything from the job record.
 */
export async function scheduleDeletion(
  uid: string,
  requestedBy: DeletionRequester,
  purgeAfter: Timestamp
): Promise<DeletionJob> {
  const liveImages = await imageRefsFor(uid, "live");
  const imageIds = liveImages.map((d) => d.id);

  const job = await db.runTransaction(async (tx) => {
    const [user, pub, existing] = await Promise.all([
      tx.get(db.doc(`users/${uid}`)),
      tx.get(db.doc(`publicProfiles/${uid}`)),
      tx.get(db.doc(`deletions/${uid}`)),
    ]);
    if (existing.exists && existing.data()?.completedAt == null) {
      throw new HttpsError("already-exists", "Deletion already scheduled.");
    }
    const job: DeletionJob = {
      uid,
      requestedBy,
      requestedAt: Timestamp.now(),
      purgeAfter,
      activeBefore: pub.exists && pub.data()?.active !== false,
      imageIds,
      steps: { imagesDeleted: false, filesDeleted: false, docsDeleted: false, authDeleted: false },
      completedAt: null,
      lastError: null,
    };
    tx.set(db.doc(`deletions/${uid}`), job);
    if (pub.exists) tx.update(pub.ref, { active: false });
    // Only an existing doc is marked — a profile-only identity (curated seed
    // with no account) must not acquire a users doc through being deleted.
    if (user.exists) {
      tx.update(user.ref, {
        status: "pendingDeletion",
        deletionRequestedAt: job.requestedAt,
        purgeAfter,
      });
    }
    return job;
  });

  await setImagesStatus(liveImages.map((d) => d.ref), "pendingDeletion");
  return job;
}

/** Reverses scheduleDeletion from the job record. Throws if nothing is pending. */
export async function cancelDeletion(uid: string): Promise<void> {
  const job = await db.runTransaction(async (tx) => {
    const [jobSnap, user, pub] = await Promise.all([
      tx.get(db.doc(`deletions/${uid}`)),
      tx.get(db.doc(`users/${uid}`)),
      tx.get(db.doc(`publicProfiles/${uid}`)),
    ]);
    if (!jobSnap.exists || jobSnap.data()?.completedAt != null) {
      throw new HttpsError("not-found", "No pending deletion.");
    }
    const job = jobSnap.data() as DeletionJob;
    if (pub.exists) tx.update(pub.ref, { active: job.activeBefore });
    if (user.exists) {
      tx.update(user.ref, {
        status: "active",
        deletionRequestedAt: FieldValue.delete(),
        purgeAfter: FieldValue.delete(),
      });
    }
    tx.delete(jobSnap.ref);
    return job;
  });

  await setImagesStatus(job.imageIds.map((id) => db.doc(`images/${id}`)), "live");
}
