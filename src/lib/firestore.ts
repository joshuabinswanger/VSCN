import { db } from "./firebase.ts";
import {
  collection,
  doc,
  deleteDoc,
  deleteField,
  type FieldValue,
  getDoc,
  getDocs,
  setDoc,
  orderBy,
  query,
  serverTimestamp,
} from "firebase/firestore";

export interface UserDoc {
  displayName: string;
  photoURL: string;
  role: string;
  bio: string;
  portfolio: string;
  socialMedia: string;
  openTo: string[];
  primaryAudiences: string[];
  tags: string[];
  phone: string;
  email: string;
  communityGoals?: string[];
  onboardingComplete?: boolean;
  createdAt?: Date;
  updatedAt?: Date;
}

export type PublicProfileDoc = Omit<UserDoc, "phone" | "email"> & { active?: boolean };

export interface OnboardingRequestDoc {
  userId: string;
  message: string;
  lang: "en" | "de";
  email?: string;
  displayName?: string;
  createdAt?: Date | FieldValue;
  updatedAt?: Date | FieldValue;
}

type LegacyAudienceCleanup = {
  primaryAudience?: FieldValue;
};

function toPublicProfile(data: Partial<UserDoc>): Partial<PublicProfileDoc> {
  const out: Partial<PublicProfileDoc> = {};
  if (data.displayName !== undefined) out.displayName = data.displayName;
  if (data.photoURL !== undefined) out.photoURL = data.photoURL;
  if (data.role !== undefined) out.role = data.role;
  if (data.bio !== undefined) out.bio = data.bio;
  if (data.portfolio !== undefined) out.portfolio = data.portfolio;
  if (data.socialMedia !== undefined) out.socialMedia = data.socialMedia;
  if (data.openTo !== undefined) out.openTo = data.openTo;
  if (data.primaryAudiences !== undefined) out.primaryAudiences = data.primaryAudiences;
  if (data.tags !== undefined) out.tags = data.tags;
  if (data.createdAt) out.createdAt = data.createdAt;
  if (data.updatedAt) out.updatedAt = data.updatedAt;
  return out;
}

export async function getUser(uid: string): Promise<Partial<UserDoc>> {
  const snap = await getDoc(doc(db, "users", uid));
  return snap.exists() ? (snap.data() as Partial<UserDoc>) : {};
}

export async function createUser(uid: string, data: Partial<UserDoc>): Promise<void> {
  await setDoc(doc(db, "users", uid), data, { merge: true });
}

export async function updateUser(uid: string, data: Partial<UserDoc>): Promise<void> {
  await setDoc(
    doc(db, "users", uid),
    { ...data, primaryAudience: deleteField() } as Partial<UserDoc> & LegacyAudienceCleanup,
    { merge: true }
  );
}

export async function publishPublicProfile(uid: string, data: Partial<UserDoc>): Promise<void> {
  const ref = doc(db, "publicProfiles", uid);
  const publicData: Partial<PublicProfileDoc> & LegacyAudienceCleanup = {
    ...toPublicProfile(data),
    primaryAudience: deleteField(),
  };
  const existing = await getDoc(ref);
  if (!existing.exists()) {
    publicData.active = true;
  }
  await setDoc(ref, publicData, { merge: true });
}

export async function updateUserProfile(uid: string, data: Partial<UserDoc>): Promise<void> {
  await Promise.all([updateUser(uid, data), publishPublicProfile(uid, data)]);
}

export async function upsertOnboardingRequest(
  uid: string,
  data: Omit<OnboardingRequestDoc, "userId" | "createdAt" | "updatedAt">
): Promise<void> {
  const ref = doc(db, "onboardingRequests", uid);
  const existing = await getDoc(ref);
  const payload: OnboardingRequestDoc = {
    userId: uid,
    message: data.message,
    lang: data.lang,
    updatedAt: serverTimestamp(),
  };
  if (data.email) payload.email = data.email;
  if (data.displayName) payload.displayName = data.displayName;
  if (!existing.exists()) {
    payload.createdAt = serverTimestamp();
  }
  await setDoc(ref, payload, { merge: true });
}

export async function publishCurrentUserProfile(uid: string): Promise<void> {
  const data = await getUser(uid);
  await publishPublicProfile(uid, {
    ...data,
    updatedAt: new Date(),
  });
}

export async function deleteUserData(uid: string): Promise<void> {
  await Promise.all([deleteDoc(doc(db, "users", uid)), deleteDoc(doc(db, "publicProfiles", uid))]);
}

export async function getMembers(): Promise<(PublicProfileDoc & { uid: string })[]> {
  const snap = await getDocs(query(collection(db, "publicProfiles"), orderBy("displayName")));
  return snap.docs
    .filter((d) => d.data().active !== false)
    .map((d) => ({ uid: d.id, ...(d.data() as PublicProfileDoc) }));
}

export interface TagDoc {
  label: string;
  active: boolean;
  group?: string;
  createdAt: Date;
  createdBy: string;
}

export async function getTags(): Promise<TagDoc[]> {
  const snap = await getDocs(query(collection(db, "tags"), orderBy("label")));
  return snap.docs
    .map((d) => d.data() as TagDoc)
    .filter((tag) => tag.active !== false);
}

export async function getOrCreateTag(label: string, uid: string, group?: string): Promise<void> {
  const normalized = label.trim().toLowerCase().replace(/\s+/g, "-");
  const ref = doc(db, "tags", normalized);
  const snap = await getDoc(ref);
  if (!snap.exists()) {
    await setDoc(ref, {
      label: label.trim(),
      active: true,
      group: group || "other",
      createdAt: new Date(),
      createdBy: uid,
    } as TagDoc);
  }
}

export async function updateTagStatus(slug: string, active: boolean): Promise<void> {
  await setDoc(doc(db, "tags", slug), { active, updatedAt: new Date() }, { merge: true });
}

export async function updateTagGroup(slug: string, group: string): Promise<void> {
  await setDoc(doc(db, "tags", slug), { group, updatedAt: new Date() }, { merge: true });
}

export interface OpenToDoc {
  id: string;
  label_en: string;
  label_de: string;
  active: boolean;
  order: number;
}

export async function getOpenToOptions(): Promise<OpenToDoc[]> {
  const snap = await getDocs(query(collection(db, "openTo"), orderBy("order")));
  return snap.docs
    .map((d) => ({ id: d.id, ...(d.data() as Omit<OpenToDoc, "id">) }))
    .filter((opt) => opt.active !== false);
}
