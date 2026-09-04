# User-Content Backend Hardening — Implementation Plan

> **For agentic workers:** REQUIRED SUB-SKILL: Use superpowers:subagent-driven-development (recommended) or superpowers:executing-plans to implement this plan task-by-task. Steps use checkbox (`- [ ]`) syntax for tracking.

**Goal:** Harden the gallery/avatar image backend: immutable caching, unified WebP pipeline, dominant-color placeholders, explicit input formats, and a crop/rotate step — all client-side, no server runtime.

**Architecture:** Keep the single-master-file + build-time-derivatives model. All processing stays in the browser (`createImageBitmap` → canvas → WebP). Storage files become strictly immutable (unique names, `immutable` cache headers); Firestore remains the source of truth; edits are metadata rewrites or file swaps.

**Tech Stack:** Astro v6 (static), Firebase v12 client SDK (Storage/Firestore/Auth), vanilla TS, no frameworks.

**Spec:** `documentation/20260823-user-content-backend-design.md`

## Global Constraints

- **No test framework** in this repo — do NOT add one. Verification is `npm run lint`, `npm run build`, and browser checks against the dev Firebase project (`vscn-dev-f4b60`, alias `dev`).
- Work on a feature branch `feature/user-content-backend` off `dev`. Commit per task; end commit messages with `Co-Authored-By: Claude Fable 5 <noreply@anthropic.com>`.
- **The `hasOnly` trap:** any new Firestore field missing from the allowlists in `firestore.rules` makes the ENTIRE profile write fail silently. Tasks 3's rules edits are not optional polish.
- `firestore.rules` URL regexes pin the prod bucket (`vscn-39508.firebasestorage.app`). This is pre-existing; keep new patterns consistent, do not "fix" it.
- Client scripts in `.astro` files initialise on `astro:page-load`, never `DOMContentLoaded`.
- Rules deploys for verification: `firebase deploy -P dev --only storage` and `firebase deploy -P dev --only firestore:rules` (run from `repo/`).
- After any task touching `.rules` files, run the `firestore-security-rules-auditor` skill over the diff before committing.
- Keep existing hardcoded-English style for validation error strings (matches current `validation.ts`); UI button labels go through `src/i18n/translations.ts` (add BOTH `en` and `de` keys — missing German falls back silently).

---

### Task 1: Gallery caching + contentType tightening

**Files:**
- Modify: `src/lib/storage.ts` (export `publicStorageUrl`)
- Modify: `src/lib/gallery.ts` (upload metadata, dedupe URL builder)
- Modify: `storage.rules` (gallery contentType)

**Interfaces:**
- Consumes: existing `uploadGalleryImage(uid, blob, onProgress)` callers (unchanged signature).
- Produces: `publicStorageUrl(storagePath: string): string` exported from `storage.ts` (Task 2 uses it).

- [ ] **Step 1: Create the branch**

```bash
git checkout dev && git checkout -b feature/user-content-backend
```

- [ ] **Step 2: Export `publicStorageUrl` from storage.ts**

In `src/lib/storage.ts:4`, change `function publicStorageUrl` to `export function publicStorageUrl`.

- [ ] **Step 3: Use it in gallery.ts and add cache metadata**

In `src/lib/gallery.ts`:
- Import: `import { deleteStorageFile, publicStorageUrl } from "./storage.ts";`
- In `uploadGalleryImage`, delete the local `const bucket = ...` line, replace the upload call and resolve:

```ts
const task = uploadBytesResumable(storageRef, blob, {
  contentType: "image/webp",
  cacheControl: "public, max-age=31536000, immutable",
});
```

and resolve with `resolve(publicStorageUrl(storagePath));` instead of the inline template string.

- [ ] **Step 4: Tighten gallery contentType in storage.rules**

In the `match /galleries/{uid}/{filename}` write rule, replace
`request.resource.contentType.matches('image/(jpeg|png|webp)')` with
`request.resource.contentType == 'image/webp'`.
Leave the avatar block alone (Task 2 owns it — changing it now breaks avatar uploads while they still send JPEG).

- [ ] **Step 5: Verify**

