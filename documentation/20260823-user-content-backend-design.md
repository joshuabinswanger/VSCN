# User-content backend: gallery + avatar hardening

Date: 2026-08-23
Status: approved design, not yet implemented

## Context

VSCN already has a working, serverless content backend for images:

- Storage layout: `avatars/{uid}.{ext}` (overwrite in place) and
  `galleries/{uid}/{timestamp}-{random}.webp` (unique per content), public read,
  owner-only write, enforced in `storage.rules`.
- Client-side pipeline: `src/lib/gallery.ts` decodes with `createImageBitmap`
  (`imageOrientation: "from-image"` bakes in EXIF rotation; canvas re-encode strips
  metadata), resizes to max 2000 px, encodes WebP q0.82. Avatars use an older
  `Image`-element pipeline in `src/lib/validation.ts` producing 512 px JPEG q0.92.
- Metadata: `gallery` array (max 8, caption ≤ 140, width/height) on `users/{uid}`,
  projected to `publicProfiles/{uid}` via `toPublicProfile()`.
- Delivery: public pages are static; Astro `getImage` generates 400/800 px WebP
  variants at build time; profile edits dispatch a GitHub Action rebuild.

This design keeps the single-master-file + build-time-derivatives model and the
no-server-runtime constraint, and closes specific gaps. Server-side processing
(Cloud Functions / Resize Images extension) was considered and rejected: it requires
the Blaze plan and a second codebase, and the threat model does not need it — the
worst a malicious member can do is upload a ≤ 2 MB mislabeled blob that renders
broken on their own profile. Revisit only if untrusted-audience uploads (e.g. a
public requests board with attachments) or video arrive.

## Scope

