# Development workflow

## Baseline and identity

This repository is `Professor2080/poster-valley-kickoff-site`, package
`poster-valley-kickoff-site`. It is not the similarly named parent repository. `main` is the sole
Production source.

Start every task with the explicit contract from the task or trusted handoff:

```powershell
npm run preflight -- `
  -Role active `
  -ExpectedRoot "<absolute-active-worktree-path>" `
  -ExpectedCommonDirectory "<absolute-git-common-directory>" `
  -ExpectedBranch "codex/<topic>" `
  -ExpectedHead "<trusted-sha>"
```

Add `-ContinueExistingChanges` only when the current task explicitly resumes the already-present
changes. The command validates canonical root/common-directory/worktree identity, role, remote,
package, branch, detached state, optional HEAD pin, upstream, cached `origin/main`, live read-only
remote `main` and status. It performs no remote write and prints no environment values. Use
`-SkipRemoteLookup` only for an explicitly offline inspection.

For a read-only review, pass `-Mode inspect`. Inspect mode may report a dirty active, reference or
archive worktree without requiring `-ContinueExistingChanges`; it prints only Git status paths and
does not reset, stash, clean, checkout or otherwise mutate the worktree. Change mode remains
restricted to the active role and retains its explicit dirty-tree authorization.

## Normal change path

1. Fetch refs only with `git fetch origin --prune`.
2. Verify the expected `origin/main` SHA and a clean reference worktree.
3. Create a focused `codex/<topic>` branch and separate worktree from that exact SHA.
4. Read `AGENTS.md` and the documents linked from it.
5. Make only the approved change; preserve unrelated and protected worktrees.
6. Run `npm run verify -- <the same active-worktree contract arguments>`.
7. Review the complete diff and prove that out-of-scope files did not change.
8. Stop uncommitted unless the current request explicitly authorizes a commit.
9. When authorized: focused commit, push, Draft PR, CI, Vercel Preview, human review, then a
   separately approved merge.

Never develop directly on `main`. Never treat permission to edit as permission to commit, push,
open/update a PR, merge or deploy.

## Local verification

`npm run verify -- <contract>` is PowerShell-friendly and runs:

- repository preflight;
- `npm ci`;
- lint;
- all Node tests;
- production build;
- unstaged and staged local `git diff --check`;
- conflict-marker and trailing-whitespace checks;
- tracked-secret and browser-environment-access checks;
- Vercel function budget;
- environment-key policy.
- skill-governance, link and Staging-MCP documentation checks.

Use `npm run verify -- -SkipInstall` only after a successful `npm ci` in the same worktree. The
verification path has no database, Supabase, email, payment or deployment step.

To compare environment key names without printing values:

```powershell
npm run env:audit -- --names-file .env.names --environment preview
```

The input may contain `KEY` or `KEY=value`; only the key names are retained or printed. Keep
`.env.names` untracked. Missing required names fail by default. `--allow-missing` is an explicit
inventory-only mode and does not prove a valid environment.

The secret scan is defense-in-depth, not proof that every possible credential encoding is absent.
It detects known token formats, credential-bearing database URLs, contextual sensitive
assignments, and common browser-exposure patterns. A synthetic marker never skips a line or known
credential pattern; it is accepted only with a narrow, unambiguous placeholder in approved
documentation or tooling-test paths. In client code, the only permitted environment reads are
exact direct dot accesses to `import.meta.env.VITE_SUPABASE_URL` and
`import.meta.env.VITE_SUPABASE_PUBLISHABLE_KEY`. Every other executable `import.meta.env` form and
every executable `process.env` source fail closed; comments and string-only examples are ignored.
Full Unicode property identifiers are consumed before exact allowlist comparison. Parenthesized
sources, optional chaining and bracket/computed access are forbidden. This deliberately local
syntax-token convention avoids relying on incomplete JavaScript dataflow analysis; it is not a
cross-file or runtime dataflow proof. Review the complete diff and provider-side secret controls
separately.

The Vercel budget treats non-underscore `.js`, `.mjs`, `.cjs`, `.ts`, `.mts` and `.cts` files under
`api/` as deployable entrypoints, including nested routes. Underscore-prefixed modules and TypeScript
declaration files are helpers. Any other file form under `api/` fails closed until explicitly
classified.

Local and CI whitespace checks use different evidence. Local verification checks staged and
unstaged worktree changes; the repository text scan covers untracked text. CI fetches full history
and checks every commit plus the final PR/push range, so it never relies on an empty checkout diff.

## Reproducible tools

- Runtime target: Vercel Node `24.x`; the reviewed local and CI toolchain is exactly Node
  `24.18.0`.
- Package manager: exactly npm `11.16.0`; CI activates and asserts it before `npm ci`.
  `packageManager` is a tooling signal, while the version check is enforcement. `package-lock.json`
  lockfile version 3 is authoritative.
- Vercel CLI: use an exact project-local invocation such as `npx --yes vercel@56.3.1 --version`
  when a future approved task needs the CLI. Do not silently use `latest` or upgrade the global
  installation.
- Supabase CLI: it is currently absent. The official npm installation is a pinned project
  devDependency (`npm install --save-dev --save-exact supabase@<reviewed-version>`) invoked with
  `npx supabase`. Adding it and initializing a local stack are a separate approved work block.
- Codex CLI: `codex-cli 0.145.0` was observed. Check with `codex --version`,
  `codex mcp list`, and `codex plugin list`; do not install or authenticate a provider implicitly.

The pinned numbers record the verified foundation, not an evergreen upgrade policy. Review release
notes and the complete lockfile diff before changing them.

## Agent workflows

Codex officially discovers repository skills under `.agents/skills`. This repository currently
contains three reviewable drafts:

- Poster Valley Preflight;
- Poster Valley Safe Change;
- Poster Valley Release Gate.

Their implicit invocation remains disabled until owner review and regression-test approval. They
point back to `AGENTS.md` and these documents rather than copying policy. No Production MCP is
configured. See the [skill register and governance policy](skills/README.md).
