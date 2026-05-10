# Changelog — ChopChopMol 2.0 (frontend)

All notable changes to the frontend live here. The branch convention is that
work merges first to `dev`, gets verified at `chopchopmoldev.web.app`, and
only then promotes to `main` (which deploys to `chopchopmol.com`).

The format is loosely based on [Keep a Changelog](https://keepachangelog.com/).

## [Unreleased] — `dev`

### Reliability / Observability
- **SSE error boundaries.** `streamSSE` in `demo/utils/apiUtils.js` now wraps
  per-event handler invocations in try/catch — one bad frame can no longer
  kill the entire stream. Added optional transport-level retries with
  exponential backoff (`{ retries }` option). 4xx and aborted streams skip
  retry to avoid replaying user-cancelled or auth-rejected calls.
- **Global error log.** `demo/utils/errorHandler.js` now mirrors every
  unhandled error and rejection to a capped (`MAX_ERRORS = 100`)
  `window.__errors` array, and exposes `window.recordError(kind, info)` so
  callers can log their own caught errors. Useful for QA: ask a user to
  paste `JSON.stringify(window.__errors)` from the console after a repro.

### Bug fixes
- **Three.js disposal race.** `Molecule._disposalInProgress` flag prevents
  `reset()` from running twice in parallel (which would double-dispose
  geometries and emit WebGL warnings or null material crashes). Mutators
  that touch the scene graph (`createForceArrows`) now bail when disposal
  is in progress.

### Engineering hygiene
- Added regression tests for the above:
  `TestSSEErrorBoundary`, `TestGlobalErrorLog`, `TestThreeJsDisposalRace`.
  18/18 tests passing in `tests/test_frontend.py`.

## 2026-05-09 — `dev` (commit `34bf713`)

### Security
- **P0** — XSS via `marked.js`. All `marked.parse() → innerHTML` assignments
  now wrapped in `DOMPurify.sanitize(...)` with an explicit allowlist of
  HTML tags. Prevents prompt-injection XSS from AI responses.

### UX
- Landing card: added value-proposition headline + descriptive subtext.
- Chat input placeholder is now molecule-specific (not "Ask me anything").
- Increased AI model trigger contrast with a visible border.
- Footer attribution: "ChopChopMol 2.0 · Powered by Claude AI & MACE".
- Toolbar divider opacity 0.1 → 0.2 for better visibility.
- Model picker title: "Choose Model & Thinking Mode".
