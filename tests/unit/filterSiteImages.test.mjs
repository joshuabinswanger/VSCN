import { test } from "node:test";
import assert from "node:assert/strict";
import { mkdtemp, readFile, writeFile, rm } from "node:fs/promises";
import { tmpdir } from "node:os";
import { join } from "node:path";

test("a corrupt public image cannot stop a site rebuild", async () => {
  const cwd = process.cwd();
  const fetch = globalThis.fetch;
  const dir = await mkdtemp(join(tmpdir(), "vscn-image-filter-"));
  const snapshot = {
    version: 1, bucket: "example.firebasestorage.app",
    images: [{ imageId: "work", storagePath: "users/member/gallery/work.webp" }],
    profiles: [{ id: "member", data: { photoURL: "https://firebasestorage.googleapis.com/v0/b/example.firebasestorage.app/o/avatar?alt=media", photoImageId: "avatar" } }],
  };
  try {
    await writeFile(join(dir, ".site-data.json"), JSON.stringify(snapshot));
    process.chdir(dir);
    globalThis.fetch = async () => new Response(Buffer.from("not an image"), { status: 200 });
    await import(`../../scripts/filter-site-images.mjs?test=${Date.now()}`);
    const filtered = JSON.parse(await readFile(join(dir, ".site-data.json"), "utf8"));
    assert.equal(filtered.images.length, 0);
    assert.equal(filtered.profiles[0].data.photoURL, undefined);
    assert.equal(filtered.profiles[0].data.photoImageId, undefined);
  } finally {
    process.chdir(cwd);
    globalThis.fetch = fetch;
    await rm(dir, { recursive: true, force: true });
  }
});
