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
import { resolveSlugs, toMemberViewBase, type MemberView } from "./memberView.ts";

interface Directory {
  members: MemberView[];
  /** Retired slugs still pointing at an active member: `/members/<slug>` aliases to their current page. */
  aliases: { slug: string; uid: string }[];
}

// Several pages call into this during one build; one fetch serves them all.
let directoryPromise: Promise<Directory> | null = null;

async function fetchDirectory(): Promise<Directory> {
  try {
    const serviceAccountJson = import.meta.env.FIREBASE_SERVICE_ACCOUNT;
    if (!serviceAccountJson) throw new Error("FIREBASE_SERVICE_ACCOUNT env var not set");

    const app =
      getApps().length === 0
        ? initializeApp({ credential: cert(JSON.parse(serviceAccountJson)) })
        : getApps()[0];
    const db = getFirestore(app);

    const [profiles, slugRows] = await Promise.all([
      db.collection("publicProfiles").orderBy("displayName").get(),
      db.collection("slugs").get(),
    ]);

    // The build READS slugs/ and never writes it: this code runs in CI with a
    // service account, and a build that wrote back would have every PR
    // preview mutating live data. onPublicProfileWritten owns the table.
    const current = new Map<string, string>();
    const retired: { slug: string; uid: string }[] = [];
    for (const row of slugRows.docs) {
      const { uid, current: isCurrent } = row.data() as { uid: string; current?: boolean };
      if (isCurrent) current.set(uid, row.id);
      else retired.push({ slug: row.id, uid });
    }

    const members = resolveSlugs(
      profiles.docs
        .filter((d) => d.data().active !== false)
        .map((d) => toMemberViewBase(d.id, d.data() as PublicProfileDoc)),
      current,
    );
    const activeUids = new Set(members.map((m) => m.id));
    return { members, aliases: retired.filter((a) => activeUids.has(a.uid)) };
  } catch (err) {
    console.error("[members] Failed to fetch members:", err);
    return { members: [], aliases: [] };
  }
}

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
  directoryPromise ??= fetchDirectory();
  return (await directoryPromise).members;
}

export async function fetchSlugAliases(): Promise<{ slug: string; uid: string }[]> {
  directoryPromise ??= fetchDirectory();
  return (await directoryPromise).aliases;
}
