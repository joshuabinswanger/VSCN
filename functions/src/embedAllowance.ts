import { randomUUID } from "node:crypto";
import { Timestamp } from "firebase-admin/firestore";
import { HttpsError } from "firebase-functions/v2/https";
import { db } from "./admin";
import { reserveWork } from "./uploads";

/** One import per member, charged before network/decoder work, including failures. */
export async function beginEmbedRequest(uid: string): Promise<string> {
  const token = randomUUID();
  await db.runTransaction(async (tx) => {
    const ref = db.doc(`embedRequests/${uid}`);
    const lease = await tx.get(ref);
    if ((lease.data()?.expiresAt?.toMillis() ?? 0) > Date.now()) {
      throw new HttpsError("resource-exhausted", "Another video is still being processed. Try again shortly.", { reason: "busy" });
    }
    const charge = await reserveWork(tx, uid);
    charge();
    // Longer than resolveEmbed's 60-second invocation timeout; crashed calls recover.
    tx.set(ref, { token, expiresAt: Timestamp.fromMillis(Date.now() + 90_000) });
  });
  return token;
}

export async function endEmbedRequest(uid: string, token: string): Promise<void> {
  await db.runTransaction(async (tx) => {
    const ref = db.doc(`embedRequests/${uid}`);
    if ((await tx.get(ref)).data()?.token === token) tx.delete(ref);
  });
}
