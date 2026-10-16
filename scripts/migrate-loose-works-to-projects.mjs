// ONE-TIME: every work into a project, every project titled (2026-10-16,
// Josh: "images without project are not allowed any longer! We need always a
// Project, just a title is mandatory").
//
//   node scripts/migrate-loose-works-to-projects.mjs                       # dry run, prod (.env)
//   node scripts/migrate-loose-works-to-projects.mjs --mode development    # dry run, dev (.env.development)
//   node scripts/migrate-loose-works-to-projects.mjs --mode development --apply
//
// Credentials exactly as scripts/export-site-data.mjs finds them:
// FIREBASE_SERVICE_ACCOUNT from the environment, else from the mode's .env
// files (vite's loadEnv), and the same refusal when the credential's project
// is not the site's.
//
// WHAT IT DOES, per member:
//   1. Live gallery images with no projectId, or one that names no project of
//      the SAME owner (a dangling or foreign id reads as no project, as in
//      ownProjects()), are filed under projects/works-{uid} — titled "Works" /
//      "Arbeiten", created if missing. The id is looseWorksProjectId() in
//      src/lib/projects.ts: the page's virtual project and the editor's local
//      one are that same id, so neither ever makes a second "Works" beside
//      the stored one. Keep the id and the words in sync with LOOSE_WORKS_TITLE.
//   2. Projects without a title (now refused by validProject in
//      firestore.rules, so their owner's next Save would be too) get one: the
//      German title when there is one, else "Works", with titleDe "Arbeiten"
//      added only when it had no German title either. A title it has is never
//      touched.
//
// DRY RUN BY DEFAULT: prints the plan and writes nothing. --apply writes it,
// in batches of at most 450 operations. Idempotent — a re-run after --apply
// finds nothing to do. A member with an open deletions/{uid} job is skipped
// and reported: their records are on their way out.
//
// The site needs no rebuild for the page's sake — the build already shows
// loose works under a virtual "Works" project (adoptLooseWorks) — but the
// next rebuild picks the stored project up, ids and all.
import { applicationDefault, cert, initializeApp, deleteApp } from "firebase-admin/app";
import { FieldValue, getFirestore } from "firebase-admin/firestore";
import { loadEnv } from "vite";

const args = process.argv.slice(2);
const modeAt = args.indexOf("--mode");
const mode = modeAt !== -1 && args[modeAt + 1] === "development" ? "development" : "production";
const apply = args.includes("--apply");
if (apply && args.includes("--dry-run")) throw new Error("--apply and --dry-run together: pick one.");

// Keep in sync with LOOSE_WORKS_TITLE / looseWorksProjectId() in src/lib/projects.ts.
const WORKS = { title: "Works", titleDe: "Arbeiten" };
const worksId = (uid) => `works-${uid}`;
const BATCH_LIMIT = 450;

const env = loadEnv(mode, process.cwd(), "");
const raw = process.env.FIREBASE_SERVICE_ACCOUNT || env.FIREBASE_SERVICE_ACCOUNT;
const credential = raw ? JSON.parse(raw) : null;
const projectId = credential?.project_id || process.env.GOOGLE_CLOUD_PROJECT || env.PUBLIC_FIREBASE_PROJECT_ID;
const expected = process.env.PUBLIC_FIREBASE_PROJECT_ID || env.PUBLIC_FIREBASE_PROJECT_ID;
if (!projectId || (expected && expected !== projectId)) throw new Error("Credential does not match the site project.");

const blank = (value) => typeof value !== "string" || value.trim() === "";