Profile gallery and avatars only. Explicitly out of scope: phase-2 content types
(requests board), video/GIF (pipeline flattens animation; motion support is a
separate project), SVG sanitization, CI image-cache persistence (defer until build
times hurt; the fix is caching Astro's image cache dir in the GitHub Actions cache).

## 1. Storage layout and caching

**Invariant (new, load-bearing): files in Storage are immutable.** Every filename is
unique per content and is never rewritten. This is what makes `immutable` caching
and the static build safe.

- Gallery uploads (`uploadGalleryImage`) gain upload metadata
  `cacheControl: "public, max-age=31536000, immutable"`. Layout unchanged.
- Avatars move to the same model: `avatars/{uid}-{timestamp}.webp`, same cache
  header, `contentType: "image/webp"` set explicitly. After a successful swap of
  `photoURL` in Firestore, the old file is deleted best-effort (Firestore is the
  source of truth, exactly like the gallery array). This also fixes a latent bug:
  today an avatar change keeps the same URL, so browser caches and the statically
  built community page can show the stale image indefinitely.

**Legacy avatars:** existing files at `avatars/{uid}.{ext}` stay readable (public
read is unchanged) and existing `photoURL`s stay valid. No migration. The delete
rule must match BOTH naming schemes so users can replace/remove legacy files.

### storage.rules changes

- Avatar write: filename must match `{uid}-{digits}.webp`; contentType tightens to
  `image/webp` (the client always re-encodes — see §3).
- Avatar delete: filename matches `{uid}.{ext}` OR `{uid}-{digits}.webp`.
- Gallery write: contentType tightens to `image/webp`.
- Run the `firestore-security-rules-auditor` skill over the result before deploy.

## 2. Input formats and validation UX

One shared allowlist for both surfaces: **JPEG, PNG, WebP, AVIF** (AVIF is
decode-only — `createImageBitmap` handles it in all modern browsers; output remains
WebP). The `accept` attribute in `ProfileForm.astro` and the validators in
`validation.ts` / `gallery.ts` all reference the shared constant.

Rejections get specific, actionable messages instead of the generic type error:

- SVG: "Please export your artwork as PNG or JPEG." (Raw SVG serving is an XSS
  vector; rasterizing was considered and declined — rejected outright.)
- HEIC/HEIF: "Please export this photo as JPEG." (iOS Safari auto-transcodes HEIC
  on file selection, so this mainly serves desktop edge cases.)
- Decode failure inside the pipeline (corrupt file, exotic variant): friendly error,
  not an unhandled exception.

## 3. One pipeline for everything

Avatars adopt the gallery pipeline. One shared resize-and-encode helper
(decode via `createImageBitmap` with `imageOrientation: "from-image"`, draw to
canvas, `toBlob("image/webp", 0.82)`); `resizeAvatar` (cover-crop to 512 px square)
and `compressGalleryImage` (max edge 2000 px, never upscale) become thin wrappers
over it. Avatar output changes from JPEG q0.92 to WebP q0.82. The duplicated
`publicStorageUrl` construction in `gallery.ts` collapses into the export from
`storage.ts`.

**Dominant color at upload:** from the already-decoded bitmap, draw into a 1×1
canvas and read the pixel → hex string.

- `GalleryItem` gains `color: string`.
- Profiles gain `photoColor: string` alongside `photoURL`.
- Cards and lightbox render the color as a background wash while the image loads.

### The `hasOnly` trap — checklist for the new fields

Every new Firestore field must land in ALL of these, or profile writes fail
silently with no error naming the field:

- [ ] `validGallery()` in `firestore.rules`: allow `color` on gallery items
- [ ] `validPublicProfile` allowedKeys in `firestore.rules`: add `photoColor`
- [ ] `validPrivateUser` allowedKeys in `firestore.rules`: add `photoColor`
- [ ] `UserDoc` / `PublicProfileDoc` types in `src/lib/firestore.ts`
- [ ] `toPublicProfile()` projection in `src/lib/firestore.ts`: copy `photoColor`
      (the `gallery` array is copied whole, so `color` rides along)

## 4. Crop/rotate before upload

A canvas-based editing step in `ProfileForm` between file selection and the
pipeline: rotate in 90° steps and a rectangular crop, rendered to a canvas whose
output feeds the existing compressor. No backend, rules, or schema involvement.
Ships last and independently.

## 5. The editing model, formalized

Three tiers; future content types follow the same shape:

1. **Metadata edits** (caption, reorder, delete): pure Firestore array rewrites.
   Reordering is reordering the array. Storage is not involved.
2. **Content replacement**: always new-unique-file → swap URL in Firestore →
   best-effort delete of the old file. Never overwrite a Storage path.
3. **Pixel edits** (crop, rotate): client-side, before upload. Storage files are
   never edited in place.

## 6. Verification

No test framework, per repo policy. Gate on `npm run lint` and `npm run build`,
then on the dev project (`vscn-dev-f4b60`):

- Upload avatar and gallery images; confirm `cache-control` response headers on the
  stored objects.
- Change an avatar; confirm the new unique filename, the Firestore swap, and the
  best-effort deletion of the old file; confirm a legacy-named avatar can still be
  replaced and deleted.
- Save a profile with the new fields; confirm the write succeeds (allowlist
  round-trip) and `photoColor` / `color` reach `publicProfiles`.
- Browser-check the color wash on cards and the crop/rotate flow.
- Reject-path checks: SVG and HEIC files get their specific messages; a corrupt
  file gets the friendly decode error.

## Implementation order

1. Gallery caching + gallery contentType tightening (gallery.ts, storage.rules) —
   smallest change, biggest win.
2. Avatar overhaul as ONE step: shared pipeline helper, WebP output, unique-name
   uploads, cache header, and the avatar rules changes. The rules tightening to
   `image/webp` and the pipeline's switch to WebP must land together, or avatar
   uploads break in between.
3. Dominant color end-to-end (pipeline → types → rules → rendering), using the
   checklist in §3.
4. Input-format allowlist + rejection messages.
5. Crop/rotate UI.
