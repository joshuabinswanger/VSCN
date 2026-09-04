<!-- Mirror of ~/.claude/projects/D--SynoDrive-VSCN/memory/subagent-workflow-preference.md — kept in sync so any Claude instance can read it without access to the user profile. -->

---
name: subagent-workflow-preference
description: "Josh wants subagent-driven work run efficiently, with Fable on the hard tasks and cheaper models elsewhere"
metadata: 
  node_type: memory
  type: feedback
  originSessionId: e3de029c-c277-47b9-ae94-97cbb49d35ac
  modified: 2026-08-20T15:08:35.029Z
---

Asked to execute a plan with subagents, Josh said: *"subagent in an efficient
way! Important tasks can use fable"*.

**Why:** he cares about both throughput and cost, and treats model choice as a
dial to set per task rather than a session-wide default. He does not want a
capable-model-for-everything approach, and he does not want ceremony that costs
wall-clock without buying confidence.

**How to apply:** dispatch `claude-fable-5` for the tasks where judgement
actually decides the outcome — on the 2026-08-20 prototype that was the card's
animation and the grid's GSAP layer — and use cheaper tiers for transcription
and mechanical work. Batch small same-shape tasks into one dispatch instead of
one agent per task. Do the trivial version-control steps in the controller
rather than spawning an agent to run `git commit`. Parallelise work on disjoint
files where only one agent commits, instead of serialising on ceremony.

Two things that paid off and are worth repeating: telling an implementer to
*measure rather than comply* when it thinks an instruction is wrong (Fable
caught two of my rulings that way, including a CSS specificity claim I had not
checked), and telling it to report a gate it could not run rather than
substituting a weaker check. Both produced better outcomes than a clean report
would have. See [[community-prototype-state]].
