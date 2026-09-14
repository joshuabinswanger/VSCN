// Preserve recorded administrator decisions without interpreting member drafts as bans.
// Default is read-only; --apply performs idempotent migration of logged admin hides.
import { parseArgs, initAdminApp } from "./lib/admin-app.mjs";
const { project, flags } = parseArgs();
const { db, projectId, close } = initAdminApp(project);
try {
  const actions = await db.collection("adminActions").where("action", "==", "setProfileActive").get();
  const latest = new Map();
  for (const row of actions.docs) {
    const a = row.data();
    if (!a.targetUid || !a.at) continue;
    if ((latest.get(a.targetUid)?.at.toMillis() ?? -1) < a.at.toMillis()) latest.set(a.targetUid, a);
  }
  let eligible = 0;
  for (const [uid, action] of latest) {
    if (action.field || action.after !== false) continue;
    await db.runTransaction(async (tx) => {
      const ref = db.doc(`publicProfiles/${uid}`);
      const snap = await tx.get(ref);
      if (!snap.exists || Object.hasOwn(snap.data(), "moderationHidden")) return;
      eligible++;
      if (flags.has("--apply")) {
        tx.update(ref, { moderationHidden: true });
        tx.create(db.collection("adminActions").doc(), {
          actorUid: "security-migration", action: "migrateProfileModeration", targetUid: uid,
          at: new Date(), sourceActionAt: action.at, moderationHidden: true,
        });
      }
    });
  }
  console.log(JSON.stringify({ projectId, applied: flags.has("--apply"), eligible }));
} finally { await close(); }
