// RANKING AND HIDING. The console's three privileged verbs.
//
// Ratings are per-admin and averaged (see imageScore.ts); a call writes ONLY
// the caller's entry in the map, so two admins rating the same picture is the
// normal case and not a conflict. Every write also marks the site rebuild
// dirty BY HAND — rebuildQueue.ts fingerprints the profile and its image
// documents, and the moderation record is deliberately outside both, so
// nothing else would notice a rating and the score would never reach the
// static site.
//
// See documentation/20260922-image-moderation-ranking-design.md.
import { randomUUID } from "node:crypto";
import { onCall, HttpsError } from "firebase-functions/v2/https";
import { Timestamp } from "firebase-admin/firestore";
import { db } from "./admin";
import { audit } from "./adminOps";
import {
  completenessChecks,
  computedCompleteness,
  imageScore,
  SCALE_MAX,
  type AdminRating,
  type ModerationRecord,
  type ScorableRecord,
} from "./imageScore";
import { galleryImageIds, plain, requireAdmin } from "./util";

/** The queue is a page of work, not a dump of the collection. */
const QUEUE_LIMIT = 50;

/**
 * What actually lands in the `ratings` map: the judgement plus who made it and
 * when, denormalised so the console can show a history without a second read.
 *
 * `at` and `name` are deliberately NOT on AdminRating. The scoring module is
 * pure and reads four numeric keys off each rater; extra keys are inert to it,
 * both arithmetically (it never enumerates the entry) and by typing (a
 * StoredRating is structurally an AdminRating). That is what lets the score be
 * computed from EXACTLY the object that gets stored, rather than from a second
 * hand-built copy that could drift from it.
 */
type StoredRating = AdminRating & { at: Timestamp; name: string };

function requireImageId(data: unknown): string {
  const id = String((data as { imageId?: unknown })?.imageId ?? "").trim();
  if (!id || id.includes("/")) throw new HttpsError("invalid-argument", "imageId is required");
  return id;
}

/** 0–5 integers only. A slider cannot produce anything else; a caller can. */
function criterion(value: unknown, name: string): number {
  if (typeof value !== "number" || !Number.isInteger(value) || value < 0 || value > SCALE_MAX) {
    throw new HttpsError("invalid-argument", `${name} must be an integer 0-${SCALE_MAX}`);
  }
  return value;
}

/** null is not missing — it is the stored instruction "follow the record". */
function optionalCriterion(value: unknown, name: string): number | null {
  if (value === null || value === undefined) return null;
  return criterion(value, name);
}

/**
 * The rebuild sweep dispatches when this document is dirty. Marked here
 * because rebuildFingerprint() cannot see a collection it does not read.
 */
async function markSiteDirty(): Promise<void> {
  await db.doc("rebuildQueue/site").set(
    { dirtyAt: Timestamp.now(), revision: randomUUID() },
    { merge: true },
  );
}

export const adminRateImage = onCall(async (req) => {
  const actor = requireAdmin(req);
  const imageId = requireImageId(req.data);
  const data = req.data as Record<string, unknown>;
  const rating: AdminRating = {
    professional: criterion(data.professional, "professional"),
    knowledge: criterion(data.knowledge, "knowledge"),
    aesthetics: criterion(data.aesthetics, "aesthetics"),
    completeness: optionalCriterion(data.completeness, "completeness"),
  };

  const actorName = String((await db.doc(`publicProfiles/${actor}`).get()).data()?.displayName ?? "");

  // ownerUid comes back OUT of the transaction rather than being fetched again
  // for the audit line: a second read would be a wasted round trip and, worse,
  // could see a different document than the one that was rated.
  const { score, ownerUid } = await db.runTransaction(async (tx) => {
    const imageRef = db.doc(`images/${imageId}`);
    const modRef = db.doc(`imageModeration/${imageId}`);
    const [image, mod] = await Promise.all([tx.get(imageRef), tx.get(modRef)]);
    if (!image.exists) throw new HttpsError("not-found", "No such image.");
    const record = image.data() as ScorableRecord;
    const existing = (mod.data() ?? {}) as ModerationRecord;
    const entry: StoredRating = { ...rating, at: Timestamp.now(), name: actorName };
    // Only the caller's own entry moves. Everyone else's stands. ONE map: the
    // score below is computed from the very object written on the next line.
    const ratings: Record<string, AdminRating> = { ...(existing.ratings ?? {}), [actor]: entry };
    const next = imageScore(record, { ...existing, ratings });
    tx.set(modRef, { ratings, score: next, scoredAt: entry.at }, { merge: true });
    return { score: next, ownerUid: String((image.data() as { ownerUid?: unknown }).ownerUid ?? "") };
  });

  await audit(actor, "rateImage", ownerUid, { imageId, ...rating, score });
  await markSiteDirty();
  return { ok: true as const, score };
});

