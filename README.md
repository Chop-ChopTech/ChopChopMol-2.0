# ChopChopMol — Frontend (`demo/`)

AI-powered 3D molecular design and quantum-chemistry platform. The frontend
is a vanilla HTML/JS app (no build step) that talks to a Flask backend over
SSE for streaming AI chat and MACE/DFT compute.

This repo is the **frontend**. The backend lives at
[`chopchopmol-ai-backend/`](../chopchopmol-ai-backend/).

## Branch convention — read this first

| Branch | Where it deploys | When to push |
|---|---|---|
| `dev` | `dev.chopchopmol.com` (S3 + CloudFront, dev backend) | All ongoing work lands here |
| `main` | `chopchopmol.com` (Vercel, prod backend) | Only after explicit human review |
| `publish-test` | staging | Rare |

Work merges first to `dev`, gets exercised against the dev stack, then is
promoted to `main` manually. **Never push directly to `main` / `prod` /
`publish-test`.**

## Architecture

```
                            ┌────────────────────────────────┐
   dev.chopchopmol.com ─→   │ CloudFront E351200SGLQFEA      │
                            │   ↓ OAC                        │
                            │ S3 chopchopmol-dev-frontend    │
                            │   ↑ deploy-dev-s3.yml workflow │
                            │     syncs demo/ on push to dev │
                            └────────────────────────────────┘
                                          │
                            HTTPS · fetch + SSE
                                          ↓
                            ┌────────────────────────────────┐
api-dev.chopchopmol.com ─→  │ Caddy (TLS via Let's Encrypt)  │
                            │   ↓                            │
                            │ Gunicorn + Flask in Docker     │
                            │ on EC2 spot (m6i.xlarge, CPU)  │
                            │ ECR image: …backend:latest     │
                            └────────────────────────────────┘
                                          │
                            Firebase Admin SDK
                                          ↓
                            ┌────────────────────────────────┐
                            │ Firebase project: chopchopmoldev│
                            │   Auth · Firestore · Hosting    │
                            └────────────────────────────────┘
```

Prod (`chopchopmol.com`) is a parallel pipeline:
- Frontend on **Vercel**, deployed from `main`
- Backend on **Render** (`chopchopmol-ai-backend.onrender.com`), deployed from `main` via `render.yaml` in the backend repo
- Auth on `chopchopmol-2` Firebase project

The dev stack is **fully isolated** from prod — different AWS resources,
different Firebase project, different domain. Nothing on the dev branch
can affect prod until someone explicitly promotes the change.

## Project structure (key files)

```
demo/
├── index.html              ~5400 LOC — full app HTML + inline JS (chat UI, SSE
│                                       parsing, tool rows, model picker,
│                                       BYOK modal, file rail, Firebase init)
├── main.js                 ~7970 LOC — Three.js scene, atom editing, viewport
├── aiagent.js              ~2860 LOC — AI agent: FUNCTIONS map, streamSSE
│                                       loop, compressToolResult, BYOK helpers
├── style.css               ~7460 LOC — all styling (dark theme, picker modal,
│                                       tool rows, force arrows, file rail)
├── atom/
│   ├── molecule.js         InstancedMesh atoms, bonds, labels, force arrows
│   ├── atom.js / bond.js   Data classes
├── utils/
│   ├── apiUtils.js         getBackendUrl, safeFetch, streamSSE (+ retry/abort)
│   ├── maceUtils.js        callMaceEnergy/Optimize/MD, callDftEnergy, device toggle
│   ├── fileHandler.js      Parse XYZ / ExtXYZ / PDB / CIF / MOL / Cube / Molden
│   ├── fileWriter.js       Export XYZ / ExtXYZ / MOL / PDB / CIF / GRO / PQR / MOL2
│   ├── orbitalUtils.js     Marching Cubes for Cube files
│   ├── scanUtils.js        Rotational / translation / angle scans
│   ├── errorHandler.js     window.__errors + recordError helper
│   └── …
├── fileExplorer.js         Web File System API + Firebase Firestore cloud files
├── handleFeatures.js       Labels, force arrows, charge viz, ribbon toggles
├── handleStyles.js         Ball-and-stick, space-fill, wireframe
└── firebase.json           Hosting config + CSP headers

tests/
├── test_frontend.py        Python pytest — DOM + JS regression assertions
├── ai-tests.js             Node script — AI agent integration against backend
└── …

.github/workflows/
├── deploy-dev-s3.yml       Push to `dev` → sync demo/ to S3 + invalidate CF
├── firebase-hosting-dev.yml  Manual rollback to chopchopmoldev.web.app
├── firebase-hosting-merge.yml  Prod (chopchopmol-2)
└── firebase-hosting-pull-request.yml  Preview channels
```

