// BUILD TIME ONLY. Never import this from a client script.
//
// It pulls `firebase-admin` and reads FIREBASE_SERVICE_ACCOUNT, so importing it
// into anything that ships to the browser would both fail to bundle and try to
// carry a service account to the client. Runtime member reads go through the
// client SDK in firebase.ts instead.
//
// It exists because two pages now need the same member list — the community
// directory and the per-member profile pages — and duplicating the credential
// handling means duplicating its failure mode too.
import { cert, getApps, initializeApp } from "firebase-admin/app";
import { getFirestore } from "firebase-admin/firestore";
import type { PublicProfileDoc } from "./firestore.ts";
import { assignSlugs, toMemberViewBase, type MemberView } from "./memberView.ts";

/**
 * Every active member, ordered by display name, as render-ready view models.
 *
 * Returns an EMPTY ARRAY when credentials are missing or the read fails, and
 * logs. That is deliberate and matches what the community page has always done,
 * but know the consequence: **"no members" and "no credentials" look
 * identical**. It bites hardest in a fresh worktree, because `.env*` is
 * gitignored and does not come along. If the directory renders empty, check for
 * FIREBASE_SERVICE_ACCOUNT before hunting for a data bug.
 */
export async function fetchMemberViews(): Promise<MemberView[]> {
  try {
    const serviceAccountJson = import.meta.env.FIREBASE_SERVICE_ACCOUNT;
    if (!serviceAccountJson) throw new Error("FIREBASE_SERVICE_ACCOUNT env var not set");

    const app =
      getApps().length === 0
        ? initializeApp({ credential: cert(JSON.parse(serviceAccountJson)) })
        : getApps()[0];

    const snap = await getFirestore(app).collection("publicProfiles").orderBy("displayName").get();

    // Slugs are assigned across the whole set, because deduplication has to see
    // every name at once.
    return assignSlugs(
      snap.docs
        .filter((d) => d.data().active !== false)
        .map((d) => toMemberViewBase(d.id, d.data() as PublicProfileDoc)),
    );
  } catch (err) {
    console.error("[members] Failed to fetch members:", err);
    return [];
  }
}
