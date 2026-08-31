/**
 * Copy that depends on which kind of member a profile belongs to.
 *
 * Both the profile form and the onboarding form adapt the same fields, and the
 * member card and its live previews all derive the badge the same way, so the
 * rules live here instead of being restated in each component.
 */

/** Looks up a translation key. Astro's `t` and `(key) => ui[lang][key]` both fit. */
type Lookup = (key: string) => string;

const BADGED_TYPES = new Set(["scientist", "both", "organization"]);

/**
 * Empty for "creator" and for profiles saved before member types existed —
 * an unbadged card reads as a creator, which is the community's default.
 */
export function memberBadgeLabel(type: string, t: Lookup): string {
  return BADGED_TYPES.has(type) ? t(`member.badge.${type}`) : "";
}

/** Types that need visuals rather than make them. */
const SCIENCE_SIDE = new Set(["scientist", "both", "organization"]);

/**
 * Whether to ask this member what they need visuals for. A creator makes
 * them, so the question is only put to the science side.
 */
export function needsVisuals(type: string): boolean {
  return SCIENCE_SIDE.has(type);
}

export interface MemberTypeFieldCopy {
  namePlaceholder: string;
  rolePlaceholder: string;
  portfolioLabel: string;
  portfolioPlaceholder: string;
  affiliationPlaceholder: string;
  socialLabel: string;
  socialPlaceholder: string;
  projectsLabel: string;
}

/**
 * Scientists and research groups have lab pages and institutional titles rather
 * than portfolios. Members who picked "both" keep the creator-facing wording,
 * since they generally do have a portfolio to show.
 */
export function memberTypeFieldCopy(type: string, t: Lookup): MemberTypeFieldCopy {
  const usesLabWording = type === "scientist" || type === "organization";

  let rolePlaceholder = t("profile.ph.role");
  if (type === "organization") rolePlaceholder = t("profile.ph.role.organization");
  else if (type === "scientist") rolePlaceholder = t("profile.ph.role.science");

  return {
    namePlaceholder:
      type === "organization" ? t("profile.ph.name.organization") : t("profile.ph.name"),
    rolePlaceholder,
    portfolioLabel: usesLabWording
      ? t("profile.label.portfolio.science")
      : t("profile.label.portfolio"),
    portfolioPlaceholder: usesLabWording
      ? t("profile.ph.portfolio.science")
      : t("profile.ph.portfolio"),
    affiliationPlaceholder: usesLabWording
      ? t("profile.ph.affiliation.science")
      : t("profile.ph.affiliation"),
    // A researcher's identifier is an ORCID, and it has nowhere else to go.
    socialLabel: usesLabWording ? t("profile.label.social.science") : t("profile.label.social"),
    socialPlaceholder: usesLabWording
      ? t("profile.ph.social.science")
      : t("profile.ph.social"),
    // Title and url already fit a paper; only the heading was wrong.
    projectsLabel: usesLabWording
      ? t("profile.label.projects.science")
      : t("profile.label.projects"),
  };
}
