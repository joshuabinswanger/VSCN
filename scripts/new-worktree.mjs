// Creates a git worktree and makes it actually usable, which plain
// `git worktree add` does not: the gitignored root env files are copied in and
// node_modules is junctioned to this checkout's.
//
//   npm run worktree -- feat/thing              # branch off dev
//   npm run worktree -- feat/thing --from main
//   npm run worktree -- fix/thing --install     # real npm ci instead of the junction
//   npm run worktree -- feat/thing --dry-run
//
// Why it exists: `.env` and `.env.development` are gitignored, so a fresh
// worktree has no FIREBASE_SERVICE_ACCOUNT. community.astro catches its own
// admin-fetch throw, so the build SUCCEEDS with a community page of zero
// members — a setup gap that looks exactly like a data bug. Two worktrees have
// already been lost to it.
//
// The node_modules junction is the trick the old wt-scientist-signup worktree
// used: a Windows junction needs no admin rights and no second install. It is
// only safe while the branch does not touch package.json — if it changes
// dependencies, pass --install so the worktree gets its own tree instead of
// writing into this one.
import { execFileSync } from "node:child_process";
import { copyFileSync, existsSync, symlinkSync } from "node:fs";
import { basename, join, resolve } from "node:path";
import { fileURLToPath } from "node:url";

const repoRoot = resolve(fileURLToPath(import.meta.url), "../..");

const argv = process.argv.slice(2);
const flags = new Set(argv.filter((a) => a.startsWith("--")));
const fromIdx = argv.indexOf("--from");
const base = fromIdx === -1 ? "dev" : argv[fromIdx + 1];
// -1 rather than 0 when --from is absent, or the branch name in argv[0] would
// be read as the base's value and swallowed.
const baseValueIdx = fromIdx === -1 ? -1 : fromIdx + 1;
const branch = argv.find((a, i) => !a.startsWith("--") && i !== baseValueIdx);

if (!branch || !base) {
  console.error(
    "Usage: npm run worktree -- <branch> [--from <base>] [--install] [--dry-run]"
  );
  process.exit(1);
}

const dryRun = flags.has("--dry-run");
const git = (...args) =>
  execFileSync("git", args, { cwd: repoRoot, encoding: "utf8" }).trim();

// A branch name is a path, so feat/thing would nest a directory. Flatten it,
// and keep the wt- prefix the repo already uses beside repo/.
const slug = branch
  .toLowerCase()
  .replace(/[^a-z0-9]+/g, "-")
  .replace(/^-+|-+$/g, "");
const dir = join(repoRoot, "..", `wt-${slug}`);

if (existsSync(dir)) {
  console.error(`${dir} already exists. Remove it, or pick another branch name.`);
  process.exit(1);
}

let branchExists = true;
try {
  git("rev-parse", "--verify", "--quiet", `refs/heads/${branch}`);
} catch {
  branchExists = false;
}
if (!branchExists) {
  try {
    git("rev-parse", "--verify", "--quiet", `refs/heads/${base}`);
  } catch {
    console.error(`No such base branch: ${base}`);
    process.exit(1);
  }
}

const envFiles = [".env", ".env.development", ".env.production"].filter((f) =>
  existsSync(join(repoRoot, f))
);

console.log(`worktree   ${dir}`);
console.log(`branch     ${branch}${branchExists ? " (existing)" : ` (new, off ${base})`}`);
console.log(`env        ${envFiles.join(", ") || "NONE FOUND — the build will render zero members"}`);
console.log(`modules    ${flags.has("--install") ? "npm ci" : "junction to repo/node_modules"}`);

if (dryRun) {
  console.log("\n--dry-run: nothing created.");
  process.exit(0);
}

// The main checkout is never touched: `worktree add` writes only the new
// directory and one ref, so a session working in repo/ keeps its HEAD.
git(
  "worktree",
  "add",
  ...(branchExists ? [dir, branch] : ["-b", branch, dir, base])
);

for (const f of envFiles) copyFileSync(join(repoRoot, f), join(dir, f));

if (flags.has("--install")) {
  execFileSync("npm", ["ci"], { cwd: dir, stdio: "inherit", shell: true });
} else {
  symlinkSync(join(repoRoot, "node_modules"), join(dir, "node_modules"), "junction");
}

console.log(`\nReady. cd ${basename(dir)} — then npm run dev, or npm run build.`);
console.log(`When it is merged: git worktree remove ../${basename(dir)}`);
