import { onCall, HttpsError } from "firebase-functions/v2/https";
import { logger } from "firebase-functions/v2";
import { Timestamp } from "firebase-admin/firestore";
import { randomUUID } from "node:crypto";
import sharp, { type Region } from "sharp";
import { db, getBucket } from "./admin";
import { requireUser } from "./util";
import { oembedEndpoint, parseEmbedUrl, thumbnailCandidates, type EmbedRef } from "./embedUrl";
import {
  autoPosterPath, inheritedFields, PUBLIC_CACHE, reserveWork, settleReplacedModeration, UUID, webpDimensions,
} from "./uploads";

// VIDEO LINKS AS WORKS (2026-09-23, release 1 of
// documentation/20260923-motion-works-design.md).
//
// A YouTube or Vimeo link becomes the same images/{id} record every picture
// is, with the same storagePath WebP — which here is the POSTER, fetched from
// the platform once, on the server, when the member adds the link. Everything
// that only knows about stills (the wall layout, moderation, the admin
// console, the eight-work cap) therefore keeps working unchanged; `media` and
// `embed` are read only by the places that can play a video.
//
// The visitor's browser never talks to YouTube or Vimeo until they press play:
// the poster is served from our own Storage.

/** Why a link was refused, for the editor to put into a sentence (profile.embed.err.*). */
export type EmbedRefusal =
  | "verify" | "notVideoLink" | "videoNotFound" | "notEmbeddable" | "providerUnavailable" | "noThumbnail";

function refuse(code: ConstructorParameters<typeof HttpsError>[0], reason: EmbedRefusal, message: string): never {
  throw new HttpsError(code, message, { reason });
}

/** What the editor needs to put the new work in the gallery without reading it back. */
export interface EmbedWorkResult {
  imageId: string;
  storagePath: string;
  width: number;
  height: number;
  color?: string;
  caption?: string;
  media: "embed";
  embed: EmbedRef;
  posterSource: "auto" | "member";
}

const FETCH_TIMEOUT_MS = 10_000;
const MAX_THUMBNAIL_BYTES = 15 * 1024 * 1024;
/** Posters never need more than the wall and lightbox show; platform thumbnails top out at 1280 anyway. */
const MAX_POSTER_EDGE = 1920;

interface OEmbed {
  title?: string;
  thumbnailUrl?: string;
}

async function fetchOembed(ref: EmbedRef): Promise<OEmbed> {
  let response: Response;
  try {
    response = await fetch(oembedEndpoint(ref), { signal: AbortSignal.timeout(FETCH_TIMEOUT_MS), redirect: "follow" });
  } catch {
    refuse("unavailable", "providerUnavailable", "The video platform did not answer.");
  }
  // YouTube: 404 missing or private, 401 embedding switched off.
  // Vimeo: 404 missing or private, 403 restricted to certain sites.
  if (response.status === 404 || response.status === 400) refuse("not-found", "videoNotFound", "No public video at that link.");
  if (response.status === 401 || response.status === 403) refuse("failed-precondition", "notEmbeddable", "This video cannot be embedded.");
  if (!response.ok) refuse("unavailable", "providerUnavailable", "The video platform did not answer.");
  const body = (await response.json().catch(() => null)) as Record<string, unknown> | null;
  if (!body || typeof body !== "object") refuse("unavailable", "providerUnavailable", "The video platform did not answer.");
  return {
    title: typeof body.title === "string" ? body.title : undefined,
    thumbnailUrl: typeof body.thumbnail_url === "string" ? body.thumbnail_url : undefined,
  };
}

/** A capped download, refusing redirects so the host allowlist in thumbnailCandidates means something. */
async function download(url: string): Promise<Buffer | null> {
  try {
    const response = await fetch(url, { signal: AbortSignal.timeout(FETCH_TIMEOUT_MS), redirect: "error" });
    if (!response.ok || !response.body) return null;
    if (Number(response.headers.get("content-length") ?? 0) > MAX_THUMBNAIL_BYTES) return null;
    const reader = response.body.getReader();
    const chunks: Uint8Array[] = [];
    let size = 0;
    try {
      while (true) {
        const { done, value } = await reader.read();
        if (done) break;
        size += value.length;
        if (size > MAX_THUMBNAIL_BYTES) return null;
        chunks.push(value);
      }
    } finally {
      await reader.cancel().catch(() => {});
    }
    return Buffer.concat(chunks, size);
  } catch {
    return null;
  }
}

export interface Poster {
  webp: Buffer;
  width: number;
  height: number;
  color: string;
}

/**
 * The letterbox, cut off. YouTube serves every thumbnail at 16:9 or 4:3 with
 * black bars filling whatever the video is not — a Short arrives as a narrow
 * upright picture in a wide black frame — and the wall would show those bars
 * as part of the work. Only black is trimmed, and only when what is left is a
 * plausible picture, so a dark still is not eaten into.
 */