See `CLAUDE.md` (in this directory) for deeper architecture notes —
state model, AI tool layers, SSE protocol, MACE integration, file parsers,
coordinate scale factor, etc.

## Local development

No build step. Serve `demo/` as a static directory and point it at any
backend.

```bash
# 1. From repo root:
cd demo && npm install     # Only pulls Firebase SDK
python3 -m http.server 8000
# Open http://localhost:8000/demo/

# 2. Backend: either run locally (see ../chopchopmol-ai-backend/README.md)
#    or point at the dev backend by hitting api-dev.chopchopmol.com.

# 3. Switch backend manually: press `\` five times in the app to cycle
#    between RunPod / Render / Local / dev.
```

The frontend auto-detects which backend to call based on hostname:
- `dev.chopchopmol.com` / `chopchopmoldev.*` / `localhost` → `api-dev.chopchopmol.com`
- `chopchopmol.com` (prod) → `chopchopmol-ai-backend.onrender.com`
- Override via `\\\\\\` keystroke or `setBackendOverride()` in console

Hostname detection lives in `demo/utils/apiUtils.js` (`getBackendUrl()`).

## Testing

Pytest hits the rendered HTML + JS files as text and asserts the shape of
the UI hasn't regressed. **No browser needed** — these run in <1 second.

```bash
# From repo root:
/opt/homebrew/bin/python3.11 -m pytest tests/test_frontend.py -v
# Expect: 73 passed
```

Notable test classes (see `tests/test_frontend.py`):

| Class | Asserts |
|---|---|
| `TestXSSPrevention` | DOMPurify wraps every `marked.parse → innerHTML` |
| `TestLandingValueProp` | "Design molecules with AI" headline + subtext present |
| `TestSimplifiedPicker` / `TestSingleModelDropdown` | Picker has exactly 1 option (Auto / Llama-Groq); BYOK hint present; FALLBACK_MODEL is Llama |
| `TestSSEErrorBoundary` | `streamSSE` wraps per-event handlers in try/catch + has exponential-backoff retries |
| `TestThreeJsDisposalRace` | `Molecule._disposalInProgress` guard prevents double-dispose |
| `TestComputeDeviceToggle` | CPU/GPU toggle exists + persists + every MACE/DFT call injects `device` |
| `TestGroqReducedToolsetNotice` | Trigger badge shows "27/59 tools" for Groq models |
| `TestNoStaleBackendUrls` / `TestAuthHeadersUnconditional` | No hard-coded dead Render URLs; auth headers unconditional |
| `TestChatErrorCard` | Friendly Retry/Show-details card for backend failures; 30-120s connect timeout |
| `TestDevFirebaseProjectIsolation` | Dev frontend signs into `chopchopmoldev`, not prod `chopchopmol-2` |
| `TestChatComposerNoGrammarly` | Chat textarea opts out of Grammarly's overlay |

Most tests are TDD — they're designed to fail before a fix lands and lock
in the fix after.

## Deployment

### Dev (this branch)

**Automatic on push to `dev`.** GitHub Actions
(`.github/workflows/deploy-dev-s3.yml`):

1. Checkout `dev`
2. `aws s3 sync demo/ s3://chopchopmol-dev-frontend/ --delete`
3. `aws cloudfront create-invalidation --paths "/*"`

Requires three repo secrets (already configured):
- `AWS_ACCESS_KEY_ID` / `AWS_SECRET_ACCESS_KEY` — IAM user
  `github-actions-chopchopmol-dev-frontend`, scoped to PutObject /
  DeleteObject on this bucket + CreateInvalidation on this distribution
- `CLOUDFRONT_DISTRIBUTION_ID` = `E351200SGLQFEA`

Manual sync (if you want to skip the GHA round-trip):
```bash
AWS_PROFILE=chopchopmol aws s3 sync demo/ s3://chopchopmol-dev-frontend/ \
  --delete --cache-control "public, no-cache" \
  --exclude ".DS_Store" --exclude "node_modules/*"
AWS_PROFILE=chopchopmol aws cloudfront create-invalidation \
  --distribution-id E351200SGLQFEA --paths "/*"
```

### Rollback (dev)

