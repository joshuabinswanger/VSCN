import { onCall, HttpsError, onRequest } from "firebase-functions/v2/https";
import { FieldValue } from "firebase-admin/firestore";
import { db } from "./admin";
import { DELAYED_AFTER_MINUTES } from "./rebuildQueue";

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
    const data = snap.data() ?? {};
    const published = data.publishedGeneration ?? 0;
    // Which generation the deploy carried. The workflow sends the one it
    // captured before export; a revision match proves nothing was queued
    // since, so the queue's own generation is what went live (queueMemberRebuild
    // writes generation and revision together) and a body without one — a
    // hand-run curl — must not strand members on "queued". A forged or
    // future generation is ignored, never trusted.
    const claimed = req.body?.generation;
    const carried = data.revision === revision
      ? data.generation ?? 0
      : Number.isSafeInteger(claimed) && claimed >= 0 && claimed <= (data.generation ?? 0) ? claimed : null;
    if (carried !== null && carried > published) tx.update(ref, { publishedGeneration: carried });
    if (data.revision !== revision) {
      // A stale build: a save landed while it ran, so the queue stays dirty.
      // But the deploy that held the lease has finished, so release it now
      // rather than making that save wait out the rest of the fifteen
      // minutes (the flush runs every minute; a live lease makes it return).
      if (data.leaseUntil) tx.update(ref, { leaseUntil: FieldValue.delete() });
      return false;
    }
    tx.update(ref, { dirtyAt: FieldValue.delete(), queuedAt: FieldValue.delete(), leaseUntil: FieldValue.delete(),
      publishedRevision: revision, publishedAt: FieldValue.serverTimestamp() });
    return true;
  });
  res.json({ acknowledged });
});

/** Read only the caller's publication state; no member data or queue internals leak. */
export const getPublicationStatus = onCall({ enforceAppCheck: true }, async (request) => {
  if (!request.auth) throw new HttpsError("unauthenticated", "Sign-in required.");
  const [member, queue] = await Promise.all([db.doc(`rebuildMembers/${request.auth.uid}`).get(), db.doc("rebuildQueue/site").get()]);
  const target = member.data()?.generation;
  const published = queue.data()?.publishedGeneration ?? 0;
  // Measured from the member's own oldest unpublished change, not from the
  // queue's newest write: while the pipeline is stuck, every save by anyone
  // used to reset the clock and nobody was ever told "delayed". A member
  // document from before queuedAt existed falls back to the queue's age.
  const since = member.data()?.queuedAt ?? queue.data()?.queuedAt ?? queue.data()?.dirtyAt;
  const delayed = since ? Date.now() - since.toMillis() > DELAYED_AFTER_MINUTES * 60_000 : false;
  return { state: typeof target !== "number" ? "unknown" : target <= published ? "published" : delayed ? "delayed" : "queued" };
});
