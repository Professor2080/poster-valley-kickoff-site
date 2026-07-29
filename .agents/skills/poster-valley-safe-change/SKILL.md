---
name: poster-valley-safe-change
description: Implement an explicitly requested Poster Valley kickoff repository change that needs branch, worktree, diff, and verification management. Use only for actual file modifications in this repository; do not trigger for read-only questions, explanation, status checks, review-only tasks, or work outside Poster Valley.
---

# Poster Valley Safe Change

1. Complete Poster Valley Preflight.
2. Read `AGENTS.md`, `docs/development-workflow.md` and the task-relevant source/tests.
3. Confirm the exact file scope and preserve unrelated/protected worktrees.
4. Implement the smallest coherent change; do not contact a remote database or external-effect
   provider by default.
5. Run focused tests, then `npm run verify` with the exact active-worktree identity contract.
   Verification may regenerate ignored `node_modules`, `dist` and synthetic temporary test
   repositories; do not treat those as source/publication writes.
6. Review the complete diff and report out-of-scope files as unchanged.
7. Stop before database writes, email, payment or external-settings changes without separate human
   approval.
8. Stop uncommitted and unpushed; commit, push, PR changes, merge and deployment each require the
   current request to authorize that exact action.
