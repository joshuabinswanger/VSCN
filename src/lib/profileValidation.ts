import { MAX_BIO_WORDS, countWords } from "./validation.ts";
import { MAX_SOCIAL_MEDIA } from "./links.ts";

/**
 * The profile editor's pre-write check, table-driven (2026-09-29).
 *
 * Every number here mirrors a cap in firestore.rules — validPublicFields()
 * and validPrivateUser() — and exists because the rules' answer to an
 * over-long field is a bare "Missing or insufficient permissions." naming
 * nothing, AFTER the work records, projects and avatar have already been
 * written. Change them together. The bio's word cap is validBioWordCount().
 */
export const PROFILE_TEXT_CAPS = {
  displayName: 100,
  role: 100,
  roleDe: 100,
  affiliation: 150,
  location: 100,
  bio: 500,
  bioDe: 500,
  portfolio: 200,
  socialMedia: MAX_SOCIAL_MEDIA,
  phone: 40,
} as const;

export const PROFILE_LIST_CAPS = {
  tags: 7,
  openTo: 5,
  visualNeeds: 8,
} as const;

export type ProfileTextField = keyof typeof PROFILE_TEXT_CAPS;
export type ProfileListField = keyof typeof PROFILE_LIST_CAPS;
export type ProfileField = ProfileTextField | ProfileListField;

export type ProfileValues = Record<ProfileTextField, string> & Record<ProfileListField, readonly string[]>;

export interface ProfileProblem {
  field: ProfileField;
  message: string;
}

/** Which ui key names each field in an error — the German twins say so. */
const FIELD_LABEL_KEY: Record<ProfileField, string> = {
  displayName: "profile.label.name",
  role: "profile.label.role.en",
  roleDe: "profile.label.role.de",
  affiliation: "profile.label.affiliation",
  location: "profile.label.location",
  bio: "profile.label.bio.en",
  bioDe: "profile.label.bio.de",
  portfolio: "profile.label.portfolio",
  socialMedia: "profile.label.social",
  phone: "profile.label.phone",
  tags: "profile.label.tags",
  openTo: "profile.openTo.legend",
  visualNeeds: "profile.visualNeeds.legend",
};

/** Form order, so the first problem reported is the first one on the page. */
const CHECK_ORDER: ProfileField[] = [
  "displayName", "role", "roleDe", "affiliation", "location", "bio", "bioDe",
  "portfolio", "socialMedia", "tags", "openTo", "visualNeeds", "phone",
];

/**
 * Fields that must not be empty. Callers pass values already trimmed, so
 * whitespace alone counts as empty. Client-side only: firestore.rules still
 * allows "" (a rules minimum is weighed against the evaluation budget).
 */
const REQUIRED_FIELDS: ProfileField[] = ["displayName"];

/**
 * The phone is stored as an optional leading + and 6 to 15 digits, nothing
 * else (2026-11-02, Josh: "only plus and digits"). Spaces are the one thing
 * the editors take out for the member, since that is how a number is written
 * and pasted: stripPhoneSpaces(). The 40-character cap above still applies,
 * and firestore.rules still holds only that cap.
 */
export const PHONE_FORMAT = /^(\+?[0-9]{6,15})?$/;

export function stripPhoneSpaces(value: string): string {
  return value.replace(/\s+/g, "");
}

/**
 * stripPhoneSpaces() on a field as the member types or pastes into it, the
 * caret kept where it was in the rest of the text. Returns the field's value.
 */
export function stripPhoneSpacesInPlace(input: HTMLInputElement): string {
  const bare = stripPhoneSpaces(input.value);
  if (bare !== input.value) {
    const caret = input.selectionStart ?? input.value.length;
    const at = stripPhoneSpaces(input.value.slice(0, caret)).length;
    input.value = bare;
    input.setSelectionRange(at, at);
  }
  return bare;
}

function fill(template: string, field: string, n: number): string {
  return template.replace("{field}", field).replace("{n}", String(n));
}

/**
 * The first field the rules would refuse, with a sentence in the member's
 * language that names it — or null when the whole profile would pass.
 */
export function firstProfileProblem(values: ProfileValues, s: Record<string, string>): ProfileProblem | null {
  for (const field of CHECK_ORDER) {
    const label = s[FIELD_LABEL_KEY[field]] ?? field;
    if (field in PROFILE_LIST_CAPS) {
      const cap = PROFILE_LIST_CAPS[field as ProfileListField];
      if (values[field as ProfileListField].length > cap) {
        return { field, message: fill(s["profile.validation.tooMany"], label, cap) };
      }
      continue;
    }
    const value = values[field as ProfileTextField];
    const cap = PROFILE_TEXT_CAPS[field as ProfileTextField];
    // The name is the one field a member cannot leave empty: the rules accept
    // "" (they only cap it), and an empty name makes the slug function fall
    // back to the uid and move the member's public URL. See REQUIRED_FIELDS.
    if (REQUIRED_FIELDS.includes(field) && value === "") {
      return { field, message: fill(s["profile.validation.required"], label, 0) };
    }
    if (field === "socialMedia" && value.length > cap) {
      return { field, message: s["profile.social.tooLong"] };
    }
    if (value.length > cap) {
      return { field, message: fill(s["profile.validation.tooLong"], label, cap) };
    }
    if (field === "phone" && !PHONE_FORMAT.test(value)) {
      return { field, message: fill(s["profile.validation.phone"], label, 0) };
    }
    if ((field === "bio" || field === "bioDe") && countWords(value) > MAX_BIO_WORDS) {
      return { field, message: fill(s["profile.validation.tooManyWords"], label, MAX_BIO_WORDS) };
    }
  }
  return null;
}
