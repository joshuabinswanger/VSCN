import { blobDimensions, publicStorageUrl, uploadImage, type UploadedImage } from "./images.ts";

// Kept as an export here because older importers reach it through this module.
export { publicStorageUrl };

/**
 * Avatars go through the same record-first pipeline as gallery images
 * (images.ts). The previous avatar's record is marked by the caller once
 * Firestore holds the new photoURL — see handleProfileUpdate.
 */
export async function uploadAvatar(
  uid: string,
  blob: Blob,
  color: string | undefined,
  onProgress: (pct: number) => void = () => {},
): Promise<UploadedImage> {
  const dims = await blobDimensions(blob);
  return uploadImage(uid, "avatar", blob, { ...dims, color }, onProgress);
}
