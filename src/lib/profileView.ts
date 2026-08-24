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
}

export interface ProfileViewModel {
  displayName: string;
  role: string;
  bio: string;
  tags: string[];
  openTo: string[];
  portfolio: string;
  socialMedia: string;
  /** The member's gallery, in order. Empty is a normal state, not an error. */
  works: ProfileWork[];
}
