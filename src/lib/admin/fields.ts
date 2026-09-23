/**
 * What the two profile documents contain, in what order, and how a value is
 * shown. The authoritative field list is `UserDoc` / `PublicProfileDoc` in
 * src/lib/firestore.ts; this file mirrors it for display. Adding a field is
 * one line in the right list below — and if you forget, the field is NOT
 * lost: memberDetail renders every key the document has that no list knows
 * about under "Other fields", and the raw JSON section shows everything.
 */
import { type Child, el, fmt, linkBtn } from "./dom.ts";

export type Doc = Record<string, unknown>;

export type FieldKind = "text" | "url" | "bool" | "date" | "list" | "gallery" | "color" | "json";

export interface FieldSpec {
  key: string;
  label: string;
  kind: FieldKind;
}

/**
 * Fields `toPublicProfile()` copies — present in BOTH documents and compared.
 *
 * A label is the word the MEMBER'S OWN FORM uses, not only the document key.
 * `portfolio` is "Portfolio / Website" on /profile, and an admin who went
 * looking for a member's website in this console found no such row — the
 * field was there under a name only the schema uses. The document key is
 * still one hover away: docRows() puts it in the `dt`'s title.
 */
export const SHARED_FIELDS: FieldSpec[] = [
  { key: "displayName", label: "display name", kind: "text" },
  { key: "memberType", label: "member type", kind: "text" },
  { key: "role", label: "role", kind: "text" },
  { key: "roleDe", label: "role (German)", kind: "text" },
  { key: "affiliation", label: "affiliation", kind: "text" },
  { key: "location", label: "location", kind: "text" },
  { key: "bio", label: "bio (about you)", kind: "text" },
  { key: "bioDe", label: "bio (German)", kind: "text" },
  { key: "portfolio", label: "portfolio / website", kind: "url" },
  { key: "socialMedia", label: "social media", kind: "url" },
  { key: "languages", label: "working languages", kind: "list" },
  { key: "openTo", label: "open to", kind: "list" },
  { key: "primaryAudiences", label: "primary audiences", kind: "list" },
  { key: "visualNeeds", label: "visual needs", kind: "list" },
  { key: "tags", label: "tags", kind: "list" },
  { key: "gallery", label: "gallery", kind: "gallery" },
  { key: "photoURL", label: "photoURL", kind: "url" },
  { key: "photoColor", label: "photoColor", kind: "color" },
  { key: "photoImageId", label: "photoImageId", kind: "text" },
  { key: "createdAt", label: "doc createdAt", kind: "date" },
  { key: "updatedAt", label: "doc updatedAt", kind: "date" },
];

/** Only on publicProfiles/{uid}. */
export const PUBLIC_ONLY_FIELDS: FieldSpec[] = [
  { key: "active", label: "active", kind: "bool" },
  { key: "moderationHidden", label: "moderationHidden", kind: "bool" },
];

/** Only on users/{uid} — the private half and the server-owned lifecycle. */
export const PRIVATE_ONLY_FIELDS: FieldSpec[] = [
  { key: "email", label: "mirror email", kind: "text" },
  { key: "phone", label: "phone", kind: "text" },
  { key: "preferredLanguage", label: "preferred language", kind: "text" },
  { key: "receiveCommunityEmails", label: "community emails", kind: "bool" },
  { key: "wantsToContribute", label: "wants to contribute", kind: "bool" },
  { key: "onboardingComplete", label: "onboarding complete", kind: "bool" },
  { key: "status", label: "status", kind: "text" },
  { key: "deletionRequestedAt", label: "deletion requested", kind: "date" },
  { key: "purgeAfter", label: "purge after", kind: "date" },
];

/** onboardingRequests/{uid}. */
export const ONBOARDING_FIELDS: FieldSpec[] = [
  { key: "displayName", label: "display name", kind: "text" },
  { key: "lang", label: "language", kind: "text" },
  { key: "message", label: "message", kind: "text" },
  { key: "userId", label: "userId", kind: "text" },
  { key: "createdAt", label: "created", kind: "date" },
  { key: "updatedAt", label: "updated", kind: "date" },
];

const ISO_RE = /^\d{4}-\d{2}-\d{2}T\d{2}:\d{2}/;
const URL_RE = /^https?:\/\/\S+$/i;

export const isEmpty = (v: unknown): boolean =>
  v === null || v === undefined || v === "" || (Array.isArray(v) && v.length === 0);

/** Plain-text rendering — for table cells, tooltips and comparison messages. */
export function formatText(v: unknown, kind: FieldKind = "text"): string {
  if (isEmpty(v)) return "—";
  if (typeof v === "boolean") return v ? "yes" : "no";
  if (Array.isArray(v)) return v.map((x) => (typeof x === "object" && x ? JSON.stringify(x) : String(x))).join(", ");
  if (typeof v === "string" && (kind === "date" || ISO_RE.test(v))) return fmt(v);
  if (typeof v === "object") return JSON.stringify(v);
  return String(v);
}

/** Options for the rich renderer — only the gallery needs to reach out. */
export interface RenderOptions {
  /** Where a gallery entry (an imageId) leads when clicked. */
  goImage?: (imageId: string) => void;
}

/**
 * A NODE for a value: chips for lists, an anchor for a URL, an ordered list
 * of image links for the gallery, a swatch for a colour, yes/no for
 * booleans, a local date for ISO strings, a dash for empty. Anything
 * unexpected falls back to its JSON — visible, never dropped.
 */
