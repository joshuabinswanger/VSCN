import { storage } from "./firebase.ts";
import { ref, uploadBytesResumable, deleteObject } from "firebase/storage";

export function publicStorageUrl(storagePath: string): string {
  const bucket = storage.app.options.storageBucket ?? "";
  return `https://firebasestorage.googleapis.com/v0/b/${bucket}/o/${encodeURIComponent(storagePath)}?alt=media`;
}

export function stripStorageToken(url: string): string {
  if (!url) return url;
  try {
    const u = new URL(url);
    if (u.hostname === "firebasestorage.googleapis.com") {
      u.searchParams.delete("token");
      return u.toString();
    }
  } catch {
    // not a valid URL, return as-is
  }
  return url;
}

export async function deleteStorageFile(fileURL: string): Promise<void> {
  if (!fileURL) return;
  try {
    const url = new URL(fileURL);
    let storagePath: string | null = null;
    if (url.hostname === "firebasestorage.googleapis.com") {
      const match = url.pathname.match(/\/o\/(.+)$/);
      if (match) storagePath = decodeURIComponent(match[1]);
    } else if (url.hostname === "storage.googleapis.com") {
      storagePath = url.pathname.split("/").slice(2).join("/");
    }
    if (storagePath) await deleteObject(ref(storage, storagePath));
  } catch {
    // Best-effort — file deletion failure should not block account deletion
  }
}

export async function deleteAvatar(photoURL: string): Promise<void> {
  await deleteStorageFile(photoURL);
}

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
