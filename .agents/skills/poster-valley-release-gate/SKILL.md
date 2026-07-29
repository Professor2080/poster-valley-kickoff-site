---
name: poster-valley-release-gate
description: Assess Poster Valley kickoff readiness for Draft PR, CI, Vercel Preview review, or an explicitly approved merge. Use for release-readiness and gate-review requests in this repository; do not use to execute a merge, deployment, migration, email, payment, or provider write.
---

# Poster Valley Release Gate

1. Read `AGENTS.md` and `docs/release-runbook.md`.
2. Re-run preflight and `npm run verify` with the exact active-worktree contract, then review the
   complete diff.
3. Confirm product/API/migration/provider-config scope and environment separation.
4. Remote verification requires an available, authenticated GitHub/Vercel connector or approved
   read-only CLI access. If access is absent, report `not verified`; never infer remote state.
5. Do not contact a database from this skill alone. Live schema or migration-state inspection is a
   separate task requiring explicit authorization, the exact Supabase Staging project, read-only
   mode and the documented minimal tool allowlist. Missing or different access is `not verified`
   and a stop; Production remains out of reach.
6. When authorized to inspect, verify the Draft PR's exact head SHA and the stable GitHub checks
   `quality-gate` and `production-dependency-audit`.
7. Treat every connector/provider inspection as read-only.
8. Local verification may regenerate ignored `node_modules`, `dist` and synthetic temporary test
   repositories; it must not modify tracked source. For a strictly no-write review, inspect existing
   verified output and report checks as not rerun.
9. This skill controls and reports only. Stop before merge, deployment, migration/database write,
   email, payment or external-settings change without separate explicit human approval.