Run: `npm run lint` (0 errors; 9-warning baseline is normal) and `npm run build` (must pass).
Then `firebase deploy -P dev --only storage`, run `npm run dev`, upload a gallery image on the dev profile page, and confirm the stored object's response header: `curl -sI "<uploaded url>" | grep -i cache-control` → `public, max-age=31536000, immutable`.

- [ ] **Step 6: Commit**

```bash
git add src/lib/storage.ts src/lib/gallery.ts storage.rules
git commit -m "feat: immutable cache headers on gallery uploads, tighten gallery rules to webp"
```

---

### Task 2: Avatar overhaul (pipeline, unique names, cache, rules — one atomic task)

The rules tightening to `image/webp` and the pipeline's switch to WebP MUST land together, or avatar uploads break in between.

**Files:**
- Create: `src/lib/image.ts`
- Modify: `src/lib/validation.ts` (`resizeAvatar`)
- Modify: `src/lib/storage.ts` (`uploadAvatar`)
- Modify: `src/lib/profile.ts` (blob passthrough + old-avatar deletion)
- Modify: `storage.rules` (avatar block)

**Interfaces:**
- Consumes: `publicStorageUrl` from Task 1.
- Produces: `src/lib/image.ts` exporting `decodeImage(source: File | Blob): Promise<ImageBitmap>` and `toWebpBlob(canvas: HTMLCanvasElement, quality?: number): Promise<Blob>`; `resizeAvatar(file: File, size?: number): Promise<Blob>` (signature unchanged — call sites in `ProfileForm.astro:954` and `OnboardingForm.astro:763` keep working); `uploadAvatar(uid: string, blob: Blob, onProgress?): Promise<string>` (was `file: File`).

- [ ] **Step 1: Create `src/lib/image.ts`**

```ts
export const WEBP_QUALITY = 0.82;

/** Decode any supported image; bakes in EXIF orientation. Canvas re-encode later strips metadata. */
export async function decodeImage(source: File | Blob): Promise<ImageBitmap> {
  try {
    return await createImageBitmap(source, { imageOrientation: "from-image" });
  } catch {
    throw new Error("This image could not be read. Please try a JPEG, PNG, or WebP export.");
  }
}

export function toWebpBlob(canvas: HTMLCanvasElement, quality = WEBP_QUALITY): Promise<Blob> {
  return new Promise((resolve, reject) => {
    canvas.toBlob(
      (b) => (b ? resolve(b) : reject(new Error("Canvas export failed"))),
      "image/webp",
      quality,
    );
  });
}
```

- [ ] **Step 2: Rewrite `resizeAvatar` in `src/lib/validation.ts`**

Replace the whole `Image`-element implementation (lines 16–46) with:

```ts
import { decodeImage, toWebpBlob } from "./image.ts";

export async function resizeAvatar(file: File, size = 512): Promise<Blob> {
  const bitmap = await decodeImage(file);
  const canvas = document.createElement("canvas");
  canvas.width = size;
  canvas.height = size;
  const ctx = canvas.getContext("2d")!;
  // Cover crop: scale so the image fills the square, centered
  const scale = Math.max(size / bitmap.width, size / bitmap.height);
  const w = bitmap.width * scale;
  const h = bitmap.height * scale;
  ctx.drawImage(bitmap, (size - w) / 2, (size - h) / 2, w, h);
  bitmap.close();
  return toWebpBlob(canvas);
}
```

- [ ] **Step 3: Rewrite `uploadAvatar` in `src/lib/storage.ts`**

```ts
export function uploadAvatar(
  uid: string,
  blob: Blob,
  onProgress: (pct: number) => void = () => {},
): Promise<string> {
  // Unique name per content: Storage files are immutable, so long caching is safe
  // and avatar changes actually propagate (the old fixed-path scheme served stale images).
  const storagePath = `avatars/${uid}-${Date.now()}.webp`;
  const storageRef = ref(storage, storagePath);
  return new Promise((resolve, reject) => {
    const task = uploadBytesResumable(storageRef, blob, {
      contentType: "image/webp",
      cacheControl: "public, max-age=31536000, immutable",
    });
    task.on(
      "state_changed",
      (snap) => {
        onProgress(Math.round((snap.bytesTransferred / snap.totalBytes) * 100));
      },
      reject,
      () => resolve(publicStorageUrl(storagePath)),
    );
  });
}
```

