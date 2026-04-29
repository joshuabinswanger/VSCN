import { db } from "./firebase.ts";
import {
  collection,
  doc,
  getDoc,
  getDocs,
  setDoc,
  orderBy,
  query,
} from "firebase/firestore";

export interface UserDoc {
  displayName: string;
  photoURL:    string;
  role:        string;
  bio:         string;
  portfolio:   string;
  email:       string;
  createdAt?:  Date;
  updatedAt?:  Date;
}

export async function getUser(uid: string): Promise<Partial<UserDoc>> {
  const snap = await getDoc(doc(db, "users", uid));
  return snap.exists() ? (snap.data() as Partial<UserDoc>) : {};
}

export async function createUser(uid: string, data: Partial<UserDoc>): Promise<void> {
  await setDoc(doc(db, "users", uid), data, { merge: true });
}

export async function updateUser(uid: string, data: Partial<UserDoc>): Promise<void> {
  await setDoc(doc(db, "users", uid), data, { merge: true });
}

export async function getMembers(): Promise<(UserDoc & { uid: string })[]> {
  const snap = await getDocs(query(collection(db, "users"), orderBy("displayName")));
  return snap.docs.map((d) => ({ uid: d.id, ...(d.data() as UserDoc) }));
}
