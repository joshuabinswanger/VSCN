import { storage } from "./firebase.ts";
import { ref, uploadBytesResumable, getDownloadURL, deleteObject } from "firebase/storage";

export function uploadAvatar(
  uid: string,
  file: File,
  onProgress: (pct: number) => void = () => {},
  oldPhotoURL?: string,
): Promise<string> {
  const ext = file.name.includes(".") ? file.name.split(".").pop() : "jpg";
  const storageRef = ref(storage, `avatars/${uid}.${ext}`);
  return new Promise((resolve, reject) => {
    const task = uploadBytesResumable(storageRef, file);
    task.on(
      "state_changed",
      (snap) => {
        onProgress(Math.round((snap.bytesTransferred / snap.totalBytes) * 100));
      },
      reject,
      async () => {
        const newURL = await getDownloadURL(task.snapshot.ref);
        if (oldPhotoURL && oldPhotoURL !== newURL) {
          try {
            await deleteObject(ref(storage, oldPhotoURL));
          } catch {
            // Old file may already be gone — not a fatal error
          }
        }
        resolve(newURL);
      },
    );
  });
}
