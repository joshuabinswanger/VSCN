import { onCall, HttpsError } from "firebase-functions/v2/https";
import { FieldValue, Timestamp } from "firebase-admin/firestore";
import type { UserRecord } from "firebase-admin/auth";
import { adminAuth, db } from "./admin";
import { GRACE_DAYS, STALE_UPLOAD_HOURS } from "./constants";
import { findEmailMismatches } from "./emails";
import { cancelDeletion, scheduleDeletion } from "./lifecycle";
import { purgeAccount } from "./purge";
import { dispatchRebuild, githubRebuildToken } from "./rebuild";
import { plain, requireAdmin } from "./util";

async function audit(
  actorUid: string,
  action: string,
  targetUid: string,
  detail: Record<string, unknown> = {}
): Promise<void> {
  await db.collection("adminActions").add({
    actorUid,
    action,
    targetUid,
    at: FieldValue.serverTimestamp(),
    ...detail,
  });
}

function requireUidArg(data: unknown): string {
  const uid = String((data as { uid?: unknown })?.uid ?? "").trim();
  if (!uid) throw new HttpsError("invalid-argument", "uid is required");
  return uid;
}

function authSummary(u: UserRecord) {
  return {
    uid: u.uid,
    email: u.email ?? null,
    emailVerified: u.emailVerified,
    disabled: u.disabled,
    createdAt: u.metadata.creationTime,
    lastSignInAt: u.metadata.lastSignInTime ?? null,
    admin: u.customClaims?.admin === true,
  };
}

/**
 * email → Auth; slug → slugs/; imageId → images/; else treat as a uid if any
 * doc or Auth user answers to it. Returns null when nothing does.
 */
async function resolveUid(query: string): Promise<string | null> {
  const q = query.trim();
  // A slash can never be an email, uid, slug or imageId, and db.doc() throws
  // on a path with the wrong number of segments — fall through to the
  // displayName search instead.
  if (!q || q.includes("/")) return null;
  if (q.includes("@")) {
    try {
      return (await adminAuth.getUserByEmail(q)).uid;
    } catch {
      return null;
    }
  }
  const [slug, image, pub, user] = await Promise.all([
    db.doc(`slugs/${q}`).get(),
    db.doc(`images/${q}`).get(),
    db.doc(`publicProfiles/${q}`).get(),
    db.doc(`users/${q}`).get(),
  ]);
  if (slug.exists) return slug.data()?.uid as string;
  if (image.exists) return image.data()?.ownerUid as string;
  if (pub.exists || user.exists) return q;
  try {
    return (await adminAuth.getUser(q)).uid;
  } catch {
    return null;
  }
}

/** Prefix match on displayName — the only substring search Firestore offers. */
async function nameMatches(fragment: string) {
  const snap = await db
    .collection("publicProfiles")
    .orderBy("displayName")
    .startAt(fragment)
    .endAt(`${fragment}\uf8ff`)
    .limit(20)
    .get();
  return snap.docs.map((d) => ({
    uid: d.id,
    displayName: String(d.data().displayName ?? ""),
    active: d.data().active !== false,
  }));
}

/** Everything attached to one identity, in one response. */
export async function memberGraph(uid: string) {
  const [authUser, user, pub, images, onboarding, deletion, slugs] = await Promise.all([
    adminAuth.getUser(uid).catch(() => null),
    db.doc(`users/${uid}`).get(),
    db.doc(`publicProfiles/${uid}`).get(),
    db.collection("images").where("ownerUid", "==", uid).get(),
    db.doc(`onboardingRequests/${uid}`).get(),
    db.doc(`deletions/${uid}`).get(),
    db.collection("slugs").where("uid", "==", uid).get(),
  ]);
  return plain({
    uid,
    auth: authUser ? authSummary(authUser) : null,
    user: user.exists ? user.data() : null,
    publicProfile: pub.exists ? pub.data() : null,
    images: images.docs.map((d) => ({ imageId: d.id, ...d.data() })),
    onboardingRequest: onboarding.exists ? onboarding.data() : null,
    deletion: deletion.exists ? deletion.data() : null,
    slugs: slugs.docs.map((d) => ({ slug: d.id, current: d.data().current === true })),
  });
}

export const adminLookupMember = onCall(async (req) => {
  requireAdmin(req);
  const query = String((req.data as { query?: unknown })?.query ?? "").trim();
  if (!query) throw new HttpsError("invalid-argument", "query is required");
  const uid = await resolveUid(query);
  if (uid) return { graph: await memberGraph(uid), matches: [] };
  return { graph: null, matches: await nameMatches(query) };
});

