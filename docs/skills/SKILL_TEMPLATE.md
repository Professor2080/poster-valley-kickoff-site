# Repository skill template

Use this template to design a skill before creating its folder. Keep the resulting `SKILL.md`
concise; record governance metadata in the central register.

## Identity

- Official name:
- Scope: repository | personal | workspace | plugin
- Owner:
- Status: draft
- Version: 0.1.0
- Last reviewed: YYYY-MM-DD

## Goal

State the single repeatable problem the skill solves.

## When to use

List concrete trigger phrases, task types and repository context.

## When not to use

List adjacent tasks, unrelated repositories and read-only/write distinctions that must not trigger.

## Required context

List the exact policy, runbook, source and task identity that must be read.

## Required tools

List local tools, optional apps/connectors/MCP servers, authentication state and permissions.
Missing required access must produce `not verified` or a fail-closed stop.

## Steps

1. Verify identity and scope.
2. Perform the smallest permitted workflow.
3. Verify results.
4. Report completed and unverified work separately.

## Safety boundaries

State protected data, repositories, worktrees, external systems and prohibited side effects.

## Allowed actions

- Read:
- Write:

## Human approval

State separate gates for commit, push, PR writes, merge, deploy, database writes, email, payment and
external settings. A skill never grants those permissions itself.

## Stop conditions

List identity mismatches, missing access, unexpected state and side-effect uncertainty.

## Verification

List deterministic tests, negative tests, diff review and exact evidence required.

## Expected output

Specify the facts, limitations, unchanged scope and approval gates to report.

## Synthetic examples

- Trigger: “Update the explicitly scoped documentation in the active example worktree.”
- Non-trigger: “Explain how Git worktrees work.”
- Placeholder credential: `replace-me`
- Synthetic host: `https://service.example.test`

Never include real project credentials, customer data or production-shaped token examples.

## Version and changelog

- `0.1.0` — draft created with synthetic examples only.

Use patch/minor/major rules from the register. Keep future version notes in the register and Git
history; do not add a separate changelog file inside the skill folder.
