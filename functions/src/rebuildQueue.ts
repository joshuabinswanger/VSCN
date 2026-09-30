import { createHash, randomUUID } from "node:crypto";
import { onSchedule } from "firebase-functions/v2/scheduler";
import { onDocumentWritten } from "firebase-functions/v2/firestore";
import { logger } from "firebase-functions/v2";
import { FieldValue, Timestamp } from "firebase-admin/firestore";
import { db } from "./admin";
import { dispatchRebuild, githubRebuildToken } from "./rebuild";

/**
 * Ignore bookkeeping timestamps: resaving identical content needs no build.
 * An empty string or an empty array is fingerprinted as ABSENT, because that
 * is what the site makes of it (memberView.ts turns `roleDe: ""` into
 * undefined; an empty gallery renders like no gallery). The editor always
 * writes `roleDe: ""` and `bioDe: ""`, and before this canonicalisation the
 * first Save after the bilingual fields shipped rebuilt production for
 * exactly those two empty strings (run 36498520542, 2026-09-28).
 */
export function rebuildFingerprint(
  profile: Record<string, unknown>,
  images: { id: string; data: Record<string, unknown> }[],
  projects: { id: string; data: Record<string, unknown> }[] = [],
): string {
  const absent = (value: unknown) => value === "" || (Array.isArray(value) && value.length === 0);
  const content = (data: Record<string, unknown>) => Object.fromEntries(
    Object.entries(data)
      .filter(([key, value]) => key !== "updatedAt" && key !== "createdAt" && !absent(value))
      .sort(([a], [b]) => a.localeCompare(b)),
  );
  const rows = (docs: { id: string; data: Record<string, unknown> }[]) =>
    docs.map((row) => [row.id, content(row.data)]).sort(([a], [b]) => String(a).localeCompare(String(b)));
  // No projects fingerprints exactly as before projects existed, so a member
  // without any is not re-queued by the deploy that added them.
  return createHash("sha256").update(JSON.stringify([
    content(profile), rows(images), ...(projects.length ? [rows(projects)] : []),
  ])).digest("hex");
}

/**
 * What a dirtying write puts on rebuildQueue/site. `dirtyAt` is the NEWEST
 * unpublished write and `queuedAt` the OLDEST: a queue that is already dirty
 * keeps its queuedAt, so the age the flush logs and the admin console shows
 * is how long the site has been behind, not how long since somebody last
 * saved. Measuring from dirtyAt alone meant a stalled pipeline never reported
 * itself while members kept saving (review T2-9). A queue written before
 * queuedAt existed has only dirtyAt, which the readers fall back to.
 */
function dirtyFields(queue: FirebaseFirestore.DocumentData | undefined, now: number): Record<string, unknown> {
  const at = Timestamp.fromMillis(now);
  return { dirtyAt: at, queuedAt: queue?.dirtyAt ? queue.queuedAt ?? queue.dirtyAt : at, revision: randomUUID() };
}

/** Dirty the queue for a change the fingerprint cannot see (moderation.ts: ratings and hides live in their own collection). */
export async function markSiteDirty(): Promise<void> {
  const ref = db.doc("rebuildQueue/site");
  await db.runTransaction(async (tx) => {
    const snap = await tx.get(ref);
    tx.set(ref, dirtyFields(snap.data(), Date.now()), { merge: true });
  });
}

/** How long the queue has been waiting, from the oldest unpublished write; null when clean. */
export function queueAgeMillis(queue: FirebaseFirestore.DocumentData | undefined, now = Date.now()): number | null {
  const since = queue?.queuedAt ?? queue?.dirtyAt;
  return since ? now - since.toMillis() : null;
}

/** After this the member's status reads "delayed" and the flush logs an error. */
export const DELAYED_AFTER_MINUTES = 30;

