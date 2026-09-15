import { onRequest } from "firebase-functions/v2/https";
import { FieldValue } from "firebase-admin/firestore";
import { db } from "./admin";

/** IAM permits only the Hosting deployer to acknowledge a completed release. */
export const acknowledgeSitePublication = onRequest({ invoker: "private", maxInstances: 1 }, async (req, res) => {
  if (req.method !== "POST") { res.status(405).send("POST required"); return; }
  const revision = req.body?.revision;
  if (typeof revision !== "string" || !/^[a-f0-9-]{36}$/.test(revision)) {
    res.status(400).send("Invalid revision"); return;
  }
  const acknowledged = await db.runTransaction(async tx => {
    const ref = db.doc("rebuildQueue/site");
    const snap = await tx.get(ref);
    if (snap.data()?.revision !== revision) return false;
    tx.update(ref, { dirtyAt: FieldValue.delete(), leaseUntil: FieldValue.delete(),
      publishedRevision: revision, publishedAt: FieldValue.serverTimestamp() });
    return true;
  });
  res.json({ acknowledged });
});
