// The shape every public rendering of a member consumes: the profile page, the
// community card, and the editor's live preview.
//
// It exists because those renderings have TWO different producers. The public
// page and the directory are built from a stored `publicProfiles` document at
// build time; the editor's preview is built from the profile form's current,
// unsaved state in the browser. Naming one shape between them is what lets the
// editor preview the real thing — the public page is a static build-time
// snapshot, so a member cannot see their own edits there until a rebuild runs.

export interface ProfileWork {
  url: string;
  width: number;
  height: number;
  /** Optional per-image caption, used as the image's alt text when present. */
  caption?: string;
  /** Dominant colour (#rrggbb), painted behind the image while it loads. */
  color?: string;
  /**
   * The image's description, on every surface that has room for it: under the
   * image on the profile page and beside it in the lightbox. Never used as alt
   * text — the caption is what gets read aloud.
   *
   * THE ONLY ONE (2026-09-04). A second, shorter field fed the non-portfolio
   * surfaces for a day; see GalleryItem.description in gallery.ts for why it
   * is gone.
   */
  description?: string;
  /**
   * Absolute href for "where this image lives" — already scheme-prefixed and
   * already filtered for linkability by workLink() in links.ts, so a renderer
   * can link it without checking anything. Absent when the member wrote
   * nothing, or wrote something that is not link-shaped.
   */
  link?: string;
}

export interface ProfileViewModel {
  displayName: string;
  photoURL?: string;
  photoColor?: string;
  role: string;
  /**
   * One of MEMBER_TYPES, or empty/absent when unset (profiles predate member
   * types). The typographic card face uses it as the tag-line fallback.
   */
  memberType?: string;
  bio: string;
  /** Institution, lab, studio or company. Empty when unset. */
  affiliation: string;
  /** Free text, e.g. "Zurich, Switzerland". Empty when unset. */
  location: string;
  /** Working languages as LANGUAGES codes, in the order LANGUAGES lists. */
  languages: string[];
  /** What the member needs visuals for. Empty for creators. */
  visualNeeds: string[];
  tags: string[];
  openTo: string[];
  portfolio: string;
  socialMedia: string;
  /** The member's gallery, in order. Empty is a normal state, not an error. */
  works: ProfileWork[];
}
