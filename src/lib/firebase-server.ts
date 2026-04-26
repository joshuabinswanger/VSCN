// Server-only — import this only from Astro frontmatter, never from <script> blocks.
import { initializeApp, getApps, cert } from "firebase-admin/app";
import { getFirestore } from "firebase-admin/firestore";
import type { UserDoc } from "./firestore.ts";

const app =
  getApps().length === 0
    ? initializeApp({
        credential: cert(
          JSON.parse((import.meta.env.FIREBASE_SERVICE_ACCOUNT as string).trim())
        ),
      })
    : getApps()[0];

const adminDb = getFirestore(app);

export async function getStaticMembers(): Promise<(UserDoc & { uid: string })[]> {
  const snap = await adminDb.collection("users").orderBy("displayName").get();
  return snap.docs.map((d) => ({ uid: d.id, ...(d.data() as UserDoc) }));
}
