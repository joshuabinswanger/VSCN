> Mirror of the agent memory file `~/.claude/projects/D--SynoDrive-VSCN/memory/scientists-as-member-type.md`
> — kept in the repo so any Claude instance can read it without access to the user profile.

# Scientists as a member type

Opening VSCN to scientists and research groups (decided 2026-08-19) is deliberately
scoped as a **profile type**, not as organization accounts. Research groups sign up as
an ordinary profile with `memberType: "organization"` — display name is the group name,
bio says what the lab does, gallery shows visual outputs. There is no entity that owns
multiple member logins, and Josh chose this over real org accounts explicitly.

Phase 1 shipped: `memberType` (creator / scientist / both / organization) chosen in
onboarding, adaptive field wording for lab folks, a card badge, and a client-side
member-type + `openTo` filter on the community grid.

**Deferred to phase 2:** a requests board where a scientist posts "need a figure for a
paper on X" and creators respond. Agreed to build it only once actual scientists have
signed up; until then the planned VSCN chat group is the connector.

**Why:** the directory previously described itself as a registry of illustrators and
designers, and onboarding asked every newcomer for a portfolio and image gallery — a
researcher had no way to say "I need visuals for my work" and no reason to feel invited.

**How to apply:** treat new scientist-facing features as profile-shaped until Josh asks
for real organizations. Before adding any field to a profile, add it to the `hasOnly`
key lists in `firestore.rules` — see `firestore-rules-hasonly-gotcha.md`.