export const adminSetImageHidden = onCall(async (req) => {
  const actor = requireAdmin(req);
  const imageId = requireImageId(req.data);
  const hidden = (req.data as { hidden?: unknown }).hidden === true;

  const image = await db.doc(`images/${imageId}`).get();
  if (!image.exists) throw new HttpsError("not-found", "No such image.");

  // No score is touched here, and none is written: hiding is a separate
  // question from ranking, and a hidden picture keeps whatever grade it had
  // for the day it is shown again.
  await db.doc(`imageModeration/${imageId}`).set(
    {
      hidden,
      hiddenBy: hidden ? actor : null,
      hiddenAt: hidden ? Timestamp.now() : null,
    },
    { merge: true },
  );
  // A separate action name from rateImage: the log should read as a
  // moderation act, not as a number changing.
  await audit(actor, hidden ? "hideImage" : "unhideImage", String(image.data()?.ownerUid ?? ""), { imageId });
  await markSiteDirty();
  return { ok: true as const };
});

export const adminListRatingQueue = onCall(async (req) => {
  const actor = requireAdmin(req);
  const limit = Math.min(200, Math.max(1, Number((req.data as { limit?: unknown })?.limit) || QUEUE_LIMIT));

  const [images, mods, profiles, slugs] = await Promise.all([
    db.collection("images").where("kind", "==", "gallery").where("status", "==", "live").get(),
    db.collection("imageModeration").get(),
    db.collection("publicProfiles").get(),
    db.collection("slugs").where("current", "==", true).get(),
  ]);

  const modById = new Map(mods.docs.map((d) => [d.id, d.data() as ModerationRecord]));
  const slugByUid = new Map(slugs.docs.map((d) => [String(d.data().uid ?? ""), d.id]));
  // Only pictures a visible profile actually points at. An unreferenced live
  // record is an orphan, and adminListQueues already has a queue for those —
  // rating one would be work spent on something no visitor can see.
  const nameByUid = new Map<string, string>();
  const referenced = new Set<string>();
  for (const doc of profiles.docs) {
    const data = doc.data();
    if (data.active === false || data.moderationHidden === true) continue;
    nameByUid.set(doc.id, String(data.displayName ?? ""));
    for (const id of galleryImageIds(data)) referenced.add(id);
  }

  const millis = (doc: { data(): Record<string, unknown> }): number => {
    const createdAt = doc.data().createdAt;
    return createdAt instanceof Timestamp ? createdAt.toMillis() : 0;
  };

  const unrated = images.docs
    .filter((d) => referenced.has(d.id) && nameByUid.has(String(d.data().ownerUid ?? "")))
    .filter((d) => !(modById.get(d.id)?.ratings ?? {})[actor])
    // NEWEST FIRST, numerically. The draft of this compared millisecond counts
    // through localeCompare, which sorts them as strings: "9…" beats "10…" and
    // the stack came out in an order nobody chose.
    .sort((a, b) => millis(b) - millis(a));

  const items = unrated.slice(0, limit).map((d) => {
    const data = d.data();
    const rec = data as ScorableRecord;
    const mod = modById.get(d.id) ?? null;
    const ownerUid = String(data.ownerUid ?? "");
    return {
      imageId: d.id,
      ownerUid,
      ownerName: nameByUid.get(ownerUid) ?? "",
      ownerSlug: slugByUid.get(ownerUid) ?? "",
      storagePath: data.storagePath,
      width: data.width,
      height: data.height,
      color: data.color,
      caption: data.caption,
      captionDe: data.captionDe,
      description: data.description,
      descriptionDe: data.descriptionDe,
      tags: Array.isArray(data.tags) ? data.tags : [],
      link: data.link,
      siteLink: data.siteLink,
      createdAt: data.createdAt,
      checks: completenessChecks(rec),
      computedCompleteness: computedCompleteness(rec),
      score: imageScore(rec, mod),
      raterCount: Object.keys(mod?.ratings ?? {}).length,
      hidden: mod?.hidden === true,
    };
  });

  // ADMIN UIDS DO NOT TRAVEL FURTHER THAN THEY MUST: the queue reports how
  // many admins have rated a picture, never which.
  return plain({ items, remaining: unrated.length });
});
