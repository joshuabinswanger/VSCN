import { onRequest } from "firebase-functions/v2/https";
import { FieldValue } from "firebase-admin/firestore";
import { db } from "./admin";

// WHO MAY ACKNOWLEDGE A RELEASE — DECLARED HERE, NOT APPLIED BY HAND.
//
// `invoker: "private"` grants nobody, so the one account that actually calls
// this — the Hosting deployer, in the last step of the merge workflow — held
// roles/run.invoker only because a human had granted it out of band. A
// functions deploy REWRITES this service's invoker policy from the manifest,
// which means every `firebase deploy --only functions` silently erased that
// grant and the next release died with 403 at the acknowledgement step.
//
// That is not a hypothetical: it happened on dev on 2026-09-22, and the thing
// that caught it was scripts/verify-release.mjs going red on the grant minutes
// before the release went red in Actions. Prod would have lost the grant the
// same way on its next functions deploy.
//
// Naming the account here makes the deploy apply the binding itself. The
// expectation in the release check and the live policy now come from the same
// source, and there is nothing left for anyone to remember to re-apply.
function hostingDeployer(): string {
  const fromConfig = (): string | undefined => {
    try {
      return JSON.parse(process.env.FIREBASE_CONFIG ?? "{}").projectId;
    } catch {
      return undefined;
    }
  };
  const project = process.env.GCLOUD_PROJECT ?? process.env.GCP_PROJECT ?? fromConfig();
  // Fail CLOSED. An unresolved id would otherwise be baked into the manifest
  // as `…@undefined.iam.gserviceaccount.com` and the deploy would grant the
  // invoker role to a principal that is not ours. A refusal here surfaces as
  // a failed discovery, which is loud, local and harmless.
  if (typeof project !== "string" || !/^[a-z][a-z0-9-]{4,28}[a-z0-9]$/.test(project)) {
    throw new Error(
      `acknowledgeSitePublication: cannot resolve the project id (got ${JSON.stringify(project)}); refusing to declare an invoker`
    );
  }
  return `vscn-hosting-deployer@${project}.iam.gserviceaccount.com`;
}

/** IAM permits only the Hosting deployer to acknowledge a completed release. */
export const acknowledgeSitePublication = onRequest({ invoker: [hostingDeployer()], maxInstances: 1 }, async (req, res) => {
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