- [ ] **Step 4: Update `src/lib/profile.ts`**

In `handleProfileUpdate`: pass the blob straight through (delete the `new File(... "avatar.jpg" ...)` wrapper), remember the previous URL, and delete the old file only AFTER the Firestore sync succeeds (Firestore is the source of truth):

```ts
let oldPhotoURL = "";
if (resizedAvatarBlob) {
  oldPhotoURL = user.photoURL ?? "";
  photoURL = await uploadAvatar(user.uid, resizedAvatarBlob, onProgress);
  await updateProfile(user, { photoURL });
  await user.getIdToken(true);
}
```

and after the existing `await updateUserProfile(user.uid, profileData);` line:

```ts
// Best-effort cleanup of the replaced avatar (works for legacy `{uid}.{ext}` names too)
if (oldPhotoURL && oldPhotoURL !== photoURL) await deleteAvatar(oldPhotoURL);
```

Add `deleteAvatar` to the import from `./storage.ts`.

- [ ] **Step 5: Update the avatar block in `storage.rules`**

```
match /avatars/{filename} {
  // Anyone can read avatars (needed to display them in the community page)
  allow read: if true;

  // Owner-only writes. Unique immutable names: {uid}-{timestamp}.webp,
  // always WebP because the client re-encodes before upload.
  allow write: if request.auth != null
               && filename.matches(request.auth.uid + '-[0-9]+\\.webp')
               && request.resource.size <= 2 * 1024 * 1024
               && request.resource.contentType == 'image/webp';

  // Delete must also match legacy fixed-path names ({uid}.{ext}) so members
  // can still replace/remove avatars uploaded before this change.
  allow delete: if request.auth != null
                && (filename.matches(request.auth.uid + '-[0-9]+\\.webp')
                    || filename.matches(request.auth.uid + '\\.[a-zA-Z]+'));
}
```

- [ ] **Step 6: Verify**

`npm run lint`, `npm run build`. Run the `firestore-security-rules-auditor` skill over the `storage.rules` diff. Then `firebase deploy -P dev --only storage`; in the dev app change an avatar and confirm: new URL ends `-<digits>.webp`, `cache-control` header is immutable, the previous Storage object is gone, and the profile page shows the new image. Legacy check: manually upload a file `avatars/<uid>.jpg` via Firebase console, set it as `photoURL` in Firestore, change the avatar in the app — the legacy file must be deleted.

- [ ] **Step 7: Commit**

```bash
git add src/lib/image.ts src/lib/validation.ts src/lib/storage.ts src/lib/profile.ts storage.rules
git commit -m "feat: avatar overhaul — unified WebP pipeline, immutable unique filenames, cache headers"
```

---

### Task 3: Dominant color end-to-end

**Files:**
- Modify: `src/lib/image.ts` (add `dominantColor`)
- Modify: `src/lib/gallery.ts` (`GalleryItem.color`, `compressGalleryImage`)
- Modify: `src/lib/validation.ts` (`resizeAvatar` returns color)
- Modify: `src/lib/firestore.ts` (`UserDoc.photoColor`, `toPublicProfile`)
- Modify: `src/lib/profile.ts` (photoColor passthrough)
- Modify: `src/components/ProfileForm.astro` (call sites ~954 and ~853–857)
- Modify: `src/components/OnboardingForm.astro` (call site ~763)
- Modify: `src/components/MemberCard.astro` (background wash)
- Modify: `firestore.rules` (allowlists + validators — the `hasOnly` trap)

**Interfaces:**
- Consumes: `decodeImage`/`toWebpBlob` from Task 2.
- Produces: `dominantColor(source: CanvasImageSource): string` (lowercase `#rrggbb`); `resizeAvatar(file, size?): Promise<{ blob: Blob; color: string }>` (BREAKING — both form call sites updated here); `compressGalleryImage(file: File | Blob): Promise<{ blob; width; height; color }>`; `GalleryItem.color?: string`; `UserDoc.photoColor?: string`.