const app = initializeApp({ credential: credential ? cert(credential) : applicationDefault(), projectId }, `loose-works-${Date.now()}`);
try {
  const db = getFirestore(app);
  const [images, projects, deletions] = await Promise.all([
    db.collection("images").where("kind", "==", "gallery").where("status", "==", "live").get(),
    db.collection("projects").get(),
    db.collection("deletions").get(),
  ]);
  const inDeletion = new Set(deletions.docs.map((d) => d.id));
  const projectById = new Map(projects.docs.map((d) => [d.id, d.data()]));

  // 1. Loose works, by owner.
  const looseByOwner = new Map();
  for (const doc of images.docs) {
    const { ownerUid, projectId: pid } = doc.data();
    if (typeof ownerUid !== "string" || !ownerUid) continue;
    const project = typeof pid === "string" && pid ? projectById.get(pid) : undefined;
    if (project && project.ownerUid === ownerUid) continue;
    const list = looseByOwner.get(ownerUid) ?? [];
    list.push({ imageId: doc.id, had: typeof pid === "string" && pid ? pid : null });
    looseByOwner.set(ownerUid, list);
  }

  // 2. Untitled projects.
  const untitled = projects.docs
    .filter((d) => blank(d.data().title))
    .map((d) => {
      const data = d.data();
      const titleDe = blank(data.titleDe) ? undefined : data.titleDe.trim();
      return {
        projectId: d.id,
        ownerUid: data.ownerUid,
        patch: titleDe ? { title: titleDe } : { title: WORKS.title, titleDe: WORKS.titleDe },
      };
    });

  const ops = [];
  const skipped = [];
  console.log(`[loose-works] ${projectId} (${mode}) — ${apply ? "APPLYING" : "dry run, nothing written"}`);
  console.log(`[loose-works] ${images.size} live gallery images, ${projects.size} projects scanned.`);

  for (const [uid, works] of [...looseByOwner].sort(([a], [b]) => a.localeCompare(b))) {
    if (inDeletion.has(uid)) {
      skipped.push(uid);
      console.log(`  ~ ${uid}: ${works.length} loose work(s) — SKIPPED, open deletion job`);
      continue;
    }
    const id = worksId(uid);
    const existing = projectById.get(id);
    if (existing && existing.ownerUid !== uid) {
      skipped.push(uid);
      console.log(`  ! ${uid}: projects/${id} exists with ANOTHER owner (${existing.ownerUid}) — SKIPPED`);
      continue;
    }
    console.log(`  + ${uid}: ${works.length} loose work(s) → projects/${id} (${existing ? "exists" : "create"})`);
    for (const w of works) console.log(`      images/${w.imageId}${w.had ? ` (named ${w.had}, not this member's project)` : ""}`);
    if (!existing) {
      ops.push((batch) =>
        batch.set(db.doc(`projects/${id}`), {
          ownerUid: uid, ...WORKS, createdAt: FieldValue.serverTimestamp(), updatedAt: FieldValue.serverTimestamp(),
        }),
      );
    }
    for (const w of works) {
      ops.push((batch) => batch.update(db.doc(`images/${w.imageId}`), { projectId: id, updatedAt: FieldValue.serverTimestamp() }));
    }
  }

  for (const p of untitled) {
    if (inDeletion.has(p.ownerUid)) {
      console.log(`  ~ projects/${p.projectId} (${p.ownerUid}): untitled — SKIPPED, open deletion job`);
      continue;
    }
    console.log(`  + projects/${p.projectId} (${p.ownerUid}): untitled → ${JSON.stringify(p.patch)}`);
    ops.push((batch) => batch.update(db.doc(`projects/${p.projectId}`), { ...p.patch, updatedAt: FieldValue.serverTimestamp() }));
  }

  const looseWorks = [...looseByOwner].filter(([uid]) => !skipped.includes(uid)).reduce((n, [, w]) => n + w.length, 0);
  console.log(
    `[loose-works] plan: ${looseWorks} loose work(s) across ${looseByOwner.size - skipped.length} member(s), ` +
      `${untitled.length} untitled project(s), ${ops.length} write(s), ${skipped.length} member(s) skipped.`,
  );

  if (!apply) {
    console.log("[loose-works] dry run — pass --apply to write.");
  } else if (ops.length === 0) {
    console.log("[loose-works] nothing to do.");
  } else {
    for (let i = 0; i < ops.length; i += BATCH_LIMIT) {
      const batch = db.batch();
      for (const op of ops.slice(i, i + BATCH_LIMIT)) op(batch);
      await batch.commit();
      console.log(`[loose-works] committed ${Math.min(i + BATCH_LIMIT, ops.length)}/${ops.length}`);
    }
    console.log("[loose-works] done. A re-run should find nothing.");
  }
} finally {
  await deleteApp(app);
}
