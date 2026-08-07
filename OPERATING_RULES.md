# Operating rules

These rules protect product focus, security, and AI spend. They apply before implementation, not
only during retrospectives.

## Architecture gate

Start every technical work block by stating:

1. the concrete customer, operator, or business outcome;
2. whether the work is product value, necessary maintenance, tooling/infrastructure, or rework;
3. the managed provider capability considered before any custom mechanism;
4. the permanent complexity being added or removed;
5. the stop condition and maximum bounded attempt count.

If these five points cannot be answered concisely, pause and clarify the work before editing.

## Mandatory stop rules

Stop the current approach and present alternatives when any condition occurs:

- the same approach fails twice;
- two consecutive pull requests or work blocks add no direct product value;
- one ordinary operation crosses more than three custom process/tool boundaries;
- a wrapper, launcher, shim, probe, or bespoke service is proposed without comparison to a managed
  standard capability;
- tooling and infrastructure exceed 15% of capacity across a representative four-week window
  without Pascal's explicit approval;
- work no longer advances the current milestone in [PROJECT_STATE.md](PROJECT_STATE.md);
- remote credentials would need to travel through an AI session when CI or a provider integration
  can own the boundary.

A stop does not authorize weakening security. It requires a simpler safe design.

## Alternatives review

When a stop rule triggers, report:

- the first unnecessary complexity boundary;
- evidence from the failed attempts or recent work;
- at least two alternatives, including a managed standard capability when available;
- migration/reversal cost, security impact, ongoing maintenance, and expected product delay;
- one recommended reversible decision.

Do not create another diagnostic layer before this review is accepted.

## Capacity and AI-cost control

Use observable work items as the default proxy when exact token or credit data is unavailable.

- Target at least 85% product value plus necessary maintenance over four weeks.
- Treat repeated prompt refinement, review-on-review loops, and toolchain repair as rework.
- Reuse already proven facts while relevant code and infrastructure are unchanged.
- Run checks proportional to the diff.
- Prefer one coherent work block and one review round over chains of microtasks.
- Report exact AI cost only when authoritative usage data is available; never invent it.

## Work classification

| Class | Meaning | Default |
| --- | --- | --- |
| Product value | Direct customer/operator/business outcome | Continue |
| Necessary maintenance | Required security, reliability, compliance, or dependency work | Bound tightly |
| Tooling/infrastructure | Enables later work but adds no direct user value | Keep below threshold |
| Rework | Repeats or repairs a failed approach | Trigger review quickly |

## Weekly stewardship

The Project Architecture Steward is read-only. It reviews recent repository evidence and reports:

- `GREEN`: no material drift; no notification required for a scheduled run;
- `ORANGE`: credible trend toward waste, complexity, stale decisions, or plan limits;
- `RED`: a mandatory stop rule is met.

It may recommend exactly one next action. It may not change files, settings, branches, pull requests,
deployments, databases, email, or payments.

## Decision ownership

Pascal approves:

- architecture/provider changes;
- exceptions to stop rules or capacity limits;
- Production actions;
- merges and releases;
- any continuation after a RED stewardship finding.

An agent may gather evidence and recommend. It may not silently grant an exception.