// Server-only documents (the rules' default deny applies). rebuildMembers/{uid}
// is never deleted, not even by purge: it holds no personal data (a hash, a
// generation, two timestamps), and the profile-delete trigger recomputes it
// the moment the profile goes — deleting it first only made that trigger see
// "no fingerprint" and queue a build to drop a member the site never showed.
export async function queueMemberRebuild(uid: string): Promise<void> {
  const stateRef = db.doc(`rebuildMembers/${uid}`);
  const queueRef = db.doc("rebuildQueue/site");
  await db.runTransaction(async (tx) => {
    const state = await tx.get(stateRef);
    const queue = await tx.get(queueRef);
    const now = Date.now();
    const profile = await tx.get(db.doc(`publicProfiles/${uid}`));
    // Fingerprint what the SITE would show, not what the document holds. The
    // export (scripts/export-site-data.mjs) drops profiles that are inactive
    // or moderationHidden, so for the build they are absent, and they are
    // fingerprinted as absent here. A hidden member's uploads then change
    // nothing and queue nothing — the release walk relies on this — while
    // hiding or deactivating a visible member still changes the fingerprint
    // and queues the build that drops them.
    const data = profile.data();
    const shown = data && data.active !== false && data.moderationHidden !== true ? data : null;
    const ids = Array.isArray(shown?.gallery)
      ? shown!.gallery.filter((id: unknown): id is string => typeof id === "string" && !id.includes("/")).slice(0, 12)
      : [];
    const images = ids.length ? await tx.getAll(...ids.map((id: string) => db.doc(`images/${id}`))) : [];
    // Projects too, because the export ships every project of a visible
    // member: a Save that only retitles a project touches no profile field
    // and no image record, and without this it would never publish
    // (documentation/20260923-projects-design.md, Build).
    const projects = shown ? (await tx.get(db.collection("projects").where("ownerUid", "==", uid))).docs : [];
    const fingerprint = rebuildFingerprint(shown ?? { deleted: true }, images
      .filter((d) => d.exists)
      .map((d) => ({ id: d.id, data: d.data() as Record<string, unknown> }))
      .filter((d) => d.data.ownerUid === uid), projects.map((d) => ({ id: d.id, data: d.data() })));
    tx.set(stateRef, { checkedAt: Timestamp.fromMillis(now), fingerprint }, { merge: true });
    if (fingerprint === state.data()?.fingerprint) {
      // A member whose last change predates generations (2026-09-28) has
      // nothing unpublished — the fingerprint says the site already shows it —
      // so they start at 0, which getPublicationStatus reads as published.
      // Without this, every unchanged save reported "unknown" indefinitely.
      if (typeof state.data()?.generation !== "number") tx.set(stateRef, { generation: 0 }, { merge: true });
    } else {
      const generation = (queue.data()?.generation ?? 0) + 1;
      // The member's own queuedAt is the oldest of THEIR unpublished changes:
      // kept while an earlier generation of theirs is still waiting, reset
      // once everything they had queued is on the site. getPublicationStatus
      // measures "delayed" from it, so a member who keeps editing while the
      // pipeline is stuck still gets told.
      const previous = state.data()?.generation;
      const waiting = typeof previous === "number" && previous > (queue.data()?.publishedGeneration ?? 0) && state.data()?.queuedAt;
      tx.set(stateRef, { generation, queuedAt: waiting ? state.data()!.queuedAt : Timestamp.fromMillis(now) }, { merge: true });
      tx.set(queueRef, { generation, ...dirtyFields(queue.data(), now) }, { merge: true });
    }
  });
}

/** Image text, removal, and completed uploads publish even if the tab closes. */
export const onImageWritten = onDocumentWritten({ document: "images/{imageId}", retry: true }, async (event) => {
  const uid = event.data?.after.data()?.ownerUid ?? event.data?.before.data()?.ownerUid;
  if (typeof uid === "string") await queueMemberRebuild(uid);
});

/** Dirty state is acknowledged by CI only AFTER successful Hosting deployment.
 *  Every minute, so a save waits at most a minute before its build starts. It
 *  cannot stack builds: a dispatch holds the 15-minute lease until CI
 *  acknowledges it, and a flush that finds a live lease just returns. */
export const flushMemberRebuilds = onSchedule(
  { schedule: "every 1 minutes", secrets: [githubRebuildToken], maxInstances: 1 },
  async () => {
    const ref = db.doc("rebuildQueue/site");
    const dirtyAt = await db.runTransaction(async (tx) => {
      const snap = await tx.get(ref);
      const data = snap.data();
      if (!data?.dirtyAt || (data.leaseUntil?.toMillis() ?? 0) > Date.now()) return null;
      const age = queueAgeMillis(data);
      if (age !== null && age > DELAYED_AFTER_MINUTES * 60_000) {
        logger.error(`Publication delayed over ${DELAYED_AFTER_MINUTES} minutes`, { minutes: Math.round(age / 60_000), generation: data.generation ?? null, publishedGeneration: data.publishedGeneration ?? 0 });
      }
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
