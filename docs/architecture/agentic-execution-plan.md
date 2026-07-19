# Agentic execution plan

Codex Cloud can execute a single task in an isolated runtime and produce a branch/PR; this task’s environment exposes no durable external task supervisor or local Git remote. Therefore do not represent one task as autonomously creating, monitoring and merging independent implementation workers. Pascal starts each approved Cloud task, supplies its brief, and reviews its draft PR. A coordinator later resolves integration.

Parallel only after contract freeze: backend foundation, frontend shell with mocks (not real integration), Woo research spike, and QA/threat review. Sequential: ADR approval -> backend schema/API migrations -> real UI writes/email/shipping/fulfilment -> reports; Woo spike -> human hosting/provisioning approval -> staging/install/test -> release. One branch/PR per workstream prevents shared-directory collisions. Local `git worktree` is optional for humans; separate Cloud branch/PR runs are the relevant isolation mechanism.
