// Grants (or with --revoke, removes) the `admin` custom claim.
//
//   node scripts/set-admin.mjs -P dev someone@example.com
//   node scripts/set-admin.mjs -P dev someone@example.com --revoke
//
// This is the ONLY way the claim is set — no callable grants it. Claims ride
// on the ID token, so the member must sign out and back in (or the client must
// call getIdToken(true)) before rules or callables see it.
import { initAdminApp, parseArgs } from "./lib/admin-app.mjs";

const { project, flags, positional } = parseArgs();
const email = positional[0];
if (!email) {
  console.error("Usage: node scripts/set-admin.mjs -P dev|prod <email> [--revoke]");
  process.exit(1);
}

const { adminAuth, projectId, close } = initAdminApp(project);
try {
  const user = await adminAuth.getUserByEmail(email);
  const claims = { ...(user.customClaims ?? {}) };
  if (flags.has("--revoke")) delete claims.admin;
  else claims.admin = true;
  await adminAuth.setCustomUserClaims(user.uid, claims);
  console.log(
    `${projectId}: ${email} (${user.uid}) admin=${claims.admin === true}. ` +
      "Sign out and back in for the token to pick it up."
  );
} finally {
  await close();
}