export function renderValue(v: unknown, kind: FieldKind, opts: RenderOptions = {}): Node {
  if (isEmpty(v)) return el("span", { class: "muted" }, Array.isArray(v) ? "(empty list)" : "—");
  if (typeof v === "boolean") return el("span", { class: `tag ${v ? "tag--yes" : "tag--no"}` }, v ? "yes" : "no");

  if (kind === "gallery" && Array.isArray(v)) {
    // Ids-only since 2026-09-07; older documents may still carry objects
    // with an imageId. Either way, each entry is a link into #image/<id>.
    const ol = el("ol", { class: "gallery-ids" });
    v.forEach((item) => {
      const id = typeof item === "string" ? item : (item as { imageId?: unknown })?.imageId;
      const li = el("li");
      if (typeof id === "string" && id) {
        li.append(opts.goImage ? linkBtn(id, () => opts.goImage!(id)) : id);
        if (typeof item !== "string") li.append(el("small", { class: "muted" }, ` (legacy object: ${JSON.stringify(item)})`));
      } else li.append(el("code", {}, JSON.stringify(item)));
      ol.append(li);
    });
    return ol;
  }

  if (Array.isArray(v)) {
    const wrap = el("span", { class: "chips" });
    for (const item of v) {
      wrap.append(el("span", { class: "tag" }, typeof item === "object" && item ? JSON.stringify(item) : String(item)));
    }
    return wrap;
  }

  if (typeof v === "string") {
    if (kind === "color" && /^#[0-9a-f]{3,8}$/i.test(v)) {
      return el("span", { class: "swatch" }, el("i", { class: "swatch__dot", style: `background:${v}` }), v);
    }
    if ((kind === "url" || URL_RE.test(v)) && URL_RE.test(v)) {
      return el("a", { href: v, target: "_blank", rel: "noreferrer" }, v);
    }
    if (kind === "date" || ISO_RE.test(v)) return el("span", { title: v }, fmt(v));
    return document.createTextNode(v);
  }

  if (typeof v === "number") return document.createTextNode(String(v));
  return el("code", {}, JSON.stringify(v));
}

/** Keys present in the document that no spec in `known` names. */
export function unknownKeys(doc: Doc | null, ...known: FieldSpec[][]): string[] {
  if (!doc) return [];
  const seen = new Set(known.flat().map((f) => f.key));
  return Object.keys(doc).filter((k) => !seen.has(k)).sort();
}

/** Structural equality with sorted object keys; array order matters (the gallery is ordered). */
export function sameValue(a: unknown, b: unknown): boolean {
  return canon(a) === canon(b);
}
function canon(v: unknown): string {
  if (v === undefined) return "undefined";
  return JSON.stringify(v, (_k, val) => {
    if (val && typeof val === "object" && !Array.isArray(val)) {
      return Object.fromEntries(Object.entries(val as Doc).sort(([x], [y]) => (x < y ? -1 : x > y ? 1 : 0)));
    }
    return val;
  });
}

export interface Comparison {
  /** Keys whose value differs between the two documents (absent counts as a value). */
  differing: Set<string>;
  /** Shared keys neither list knows but at least one document has. */
  extraShared: string[];
}

/**
 * Where users/{uid} and publicProfiles/{uid} DISAGREE on a field that
 * `toPublicProfile()` copies. They are written together by the client, so a
 * difference means one of the two writes was rejected — typically the
 * public one, by `hasOnly` in firestore.rules — and the member's page is
 * showing something other than what they last saved. Nothing else surfaces
 * that. Fields that exist on only one side by design are not compared.
 */
export function compareDocs(pub: Doc | null, usr: Doc | null): Comparison {
  const differing = new Set<string>();
  if (!pub || !usr) return { differing, extraShared: [] };
  const oneSided = new Set([...PUBLIC_ONLY_FIELDS, ...PRIVATE_ONLY_FIELDS].map((f) => f.key));
  const known = new Set(SHARED_FIELDS.map((f) => f.key));
  const keys = new Set([...SHARED_FIELDS.map((f) => f.key), ...Object.keys(pub), ...Object.keys(usr)]);
  const extraShared: string[] = [];
  for (const k of keys) {
    if (oneSided.has(k)) continue;
    if (!known.has(k)) extraShared.push(k);
    if (!(k in pub) && !(k in usr)) continue;
    if (!sameValue(pub[k], usr[k])) differing.add(k);
  }
  return { differing, extraShared: extraShared.sort() };
}

/** A one-line, plain-text summary of how a field differs, for the tooltip on the marker. */
export function differenceNote(key: string, pub: Doc, usr: Doc): string {
  const inPub = key in pub;
  const inUsr = key in usr;
  if (inPub && !inUsr) return `only in publicProfiles: ${formatText(pub[key])}`;
  if (!inPub && inUsr) return `only in users: ${formatText(usr[key])}`;
  return `public: ${formatText(pub[key])} · private: ${formatText(usr[key])}`;
}

/** The gallery as a list of ids, whatever shape the document stores. */
export function galleryIds(doc: Doc | null): string[] {
  const g = doc?.gallery;
  if (!Array.isArray(g)) return [];
  return g
    .map((item) => (typeof item === "string" ? item : (item as { imageId?: unknown })?.imageId))
    .filter((id): id is string => typeof id === "string" && id.length > 0);
}

export type { Child };
