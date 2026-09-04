// Marks the seeded curated galleries after migrate-image-records has run.
//
//   node --experimental-strip-types scripts/backfill-provenance.mjs -P dev [--write]
//
// The manifest carries only src/width/height — no credits — so what can be
// recorded is origin and the source file. Matching is by slug
// (slugifyName(displayName), the seeder's own convention) and by array
// position: the seeder pushed images in manifest order and skipped members
// who already had a gallery, so lengths must agree or the member is skipped.
import fs from "node:fs";
import { resolve } from "node:path";
import { FieldValue } from "firebase-admin/firestore";
import { initAdminApp, parseArgs, ROOT } from "./lib/admin-app.mjs";
import { slugifyName } from "../src/lib/memberView.ts";

const { project, flags } = parseArgs();
const write = flags.has("--write");
const { db, projectId, close } = initAdminApp(project);

const manifest = JSON.parse(
  fs.readFileSync(resolve(ROOT, "scripts/assets/curated-galleries/manifest.json"), "utf-8")
);

try {
  console.log(`Project: ${projectId} — ${write ? "WRITE" : "dry run"}\n`);
  const pubs = await db.collection("publicProfiles").get();
  const bySlug = new Map(pubs.docs.map((d) => [slugifyName(d.data().displayName ?? ""), d]));
  let marked = 0;

  for (const [slug, entries] of Object.entries(manifest)) {
    const pub = bySlug.get(slug);
    if (!pub) { console.log(`  ! ${slug}: no profile with that name`); continue; }
    const gallery = Array.isArray(pub.data().gallery) ? pub.data().gallery : [];
    if (gallery.length !== entries.length) {
      console.log(`  ~ ${slug}: gallery has ${gallery.length} item(s), manifest ${entries.length} — skipped`);
      continue;
    }
    for (const [i, entry] of entries.entries()) {
      const item = gallery[i];
      if (!item?.imageId) { console.log(`  ! ${slug}[${i}]: no imageId — run the migration first`); continue; }
      const source = entry.src.replace("/proto/img/real/", "curated-galleries/img/");
      if (write) {
        await db.doc(`images/${item.imageId}`).update({
          origin: "curated",
          "provenance.source": source,
          updatedAt: FieldValue.serverTimestamp(),
        });
      }
      marked += 1;
      console.log(`  ${write ? "marked" : "would mark"} images/${item.imageId} ← ${source}`);
    }
  }
  console.log(`\n${marked} image(s) ${write ? "marked" : "to mark"} curated.`);
} finally {
  await close();
}
