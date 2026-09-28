// Capture before export; the private backend endpoint acknowledges after deployment.
import { appendFileSync } from 'node:fs';
import { applicationDefault, initializeApp, deleteApp } from 'firebase-admin/app';
import { getFirestore } from 'firebase-admin/firestore';
if (process.argv[2] !== 'begin' || process.env.GITHUB_ACTIONS !== 'true') throw new Error('CI publication begin only');
const app = initializeApp({ credential: applicationDefault(), projectId: process.env.PUBLIC_FIREBASE_PROJECT_ID });
try {
  const state = (await getFirestore(app).doc('rebuildQueue/site').get()).data();
  const revision = state?.revision ?? '';
  const generation = state?.generation ?? 0;
  if (!Number.isSafeInteger(generation) || generation < 0) throw new Error('Invalid generation');
  if (revision && !/^[a-f0-9-]{36}$/.test(revision)) throw new Error('Invalid publication revision');
  appendFileSync(process.env.GITHUB_OUTPUT, `revision=${revision}\ngeneration=${generation}\n`);
} finally { await deleteApp(app); }
