import type { UserRecord } from "firebase-admin/auth";
import { adminAuth, db } from "./admin";
import type { EmailMismatch } from "./types";

export async function listAllAuthUsers(): Promise<UserRecord[]> {
  const out: UserRecord[] = [];
  let pageToken: string | undefined;
  do {
    const page = await adminAuth.listUsers(1000, pageToken);
    out.push(...page.users);
    pageToken = page.pageToken;
  } while (pageToken);
  return out;
}

/**
 * Every users/{uid}.email that disagrees with Auth. Auth is the source of
 * truth; the Firestore copy is a mirror for scripts and the admin page.
 */
export async function findEmailMismatches(): Promise<EmailMismatch[]> {
  const users = await listAllAuthUsers();
  const mismatches: EmailMismatch[] = [];
  for (let i = 0; i < users.length; i += 100) {
    const chunk = users.slice(i, i + 100);
    const docs = await db.getAll(...chunk.map((u) => db.doc(`users/${u.uid}`)));
    docs.forEach((doc, j) => {
      const authEmail = chunk[j].email;
      if (!doc.exists || !authEmail) return;
      const stored = (doc.data()?.email as string | undefined) ?? null;
      if (stored !== authEmail) mismatches.push({ uid: chunk[j].uid, storedEmail: stored, authEmail });
    });
  }
  return mismatches;
}
