import { auth, db } from "./firebase.ts";
import type { GalleryItem } from "./gallery.ts";
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

// Keep in sync with validLanguages() in firestore.rules.
export const LANGUAGES = ["de", "en", "fr", "it"] as const;

export type LanguageCode = (typeof LANGUAGES)[number];

// Keep in sync with validMemberType() in firestore.rules.
export const MEMBER_TYPES = ["creator", "scientist", "both", "organization"] as const;

export type MemberType = (typeof MEMBER_TYPES)[number];

export function isMemberType(value: unknown): value is MemberType {
  return typeof value === "string" && (MEMBER_TYPES as readonly string[]).includes(value);
}

export interface UserDoc {
  displayName: string;
  photoURL: string;
  /** Dominant color of the avatar (#rrggbb), shown while it loads. */
  photoColor?: string;
  // Optional: profiles created before member types existed have no value.
  memberType?: MemberType;
  role: string;
  bio: string;
  portfolio: string;
  socialMedia: string;
  openTo: string[];
  primaryAudiences: string[];
  tags: string[];
  gallery: GalleryItem[];
  /** Institution, lab, studio or company. Public. */
  affiliation?: string;
  /** Free text, e.g. "Zurich, Switzerland". Public. */
  location?: string;
  /** Working languages, values from LANGUAGES. Public. */
  languages?: string[];
  /**
   * What this member needs visuals for: ids from the seeded `visualNeeds`
   * collection plus any custom entries. Only asked of science-side members,
   * since a creator makes visuals rather than needing them. Public.
   */
  visualNeeds?: string[];
  phone: string;
  email: string;
  wantsToContribute?: boolean;
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

/**
 * Fields this codebase no longer has, deleted on every write.
 *
 * `primaryAudience` is the singular ancestor of `primaryAudiences`.
 * `projects` is the withdrawn projects feature (2026-09-01) — and deleting it
 * is not tidiness: firestore.rules dropped 'projects' from allowedKeys, and
 * `hasOnly` rejects a whole write over one unlisted key, so any client still
 * sending the field would fail silently and completely. deleteField() merges
 * to an ABSENT key, which is what passes.
 *
 * Both are safe to send to a document that never had them.
 */
type LegacyFieldCleanup = {
  primaryAudience?: FieldValue;
  projects?: FieldValue;
};

function toPublicProfile(data: Partial<UserDoc>): Partial<PublicProfileDoc> {
  const out: Partial<PublicProfileDoc> = {};
  if (data.displayName !== undefined) out.displayName = data.displayName;
  if (data.photoURL !== undefined) out.photoURL = data.photoURL;
  if (data.photoColor !== undefined) out.photoColor = data.photoColor;
  if (data.memberType !== undefined) out.memberType = data.memberType;
  if (data.role !== undefined) out.role = data.role;
  if (data.bio !== undefined) out.bio = data.bio;
  if (data.portfolio !== undefined) out.portfolio = data.portfolio;
  if (data.socialMedia !== undefined) out.socialMedia = data.socialMedia;
  if (data.openTo !== undefined) out.openTo = data.openTo;
  if (data.primaryAudiences !== undefined) out.primaryAudiences = data.primaryAudiences;
  if (data.tags !== undefined) out.tags = data.tags;
  if (data.gallery !== undefined) out.gallery = data.gallery;
  if (data.affiliation !== undefined) out.affiliation = data.affiliation;
  if (data.location !== undefined) out.location = data.location;
  if (data.languages !== undefined) out.languages = data.languages;
  if (data.visualNeeds !== undefined) out.visualNeeds = data.visualNeeds;
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
    {
      ...data,
      primaryAudience: deleteField(),
      projects: deleteField(),
    } as Partial<UserDoc> & LegacyFieldCleanup,
    { merge: true }
  );
}

export async function publishPublicProfile(uid: string, data: Partial<UserDoc>): Promise<void> {
  const ref = doc(db, "publicProfiles", uid);
  const publicData: Partial<PublicProfileDoc> & LegacyFieldCleanup = {
    ...toPublicProfile(data),
    primaryAudience: deleteField(),
    projects: deleteField(),
  };
  // An unverified member saves a DRAFT, always — written explicitly, never
  // left absent. Both readers publish on `active !== false` (getMembers below,
  // and membersBuild.ts), so a missing `active` means PUBLISHED, not hidden;
  // omitting it here would put an unverified profile straight into the public
  // directory. canPublish() in firestore.rules enforces the same rule from the
  // other side and would reject this write outright without the explicit flag.
  // Verifying flips it back — see activatePublicProfile.
  if (auth.currentUser && !auth.currentUser.emailVerified) {
    publicData.active = false;
  }
  await setDoc(ref, publicData, { merge: true });
}

export async function activatePublicProfile(uid: string): Promise<void> {
  await setDoc(doc(db, "publicProfiles", uid), { active: true }, { merge: true });
}

/**
 * Publish a member who has just verified their email — but only if they
 * already have a profile. Verification can happen before onboarding writes
 * anything, and a bare `setDoc(..., { merge: true })` would CREATE the
 * document holding nothing but `active: true`. The directory publishes on
 * `active !== false`, so that would seed a nameless, artwork-less member into
 * the public build. The existence check is the whole point of this function.
 */
export async function activatePublicProfileIfExists(uid: string): Promise<void> {
  const ref = doc(db, "publicProfiles", uid);
  if (!(await getDoc(ref)).exists()) return;
  await setDoc(ref, { active: true }, { merge: true });
}

export async function setProfileActive(uid: string, active: boolean): Promise<void> {
  await setDoc(doc(db, "publicProfiles", uid), { active }, { merge: true });
}

export async function getPublicProfileActive(uid: string): Promise<boolean> {
  const snap = await getDoc(doc(db, "publicProfiles", uid));
  return snap.exists() ? ((snap.data().active as boolean | undefined) ?? false) : false;
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

/**
 * The seeded `visualNeeds` registry. Same document shape as `openTo`, so it
 * reuses OpenToDoc rather than cloning an identical interface.
 */
export async function getVisualNeedsOptions(): Promise<OpenToDoc[]> {
  const snap = await getDocs(query(collection(db, "visualNeeds"), orderBy("order")));
  return snap.docs
    .map((d) => ({ id: d.id, ...(d.data() as Omit<OpenToDoc, "id">) }))
    .filter((opt) => opt.active !== false);
}

export async function getOpenToOptions(): Promise<OpenToDoc[]> {
  const snap = await getDocs(query(collection(db, "openTo"), orderBy("order")));
  return snap.docs
    .map((d) => ({ id: d.id, ...(d.data() as Omit<OpenToDoc, "id">) }))
    .filter((opt) => opt.active !== false);
}
