// WHERE FIREBASE'S EMAIL LINKS LAND.
//
// Auth emails (password reset, email verification) carry a link to an "action
// handler". By default that is Firebase's own generic page at
// <project>.firebaseapp.com/__/auth/action. Prod points at the site's own
// /auth/action; dev does NOT, so on dev the custom page is never exercised.
//
// This CANNOT be set from client code. `ActionCodeSettings.url` is the
// *continue* URL — it is appended as `continueUrl` and does not move the
// handler. It is project config: notification.sendEmail.callbackUri.
//
// AND IT CANNOT BE SET FROM HERE EITHER (verified 2026-09-03). PATCHing that
// field on the Identity Toolkit admin API returns
//
//     400 EMAIL_TEMPLATE_UPDATE_NOT_ALLOWED
//
// which is NOT an IAM problem: the dev service account already holds
// roles/firebaseauth.admin. Google refuses email-template writes on these
// projects over the admin API regardless of permission, and the error is
// undocumented. The only route is the Firebase console:
//
//     Authentication > Templates > (any template) > pencil >
//     "customize action URL"
//
// It is one per-project setting shared by every template, so setting it once
// from any one of them is enough. That is presumably how prod got its value.
//
// So this script is a READER. `--dump` prints the whole notification block; a
// bare run reports current vs. expected — which is what you want when asking
// "why did that reset email land on the wrong page?". The --write path stays
// because the API may start allowing it, and because a script that names the
// field beats hunting the console for it.
//
// Usage:  node scripts/set-auth-action-url.mjs -P dev [--dump] [--write] [<url>]
import { initAdminApp, parseArgs } from "./lib/admin-app.mjs";

const { project, flags, positional } = parseArgs();
const { app, projectId, adminAuth, close } = initAdminApp(project);

const DEFAULTS = {
  dev: "https://vscn-dev-f4b60.web.app/auth/action",
  prod: "https://vscn.ch/auth/action",
};
const target = positional[0] ?? DEFAULTS[project];

const token = (
  await app.options.credential.getAccessToken()
).access_token;
const base = `https://identitytoolkit.googleapis.com/admin/v2/projects/${projectId}/config`;

async function readConfig() {
  const res = await fetch(base, { headers: { Authorization: `Bearer ${token}` } });
  if (!res.ok) throw new Error(`GET config ${res.status}: ${await res.text()}`);
  return res.json();
}

// GROUND TRUTH. The config field below is what the admin API reports, but the
// console may store a custom action URL somewhere that field does not reflect.
// A generated link is the only answer that cannot be wrong — and generating
// one sends no email.
if (flags.has("--link")) {
  const email = positional[0] ?? "";
  const link = await adminAuth.generatePasswordResetLink(email);
  const u = new URL(link);
  console.log(`handler      ${u.origin}${u.pathname}`);
  console.log(`continueUrl  ${u.searchParams.get("continueUrl") ?? "(none)"}`);
  console.log(`full         ${link}`);

  // The handler is stuck on Firebase's page for projects that refuse the
  // config change (see the header). The oobCode in that link is what the
  // site's own /auth/action needs, and it does not care which page redeems
  // it — so re-point the link at the site and the custom page becomes
  // testable end-to-end without any project config at all.
  const site = new URL(DEFAULTS[project]);  // not `target`: positional[0] is the email here
  if (`${u.origin}${u.pathname}` !== `${site.origin}${site.pathname}`) {
    const onSite = new URL(site.origin + site.pathname);
    for (const [k, v] of u.searchParams) onSite.searchParams.set(k, v);
    console.log(`
on the site  ${onSite.toString()}`);
    console.log("             (same oobCode, redeemed by the site's own page)");
  }

  await close();
  process.exit(0);
}

const before = await readConfig();
if (flags.has("--dump")) {
  console.log(JSON.stringify({ notification: before?.notification, client: before?.client, authorizedDomains: before?.authorizedDomains }, null, 2));
}
const current = before?.notification?.sendEmail?.callbackUri ?? "(unset — Firebase default page)";
console.log(`project      ${projectId}`);
console.log(`current      ${current}`);
console.log(`target       ${target}`);

if (current === target) {
  console.log("\nAlready set. Nothing to do.");
} else if (!flags.has("--write")) {
  console.log("\nDry run. Re-run with --write to apply.");
} else {
  const res = await fetch(`${base}?updateMask=notification.sendEmail.callbackUri`, {
    method: "PATCH",
    headers: { Authorization: `Bearer ${token}`, "Content-Type": "application/json" },
    body: JSON.stringify({ notification: { sendEmail: { callbackUri: target } } }),
  });
  if (!res.ok) throw new Error(`PATCH config ${res.status}: ${await res.text()}`);
  const after = await readConfig();
  console.log(`\nnow          ${after?.notification?.sendEmail?.callbackUri ?? "(unset)"}`);
}

await close();
