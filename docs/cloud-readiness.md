# Codex Cloud development readiness

This repository is the Poster Valley Kickoff site. The Admin Dashboard will
initially be developed in this repository.

Codex Cloud supports background development independently of a local computer.
The standard development checks are:

```sh
npm ci
npm run lint
npm test
npm run build
```

Production secrets must not be added to routine development tasks. No task may
deploy production, send customer email, or start a live Mollie payment without
explicit approval.