- [ ] **Step 1: Add `dominantColor` to `src/lib/image.ts`**

```ts
/** Average color via a smoothed 1x1 downscale. Lowercase #rrggbb. */
export function dominantColor(source: CanvasImageSource): string {
  const c = document.createElement("canvas");
  c.width = 1;
  c.height = 1;
  const ctx = c.getContext("2d", { willReadFrequently: true })!;
  ctx.imageSmoothingEnabled = true;
  ctx.drawImage(source, 0, 0, 1, 1);
  const [r, g, b] = ctx.getImageData(0, 0, 1, 1).data;
  return `#${[r, g, b].map((v) => v.toString(16).padStart(2, "0")).join("")}`;
}
```

- [ ] **Step 2: Thread color through the two pipelines**

`src/lib/gallery.ts` — `CompressedImage` gains `color: string`; `GalleryItem` gains `color?: string` (optional — pre-existing items have none); `compressGalleryImage(file: File | Blob)` uses `decodeImage`/`toWebpBlob` from `./image.ts` (delete its local canvas/toBlob code) and returns `{ blob, width, height, color: dominantColor(canvas) }` (call `dominantColor(canvas)` before `toWebpBlob`).

`src/lib/validation.ts` — `resizeAvatar` returns `{ blob: toWebpBlob(canvas) awaited, color: dominantColor(canvas) }`.

- [ ] **Step 3: Update call sites**

- `ProfileForm.astro` ~954: `resizedAvatarBlob = await resizeAvatar(file);` → destructure: `({ blob: resizedAvatarBlob, color: avatarColor } = await resizeAvatar(file));` with `let avatarColor = "";` declared beside `resizedAvatarBlob`; include `photoColor: avatarColor || undefined` in the object passed to `handleProfileUpdate` (it's a `Partial<UserDoc>`, so no signature change).
- `ProfileForm.astro` ~853–857: destructure `color` from `compressGalleryImage(file)` and push `{ url, caption: "", width, height, color }`.
- `OnboardingForm.astro` ~763: same destructure as the avatar site above; include `photoColor` in the user document it writes alongside `photoURL`.

- [ ] **Step 4: Firestore types + projection**

`src/lib/firestore.ts`: add `photoColor?: string;` to `UserDoc` directly under `photoURL` (line ~27). `PublicProfileDoc` inherits via its `Omit`. In `toPublicProfile` add, under the `photoURL` line: `if (data.photoColor !== undefined) out.photoColor = data.photoColor;`

- [ ] **Step 5: firestore.rules — ALL FIVE spots**

1. `validPublicProfile` allowedKeys: add `'photoColor'` after `'photoURL'`.
2. `validPrivateUser` allowedKeys: add `'photoColor'` after `'photoURL'`.
3. `validPublicFields`: add clause
   `&& (!('photoColor' in data) || (data.photoColor is string && data.photoColor.matches('#[0-9a-f]{6}')))`
4. `validGalleryItem` hasOnly: `['url', 'caption', 'width', 'height', 'color']`.
5. `validGalleryItem`: add clause
   `&& (!('color' in item) || (item.color is string && item.color.matches('#[0-9a-f]{6}')))`

- [ ] **Step 6: Render the wash in `MemberCard.astro`**

On the gallery thumbnail's `<img>` (or its immediate wrapper if the img is absolutely positioned) add `style={`background-color: ${g.color ?? "var(--color-border)"}`}`, and on the avatar `<img>` add `style={`background-color: ${m?.photoColor ?? "var(--color-border)"}`}`. These are data-driven values, not design-token violations. Ensure `g.color` survives the `galleryImages` mapping in the frontmatter (it does — the map spreads `...g`).

- [ ] **Step 7: Verify**

`npm run lint`, `npm run build`. Rules-auditor skill over the `firestore.rules` diff, then `firebase deploy -P dev --only firestore:rules`. In the dev app: save a profile with a new avatar AND a new gallery image — the write must succeed (allowlist round-trip), and `publicProfiles/{uid}` in the console must show `photoColor` and `gallery[n].color`. Also save a profile WITHOUT touching images (legacy items, no color) — must still succeed. Throttle the network in devtools and confirm the color wash shows before images load.

- [ ] **Step 8: Commit**

```bash
git add src/lib src/components/ProfileForm.astro src/components/OnboardingForm.astro src/components/MemberCard.astro firestore.rules
git commit -m "feat: dominant-color placeholders for avatars and gallery images"
```

---

### Task 4: Input-format allowlist + specific rejection messages

**Files:**
- Modify: `src/lib/image.ts` (allowlist + `rejectionMessage`)
- Modify: `src/lib/gallery.ts` (`validateGalleryFile`)
- Modify: `src/lib/validation.ts` (`validateAvatar`)
- Modify: `src/components/ProfileForm.astro` (both `accept` attrs: lines ~25, ~123)
- Modify: `src/components/OnboardingForm.astro` (`accept` attr: line ~192)

**Interfaces:**
- Produces: `ALLOWED_INPUT_TYPES: string[]` and `rejectionMessage(file: File): string | null` from `image.ts`.

- [ ] **Step 1: Add to `src/lib/image.ts`**

```ts
// AVIF is decode-only: createImageBitmap reads it in all modern browsers; output stays WebP.
export const ALLOWED_INPUT_TYPES = ["image/jpeg", "image/png", "image/webp", "image/avif"];

