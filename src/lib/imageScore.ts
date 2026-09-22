// THE PRIORITY SCORE. One arithmetic, used in three places: the rating
// callable, the build's snapshot export, and the console panel that shows an
// admin the number before they commit to it. They must agree exactly, or the
// console lies about what it is about to do.
//
// THIS FILE EXISTS TWICE, BYTE FOR BYTE:
//   src/lib/imageScore.ts        — site, build scripts, admin console
//   functions/src/imageScore.ts  — the callables
// Not an oversight. functions/tsconfig.json sets rootDir "src" and the deploy
// uploads only functions/, so a Cloud Function cannot import ../src/lib. The
// repo already mirrors rules this way (validImage lives in three files). What
// is new is that tests/unit/imageScore.test.mjs compares the two files and
// fails if they differ, so the copy cannot rot quietly. EDIT BOTH.
//
// Pure: no Firebase import of any kind, browser or admin, exactly as
// galleryRecords.ts is pure. That is what makes it testable without an
// emulator and safe to import from a build script.
//
// See documentation/20260922-image-moderation-ranking-design.md.

/** The fields of an images/{id} record the completeness reading looks at. */
export interface ScorableRecord {
  caption?: string;
  captionDe?: string;
  description?: string;
  descriptionDe?: string;
  tags?: string[];
  link?: string;
  siteLink?: string;
}

/** Shown in the console beside the slider, so an override is a disagreement and not a guess. */
export interface CompletenessChecks {
  caption: boolean;
  description: boolean;
  /** BOTH German fields. Half a translation is not a translated record. */
  german: boolean;
  tags: boolean;
  /** Either link — where it appeared, or the member's own page for it. */
  link: boolean;
}

/** One admin's judgement. `completeness: null` means "follow the record". */
export interface AdminRating {
  professional: number;
  knowledge: number;
  aesthetics: number;
  completeness: number | null;
}

/** The imageModeration/{imageId} document, as far as scoring cares. */
export interface ModerationRecord {
  ratings?: Record<string, AdminRating>;
  hidden?: boolean;
}

export const WEIGHTS = {
  professional: 0.35,
  knowledge: 0.25,
  aesthetics: 0.25,
  completeness: 0.15,
};

export const SCALE_MAX = 5;

/** What an unrated human criterion contributes: the middle of the scale. */
export const NEUTRAL = 2.5;

function filled(value: unknown): boolean {
  return typeof value === "string" && value.trim().length > 0;
}

export function completenessChecks(rec: ScorableRecord): CompletenessChecks {
  return {
    caption: filled(rec.caption),
    description: filled(rec.description),
    german: filled(rec.captionDe) && filled(rec.descriptionDe),
    tags: Array.isArray(rec.tags) && rec.tags.length > 0,
    link: filled(rec.link) || filled(rec.siteLink),
  };
}

/** Checks passed — already on the 0–5 scale the other three criteria use. */
export function computedCompleteness(rec: ScorableRecord): number {
  return Object.values(completenessChecks(rec)).filter(Boolean).length;
}

function clamp(value: unknown): number {
  const n = typeof value === "number" && Number.isFinite(value) ? value : 0;
  return Math.min(SCALE_MAX, Math.max(0, n));
}

function mean(values: number[]): number {
  return values.reduce((sum, v) => sum + v, 0) / values.length;
}

/**
 * 0–100. An image nobody has rated takes NEUTRAL on the three human criteria
 * but its REAL completeness, so a documented picture edges ahead of a bare one
 * before anyone has looked at it — a 15-point spread around the middle, enough
 * to break ties and not enough to reorder a page.
 */
export function imageScore(rec: ScorableRecord, mod?: ModerationRecord | null): number {
  const auto = computedCompleteness(rec);
  const raters = Object.values(mod?.ratings ?? {});
  const parts = raters.length
    ? {
        professional: mean(raters.map((r) => clamp(r.professional))),
        knowledge: mean(raters.map((r) => clamp(r.knowledge))),
        aesthetics: mean(raters.map((r) => clamp(r.aesthetics))),
        // An `auto` rater contributes TODAY's reading, not the one that was
        // true when they rated. That is the whole reason completeness is
        // computed: a member who adds a German description next month lifts
        // their own score with nobody re-rating anything.
        completeness: mean(raters.map((r) => (r.completeness === null || r.completeness === undefined ? auto : clamp(r.completeness)))),
      }
    : {
        professional: NEUTRAL,
        knowledge: NEUTRAL,
        aesthetics: NEUTRAL,
        completeness: auto,
      };
  const weighted =
    WEIGHTS.professional * parts.professional +
    WEIGHTS.knowledge * parts.knowledge +
    WEIGHTS.aesthetics * parts.aesthetics +
    WEIGHTS.completeness * parts.completeness;
  return Math.round((100 * weighted) / SCALE_MAX);
}

/** Hidden is a moderation act, never a consequence of a low score. */
export function isHidden(mod?: ModerationRecord | null): boolean {
  return mod?.hidden === true;
}
