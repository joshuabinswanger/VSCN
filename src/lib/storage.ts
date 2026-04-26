import { storage } from "./firebase.ts";
import { ref, uploadBytesResumable, getDownloadURL } from "firebase/storage";

export function uploadAvatar(
  uid: string,
  file: File,
  onProgress: (pct: number) => void = () => {},
): Promise<string> {
  const ext = file.name.split(".").pop();
  const storageRef = ref(storage, `avatars/${uid}.${ext}`);
  return new Promise((resolve, reject) => {
    const task = uploadBytesResumable(storageRef, file);
    task.on(
      "state_changed",
      (snap) => {
        onProgress(Math.round((snap.bytesTransferred / snap.totalBytes) * 100));
      },
      reject,
      async () => resolve(await getDownloadURL(task.snapshot.ref)),
    );
  });
}
