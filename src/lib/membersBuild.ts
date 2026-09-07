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
import { cert, getApps, initializeApp, type ServiceAccount } from "firebase-admin/app";
import { getFirestore } from "firebase-admin/firestore";
import type { PublicProfileDoc } from "./firestore.ts";
import { resolveSlugs, toMemberViewBase, type MemberView } from "./memberView.ts";
import type { GalleryRecord } from "./galleryRecords.ts";

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

    // Named rather than inlined into cert() because the bucket name below comes
    // out of the same object. The cast is measured, not decorative: cert()
    // accepts this raw snake_case JSON at runtime — it reads project_id,
    // client_email and private_key — but its DECLARED type only names the
    // camelCase ServiceAccount form, so the honest shape has nothing in common
    // with it and astro check rejects the call without the assertion.
    const serviceAccount = JSON.parse(serviceAccountJson) as { project_id: string };
    const app =
      getApps().length === 0
        ? initializeApp({ credential: cert(serviceAccount as ServiceAccount) })
        : getApps()[0];
    const db = getFirestore(app);
    // The default bucket's name, the same derivation scripts/lib/admin-app.mjs
    // uses. Work URLs are derived from records' storagePath against it.
    const bucket = `${serviceAccount.project_id}.firebasestorage.app`;

    // THE RECORDS, since 2026-09-07 (documentation/20260907-works-on-the-record-
    // design.md): the profile's gallery is a list of ids, and every word about
    // a work lives on images/{imageId}. One query for the whole site, grouped by
    // owner below. Two equality filters ride Firestore's single-field index
    // merge — no composite index to deploy. Inside this try on purpose: a
    // failure here is a failure to build the directory, not a site quietly
    // rendered without artwork.
    const [profiles, slugRows, imageRows] = await Promise.all([
      db.collection("publicProfiles").orderBy("displayName").get(),
      db.collection("slugs").get(),
      db.collection("images").where("kind", "==", "gallery").where("status", "==", "live").get(),
    ]);
    const recordsByOwner = new Map<string, GalleryRecord[]>();
    for (const d of imageRows.docs) {
      const rec = { imageId: d.id, ...(d.data() as Omit<GalleryRecord, "imageId">) };
      const list = recordsByOwner.get(rec.ownerUid) ?? [];
      list.push(rec);
      recordsByOwner.set(rec.ownerUid, list);
    }

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
        .map((d) => toMemberViewBase(d.id, d.data() as PublicProfileDoc, recordsByOwner.get(d.id) ?? [], bucket)),
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