export const adminListQueues = onCall(async (req) => {
  requireAdmin(req);
  const cutoff = Date.now() - STALE_UPLOAD_HOURS * 3_600_000;
  const [open, uploading, live, pubs, users, emailMismatches] = await Promise.all([
    db.collection("deletions").where("completedAt", "==", null).get(),
    db.collection("images").where("status", "==", "uploading").get(),
    db.collection("images").where("status", "==", "live").get(),
    db.collection("publicProfiles").get(),
    db.collection("users").get(),
    findEmailMismatches(),
  ]);

  // The orphan the upload inversion does NOT prevent: a record that reached
  // `live` and then never made it into a gallery array or onto photoImageId
  // (the profile write was rejected, the tab closed, an avatar was replaced
  // twice in one onboarding). No sweeper takes these — shown here so a human
  // decides, because declaring a member's image unwanted is not automatic.
  const referenced = new Set<string>();
  for (const snap of [pubs, users]) {
    for (const d of snap.docs) {
      const data = d.data();
      if (typeof data.photoImageId === "string" && data.photoImageId) referenced.add(data.photoImageId);
      const gallery = Array.isArray(data.gallery) ? data.gallery : [];
      for (const item of gallery) {
        const id = (item as { imageId?: unknown } | null)?.imageId;
        if (typeof id === "string" && id) referenced.add(id);
      }
    }
  }

  return plain({
    pendingDeletions: open.docs.map((d) => d.data()),
    staleUploads: uploading.docs
      .filter((d) => (d.data().createdAt as Timestamp).toMillis() < cutoff)
      .map((d) => ({ imageId: d.id, ...d.data() })),
    unreferencedLive: live.docs
      .filter((d) => !referenced.has(d.id) && (d.data().createdAt as Timestamp).toMillis() < cutoff)
      .map((d) => ({ imageId: d.id, ...d.data() })),
    emailMismatches,
  });
});

export const adminPurgeAccount = onCall({ secrets: [githubRebuildToken] }, async (req) => {
  const actor = requireAdmin(req);
  const uid = requireUidArg(req.data);
  const immediate = (req.data as { immediate?: unknown })?.immediate === true;
  const purgeAfter = immediate
    ? Timestamp.now()
    : Timestamp.fromMillis(Date.now() + GRACE_DAYS * 86_400_000);
  const existing = await db.doc(`deletions/${uid}`).get();
  if (!existing.exists || existing.data()?.completedAt != null) {
    await scheduleDeletion(uid, "admin", purgeAfter);
  }
  if (immediate) await purgeAccount(uid);
  await audit(actor, immediate ? "purgeAccount" : "scheduleDeletion", uid, {
    purgeAfter: purgeAfter.toDate().toISOString(),
  });
  await dispatchRebuild();
  return { ok: true, purgeAfter: purgeAfter.toDate().toISOString() };
});

export const adminRestoreAccount = onCall({ secrets: [githubRebuildToken] }, async (req) => {
  const actor = requireAdmin(req);
  const uid = requireUidArg(req.data);
  await cancelDeletion(uid);
  await audit(actor, "restoreAccount", uid);
  await dispatchRebuild();
  return { ok: true };
});

/**
 * Fixes an address on request. Verification status is left as it was — this
 * is the admin correcting a typo for a member they have spoken to, not a
 * member changing their own address (that path is verifyBeforeUpdateEmail in
 * the client, which Auth verifies itself).
 */
export const adminSetMemberEmail = onCall(async (req) => {
  const actor = requireAdmin(req);
  const uid = requireUidArg(req.data);
  const email = String((req.data as { email?: unknown })?.email ?? "").trim().toLowerCase();
  if (!email.includes("@")) throw new HttpsError("invalid-argument", "email is required");
  const before = await adminAuth.getUser(uid);
  await adminAuth.updateUser(uid, { email });
  const userRef = db.doc(`users/${uid}`);
  if ((await userRef.get()).exists) await userRef.update({ email });
  await audit(actor, "setMemberEmail", uid, { before: before.email ?? null, after: email });
  return { ok: true };
});

export const adminSetProfileActive = onCall({ secrets: [githubRebuildToken] }, async (req) => {
  const actor = requireAdmin(req);
  const uid = requireUidArg(req.data);
  const active = (req.data as { active?: unknown })?.active === true;
  const ref = db.doc(`publicProfiles/${uid}`);
  const snap = await ref.get();
  if (!snap.exists) throw new HttpsError("not-found", "No public profile.");
  await ref.update({ active });
  await audit(actor, "setProfileActive", uid, { before: snap.data()?.active !== false, after: active });
  await dispatchRebuild();
  return { ok: true };
});
