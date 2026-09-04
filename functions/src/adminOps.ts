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
      // Lowercased: Auth stores the address it was given, and getUserByEmail
      // does not case-fold for us, so "Josh@Example.com" found nobody.
      return (await adminAuth.getUserByEmail(q.toLowerCase())).uid;
    } catch {
      return null;
    }
  }
  // A SLUG IS ALWAYS LOWERCASE (it is derived from displayName), so a query
  // typed the way the name reads — "Daniel-Roettele" — was a slug with the
  // wrong case and resolved to nothing. uid and imageId stay case-SENSITIVE:
  // they are opaque ids, and folding them would be inventing matches.
  const slugKey = q.toLowerCase();
  const [slug, image, pub, user] = await Promise.all([
    db.doc(`slugs/${slugKey}`).get(),
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
/**
 * uid → its CURRENT slug. There is no `slug` field on a profile: slugs are
 * their own collection keyed BY the slug (`slugs/{slug} -> { uid, current }`),
 * owned by onPublicProfileWritten, with retired slugs kept as aliases. Both
 * callers below wanted to show and search one, and both read a
 * `publicProfiles.slug` that has never existed — so the column was blank and
 * the slug half of the search matched nothing.
 */
async function currentSlugByUid(): Promise<Map<string, string>> {
  const snap = await db.collection("slugs").where("current", "==", true).get();
  const byUid = new Map<string, string>();
  for (const d of snap.docs) {
    const uid = String(d.data().uid ?? "");
    if (uid) byUid.set(uid, d.id);
  }
  return byUid;
}

/**
 * Name search, in memory and CASE-INSENSITIVE (2026-09-03, Josh: "make search
 * not be case sensitive in the admin console").
 *
 * It was a Firestore prefix range, and that failed an admin twice over.
 * Firestore orders strings by BYTE, so "josh" could never reach "Joshua":
 * lowercase j is 0x6A, uppercase J is 0x4A, and the range therefore starts
 * after every capitalised name in the collection. And a prefix range only ever
 * matches the START of the field, so "binswanger" never found "Joshua
 * Binswanger" whatever the case.
 *
 * A full scan with a substring test fixes both, and the cost is already paid
 * next door: adminListQueues reads every publicProfile and every user on every
 * call. The directory is a couple of dozen members. When that stops being
 * true the answer is a stored lowercased field to range over, not a cleverer
 * query on this one.
 */
async function nameMatches(fragment: string) {
  const needle = fragment.trim().toLowerCase();
  if (!needle) return [];
  const [snap, slugByUid] = await Promise.all([
    db.collection("publicProfiles").get(),
    currentSlugByUid(),
  ]);
  return snap.docs
    .map((d) => ({
      uid: d.id,
      displayName: String(d.data().displayName ?? ""),
      slug: slugByUid.get(d.id) ?? "",
      active: d.data().active !== false,
    }))
    .filter(
      (m) =>
        m.displayName.toLowerCase().includes(needle) ||
        m.slug.toLowerCase().includes(needle) ||
        m.uid.toLowerCase() === needle
    )
    .sort((a, b) => a.displayName.localeCompare(b.displayName))
    .slice(0, 50);
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

/**
 * EVERY MEMBER AS ONE ROW — the console's front door (2026-09-03, Josh: "maek
 * a list view with filter instead of one big search bar").
 *
 * A search box can only answer a question you already know how to ask. An
 * admin arriving at this console usually does not: they want to see who is
 * there, who is hidden, who is mid-deletion, who has no Auth user. So the
 * console opens on the list and filters it in the browser — which is also what
 * makes the filter case-insensitive and instant, with no round trip per
 * keystroke.
 *
 * Rows are deliberately THIN. Everything here is what you filter or scan on;
 * the full graph stays behind adminLookupMember, one member at a time. The one
 * apparent luxury is the two image numbers, and they earn it: `galleryCount`
 * is what the member's page will show (the array), `imageRecords` is what
 * actually exists (the records). A row where those disagree is the exact shape
 * of a half-finished upload or a rejected profile write, visible without
 * opening anything.
 *
 * Auth is fetched in ONE batched call rather than per member: getUsers takes
 * 100 identifiers at a time, and a member with no Auth user (every curated
 * seed profile) simply comes back missing — which is itself a column here.
 */
export const adminListMembers = onCall(async (req) => {
  requireAdmin(req);
  const [pubs, users, images, deletions, slugByUid] = await Promise.all([
    db.collection("publicProfiles").get(),
    db.collection("users").get(),
    db.collection("images").get(),
    db.collection("deletions").where("completedAt", "==", null).get(),
    currentSlugByUid(),
  ]);

  const userById = new Map(users.docs.map((d) => [d.id, d.data()]));
  const pendingUids = new Set(deletions.docs.map((d) => d.id));
  const records = new Map<string, number>();
  for (const d of images.docs) {
    const owner = String(d.data().ownerUid ?? "");
    if (owner) records.set(owner, (records.get(owner) ?? 0) + 1);
  }

  // Union of both profile docs: a profile-only identity has no users doc, and
  // a users doc can outlive its public profile. Either alone would hide a
  // member from the one view meant to show all of them.
  const uids = [...new Set([...pubs.docs.map((d) => d.id), ...users.docs.map((d) => d.id)])];

  const authByUid = new Map<string, UserRecord>();
  for (let i = 0; i < uids.length; i += 100) {
    const { users: found } = await adminAuth.getUsers(uids.slice(i, i + 100).map((uid) => ({ uid })));
    for (const u of found) authByUid.set(u.uid, u);
  }

  const pubById = new Map(pubs.docs.map((d) => [d.id, d.data()]));
  const rows = uids.map((uid) => {
    const pub = pubById.get(uid);
    const usr = userById.get(uid);
    const auth = authByUid.get(uid);
    const gallery = Array.isArray(pub?.gallery) ? pub.gallery : [];
    return {
      uid,
      displayName: String(pub?.displayName ?? usr?.displayName ?? ""),
      slug: slugByUid.get(uid) ?? "",
      role: String(pub?.role ?? usr?.role ?? ""),
      memberType: String(pub?.memberType ?? usr?.memberType ?? ""),
      email: auth?.email ?? (typeof usr?.email === "string" ? usr.email : null),
      emailVerified: auth ? auth.emailVerified : null,
      hasAuth: Boolean(auth),
      hasPublicProfile: Boolean(pub),
      active: pub ? pub.active !== false : false,
      status: String(usr?.status ?? (usr ? "active" : "profile only")),
      pendingDeletion: pendingUids.has(uid),
      galleryCount: gallery.length,
      imageRecords: records.get(uid) ?? 0,
      hasAvatar: Boolean(pub?.photoImageId ?? usr?.photoImageId),
      createdAt: auth?.metadata.creationTime ?? null,
    };
  });

  rows.sort((a, b) => (a.displayName || a.uid).localeCompare(b.displayName || b.uid));
  return plain({ members: rows });
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
