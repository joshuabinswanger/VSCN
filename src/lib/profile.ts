import { updateProfile, type User } from "firebase/auth";
import { httpsCallable } from "firebase/functions";
import { functions } from "./firebase.ts";
import { uploadAvatar } from "./storage.ts";
import { updateUserProfile } from "./firestore.ts";
import { validateBio } from "./validation.ts";
import type { UserDoc } from "./firestore.ts";

export interface ProfileUpdateOptions extends Partial<UserDoc> {
  resizedAvatarBlob?: Blob | null;
}

export async function handleProfileUpdate(
  user: User,
  options: ProfileUpdateOptions,
  onProgress?: (pct: number) => void
): Promise<{ photoURL: string }> {
  const { resizedAvatarBlob, ...data } = options;
  let photoURL = data.photoURL ?? user.photoURL ?? "";

  // 1. Validation (Bio)
  if (data.bio !== undefined) {
    const bioResult = validateBio(data.bio);
    if (!bioResult.ok) {
      throw new Error(bioResult.error);
    }
  }

  // 2. Avatar Upload
  if (resizedAvatarBlob) {
    const avatarFile = new File([resizedAvatarBlob], "avatar.jpg", { type: "image/jpeg" });
    photoURL = await uploadAvatar(user.uid, avatarFile, onProgress);
    
    // Update Firebase Auth profile
    await updateProfile(user, { photoURL });
    // Force refresh token to include new photoURL in claims if needed
    await user.getIdToken(true);
  }

  // 3. Firestore Sync
  // Ensure we have essential fields if they are missing but we are updating the profile
  const profileData: Partial<UserDoc> = {
    ...data,
    photoURL,
    updatedAt: new Date(),
  };

  // If we're updating the name, sync it to Firebase Auth too
  if (data.displayName && data.displayName !== user.displayName) {
    await updateProfile(user, { displayName: data.displayName });
  }

  await updateUserProfile(user.uid, profileData);

  return { photoURL };
}

/**
 * Triggers a GitHub Actions rebuild for the community page via the
 * `requestRebuild` Cloud Function, which verifies the caller's Firebase Auth
 * token and holds the GitHub token as a server-side secret.
 * Best-effort: failures are logged, never thrown.
 */
export async function triggerRebuild() {
  try {
    const requestRebuild = httpsCallable(functions, "requestRebuild");
    await requestRebuild();
  } catch (rebuildErr) {
    console.error("Rebuild trigger error:", rebuildErr);
  }
}
