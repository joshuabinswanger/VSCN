import { onDocumentWritten } from "firebase-functions/v2/firestore";
import { logger } from "firebase-functions/v2";
import { FieldValue, type DocumentSnapshot } from "firebase-admin/firestore";
import { db } from "./admin";

// COPY of slugifyName() in src/lib/memberView.ts — functions is a separate TS
// project (CommonJS) and cannot import from src/. Change both or neither.
const TRANSLITERATE: Record<string, string> = {
  ä: "ae", ö: "oe", ü: "ue", Ä: "ae", Ö: "oe", Ü: "ue", ß: "ss",
  å: "a", æ: "ae", ø: "oe", œ: "oe", Å: "a", Æ: "ae", Ø: "oe", Œ: "oe",
};
const SLUG_MAX = 60;

export function slugifyName(name: string): string {
  return (name ?? "")
    .trim()
    .replace(/[äöüÄÖÜßåæøœÅÆØŒ]/g, (ch) => TRANSLITERATE[ch] ?? ch)
    .normalize("NFD")
    .replace(/\p{Diacritic}/gu, "")
    .toLowerCase()
    .replace(/[^a-z0-9]+/g, "-")
    .replace(/^-+|-+$/g, "")
    .slice(0, SLUG_MAX)
    .replace(/-+$/, "");
}

/**
 * Claims a slug for `uid`: the base if free (or already this uid's, current
 * or retired), else `-2`, `-3`, …; retires this uid's other current slug so
 * the old URL can alias to the new one. Serialised in a transaction because
 * two renames landing together must not both take the same suffix.
 */
export async function claimSlug(uid: string, displayName: string): Promise<string> {
  const base = slugifyName(displayName) || uid.toLowerCase();
  return db.runTransaction(async (tx) => {
    const mine = await tx.get(db.collection("slugs").where("uid", "==", uid));
    let candidate = base;
    let n = 1;
    let claimed: DocumentSnapshot | undefined;  // the snapshot of the candidate that won
    // All reads happen before any write, as the Admin SDK transaction requires.
    for (;;) {
      const snap = await tx.get(db.doc(`slugs/${candidate}`));
      if (!snap.exists || snap.data()?.uid === uid) {
        claimed = snap;
        break;
      }
      n += 1;
      candidate = `${base}-${n}`;
    }
    for (const d of mine.docs) {
      if (d.id !== candidate && d.data().current === true) tx.update(d.ref, { current: false });
    }
    tx.set(
      db.doc(`slugs/${candidate}`),
      {
        uid,
        current: true,
        // Creation time, not last-claimed time: a member re-claiming their
        // own slug (A → B → A) must not rewrite history.
        ...(claimed!.exists ? {} : { createdAt: FieldValue.serverTimestamp() }),
      },
      { merge: true }
    );
    return candidate;
  });
}

/**
 * Owns slugs/. Fires on every publicProfiles write; acts only when the
 * display name changed (or the doc is new). Deletion is purgeAccount's job.
 */
export const onPublicProfileWritten = onDocumentWritten("publicProfiles/{uid}", async (event) => {
  const after = event.data?.after;
  const before = event.data?.before;
  if (!after?.exists) return;
  const name = String(after.data()?.displayName ?? "");
  const previous = before?.exists ? String(before.data()?.displayName ?? "") : undefined;
  if (previous === name) return;
  const slug = await claimSlug(event.params.uid, name);
  logger.info("Slug claimed", { uid: event.params.uid, slug });
});
