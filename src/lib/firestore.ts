import { auth, db } from "./firebase.ts";
import { isProfileVisible } from "./profileVisibility.ts";
import {
  collection,
  doc,
  deleteField,
  type FieldValue,
  getDoc,
  getDocs,
  setDoc,
  updateDoc,
  orderBy,
  query,
  serverTimestamp,
  writeBatch,
} from "firebase/firestore";

// Keep in sync with validLanguages() in firestore.rules.
export const LANGUAGES = ["de", "en", "fr", "it"] as const;

export type LanguageCode = (typeof LANGUAGES)[number];

/**
 * The member's own language: the site locale they are routed to on /profile and
 * after sign-in, and the language VSCN writes to them in. Unrelated to the public
 * profile's working languages. See src/lib/siteLanguage.ts.
 */
export type PreferredLanguage = "de" | "en";

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
  /** The images/{imageId} record behind photoURL. Absent on profiles with no avatar. */
  photoImageId?: string;
  // Optional: profiles created before member types existed have no value.
  memberType?: MemberType;
  role: string;
  bio: string;
  /**
   * German role and bio, OPTIONAL — the `captionDe` / `descriptionDe` rule
   * extended to the profile (2026-09-23, member feedback "Alles sollte
   * zweisprachig sein"). `role` and `bio` stay the fields of record; German
   * pages read these when filled and fall back to them otherwise — see
   * pickLocaleText() in links.ts. Absent on every profile saved before then.
   */
  roleDe?: string;
  bioDe?: string;
  portfolio: string;
  socialMedia: string;
  openTo: string[];
  primaryAudiences: string[];
  tags: string[];
  /**
   * Image ids in display order — and nothing else, since 2026-09-07. The
   * records behind them (images/{imageId}) hold every word and every pixel
   * dimension; see src/lib/galleryRecords.ts. Was GalleryItem[] before.
   */
  gallery: string[];
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
  /** Private, opt-in consent for community (non-essential) mail. Absent means no choice yet. */
  receiveCommunityEmails?: boolean;
  /**
   * Private. Site language AND email language — one setting, see PreferredLanguage.
   * Absent means never chosen: no redirect happens, and mail exports fall back to German.
   */
  preferredLanguage?: PreferredLanguage;
  wantsToContribute?: boolean;
  onboardingComplete?: boolean;
  /**
   * Server-written lifecycle. "pendingDeletion" means a deletion request is in
   * its grace period; purgeAfter is when purgeExpiredAccounts will act. Clients
   * read these and never write them — firestore.rules pins them.
   */
  status?: "active" | "pendingDeletion";
  deletionRequestedAt?: Date;
  purgeAfter?: Date;
  createdAt?: Date;
  updatedAt?: Date;
}

export type PublicProfileDoc = Omit<
  UserDoc,
  "phone"
  | "email"
  | "receiveCommunityEmails"
  | "preferredLanguage"
  | "status"
  | "deletionRequestedAt"
  | "purgeAfter"
> & { active?: boolean; moderationHidden?: boolean };

export interface OnboardingRequestDoc {
  userId: string;
  message: string;
  lang: "en" | "de";
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
  if (data.photoImageId !== undefined) out.photoImageId = data.photoImageId;
  if (data.memberType !== undefined) out.memberType = data.memberType;
  if (data.role !== undefined) out.role = data.role;
  if (data.bio !== undefined) out.bio = data.bio;
  if (data.roleDe !== undefined) out.roleDe = data.roleDe;
  if (data.bioDe !== undefined) out.bioDe = data.bioDe;
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

/**
 * The EN / DE switch, when a member is signed in: the one setting follows the
 * click (see src/lib/siteLanguage.ts). updateDoc rather than updateUser's merge,
 * so a member with no users doc yet — mid-signup — gets nothing written instead
 * of a stub record. Private field only, so publicProfiles is not touched.
 */
export async function savePreferredLanguage(uid: string, lang: PreferredLanguage): Promise<void> {
  await updateDoc(doc(db, "users", uid), { preferredLanguage: lang });
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
 *
 * Returns whether a profile was actually activated, so a caller can request
 * a rebuild only when something just became visible.
 */
export async function activatePublicProfileIfExists(uid: string): Promise<boolean> {
  const ref = doc(db, "publicProfiles", uid);
  if (!(await getDoc(ref)).exists()) return false;
  await setDoc(ref, { active: true }, { merge: true });
  return true;
}

export async function setProfileActive(uid: string, active: boolean): Promise<void> {
  await setDoc(doc(db, "publicProfiles", uid), { active }, { merge: true });
}

export async function getPublicProfileActive(uid: string): Promise<boolean> {
  const snap = await getDoc(doc(db, "publicProfiles", uid));
  return snap.exists() ? ((snap.data().active as boolean | undefined) ?? false) : false;
}

export async function updateUserProfile(uid: string, data: Partial<UserDoc>): Promise<void> {
  const cleanup = { primaryAudience: deleteField(), projects: deleteField() };
  const publicData = { ...toPublicProfile(data), ...cleanup };
  if (auth.currentUser && !auth.currentUser.emailVerified) publicData.active = false;
  const batch = writeBatch(db);
  batch.set(doc(db, "users", uid), { ...data, ...cleanup }, { merge: true });
  batch.set(doc(db, "publicProfiles", uid), publicData, { merge: true });
  await batch.commit();
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

export async function getMembers(): Promise<(PublicProfileDoc & { uid: string })[]> {
  const snap = await getDocs(query(collection(db, "publicProfiles"), orderBy("displayName")));
  return snap.docs
    .filter((d) => isProfileVisible(d.data()))
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