async function letterboxCrop(bytes: Buffer): Promise<Region | null> {
  try {
    const meta = await sharp(bytes, { failOn: "error" }).metadata();
    const { info } = await sharp(bytes, { failOn: "error" })
      .trim({ background: "#000000", threshold: 24 })
      .toBuffer({ resolveWithObject: true });
    const left = -(info.trimOffsetLeft ?? 0);
    const top = -(info.trimOffsetTop ?? 0);
    if (!meta.width || !meta.height) return null;
    const trimmed = info.width < meta.width || info.height < meta.height;
    const plausible = info.width >= meta.width * 0.25 && info.height >= meta.height * 0.5;
    return trimmed && plausible ? { left, top, width: info.width, height: info.height } : null;
  } catch {
    // An all-black thumbnail has nothing left to trim to; keep it whole.
    return null;
  }
}

/** Any image the platform handed us → the WebP poster, its size and its placeholder colour. */
export async function posterFrom(bytes: Buffer, trimBars: boolean): Promise<Poster> {
  const crop = trimBars ? await letterboxCrop(bytes) : null;
  let pipeline = sharp(bytes, { limitInputPixels: 50_000_000, failOn: "error" }).rotate();
  if (crop) pipeline = pipeline.extract(crop);
  const { data, info } = await pipeline
    .resize({ width: MAX_POSTER_EDGE, height: MAX_POSTER_EDGE, fit: "inside", withoutEnlargement: true })
    .webp({ quality: 85 })
    .toBuffer({ resolveWithObject: true });
  return { webp: data, width: info.width, height: info.height, color: await dominantColor(data) };
}

async function dominantColor(bytes: Buffer): Promise<string> {
  const { dominant } = await sharp(bytes).stats();
  return `#${[dominant.r, dominant.g, dominant.b].map((c) => c.toString(16).padStart(2, "0")).join("")}`;
}

async function fetchPoster(ref: EmbedRef, oembedThumbnail: string | undefined): Promise<Poster> {
  for (const candidate of thumbnailCandidates(ref, oembedThumbnail)) {
    const bytes = await download(candidate.url);
    if (!bytes) continue;
    try {
      const poster = await posterFrom(bytes, candidate.letterboxed);
      // ytimg answers a missing rendition with a 120×90 grey placeholder on
      // some paths instead of a 404; that is not a poster.
      if (poster.width * poster.height < 200 * 150) continue;
      return poster;
    } catch (error) {
      logger.warn("Thumbnail did not decode", { provider: ref.provider, error: String(error) });
    }
  }
  refuse("failed-precondition", "noThumbnail", "The video has no thumbnail we could use.");
}

function requireVerified(req: { auth?: { token: Record<string, unknown> } }): void {
  // A video work is always a fresh uuid record, and the unverified account's
  // one slot is for its one picture — the same line authorizeImageUpload draws.
  if (req.auth?.token.email_verified !== true) {
    refuse("permission-denied", "verify", "Verify your email before adding video links.");
  }
}

function saveObject(path: string, bytes: Buffer, uid: string, imageId: string): Promise<void> {
  return getBucket().file(path).save(bytes, {
    resumable: false,
    contentType: "image/webp",
    metadata: { cacheControl: PUBLIC_CACHE, metadata: { ownerUid: uid, imageId } },
  });
}

/**
 * Publishes a record allocated as `uploading`: bytes first, `live` last, and
 * on any failure the record and whatever bytes landed go — so a half-made
 * work is never on the site and never left for the member to find.
 */
async function publish(
  uid: string, imageId: string, storagePath: string, bytes: Buffer,
  settle?: (tx: FirebaseFirestore.Transaction) => Promise<void>,
): Promise<void> {
  const imageRef = db.doc(`images/${imageId}`);
  try {
    await Promise.all([
      saveObject(storagePath, bytes, uid, imageId),
      saveObject(autoPosterPath(storagePath), bytes, uid, imageId),
    ]);
    await db.runTransaction(async (tx) => {
      const [deletion, current] = await Promise.all([tx.get(db.doc(`deletions/${uid}`)), tx.get(imageRef)]);
      if (deletion.exists) throw new HttpsError("failed-precondition", "Account deletion is pending or completed.");
      if (current.data()?.status !== "uploading") throw new HttpsError("failed-precondition", "The work changed while it was being made.");
      if (settle) await settle(tx);
      tx.update(imageRef, { status: "live", updatedAt: Timestamp.now() });
    });
  } catch (error) {
    const bucket = getBucket();
    await Promise.all([storagePath, autoPosterPath(storagePath)].map((path) =>
      bucket.file(path).delete({ ignoreNotFound: true }).catch(() => {})));
    await imageRef.delete().catch(() => {});
    throw error;
  }
}

/**
 * "Add a video link". Parses the link here, never in the browser — the server
 * decides what a link means — asks the platform's oEmbed whether the video
 * exists and may be embedded, stores its thumbnail as the poster, and returns
 * a live work the editor appends to the gallery like a finished upload.
 */
