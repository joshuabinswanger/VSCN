// Read-only, consent-aware export for a human-operated community mailing.
// It sends no email. `receiveCommunityEmails` must be exactly true; a missing
// legacy value is unknown rather than consent. Language defaults to de.
//
//   node scripts/export-community-mailing.mjs -P dev
//   node scripts/export-community-mailing.mjs -P prod
import { initAdminApp, parseArgs } from "./lib/admin-app.mjs";
import { toCommunityMailRecipient } from "./lib/community-mailing.mjs";

const { project } = parseArgs();
const { db, projectId, close } = initAdminApp(project);

try {
  const snap = await db.collection("users").orderBy("displayName").get();
  const rows = snap.docs
    .map((doc) => toCommunityMailRecipient(doc.id, doc.data()))
    .filter((row) => row !== null);

  console.log(`${rows.length} explicitly opted-in community-mail recipient(s) in ${projectId}:`);
  if (rows.length) console.table(rows);
} finally {
  await close();
}