// Runs after the credential file is removed and before Astro loads remote
// images. A corrupt member image cannot block moderation or other rebuilds.
import { readFile, writeFile, rename } from "node:fs/promises";
import { resolve } from "node:path";
import sharp from "sharp";

const path = resolve(process.cwd(), ".site-data.json");
const temp = resolve(process.cwd(), ".site-data.json.tmp");
const snapshot = JSON.parse(await readFile(path, "utf8"));
if (snapshot.version !== 1 || !Array.isArray(snapshot.profiles) || !Array.isArray(snapshot.images)) {
  throw new Error("Site data export is missing or malformed.");
}

function storageUrl(storagePath) {
  return `https://firebasestorage.googleapis.com/v0/b/${snapshot.bucket}/o/${encodeURIComponent(storagePath)}?alt=media`;
}

async function boundedDownload(url, maxBytes) {
  const response = await fetch(url, { signal: AbortSignal.timeout(20_000) });
  if (response.status === 404) return null;
  if (!response.ok || !response.body) throw new Error(`Public image download failed: HTTP ${response.status}`);
  if (Number(response.headers.get("content-length") ?? 0) > maxBytes) return null;
  const reader = response.body.getReader();
  const chunks = [];
  let size = 0;
  try {
    while (true) {
      const { done, value } = await reader.read();
      if (done) break;
      size += value.length;
      if (size > maxBytes) return null;
      chunks.push(value);
    }
  } finally {
    await reader.cancel().catch(() => {});
  }
  return Buffer.concat(chunks, size);
}

async function decodes(url, maxBytes) {
  const bytes = await boundedDownload(url, maxBytes);
  if (!bytes) return false;
  try {
    await sharp(bytes, { limitInputPixels: 100_000_000, failOn: "error" })
      .resize(1, 1).webp().timeout({ seconds: 10 }).toBuffer();
    return true;
  } catch {
    return false;
  }
}

let rejected = 0;
let checked = 0;
const validImages = [];
for (const image of snapshot.images) {
  checked += 1;
  if (await decodes(storageUrl(image.storagePath), 8 * 1024 * 1024)) validImages.push(image);
  else rejected += 1;
}
snapshot.images = validImages;
for (const profile of snapshot.profiles) {
  const photoURL = profile.data?.photoURL;
  if (typeof photoURL !== "string" || !photoURL) continue;
  checked += 1;
  let url;
  try { url = new URL(photoURL); } catch { url = null; }
  if (!url) {
    delete profile.data.photoURL;
    delete profile.data.photoImageId;
    rejected += 1;
    continue;
  }
  url.searchParams.delete("token");
  if (!await decodes(url.toString(), 2 * 1024 * 1024)) {
    delete profile.data.photoURL;
    delete profile.data.photoImageId;
    rejected += 1;
  }
}
await writeFile(temp, JSON.stringify(snapshot), { mode: 0o600 });
await rename(temp, path);
console.log(JSON.stringify({ imagesChecked: checked, rejected }));
