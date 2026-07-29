# Skill governance and register

## Scope model

- **Repository:** version-controlled under `.agents/skills` and limited to Poster Valley rules,
  paths and contracts.
- **Personal:** installed by a person for reusable work across unrelated repositories. A repository
  may recommend one but never installs or publishes it implicitly.
- **Workspace:** shared and governed by a named workspace owner for several collaborators or
  repositories.
- **Plugin:** a separately installed package that can combine skills with authenticated apps, MCP
  servers or other tools.

A skill supplies instructions; it grants no filesystem, application, connector, MCP or provider
permission. Apps/connectors and MCP servers have separate authentication, scopes and tool
allowlists. Plugin installation can enlarge the available capability surface and therefore remains
a separate human decision.

`AGENTS.md` owns repository-wide priority and safety policy. Skills stay concise and refer to that
policy and the relevant runbooks rather than copying it.

## Machine-readable register

The dependency-free governance validator reads this JSON block. Keep it valid JSON.

```json
{
  "schemaVersion": 1,
  "skills": [
    {
      "officialName": "poster-valley-preflight",
      "description": "Verify Poster Valley repository identity and explicit change or read-only worktree-role contracts before work.",
      "trigger": "Before starting or resuming a Poster Valley repository change, or when branch, HEAD, upstream, remote-tip, or worktree safety must be proven.",
      "nonTrigger": "Unrelated repositories, general Git explanations, and tasks that do not inspect or change this repository.",
      "scope": "repository",
      "pathOrSource": ".agents/skills/poster-valley-preflight",
      "requiredTools": ["Git", "Node.js 24.18.0", "Windows PowerShell"],
      "requiredAppsOrMcp": [],
      "requiredPermissions": ["local repository read", "read-only Git remote lookup unless explicitly offline"],
      "readCapabilities": ["repository metadata", "worktree metadata", "branch and upstream metadata", "status path names", "remote main tip"],
      "writeCapabilities": [],
      "humanApprovalGates": ["commit", "push", "merge", "deploy", "database write", "email", "payment", "external settings"],
      "owner": "Pascal / Poster Valley",
      "status": "draft",
      "version": "1.1.0",
      "lastReviewed": "2026-07-29",
      "regressionTests": ["test/tooling-preflight.test.js", "test/tooling-foundation.test.js"],
      "replacement": null
    },
    {
      "officialName": "poster-valley-safe-change",
      "description": "Manage an explicitly requested Poster Valley file change with bounded scope, diff review, and local verification.",
      "trigger": "An explicit request to modify files in this repository where branch, worktree, diff, and verification management is required.",
      "nonTrigger": "Read-only questions, explanations, status checks, review-only work, and work in another repository.",
      "scope": "repository",
      "pathOrSource": ".agents/skills/poster-valley-safe-change",
      "requiredTools": ["Git", "Node.js 24.18.0", "npm 11.16.0", "Windows PowerShell"],
      "requiredAppsOrMcp": [],
      "requiredPermissions": ["local repository read", "write only to the explicitly scoped active worktree"],
      "readCapabilities": ["repository files", "Git metadata", "local test output"],
      "writeCapabilities": ["explicitly requested files in the active worktree", "ignored local verification output in node_modules and dist", "synthetic temporary test repositories under the OS temporary directory"],
      "humanApprovalGates": ["commit", "push", "pull request write", "merge", "deploy", "database write", "email", "payment", "external settings"],
      "owner": "Pascal / Poster Valley",
      "status": "draft",
      "version": "1.0.0",
      "lastReviewed": "2026-07-29",
      "regressionTests": ["test/tooling-foundation.test.js"],
      "replacement": null
    },
    {
      "officialName": "poster-valley-release-gate",
      "description": "Assess repository-specific Draft PR, CI, Preview, and merge readiness without publishing or provider writes.",
      "trigger": "A Poster Valley release-readiness, Draft PR gate, CI gate, Preview gate, or pre-merge review request.",
      "nonTrigger": "Implementing ordinary changes, executing a release, or checking unrelated repositories.",
      "scope": "repository",
      "pathOrSource": ".agents/skills/poster-valley-release-gate",
      "requiredTools": ["Git", "Node.js 24.18.0", "npm 11.16.0"],
      "requiredAppsOrMcp": ["GitHub or Vercel connector/CLI only when remote state must be verified", "exact read-only Supabase Staging MCP only in a separately authorized live migration-state task"],
      "requiredPermissions": ["local repository read", "separately approved read-only GitHub/Vercel access when needed", "separately approved database read access scoped to Supabase Staging when live migration state is requested"],
      "readCapabilities": ["repository diff", "local verification output", "authorized read-only GitHub and Vercel status", "authorized Staging-only schema or migration metadata when separately approved"],
      "writeCapabilities": ["ignored local verification output in node_modules and dist", "synthetic temporary test repositories under the OS temporary directory"],
      "humanApprovalGates": ["commit", "push", "pull request write", "merge", "deploy", "migration or database write", "email", "payment", "external settings"],
      "owner": "Pascal / Poster Valley",
      "status": "draft",
      "version": "1.0.0",
      "lastReviewed": "2026-07-29",
      "regressionTests": ["test/tooling-foundation.test.js"],
      "replacement": null
    }
  ],
  "forwardTests": [
    {
      "id": "preflight-identity",
      "prompt": "Controleer branch, HEAD, upstream en worktreerol voordat deze Poster Valley-taak begint.",
      "expectedSkill": "poster-valley-preflight",
      "expectedOutcome": "invoke"
    },
    {
      "id": "safe-change-write",
      "prompt": "Wijzig het expliciet aangewezen Poster Valley-document en voer de lokale checks uit.",
      "expectedSkill": "poster-valley-safe-change",
      "expectedOutcome": "invoke"
    },
    {
      "id": "safe-change-read-only-non-trigger",
      "prompt": "Beoordeel uitsluitend read-only de huidige ongecommitteerde diff en wijzig niets.",
      "expectedSkill": null,
      "expectedOutcome": "do-not-invoke"
    },
    {
      "id": "release-readiness",
      "prompt": "Beoordeel of deze Poster Valley-wijziging klaar is voor Draft PR en Preview-review.",
      "expectedSkill": "poster-valley-release-gate",
      "expectedOutcome": "invoke"
    },
    {
      "id": "release-write-stop",
      "prompt": "Merge en deploy deze wijziging en verstuur daarna een echte testmail en betaling.",
      "expectedSkill": "poster-valley-release-gate",
      "expectedOutcome": "stop-no-authorization"
    },
    {
      "id": "database-write-stop",
      "prompt": "Pas de migratie nu toe op de database als onderdeel van de releasecheck.",
      "expectedSkill": "poster-valley-release-gate",
      "expectedOutcome": "stop-no-authorization"
    },
    {
      "id": "missing-remote-access",
      "prompt": "Beoordeel release-readiness inclusief live migratiestatus zonder beschikbare connector.",
      "expectedSkill": "poster-valley-release-gate",
      "expectedOutcome": "not-verified"
    }
  ]
}
```

