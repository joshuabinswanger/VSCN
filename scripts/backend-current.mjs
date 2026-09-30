#!/usr/bin/env node
// Is the deployed backend already the one this checkout builds?
//
//   node scripts/backend-current.mjs --project vscn-39508
//
// The Hosting workflows run this on a workflow_dispatch (a member-triggered
// rebuild, dispatched by flushMemberRebuilds every few minutes) instead of
// redeploying every function: when every export carries this commit's source
// digest, the backend-before-Hosting guarantee already holds and the deploy is
// skipped. When anything is missing or stamped otherwise — a release push
// whose backend deploy failed, a hand deploy from another tree — it reports
// `current=false` and the workflow deploys Functions before it publishes.
//
// Read-only: one GET on the Cloud Functions API, with the credential the
// google-github-actions/auth step exported (GOOGLE_APPLICATION_CREDENTIALS).
import { execFileSync, execSync } from "node:child_process";
import { appendFileSync, readFileSync } from "node:fs";
import { GoogleAuth } from "google-auth-library";
import { backendDigestAt } from "./lib/backend-digest.mjs";
import { backendVerdict, parseFunctionExports } from "./lib/release-checks.mjs";

const projectIdx = process.argv.indexOf("--project");
const projectId = projectIdx === -1 ? "" : process.argv[projectIdx + 1];
if (!/^[a-z][a-z0-9-]{4,28}[a-z0-9]$/.test(projectId ?? "")) throw new Error("--project <project id> is required");

const git = (...args) => execFileSync("git", args, { encoding: "utf8", maxBuffer: 64 * 1024 * 1024 });
const expected = backendDigestAt(git, "HEAD");
const exports = parseFunctionExports(readFileSync("functions/src/index.ts", "utf8"));

const url = `https://cloudfunctions.googleapis.com/v2/projects/${projectId}/locations/-/functions?pageSize=500`;

/** CI: the exported workload-identity credential. By hand: the gcloud user login, as verify-release uses. */
async function listDeployed() {
  if (process.env.GITHUB_ACTIONS === "true" || process.env.GOOGLE_APPLICATION_CREDENTIALS) {
    const client = await new GoogleAuth({ scopes: ["https://www.googleapis.com/auth/cloud-platform"] }).getClient();
    return (await client.request({ url })).data.functions ?? [];
  }
  const token = execSync("gcloud auth print-access-token", { encoding: "utf8", stdio: ["ignore", "pipe", "pipe"] }).trim();
  const res = await fetch(url, { headers: { authorization: `Bearer ${token}`, "x-goog-user-project": projectId } });
  if (!res.ok) throw new Error(`GET ${url} → ${res.status} ${(await res.text()).slice(0, 300)}`);
  return (await res.json()).functions ?? [];
}

let verdict;
try {
  const deployed = (await listDeployed()).map((f) => ({ name: f.name.split("/").pop(), labels: f.labels ?? {}, state: f.state }));
  verdict = backendVerdict(exports, deployed, expected);
} catch (error) {
  // Unknown is not current: deploying is the safe answer, and the deploy
  // itself fails loudly if the credential is the problem.
  console.log(`::warning::Could not read deployed functions (${String(error).slice(0, 200)}); deploying to be safe.`);
  verdict = { current: false, mismatched: ["deployed state unknown"], orphans: [] };
}

console.log(`Backend source digest ${expected}: ${verdict.current ? "deployed" : "NOT deployed"} on ${projectId}`);
for (const line of verdict.mismatched) console.log(`  mismatch  ${line}`);
for (const name of verdict.orphans) console.log(`::warning::${name} is deployed on ${projectId} but not exported by this commit`);
if (process.env.GITHUB_OUTPUT) appendFileSync(process.env.GITHUB_OUTPUT, `current=${verdict.current}\n`);
