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
 * exists so a cancel can restore everything from the job record. The image
 * flips are part of the same transaction as the job/profile/user writes, so a
 * failure leaves nothing half-parked — either everything commits or nothing
 * does.
 */
export async function scheduleDeletion(
  uid: string,
  requestedBy: DeletionRequester,
  purgeAfter: Timestamp
): Promise<DeletionJob> {
  const job = await db.runTransaction(async (tx) => {
    const [user, pub, existing, imagesSnap] = await Promise.all([
      tx.get(db.doc(`users/${uid}`)),
      tx.get(db.doc(`publicProfiles/${uid}`)),
      tx.get(db.doc(`deletions/${uid}`)),
      tx.get(db.collection("images").where("ownerUid", "==", uid)),
    ]);
    if (existing.exists && existing.data()?.completedAt == null) {
      throw new HttpsError("already-exists", "Deletion already scheduled.");
    }
    const liveImages = imagesSnap.docs.filter((d) => d.data().status === "live");
    const imageIds = liveImages.map((d) => d.id);
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
    for (const d of liveImages) {
      tx.update(d.ref, { status: "pendingDeletion", updatedAt: FieldValue.serverTimestamp() });
    }
    return job;
  });

  return job;
}

/**
 * Reverses scheduleDeletion from the job record. Throws if nothing is
 * pending. The image flips happen inside the same transaction as the
 * job/profile/user writes, after all reads (Firestore transactions require
 * every read before any write) — so a failure leaves nothing half-restored.
 */
export async function cancelDeletion(uid: string): Promise<void> {
  await db.runTransaction(async (tx) => {
    const [jobSnap, user, pub] = await Promise.all([
      tx.get(db.doc(`deletions/${uid}`)),
      tx.get(db.doc(`users/${uid}`)),
      tx.get(db.doc(`publicProfiles/${uid}`)),
    ]);
    if (!jobSnap.exists || jobSnap.data()?.completedAt != null) {
      throw new HttpsError("not-found", "No pending deletion.");
    }
    const job = jobSnap.data() as DeletionJob;
    const imageRefs = job.imageIds.map((id) => db.doc(`images/${id}`));
    const imageSnaps = imageRefs.length ? await tx.getAll(...imageRefs) : [];

    if (pub.exists) tx.update(pub.ref, { active: job.activeBefore });
    if (user.exists) {
      tx.update(user.ref, {
        status: "active",
        deletionRequestedAt: FieldValue.delete(),
        purgeAfter: FieldValue.delete(),
      });
    }
    tx.delete(jobSnap.ref);
    // A recorded image that no longer exists (swept or purged) is skipped,
    // not an error.
    for (const s of imageSnaps) {
      if (s.exists) tx.update(s.ref, { status: "live", updatedAt: FieldValue.serverTimestamp() });
    }
  });
}
