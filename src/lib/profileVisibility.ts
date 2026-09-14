/** Member publishing preference and administrator moderation are independent. */
export function isProfileVisible(profile: { active?: unknown; moderationHidden?: unknown }): boolean {
  return profile.active !== false && profile.moderationHidden !== true;
}
