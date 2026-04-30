import { db } from "./firebase.ts";
import {
  collection,
  doc,
  deleteDoc,
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
  phone:       string;
  email:       string;
  createdAt?:  Date;
  updatedAt?:  Date;
}

export type PublicProfileDoc = Omit<UserDoc, "phone" | "email">;

function toPublicProfile(data: Partial<UserDoc>): Partial<PublicProfileDoc> {
  return {
    displayName: data.displayName ?? "",
    photoURL: data.photoURL ?? "",
    role: data.role ?? "",
    bio: data.bio ?? "",
    portfolio: data.portfolio ?? "",
    ...(data.createdAt ? { createdAt: data.createdAt } : {}),
    ...(data.updatedAt ? { updatedAt: data.updatedAt } : {}),
  };
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

export async function publishPublicProfile(uid: string, data: Partial<UserDoc>): Promise<void> {
  await setDoc(doc(db, "publicProfiles", uid), toPublicProfile(data), { merge: true });
}

export async function updateUserProfile(uid: string, data: Partial<UserDoc>): Promise<void> {
  await Promise.all([
    updateUser(uid, data),
    publishPublicProfile(uid, data),
  ]);
}

export async function publishCurrentUserProfile(uid: string): Promise<void> {
  const data = await getUser(uid);
  await publishPublicProfile(uid, {
    ...data,
    updatedAt: new Date(),
  });
}

export async function deleteUserData(uid: string): Promise<void> {
  await Promise.all([
    deleteDoc(doc(db, "users", uid)),
    deleteDoc(doc(db, "publicProfiles", uid)),
  ]);
}

export async function getMembers(): Promise<(PublicProfileDoc & { uid: string })[]> {
  const snap = await getDocs(query(collection(db, "publicProfiles"), orderBy("displayName")));
  return snap.docs.map((d) => ({ uid: d.id, ...(d.data() as PublicProfileDoc) }));
}
