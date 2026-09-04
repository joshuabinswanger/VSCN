> Mirror of the agent memory file `~/.claude/projects/D--SynoDrive-VSCN/memory/firestore-rules-hasonly-gotcha.md`
> — kept in the repo so any Claude instance can read it without access to the user profile.

# firestore.rules `hasOnly` gotcha

`firestore.rules` validates profile writes with `data.keys().hasOnly(allowedKeys)` in both
`validPublicProfile` and `validPrivateUser`. A field missing from those lists does not get
dropped — it rejects the **whole document write**, including every other field in the same
call. The client code wraps these saves in `.catch(() => {})`, so nothing surfaces in the UI
or the console.

This had already bitten the project: onboarding step 1 wrote `wantsToContribute`, which was
absent from `validPrivateUser`, so that call always failed and `openTo` was never saved from
the onboarding flow (it only stuck when re-saved later from the profile page). Fixed on
2026-08-19 by adding the key.

**Why:** it presents as "the feature just doesn't persist" with no error anywhere, which is
expensive to diagnose from the symptom.

**How to apply:** any new profile field means editing `firestore.rules` in the same change —
add it to both `allowedKeys` lists plus a type check in `validPublicFields`, and mirror any
enum in a `valid*` helper next to the TypeScript const. See `scientists-as-member-type.md`
for the `memberType` example.
