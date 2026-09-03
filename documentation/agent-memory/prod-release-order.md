<!-- Mirror of ~/.claude/projects/D--SynoDrive-VSCN/memory/prod-release-order.md — kept in the repo so any
     Claude instance can read it without access to the user profile. Edit both copies. -->

---
name: prod-release-order
description: "One prod deploy carries three separately-gated things off dev — read the order before touching the runbook, because its step 3 ships all of them"
metadata: 
  node_type: memory
  type: project
  originSessionId: b58f7d4e-bbf2-4f19-a2f6-4579ba899643
  modified: 2026-09-03T08:56:57.855Z
---

**Written 2026-09-03.** Dev has accumulated **three independent things** that all
reach prod through one deploy, each with its own gate, and the gates were
recorded in three different notes — which is how a step gets missed:

1. The **Firebase entity restructuring** ([[firebase-entity-restructuring]]) — gated
   on migrating prod data before the tightened rules land.
2. The **image-led directory and everything after it** ([[release-b-shipped-to-dev]],
   [[image-cards-need-content]]) — gated on the **member review email**; prod
   galleries are at zero until it goes out.
3. The **description split** ([[image-descriptions-long-and-short]]) — gated on dev's
   placeholder text not being read as a member's own words.

**The trap:** the restructuring runbook's **step 3 ships #2 and #3 with it**. The
merge to `main` is not "the restructuring release", it is everything on `dev`.

**Why:** each note was true in isolation and none of them said what order they
had to happen in, so the order only existed in whoever's head last thought about
it.

**How to apply:** read `documentation/20260903-prod-release-order.md` first, then
follow the 8-step runbook (in [[firebase-entity-restructuring]]) for the
mechanics — the order note deliberately does not restate them, so a step changes
in exactly one place. Two rules that are NOT in the runbook: deploy `--only
storage` **before** the hosting that relies on it
([[storage-rules-cap-tracks-max-edge]]), and never assume a repo's rules file is
what a project has deployed.

Before any of it: the **signed-in pass on dev**, which every note keeps
deferring. No human or agent has driven one signed-in flow on the new client —
the avatar-save case first, because its failure is silent.

Since 2026-09-03 every page stamps its build into `<head>`, so
`curl -s https://<host>/community | grep 'name="build-'` answers "is this
current?" — a `-dirty` suffix means an edited working tree built it.
