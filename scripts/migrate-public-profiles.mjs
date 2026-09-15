// Backfill missing public documents only. Existing profiles/moderation are preserved.
// node scripts/migrate-public-profiles.mjs -P dev [--apply]
import { initAdminApp, parseArgs } from './lib/admin-app.mjs';
const { project, flags } = parseArgs();
const { db, close } = initAdminApp(project);
try {
  const users = await db.collection('users').get();
  let eligible = 0;
  for (const user of users.docs) {
    const ref = db.doc('publicProfiles/' + user.id);
    const data = user.data();
    const created = await db.runTransaction(async tx => {
      const [existing, deletion] = await Promise.all([tx.get(ref), tx.get(db.doc('deletions/' + user.id))]);
      if (existing.exists || deletion.exists) return false;
      // Draft by default; publication goes through the verified member flow.
      if (flags.has('--apply')) tx.create(ref, {
        displayName: data.displayName ?? '', role: data.role ?? '', bio: data.bio ?? '',
        portfolio: data.portfolio ?? '', active: false, updatedAt: new Date(),
      });
      return true;
    });
    if (created) eligible++;
  }
  console.log(JSON.stringify({ project, applied: flags.has('--apply'), eligible }));
} finally { await close(); }
