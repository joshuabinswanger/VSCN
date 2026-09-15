# Audit release — 2026-09-15

This release integrates the audit fixes onto dev fc1f13c. The earlier report and remediation notes describe the original local audit; this document supersedes their rollout and credential notes.

The current server-allocated, validated pending-image upload flow is retained. Deletion revokes pending permits without exceeding the Storage rules cross-service read budget. A failed publication transaction removes its copied Storage generation.

Hosting keeps the existing separate, keyless Workload Identity Federation reader and deployer accounts. Export, rendering, and deployment now use separate runners. A private IAM-protected function acknowledges only the revision captured before export; the Hosting deployer requires roles/run.invoker on that function only. PR previews use staging data and never acknowledge publication.

Local lint and Astro diagnostics passed (zero errors/warnings; one existing hint). Root and Functions clean installs reported zero vulnerabilities. Emulator and hosted release results will be recorded after rollout.
