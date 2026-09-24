> Mirrors the `~/.claude/projects/D--SynoDrive-VSCN/memory/scientists-as-member-type.md` memory file; keep the two in sync.

---
name: scientists-as-member-type
description: "VSCN welcomes scientists via a memberType profile field, not org accounts; a requests board is the deferred phase 2"
metadata: 
  node_type: memory
  type: project
  originSessionId: 447c279a-e834-4727-a333-3932fed04e98
  modified: 2026-08-19T07:11:30.173Z
---

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
key lists in `firestore.rules` — see [[firestore-rules-hasonly-gotcha]].