/** Returns a user-facing error for unsupported files, or null if the type is accepted. */
export function rejectionMessage(file: File): string | null {
  if (file.type === "image/svg+xml") {
    return "SVGs can't be uploaded. Please export your artwork as PNG or JPEG.";
  }
  if (file.type === "image/heic" || file.type === "image/heif") {
    return "This photo is in HEIC format. Please export it as JPEG.";
  }
  if (!ALLOWED_INPUT_TYPES.includes(file.type)) {
    return "Only JPEG, PNG, WebP, or AVIF images are allowed.";
  }
  return null;
}
```

- [ ] **Step 2: Use it in both validators**

`validateGalleryFile` in `gallery.ts` (delete its local `ALLOWED_TYPES`) and `validateAvatar` in `validation.ts` (delete its `ALLOWED_IMAGE_TYPES`): replace the type check with

```ts
const rejection = rejectionMessage(file);
if (rejection) return { ok: false, error: rejection };
```

(size checks stay first, unchanged).

- [ ] **Step 3: Update the three `accept` attributes**

All three file inputs get the literal `accept="image/jpeg,image/png,image/webp,image/avif"`:
`ProfileForm.astro:25` (avatar, currently `image/*` — the explicit list is what makes iOS auto-transcode HEIC), `ProfileForm.astro:123` (gallery), `OnboardingForm.astro:192` (avatar).
Note: `OnboardingForm` must also call `validateAvatar` before `resizeAvatar` if it doesn't already — check its handler at ~761 and add the check with the error shown in `ob-upload-status` if missing.

- [ ] **Step 4: Verify**

`npm run lint`, `npm run build`. In the dev app try: an `.svg` (SVG message), a renamed `.heic` (HEIC message on desktop), a text file renamed `.jpg` (friendly decode error from `decodeImage`, not an unhandled rejection), a real `.avif` (uploads fine, stored as `.webp`).

- [ ] **Step 5: Commit**

```bash
git add src/lib/image.ts src/lib/gallery.ts src/lib/validation.ts src/components/ProfileForm.astro src/components/OnboardingForm.astro
git commit -m "feat: shared input allowlist with AVIF support and specific SVG/HEIC rejections"
```

---

### Task 5: Crop/rotate step before upload

**Files:**
- Create: `src/lib/imageEditor.ts`
- Modify: `src/components/ProfileForm.astro` (avatar + gallery handlers)
- Modify: `src/i18n/translations.ts` (button labels, en + de)

**Interfaces:**
- Consumes: `decodeImage` from `image.ts`; `compressGalleryImage(file: File | Blob)` (Task 3 widened it to Blob) and `resizeAvatar` accepting `File` — pass `new File([blob], "edited.png", { type: "image/png" })` to `resizeAvatar` since its signature takes `File`.
- Produces: `openImageEditor(file: File, labels: EditorLabels): Promise<Blob | null>` — resolves the edited image as a PNG blob (lossless intermediate; the existing pipeline does the WebP compression), or `null` if the user cancels or skips editing unchanged.

- [ ] **Step 1: Create `src/lib/imageEditor.ts`**

```ts
import { decodeImage } from "./image.ts";

export interface EditorLabels {
  rotate: string;
  apply: string;
  cancel: string;
}

/**
 * Modal crop/rotate editor. Rotation in 90° steps; crop by dragging on the canvas.
 * Resolves an edited PNG blob, or null on cancel / no changes. Lossless: WebP
 * compression happens in the existing pipeline afterwards.
 */