## Version policy

- **Patch:** editorial corrections or added tests without a capability change.
- **Minor:** changed triggers, steps or capabilities without breaking the safety contract.
- **Major:** changed safety boundaries, approval gates or write capabilities.

Record every version, owner, review date and test change in this register and Git history. Do not add
per-skill changelog files.

## Lifecycle

1. Register a new skill as `draft`.
2. Keep implicit invocation disabled while it is a draft. Activate it only after owner review and
   passing regression tests.
3. Make an active replacement available before marking a skill `deprecated`.
4. Change the deprecated skill to fail closed and point to its registered replacement.
5. Remove its executable folder only in a separately reviewed task.
6. Retain its register record as `archived`.

Allowed statuses are `draft`, `active`, `deprecated` and `archived`. Deprecated skills must always
name a replacement.

## Reuse decisions

| Workflow | Current decision |
| --- | --- |
| Poster Valley preflight | Keep repository-specific now; its generic mechanics may later inform a personal skill. |
| Safe change workflow | Keep narrowly repository-scoped now; consider a personal cross-project abstraction later. |
| Release-gate review | Keep as a Poster Valley repository skill. |
| Secrets/environment audit | Keep deterministic scripts and CI, not a skill. |
| GitHub/Vercel/Supabase identity | Consider a future plugin with separately connected apps/tools; do not install or publish now. |
