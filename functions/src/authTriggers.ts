import * as functionsV1 from "firebase-functions/v1";
import { defineSecret, defineString } from "firebase-functions/params";
import { logger } from "firebase-functions/v2";
import { Timestamp } from "firebase-admin/firestore";
import { db } from "./admin";
import { scheduleDeletion } from "./lifecycle";
import { sendViaBrevo, signupNotification } from "./notify";
import { purgeAccount } from "./purge";
import { dispatchRebuild } from "./rebuild";

// The admin ping's delivery. Both are Secret Manager secrets, set per project:
//   npx -y firebase-tools@latest functions:secrets:set BREVO_API_KEY
//   npx -y firebase-tools@latest functions:secrets:set ADMIN_NOTIFY_TO
// The recipient is a secret rather than a functions/.env param because the
// repo is public and it is a private mailbox. The sender is not private, but
// Brevo only honours it once vscn.ch is authenticated in their dashboard.
export const brevoApiKey = defineSecret("BREVO_API_KEY");
export const adminNotifyTo = defineSecret("ADMIN_NOTIFY_TO");
const notifyFrom = defineString("NOTIFY_FROM", { default: "VSCN <notifications@vscn.ch>" });

/**
 * Tells the operator that someone started signing up. Fires at Auth-create,
 * which is wizard step 1 — before verification, before the wizard is done —
 * so the message says exactly that (notify.ts). Best-effort end to end: a
 * failed send is logged and the account creation is untouched.
 */
export const onAuthUserCreated = functionsV1
  .runWith({ secrets: ["BREVO_API_KEY", "ADMIN_NOTIFY_TO"] })
  .auth.user()
  .onCreate(async (user) => {
    const projectId = process.env.GCLOUD_PROJECT ?? "unknown-project";
    const msg = signupNotification({
      email: user.email,
      uid: user.uid,
      createdAt: new Date(user.metadata.creationTime ?? Date.now()),
      projectId,
    });
    const ok = await sendViaBrevo(
      fetch,
      { apiKey: brevoApiKey.value(), from: notifyFrom.value(), to: adminNotifyTo.value() },
      msg,
      (detail) => logger.error("Signup notice not sent", { uid: user.uid, detail })
    );
    if (ok) logger.info("Signup notice sent", { uid: user.uid });
  });

/**
 * Backstop for a user deleted straight from the Firebase console (or by any
 * path other than purgeAccount): open an immediate, no-grace job and run it.
 * Auth triggers are still v1-only; v1 and v2 coexist in one codebase.
 *
 * When purgeAccount itself deletes the Auth user this fires too — the job
 * already exists then (open or completed), so it returns without touching it.
 *
 * The console deletion this backstops is the one purge path where the member
 * was still PUBLIC a second ago, so the static site keeps serving their card
 * and /members/<slug> until something else happens to rebuild — hence the
 * dispatch, and the secret binding a v1 function needs to reach it.
 */
export const onAuthUserDeleted = functionsV1
  .runWith({ secrets: ["GITHUB_REBUILD_TOKEN"] })
  .auth.user()
  .onDelete(async (user) => {
    const existing = await db.doc(`deletions/${user.uid}`).get();
    if (existing.exists) {
      logger.info("Auth user deleted; job already present", { uid: user.uid });
      return;
    }
    await scheduleDeletion(user.uid, "auth-delete", Timestamp.now());
    await purgeAccount(user.uid);
    await dispatchRebuild();
    logger.info("Auth user deleted out-of-band; data purged", { uid: user.uid });
  });