export async function openImageEditor(file: File, labels: EditorLabels): Promise<Blob | null> {
  const bitmap = await decodeImage(file);

  const dialog = document.createElement("dialog");
  dialog.className = "image-editor";
  dialog.innerHTML = `
    <canvas></canvas>
    <div class="image-editor-actions">
      <button type="button" data-act="rotate" class="btn-outline">${labels.rotate}</button>
      <button type="button" data-act="cancel" class="btn-outline">${labels.cancel}</button>
      <button type="button" data-act="apply" class="btn-outline">${labels.apply}</button>
    </div>`;
  document.body.appendChild(dialog);

  const canvas = dialog.querySelector("canvas")!;
  const ctx = canvas.getContext("2d")!;
  let quarterTurns = 0; // 0..3
  // Crop rect in canvas coordinates; null = full image
  let crop: { x: number; y: number; w: number; h: number } | null = null;

  const MAX_VIEW = 640;

  function draw() {
    const rotated = quarterTurns % 2 === 1;
    const iw = rotated ? bitmap.height : bitmap.width;
    const ih = rotated ? bitmap.width : bitmap.height;
    const scale = Math.min(1, MAX_VIEW / Math.max(iw, ih));
    canvas.width = Math.round(iw * scale);
    canvas.height = Math.round(ih * scale);
    ctx.save();
    ctx.translate(canvas.width / 2, canvas.height / 2);
    ctx.rotate((quarterTurns * Math.PI) / 2);
    ctx.drawImage(bitmap, (-bitmap.width * scale) / 2, (-bitmap.height * scale) / 2,
      bitmap.width * scale, bitmap.height * scale);
    ctx.restore();
    if (crop) {
      ctx.strokeStyle = "#fff";
      ctx.lineWidth = 2;
      ctx.setLineDash([6, 4]);
      ctx.strokeRect(crop.x, crop.y, crop.w, crop.h);
      ctx.setLineDash([]);
    }
  }

  let dragStart: { x: number; y: number } | null = null;
  canvas.addEventListener("pointerdown", (e) => {
    const r = canvas.getBoundingClientRect();
    dragStart = { x: e.clientX - r.left, y: e.clientY - r.top };
    canvas.setPointerCapture(e.pointerId);
  });
  canvas.addEventListener("pointermove", (e) => {
    if (!dragStart) return;
    const r = canvas.getBoundingClientRect();
    const x = Math.max(0, Math.min(canvas.width, e.clientX - r.left));
    const y = Math.max(0, Math.min(canvas.height, e.clientY - r.top));
    crop = {
      x: Math.min(dragStart.x, x),
      y: Math.min(dragStart.y, y),
      w: Math.abs(x - dragStart.x),
      h: Math.abs(y - dragStart.y),
    };
    draw();
  });
  canvas.addEventListener("pointerup", () => {
    if (crop && (crop.w < 10 || crop.h < 10)) crop = null; // treat tiny drags as clicks
    dragStart = null;
    draw();
  });

  draw();
  dialog.showModal();

  return new Promise((resolve) => {
    function finish(result: Blob | null) {
      dialog.close();
      dialog.remove();
      bitmap.close();
      resolve(result);
    }
    dialog.addEventListener("cancel", () => finish(null)); // Esc key
    dialog.querySelector('[data-act="cancel"]')!.addEventListener("click", () => finish(null));
    dialog.querySelector('[data-act="rotate"]')!.addEventListener("click", () => {
      quarterTurns = (quarterTurns + 1) % 4;
      crop = null; // crop coordinates are meaningless after rotation
      draw();
    });
    dialog.querySelector('[data-act="apply"]')!.addEventListener("click", () => {
      if (quarterTurns === 0 && !crop) return finish(null); // nothing changed
      // Render full-resolution: rotate onto an offscreen canvas, then cut the crop.
      const rotated = quarterTurns % 2 === 1;
      const full = document.createElement("canvas");
      full.width = rotated ? bitmap.height : bitmap.width;
      full.height = rotated ? bitmap.width : bitmap.height;
      const fctx = full.getContext("2d")!;
      fctx.translate(full.width / 2, full.height / 2);
      fctx.rotate((quarterTurns * Math.PI) / 2);
      fctx.drawImage(bitmap, -bitmap.width / 2, -bitmap.height / 2);
      let out = full;
      if (crop) {
        const k = full.width / canvas.width; // canvas → full-res scale factor
        const cut = document.createElement("canvas");
        cut.width = Math.round(crop.w * k);
        cut.height = Math.round(crop.h * k);
        cut.getContext("2d")!.drawImage(full,
          Math.round(crop.x * k), Math.round(crop.y * k), cut.width, cut.height,
          0, 0, cut.width, cut.height);
        out = cut;
      }
      out.toBlob((b) => finish(b), "image/png");
    });
  });
}
```

- [ ] **Step 2: Minimal dialog styling**

In `ProfileForm.astro`'s `<style>` block (tokens only, no raw hex):

```css
.image-editor {
  border: 1px solid var(--color-border);
  border-radius: var(--radius-md);
  background: var(--color-bg);
  padding: 1rem;
}
.image-editor canvas {
  max-width: 100%;
  touch-action: none;
  cursor: crosshair;
}
.image-editor-actions {
  display: flex;
  gap: 0.5rem;
  justify-content: flex-end;
  margin-top: 0.75rem;
}
```

Note: `dialog` styles land in a scoped block but the dialog is created via `document.body.appendChild`, so the scope attribute won't match — put these rules inside `<style is:global>` or move them to `global.css`.

- [ ] **Step 3: Translations**

Add to `ui.en` / `ui.de` in `src/i18n/translations.ts`:
`"profile.edit.rotate": "Rotate" / "Drehen"`, `"profile.edit.apply": "Apply" / "Übernehmen"`, `"profile.edit.cancel": "Cancel" / "Abbrechen"`.

- [ ] **Step 4: Wire into ProfileForm**

Import `openImageEditor` in the script block. Labels object once: `const editorLabels = { rotate: s["profile.edit.rotate"], apply: s["profile.edit.apply"], cancel: s["profile.edit.cancel"] };`

Avatar handler (~954), after `validateAvatar` passes and before `resizeAvatar`:

```ts
const edited = await openImageEditor(file, editorLabels);
const source = edited ? new File([edited], "edited.png", { type: "image/png" }) : file;
({ blob: resizedAvatarBlob, color: avatarColor } = await resizeAvatar(source));
```

Gallery handler (~853), after `validateGalleryFile` passes:

```ts
const edited = await openImageEditor(file, editorLabels);
const { blob, width, height, color } = await compressGalleryImage(edited ?? file);
```

(`null` means cancelled-or-unchanged; proceeding with the original file is the intended behavior for "unchanged" — a user who wants to abort entirely can simply not save. If distinct cancel-vs-skip semantics are wanted later, that's a follow-up, not this task.)

- [ ] **Step 5: Verify**

`npm run lint`, `npm run build`. Dev app: upload with a crop (stored image is cropped, dimensions in Firestore match), rotate an image 90° (orientation correct at full res), Esc/cancel (original uploads), plain apply without edits (original uploads, no double-encode), and on mobile viewport confirm the drag-crop works (pointer events + `touch-action: none`).

- [ ] **Step 6: Commit**

```bash
git add src/lib/imageEditor.ts src/components/ProfileForm.astro src/i18n/translations.ts src/styles/global.css
git commit -m "feat: crop/rotate editor before image upload"
```

---

## Post-plan

Merge flow per repo convention: feature branch → `dev` (manual `npm run deploy:dev` to verify on staging) → PR to `main`. Rules files deploy to prod only with the `main` release.
