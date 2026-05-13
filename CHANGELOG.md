# Changelog — ChopChopMol 2.0 (frontend)

All notable changes to the frontend live here. The branch convention is that
work merges first to `dev`, gets verified at `chopchopmoldev.web.app`, and
only then promotes to `main` (which deploys to `chopchopmol.com`).

The format is loosely based on [Keep a Changelog](https://keepachangelog.com/).

## [Unreleased] — `dev`

### Infrastructure — dev frontend moved to AWS S3 + CloudFront
- `https://dev.chopchopmol.com` is now served from CloudFront distribution
  `E351200SGLQFEA` (alias `d29u421gc7m3rh.cloudfront.net`) in front of S3
  bucket `chopchopmol-dev-frontend` (us-east-1). ACM cert
  `arn:aws:acm:us-east-1:099554283476:certificate/4b35cfee-b9ca-413b-9f0e-41e61e6e3d66`
  issues TLS for the alias. The S3 bucket is private — only the CloudFront
  OAC can `GetObject`.
- New workflow `.github/workflows/deploy-dev-s3.yml` syncs `demo/` to the
  bucket and invalidates `/*` on every push to `dev`. Three repo secrets
  back it: `AWS_ACCESS_KEY_ID`, `AWS_SECRET_ACCESS_KEY`
  (IAM user `github-actions-chopchopmol-dev-frontend`, scoped to
  `s3:PutObject`/`s3:DeleteObject` on this bucket + `cloudfront:CreateInvalidation`
  on this distribution — least-priv), and `CLOUDFRONT_DISTRIBUTION_ID`.
- SPA fallback wired: CloudFront serves `/index.html` with HTTP 200 for both
  403 and 404 from S3, so client-side routes don't break.
- Cloudflare DNS: `dev.chopchopmol.com` is now a **DNS-only** (gray-cloud)
  CNAME → `d29u421gc7m3rh.cloudfront.net`. DNS-only on purpose for now —
  rules out Cloudflare's CDN layer when debugging. Flip to proxied later
  if we want Cloudflare's edge caching too.
- Prod (`chopchopmol.com` on Vercel) is untouched. The previous Firebase
  Hosting target `chopchopmoldev.web.app` is also untouched and remains a
  hot rollback path. The old `firebase-hosting-dev.yml` workflow still
  runs on every push to `dev` — both deploys happen in parallel; only the
  S3+CloudFront one is what `dev.chopchopmol.com` resolves to.

**Rollback runbook (3 steps):**
1. In Cloudflare, change the `dev.chopchopmol.com` CNAME back to
   `chopchopmoldev.web.app` (or whatever the Firebase Hosting target was).
2. Wait 1-2 min for DNS TTL (currently 300s).
3. Firebase Hosting is still running, so traffic resumes there. Disable
   the AWS deploy workflow at the same time if you want to stop syncing.

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