If a `dev` deploy breaks `dev.chopchopmol.com`:

1. Cloudflare: change `dev.chopchopmol.com` CNAME from
   `d29u421gc7m3rh.cloudfront.net` → `chopchopmoldev.web.app`
2. Wait 1-2 min for DNS TTL (300s)
3. Traffic resumes on the Firebase Hosting target, which still has the
   last `firebase-hosting-dev.yml` deploy.

You can also run the Firebase workflow manually
(`.github/workflows/firebase-hosting-dev.yml`) to push a fresh build
there before the DNS swap.

### Prod

**Not done from this repo's `dev` branch.** Merge `dev → main` via PR
review, then prod (`chopchopmol.com` on Vercel) picks up the change on
the next Vercel deployment.

## Authentication

The dev frontend signs users into the **`chopchopmoldev`** Firebase
project (not prod's `chopchopmol-2`). Hostname-based switch lives in
`demo/index.html` near the `firebaseConfig` block.

| Provider | Status |
|---|---|
| Email / password | Enabled. Test user: `qa-test@chopchopmol.dev` |
| Google sign-in | Enabled. Origin `dev.chopchopmol.com` allowlisted in chopchopmoldev's authorized domains |
| Founder accounts (`sanjay@`, `nguyen@`, `buu@`) | Provisioned with `admin+founder+tier=premium` claims; passwords in AWS Secrets Manager |

The backend verifies tokens against the same `chopchopmoldev` project via
its Admin SDK service account at `/app/fb-sa.json`. If the audiences
mismatch (e.g., frontend signs into `chopchopmol-2` by mistake), every
authed request returns 401.

## BYOK (Bring Your Own Key)

The picker only shows one model (Groq Llama 3.3 70B free tier). Users
who want Claude or GPT click the **key icon** in the AI Assistant header
and paste their own Anthropic / OpenAI API key. The key is stored only
in `localStorage` (`chopchop_byok_anthropic` / `chopchop_byok_openai`)
and attached to outbound requests as `X-User-Anthropic-Key` /
`X-User-OpenAI-Key` headers.

The backend creates per-request SDK clients from those headers — so the
server never holds the user's token. This keeps ChopChopMol's hosted
token spend at zero for power users on paid providers.

## Common operations

| What | Where |
|---|---|
| Add a new AI tool | Backend `TOOLS_JSON` + frontend `aiagent.js FUNCTIONS` + `toolIconMap` in `index.html`. See `CLAUDE.md` "Adding a New AI Tool". |
| Change default model | `FALLBACK_MODEL` constant near the model picker init in `demo/index.html`. |
| Restrict a provider for non-BYOK users | Set `RESTRICTED_PROVIDER` const in `demo/index.html` to `'claude'` or `'openai'`. |
| Switch which backend dev points at | Override via `\\\\\\` keystroke (cycles RunPod → Render → Local) or via `setBackendOverride(url)` in console. Cleared by `setBackendOverride(null)`. |

## Where to look when things break

| Symptom | Most likely cause | Where to start |
|---|---|---|
| "Couldn't reach AI backend" toast | `api-dev.chopchopmol.com` down OR Groq taking >60s to TTFT | `curl https://api-dev.chopchopmol.com/health` from your laptop |
| Auth says "Email or password is incorrect" | Frontend signing into wrong Firebase project | `index.html` `firebaseConfig` should be `chopchopmoldev` on dev hosts |
| Backend returns 401 with valid Firebase token | Backend's Firebase Admin SDK can't verify token (wrong project SA OR `/app/fb-sa.json` missing) | SSM into the EC2 spot, `docker logs chopchopmol | grep -i firebase` |
| Tool call succeeds but second turn fails | Likely the toolResults validator bug (fixed in backend `c7a309b`) | Check backend HEAD includes that commit |
| Lost progress after spot recycle | `:latest` ECR image out of date | Trigger an ECR rebuild via `docker buildx ... --push`, or wire CI |
| Cloud panel says "Sign in to use cloud storage" while signed in | Firebase auth state not propagating | Recent fix `4f84212` should have addressed this |

## Pointers to deeper docs

- `CLAUDE.md` — full architecture reference (state model, SSE protocol, tool layers, MACE/DFT integration, file parsers)
- `CHANGELOG.md` — every `dev`-bound change since the AWS migration
- `tests/test_frontend.py` — TDD specs for every UX guarantee
- Backend repo `chopchopmol-ai-backend/README.md` — server-side architecture, deployment runbook
