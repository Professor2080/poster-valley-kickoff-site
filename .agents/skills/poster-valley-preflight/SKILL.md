---
name: poster-valley-preflight
description: Verify Poster Valley kickoff repository identity and the explicit reference, active, or archive worktree contract. Use before starting or resuming repository changes, or when asked to prove branch, HEAD, upstream, remote-tip, and worktree safety. Do not use for unrelated analysis outside this repository.
---

# Poster Valley Preflight

1. Read the root `AGENTS.md`.
2. Read `docs/worktree-and-branch-policy.md` and `docs/environment-matrix.md`.
3. Obtain the intended absolute root, Git common directory, role, branch, and optional pinned HEAD
   from the task or trusted handoff. Do not derive expected values from the worktree being tested.
4. Run the deterministic `npm run preflight -- <contract arguments>` command documented in the
   worktree policy. Use `-Mode inspect` for a read-only active, reference or archive inspection;
   dirty inspect mode reports paths without modifying them. Use `-ContinueExistingChanges` only
   for an active change task that explicitly resumes the already-present changes.
5. State the repository, role, branch, HEAD, upstream, remote tip, worktree status and environment
   in scope.
6. Stop on target, credential, schema/history, alias-path or protected-worktree uncertainty.

This workflow is read-only. It authorizes no database access or write, commit, push, merge,
deployment, email, payment or external-settings change.
