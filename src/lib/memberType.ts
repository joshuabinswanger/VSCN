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

export interface MemberTypeFieldCopy {
  namePlaceholder: string;
  rolePlaceholder: string;
  portfolioLabel: string;
  portfolioPlaceholder: string;
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
  };
}
