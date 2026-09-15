import { createHash, randomUUID } from "node:crypto";
import { onSchedule } from "firebase-functions/v2/scheduler";
import { onDocumentWritten } from "firebase-functions/v2/firestore";
import { logger } from "firebase-functions/v2";
import { FieldValue, Timestamp } from "firebase-admin/firestore";
import { db } from "./admin";
import { dispatchRebuild, githubRebuildToken } from "./rebuild";

/** Ignore bookkeeping timestamps: resaving identical content needs no build. */
export function rebuildFingerprint(profile: Record<string, unknown>, images: { id: string; data: Record<string, unknown> }[]): string {
  const content = (data: Record<string, unknown>) => Object.fromEntries(
    Object.entries(data).filter(([key]) => key !== "updatedAt" && key !== "createdAt").sort(([a], [b]) => a.localeCompare(b)),
  );
  return createHash("sha256").update(JSON.stringify([
    content(profile), images.map((row) => [row.id, content(row.data)]).sort(([a], [b]) => String(a).localeCompare(String(b))),
  ])).digest("hex");
}

// Server-only documents (the rules' default deny applies).
export async function queueMemberRebuild(uid: string): Promise<void> {
  const stateRef = db.doc(`rebuildMembers/${uid}`);
  const queueRef = db.doc("rebuildQueue/site");
  await db.runTransaction(async (tx) => {
    const state = await tx.get(stateRef);
    const now = Date.now();
    const profile = await tx.get(db.doc(`publicProfiles/${uid}`));
    const ids = Array.isArray(profile.data()?.gallery)
      ? profile.data()!.gallery.filter((id: unknown): id is string => typeof id === "string" && !id.includes("/")).slice(0, 8)
      : [];
    const images = ids.length ? await tx.getAll(...ids.map((id: string) => db.doc(`images/${id}`))) : [];
    const fingerprint = rebuildFingerprint(profile.data() ?? { deleted: true }, images
      .filter((d) => d.exists)
      .map((d) => ({ id: d.id, data: d.data() as Record<string, unknown> }))
      .filter((d) => d.data.ownerUid === uid));
    tx.set(stateRef, { checkedAt: Timestamp.fromMillis(now), fingerprint });
    if (fingerprint !== state.data()?.fingerprint) {
      tx.set(queueRef, { dirtyAt: Timestamp.fromMillis(now), revision: randomUUID() }, { merge: true });
    }
  });
}

/** Image text, removal, and completed uploads publish even if the tab closes. */
export const onImageWritten = onDocumentWritten({ document: "images/{imageId}", retry: true }, async (event) => {
  const uid = event.data?.after.data()?.ownerUid ?? event.data?.before.data()?.ownerUid;
  if (typeof uid === "string") await queueMemberRebuild(uid);
});

/** Dirty state is acknowledged by CI only AFTER successful Hosting deployment. */
export const flushMemberRebuilds = onSchedule(
  { schedule: "every 5 minutes", secrets: [githubRebuildToken], maxInstances: 1 },
  async () => {
    const ref = db.doc("rebuildQueue/site");
    const dirtyAt = await db.runTransaction(async (tx) => {
      const snap = await tx.get(ref);
      const data = snap.data();
      if (!data?.dirtyAt || (data.leaseUntil?.toMillis() ?? 0) > Date.now()) return null;
      if (Date.now() - data.dirtyAt.toMillis() > 30 * 60_000) logger.error("Publication delayed over 30 minutes");
      const lease = Timestamp.fromMillis(Date.now() + 15 * 60_000);
      tx.update(ref, { leaseUntil: lease, ...(!data.revision ? { revision: randomUUID() } : {}) });
      return lease;
    });
    if (!dirtyAt) return;
    const ok = await dispatchRebuild();
    await db.runTransaction(async (tx) => {
      const snap = await tx.get(ref);
      // An accepted dispatch is still pending. If CI fails or never starts,
      // lease expiry retries it. Do not clear a newer runner's lease.
      if (!ok && snap.data()?.leaseUntil?.isEqual(dirtyAt)) {
        tx.update(ref, { leaseUntil: FieldValue.delete() });
      }
    });
  },
);