export const resolveEmbed = onCall({ maxInstances: 3, memory: "512MiB", timeoutSeconds: 60 }, async (req) => {
  const uid = requireUser(req);
  requireVerified(req);
  const ref = parseEmbedUrl(req.data?.url);
  if (!ref) refuse("invalid-argument", "notVideoLink", "Not a YouTube or Vimeo video link.");
  // Refused before anything is fetched, so a member at the cap does not make
  // us download a thumbnail only to throw it away. Re-checked in the
  // transaction below, which is the check that counts.
  await db.runTransaction(async (tx) => { await reserveWork(tx, uid); });

  const meta = await fetchOembed(ref);
  const poster = await fetchPoster(ref, meta.thumbnailUrl);
  const imageId = randomUUID();
  const storagePath = `users/${uid}/gallery/${imageId}.webp`;
  const embed: EmbedRef = { provider: ref.provider, videoId: ref.videoId, ...(ref.hash ? { hash: ref.hash } : {}) };
  // The platform's title stands in for a caption the member has not written
  // yet — it is a new work, so there is no caption of theirs to overwrite.
  const caption = meta.title?.trim().slice(0, 140) || undefined;
  await db.runTransaction(async (tx) => {
    const commitAllowance = await reserveWork(tx, uid);
    const now = Timestamp.now();
    commitAllowance();
    tx.create(db.doc(`images/${imageId}`), {
      ownerUid: uid, kind: "gallery", storagePath, width: poster.width, height: poster.height, color: poster.color,
      origin: "member", status: "uploading", media: "embed", embed, posterSource: "auto",
      ...(caption ? { caption } : {}), createdAt: now, updatedAt: now,
    });
  });
  await publish(uid, imageId, storagePath, poster.webp);
  const result: EmbedWorkResult = {
    imageId, storagePath, width: poster.width, height: poster.height, color: poster.color,
    ...(caption ? { caption } : {}), media: "embed", embed, posterSource: "auto",
  };
  return result;
});

/**
 * "Use automatic thumbnail". The member's own poster goes and the platform's
 * comes back — from `{id}.auto.webp`, so YouTube is not asked again. Same
 * shape as a replacement (a NEW record, because the id is the filename and a
 * published object is cached `immutable`), with the same moderation outcome:
 * ratings reset, a hide carries over.
 */
export const restoreAutoPoster = onCall({ maxInstances: 3, memory: "512MiB" }, async (req) => {
  const uid = requireUser(req);
  requireVerified(req);
  const oldId = req.data?.imageId;
  if (typeof oldId !== "string" || !UUID.test(oldId)) throw new HttpsError("invalid-argument", "Invalid image id.");
  const oldRef = db.doc(`images/${oldId}`);
  const old = (await oldRef.get()).data();
  if (!old || old.ownerUid !== uid || old.kind !== "gallery" || old.status !== "live"
    || old.media !== "embed" || old.posterSource !== "member") {
    throw new HttpsError("permission-denied", "Only a video work of yours with its own thumbnail can go back to the automatic one.");
  }
  let bytes: Buffer;
  try {
    [bytes] = await getBucket().file(autoPosterPath(old.storagePath)).download();
  } catch {
    throw new HttpsError("failed-precondition", "The automatic thumbnail is no longer available.");
  }
  const dims = webpDimensions(bytes.subarray(0, 64), bytes.length);
  if (!dims) throw new HttpsError("failed-precondition", "The automatic thumbnail is no longer available.");
  const color = await dominantColor(bytes);

  const imageId = randomUUID();
  const storagePath = `users/${uid}/gallery/${imageId}.webp`;
  let fields: Record<string, unknown> = {};
  await db.runTransaction(async (tx) => {
    const commitAllowance = await reserveWork(tx, uid);
    const current = (await tx.get(oldRef)).data();
    if (!current || current.status !== "live" || current.media !== "embed") {
      throw new HttpsError("failed-precondition", "The work changed while its thumbnail was being restored.");
    }
    fields = inheritedFields(current, "auto");
    const now = Timestamp.now();
    commitAllowance();
    tx.create(db.doc(`images/${imageId}`), {
      ownerUid: uid, kind: "gallery", storagePath, width: dims.width, height: dims.height, color,
      origin: "member", status: "uploading", ...fields, createdAt: now, updatedAt: now,
    });
  });
  await publish(uid, imageId, storagePath, bytes, async (tx) => {
    const moderation = await tx.get(db.doc(`imageModeration/${oldId}`));
    if (moderation.exists) settleReplacedModeration(tx, imageId, oldId, moderation.data()!);
  });
  const result: EmbedWorkResult = {
    imageId, storagePath, width: dims.width, height: dims.height, color,
    ...(typeof fields.caption === "string" ? { caption: fields.caption } : {}),
    media: "embed", embed: fields.embed as EmbedRef, posterSource: "auto",
  };
  return result;
});
