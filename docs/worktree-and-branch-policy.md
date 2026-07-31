# Worktree and branch policy

## Repository identity

The working repository must satisfy both:

- origin: `https://github.com/Professor2080/poster-valley-kickoff-site.git`;
- package name: `poster-valley-kickoff-site`.

The similarly named parent repository is not a valid working root. Folder names alone are never
proof. The preflight compares a task-supplied absolute root and Git common directory, rejects
ambiguous/symlinked/junction paths, verifies the worktree registration and reports ancestor
repositories.

## Worktree roles

The version-controlled classification rules are in `scripts/tooling/worktree-policy.json`.

### Reference

- A normally clean, read-only baseline used for comparison and branch creation.
- Contains no product or tooling work.
- Cannot pass a change-mode preflight.
- Inspect mode may report an unexpected dirty state without altering it; a dirty reference must not
  be used for branch creation until a human resolves its ownership.
- `main` and `codex/rebuild-from-stable-main` are reference branches.

### Active

- The only role allowed for repository modifications.
- Uses one focused `codex/<topic>` branch, excluding reserved reference/archive patterns.
- Requires the intended absolute root, Git common directory and branch as explicit preflight
  inputs.
- Rejects detached HEAD and `main`.
- A pinned expected HEAD is required when the task/handover supplies one.
- Dirty state fails unless the current task explicitly continues those exact changes and passes
  `-ContinueExistingChanges`.

### Archive

- A read-only source retained for history or an intentionally frozen workstream.
- Cannot pass a change-mode preflight.
- Clean and dirty archives may pass inspect mode. A dirty inspection reports only status paths and
  never treats the changes as authorized for modification.
- Never reset, stash, clean, rebase, move or delete it to simplify another task.
- `archive/*`, `codex/archive-*` and explicitly registered frozen branches are archives.

## Active operating limits

These are forward operating limits, not permission to remove an existing worktree. Classify and
clean up older worktrees only in separate, owner-approved tasks after their state and provenance are
known.

| Worktree role | Maximum | Create when | Clean up when |
| --- | ---: | --- | --- |
| Clean reference | 1 | a verified, read-only `main` baseline is needed for comparison and branch creation | replace only after the successor is verified and the old reference is clean and unused |
| Active track A | 1 | the primary approved product/change workstream starts | after merge verification or an explicit abandonment decision, with clean/pushed state proven |
| Active track B | 1 | one intentionally parallel, independent workstream is approved | after merge verification or an explicit abandonment decision, with clean/pushed state proven |
| Temporary infrastructure | 1 | a separate environment, migration-history, secret-scope, hosting, backup or recovery task is approved | immediately after the infrastructure task is completed/abandoned and evidence ownership is resolved |

After a merge, retain the branch briefly for verification, then clean it up in a separate controlled
task. Temporary recovery and verification worktrees must not become permanent. Never commit
`.playwright-cli/`, `supabase/.temp/`, logs or temporary reports. Remove temporary output only after
the producing task is complete and its origin and required evidence have been established.

## Preflight contract

Expected values must come from the task, a trusted handoff or a separately verified reference; do
not calculate “expected” values from the worktree being tested.

```powershell
npm run preflight -- `
  -Role active `
  -ExpectedRoot "<absolute-active-worktree-path>" `
  -ExpectedCommonDirectory "<absolute-git-common-directory>" `
  -ExpectedBranch "codex/<topic>" `
  -ExpectedHead "<trusted-sha>" `
  -ContinueExistingChanges
```

Omit `-ExpectedHead` only after intentional local commits make the starting pin obsolete. Omit
`-ContinueExistingChanges` when a clean tree is required. `-SkipRemoteLookup` is an explicit
offline exception: it does not prove the live remote tip.

The preflight checks absolute/canonical root, Git common directory, worktree registration, role,
branch, detached state, optional HEAD pin, origin identity, cached and live `main`, upstream and
status. It is read-only. Pass `-Mode inspect` to inspect any role without mutating it; dirty inspect
mode reports status paths and succeeds. Change mode remains exclusive to active worktrees, and a
dirty active change still requires `-ContinueExistingChanges`.

## Creating work and upstream policy

1. Select a clean reference worktree.
2. Fetch refs only with `git fetch origin --prune`.
3. Record and verify `git rev-parse origin/main`.
4. Ensure the requested branch and path do not already exist.
5. Create `codex/<topic>` from the exact verified `origin/main`.
6. Leave the new branch without an upstream before its first push.
7. Verify the active contract before editing.

After an explicitly approved first push, the active branch may track only its equal remote branch:
`codex/<topic>` may track `origin/codex/<topic>`. An active feature branch must never track
`origin/main` or an unrelated branch. Do not use ordinary `git pull` until the upstream has been
verified.

One branch belongs to one worktree. A separate worktree is required when starting from a reference,
when another task has uncommitted work, when workstreams must remain isolated, or when the task
explicitly requires it. A small, explicitly authorized documentation correction may reuse an
already clean active worktree when its branch and scope match; it may never use a reference,
archive, protected or unrelated dirty worktree.

## Preservation and cleanup

- Uncommitted changes belong to their worktree owner.
- Capture protected branch, HEAD and short status before work and compare them at handoff.
- Stop if a target path/branch exists unexpectedly or a remote tip moves.
- Never delete a branch or worktree automatically.

Cleanup is a separate human-approved action only after:

1. the intended merge or abandonment decision is confirmed;
2. status is clean, including untracked files;
3. no unpushed commit remains;
4. the remote branch/PR disposition is known;
5. no other process or worktree uses the branch;
6. any archive requirement has been decided.

An old archive remains read-only until Pascal explicitly approves its removal. No cleanup script in
this foundation removes branches or worktrees.

Current freeze: A4 reporting/exports, migration-history repair and deterministic schema
verification remain untouched until a separate task resumes them.

## Publication

Editing does not authorize publication. Commit, push, Draft PR, merge and deployment each require
the authority stated in the current request. The normal path is:

`feature branch -> Draft PR -> quality-gate + production-dependency-audit -> Vercel Preview -> review -> merge`

Never force-push, delete a shared branch, bypass checks or develop directly on `main`.
