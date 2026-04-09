# CLAUDE.md

This file provides guidance to Claude Code (claude.ai/code) when working with code in this repository.

## Project Overview

ChopChopMol 2.0 is a web-based 3D molecular visualization and AI-powered editing platform. Users visualize molecular structures in Three.js, then manipulate them via natural language commands powered by Claude AI with MACE machine learning potentials for energy calculations and PySCF/GPU4PySCF for DFT calculations.

## Repository Layout

This is a **two-repo** setup:

- **Frontend** (`demo/`): Vanilla HTML/JS app (no build step, ES6 modules, Three.js)
- **Backend** (separate repo at `chopchopmol-ai-backend/`): Python Flask server for Claude AI proxy, MACE ML calculations, DFT calculations, MACE fine-tuning, and Python code execution

The frontend is a static site deployed to Firebase Hosting. The backend deploys to Render.com via `render.yaml` and RunPod GPU via Docker (`Dockerfile` + `deploy.sh` + `start.sh`).

**Reference repos** (read-only, for copying patterns — do NOT modify):
- `ChopChopMol 3.0/` — Next-gen frontend (FastAPI-based patterns, streaming tools)
- `ChopChopMol Backend/` — Next-gen backend (native torch_geometric batching, streaming MD, FastAPI+Uvicorn). The working backend is `chopchopmol-ai-backend/`, not this one.

### Frontend File Structure

| File | Lines | Purpose |
|------|-------|---------|
| `demo/main.js` | ~7970 | Main controller: molecule lifecycle, pointer/keyboard handlers, camera, rendering loop, atom editing, viewport management |
| `demo/index.html` | ~5400 | Full app HTML + inline JS for chat UI, SSE parsing, tool row rendering, thinking blocks, chart rendering, file attachments, conversation persistence |
| `demo/style.css` | ~7460 | All styles: 3D viewport, chat panel, tool rows, file explorer, modals, force arrows, orbital viewer |
| `demo/aiagent.js` | ~2860 | AI agent: `FUNCTIONS` object (58 tool implementations), `streamChat()` SSE loop, `compressToolResult()`, `getMoleculeState()`, cache warmup |
| `demo/atom/molecule.js` | ~2230 | Molecule class: InstancedMesh atoms, bonds, labels, force arrows, frame animation, draw/dispose |
| `demo/atom/atom.js` | 20 | Atom class: position, element, selection state |
| `demo/atom/bond.js` | 8 | Bond class: cylinder geometry, half-bond coloring |
| `demo/fileExplorer.js` | ~2000 | File explorer panel: Web File System API, cloud saves (Firebase), IndexedDB persistence, text editor, drag-drop |
| `demo/remoteFiles.js` | ~660 | SSH/SFTP remote file browser via backend paramiko proxy |
| `demo/handleFeatures.js` | ~500 | Feature toggles: labels, force arrows, charge visualization, ribbon |
| `demo/handleStyles.js` | ~450 | Atom rendering styles: ball-and-stick, space-fill, wireframe |
| `demo/utils/fileHandler.js` | ~2250 | File parser: XYZ, ExtXYZ, PDB, CIF, MOL/SDF, MOL2, PQR, GRO, CML, ORCA OUT, Cube, Molden + Bohr auto-detection |
| `demo/utils/fileWriter.js` | ~500 | File export: XYZ, ExtXYZ, MOL/SDF, PDB, CIF, GRO, PQR, MOL2 |
| `demo/utils/orbitalUtils.js` | ~860 | Marching Cubes isosurface generation for Cube file volumetric data |
| `demo/utils/moldenOrbitalUtils.js` | ~470 | Molden orbital rendering: volume/mesh decompression, Three.js mesh creation |
| `demo/utils/maceUtils.js` | ~300 | MACE/DFT helpers: `callMaceEnergy`, `callMaceEnergyBatch`, `callMaceOptimize`, `callMaceMD`, `callDftEnergy`, `callDftEnergyBatch`, `streamMaceSSE`, ExtXYZ generation, force merging |
| `demo/utils/scanUtils.js` | ~280 | Scan generators: rotational, angle, translation scans |
| `demo/utils/frameUtils.js` | ~120 | Frame slider setup, `loadFrames()`, `generateTransformFrames()` |
| `demo/utils/graphUtils.js` | ~100 | Molecular graph: `buildAdjacencyList()`, `findConnectedFragment()`, `findFragmentAvoidingVertex()` |
| `demo/utils/undo.js` | ~260 | Undo/redo via UndoManager: deep-copies molecule state, 30-action limit |
| `demo/utils/ribbon.js` | ~310 | Protein ribbon rendering from backbone CA atoms |
| `demo/utils/utils.js` | ~430 | Common utility functions |
| `demo/utils/stripe.js` | ~110 | Stripe payment integration |
| `demo/utils/marchingCubesWorker.js` | ~330 | Web Worker for marching cubes (parallel isosurface) |
| `demo/utils/apiUtils.js` | ~225 | `safeFetch()` wrapper, `getBackendUrl()` with RunPod→Render→Local auto-detection, `postJson()`, `retryFetch()` |
| `demo/utils/domUtils.js` | ~116 | DOM helper utilities |
| `demo/utils/errorHandler.js` | 38 | Global error handler |
| `demo/utils/toast.js` | ~100 | Toast notification system |
| `demo/utils/atomSettings.json` | | Per-element atom radii, colors, covalent radii |

### Backend Structure

| File | Lines | Purpose |
|------|-------|---------|
| `chopchopmol-ai-backend/app.py` | ~3630 | Single Flask app: AI chat proxy, MACE endpoints, DFT endpoints, MACE fine-tuning, Python execution, orbital calculations, SSH/SFTP, job management, Tavily search |
| `chopchopmol-ai-backend/render.yaml` | 10 | Render.com deployment config |
| `chopchopmol-ai-backend/requirements.txt` | 17 | Python deps: Flask, PyTorch, ASE, MACE, PySCF, GPU4PySCF, dftd3, dftd4, paramiko, orjson, httpx, cuequivariance |
| `chopchopmol-ai-backend/Dockerfile` | 45 | Docker image for RunPod GPU (CUDA 12.4, Python 3.11) |
| `chopchopmol-ai-backend/deploy.sh` | 29 | Docker build & push helper script |
| `chopchopmol-ai-backend/start.sh` | 37 | Container startup: SSH setup, env vars, Gunicorn launch |

## Development Commands

### Frontend

```bash
cd demo && npm install              # Install dependencies (Firebase SDK only)
python -m http.server 8000          # Serve locally, then visit http://localhost:8000/demo/
npm run test:ai                     # AI agent tests against production backend
npm run test:ai:local               # AI agent tests against localhost:10000
firebase deploy                     # Deploy to Firebase Hosting (project: chopchopmol-2)
```

### Backend

```bash
cd chopchopmol-ai-backend
python -m venv venv && source venv/bin/activate
pip install -r requirements.txt
export ANTHROPIC_API_KEY="..." OPENAI_API_KEY="..."
python app.py                       # Dev server on port 10000
gunicorn app:app --workers 1 --threads 4 --timeout 600 --preload  # Production (Render)
# RunPod: start.sh handles SSH + Gunicorn without --preload (CUDA init in worker)
```

No linter, formatter, or build toolchain is configured for either component.

## Architecture

### Global State Model

All state lives on `window` (no framework, no state library):

- `window.main` - Main controller instance (single singleton)
- `window.molecule` / `window.main.molecule` - Current Molecule instance (atoms, bonds, Three.js meshes)
- `window.scene`, `window.camera`, `window.renderer` - Three.js objects
- `window.atomsSelected[]` - Currently selected atom indices (0-based), delegated via `Object.defineProperty`
- `window.xyzFrames` - Multi-frame trajectory data (array of `{atomData, numAtoms, comment, energy}`)
- `window.frameEnergies` - Energy values aligned 1:1 with `xyzFrames`
- `window.frameMetadata` - Per-frame metadata (lattice, virial, stress, pbc, etc.)
- `window.lastMaceResults` - Cached MACE energy/force results for charting
- `window.fileExplorer` - File explorer instance (Web File API)
- `window.undoManager` - Undo/redo manager (30-action stack)
- `window.rotationAxis`, `window.axisAtoms` - Defined rotation axis for scans
- `window.forceArrowScale` - Scale factor for force arrow visualization
- `window.orbitalData`, `window.moldenData` - Orbital visualization data
- `window.finetunedModels` - Locally cached fine-tuned model names
- `window._thinkingBudget` - Extended thinking token budget (0/4096/10000/32000)
- `window._loadedConversationContext` - Injected prior conversation context for continuity
- `window.attachFileToChat` - Function to programmatically attach files to chat input
- `window.THREE` - Three.js library reference
- `window.currentUser`, `window.currentUserEmail` - Firebase auth state

### AI Agent Flow

1. User types natural language command in chat (optionally with file attachments)
2. `aiagent.js` sends message + molecule state to Flask backend via SSE (`POST /ai/chat/stream`)
3. Backend builds system prompt with dynamic STATE line, calls Claude API or OpenAI with 59 tool definitions
4. Backend streams SSE events to frontend: `text`, `thinking_start/thinking/thinking_done`, `tool_status`, `tool_delta`, `tool_calls`, `done`, `error`
5. `aiagent.js` executes tool functions locally **in parallel** via `Promise.all()` (they manipulate `window.molecule`, DOM, Three.js)
6. Results compressed via `compressToolResult()` with auto-injected `NEXT_STEPS` composability hints, sent back to backend
7. Loop continues (max 10 iterations) until AI responds with text only (no tool calls)

**Tool counts**: 59 schemas in backend `TOOLS_JSON`, 58 frontend `FUNCTIONS` implementations (`add_hydrogens` has schema but no frontend impl).

### AI Tool Layers (compose bottom-up)

| Layer | Tools | Purpose |
|-------|-------|---------|
| L1 QUERY | `get_molecule_info`, `get_atom_info`, `get_bonded_atoms`, `measure_distance`, `measure_angle`, `measure_dihedral`, `get_cached_energies`, `web_search`, `read_file`, `list_folder_files` | Read-only, no side effects |
| L2 SELECT | `select_atoms`, `select_atoms_by_element`, `select_all_atoms`, `select_connected`, `clear_selection` | Set context for L3 |
| L3 EDIT | `add_atom`, `remove_atoms`, `change_atom_element`, `set_bond_distance`, `set_angle`, `set_dihedral_angle`, `transform_atoms`, `split_molecule`, `add_hydrogens` | Modify molecule |
| L4 GENERATE | `rotational_scan`, `translation_scan`, `angle_scan`, `calculate_energy`, `calculate_dft_energy`, `calculate_all_energies`, `calculate_all_dft_energies`, `optimize_geometry`, `run_md`, `load_molecule`, `finetune_model`, `list_finetuned_models` | Create frames/data, train models |
| L5 OUTPUT | `create_chart`, `save_file`, `save_image`, `create_file`, `edit_file`, `execute_python` | Present results |
| L6 VIEW | `toggle_labels`, `toggle_force_arrows`, `toggle_charge_visualization`, `toggle_ribbon`, `set_style`, `show_all_bond_lengths`, `remove_bond_label`, `clear_measurements`, `reset_camera`, `zoom_to_fit`, `rotate_camera`, `define_axis`, `remove_axis`, `create_fragment`, `isolate_selection`, `undo`, `redo` | Non-destructive |

### AI Chat UI

The chat panel (`demo/index.html` inline JS + `demo/style.css`) uses a modern flowing layout:

- **Full-width messages** with labels ("You" / "ChopChopMol"), no chat bubbles
- **Extended thinking**: Collapsible block with live timer, auto-collapses when done. User-configurable budget (Off/Low/Med/High) persisted in localStorage. Hidden for GPT models.
- **Stacked tool rows**: Each tool call gets its own row with icon, label, spinner/checkmark, and expandable details. `execute_python` rows auto-expand to show live code streaming via `tool_delta` SSE events.
- **Inline permission (Cursor-style)**: `execute_python` shows an inline Allow/Deny bar inside the tool row (not a modal overlay). The tool row turns amber, spinner swaps to shield icon, and compact buttons appear below the code preview.
- **Flowing text layout**: Text and tool rows are appended to `contentEl` in chronological order. When text arrives after a tool call, a new `.ai-response-text` block is created.
- **Stop button**: Send button swaps to stop icon during streaming, calls `AIAgent.abort()` via AbortController.
- **Inline charts**: Chart.js `<canvas>` elements rendered from `create_chart` tool results via `chart_ready` SSE event. Toolbar with fullscreen + download buttons.
- **Inline matplotlib figures**: Base64 PNG `<img>` tags from `execute_python` results, click for fullscreen.
- **File attachments**: Paperclip button + drag-drop support. 40+ text file types supported (100KB per file, 500KB total). Files wrapped in `<attached_file>` tags in message. Supports drag from system Finder, local file explorer, and cloud files.
- **Conversation persistence**: Auto-saves to Firebase Firestore on tab visibility change + page unload. Loads last conversation on sign-in if chat is empty.

Key maps in `index.html`: `toolStatusMap` (human-readable labels) and `toolIconMap` (Font Awesome icons including `_default` fallback).

### SSE Streaming Protocol

Backend yields SSE events as `data: {json}\n\n`. Frontend (`aiagent.js`) parses in a streaming loop:

| Event | Payload | Purpose |
|-------|---------|---------|
| `text` | `{content}` | AI response text delta |
| `thinking_start` | `{}` | Begin extended thinking block |
| `thinking` | `{content}` | Thinking text delta |
| `thinking_done` | `{}` | End thinking block |
| `tool_status` | `{toolName}` | Tool call started (creates tool row in UI) |
| `tool_delta` | `{toolName, delta}` | Partial JSON of tool arguments (live code preview for execute_python) |
| `tool_calls` | `{toolCalls, assistantMessage, sessionId}` | Complete tool calls batch for frontend execution |
| `chart_ready` | `{chartData}` | Chart rendered immediately without waiting for next AI round-trip |
| `done` | `{sessionId}` | Stream complete, no more tool calls |
| `error` | `{error}` | Error message |

### Python Code Execution

The `execute_python` tool enables the AI to run Python code on the backend:

- **Backend** (`/ai/python/execute`): Runs code via `exec()` with numpy, matplotlib, math pre-imported. Injects `atoms` (current frame), `positions` (numpy array `(n_frames, n_atoms, 3)` if trajectory loaded), `energies` (numpy 1D array), `frames` (list of frame dicts). Captures stdout/stderr. Renders matplotlib figures as base64 PNG with dark backgrounds. Truncates output (10K stdout / 5K stderr).
- **Frontend permission**: Inline Cursor-style Allow/Deny bar appears inside the tool row. The tool row shows the streaming code preview, then appends permission buttons. No modal overlay.
- **Figure handling**: Base64 figures stored as `pythonFigures` on the action object (not sent back to AI — only `figureCount` is compressed). Rendered as inline `<img>` tags in chat with click-to-fullscreen.
- **Trajectory data**: Frontend sends up to 200 frames (evenly subsampled) + all energies alongside the code. Backend builds `positions` numpy array for vectorized operations.

### Token Bloat Prevention

The backend has two mechanisms to prevent context window overflow:

1. **Argument truncation**: `execute_python` tool_call arguments are truncated to a summary in stored `conversationHistory` (code replaced with `[truncated — N chars]`), while full code is sent to frontend via SSE for execution.
2. **Token-aware pruning**: After building the message list, a pruning loop drops oldest user+assistant+tool message groups when estimated tokens exceed 120K (`MAX_HISTORY_TOKENS`). Token estimation includes tool_call argument lengths.

### Composability Hints (NEXT_STEPS)

`compressToolResult()` in `aiagent.js` auto-injects `NEXT_STEPS` hints into compressed tool results. These tell the AI what workflow steps naturally follow each tool (e.g., after `rotational_scan` → `calculate_all_energies` → `create_chart`). This enables tool chaining without explicit user instructions.

### Cache Warmup

`warmupCache()` runs on page load, sending a dummy "ping" message to the backend with a disposable `_warmup_` session ID. This primes the prompt cache and speeds up the first real request by ~500-1000ms.

### Rendering

Molecule class (`demo/atom/molecule.js`) uses `InstancedMesh` for atoms (single draw call for all atoms). Bonds are cylinder geometries with half-bond coloring. Two material modes: mode 0 = `MeshBasicMaterial` (fast, no lighting), mode 1+ = `MeshStandardMaterial` (lighting). Call `molecule.draw()` to re-render after changes (handles disposal).

Key Molecule methods:
- `init(data, mode, center)` - Create atoms/bonds from parsed data
- `draw()` - Dispose old geometry, recreate InstancedMesh + bonds
- `createForceArrows(scale)` - Arrow helpers from `forceData`
- `setForcesFromCalculation(forces)` - Set forces from `[[fx,fy,fz],...]` array (MACE results)
- `setForcesFromFrame(frameData)` - Set forces from frame's `atomData` (with `fx,fy,fz` properties)
- `animateToFrame(frameData, duration, easing)` - Smooth interpolation to target frame positions + forces

### Force Visualization Pipeline

1. **Force data sources**: MACE energy calculations (`includeForces: true` by default), DFT gradient calculations, file parsing (ExtXYZ with forces columns, ORCA gradients), Bohr-converted files (Hartree/Bohr → eV/Å)
2. **Storage**: `molecule.forceData` array of `{element, x, y, z, fx, fy, fz}` objects
3. **Rendering**: `createForceArrows(scale)` creates `THREE.ArrowHelper` objects. Adaptive coloring: green (low force) → red (high force) based on magnitude
4. **Toggle**: `toggle_force_arrows` AI tool or checkbox in UI. `toggleForceArrows(show, scale)` method
5. **Frame sync**: When changing frames, `setForcesFromFrame()` updates force data, `updateForceArrowControls()` refreshes UI

### MACE Integration

ML potential calculations go through `demo/utils/maceUtils.js` -> Flask backend -> PyTorch/ASE:

- Three MACE models: `mace-mp-0a` (fast), `mace-mp-0b3` (high-pressure), `mace-mpa-0` (most accurate)
- For `optimize_geometry` and `run_md`: models are `small`, `medium`, `large`, `mace-mpa-0`
- Calculators lazily loaded and cached in backend. GPU auto-detect (`MACE_DEVICE`). Default dtype `float32`.
- **Forces included by default** in all MACE outputs (`includeForces` defaults to `true` in schemas and backend)
- `run_md` supports `frames` parameter for exact output frame count (preferred over `steps`/`saveInterval`)
- Results cached in `window.lastMaceResults` for charting via `get_cached_energies`
- **Streaming endpoints**: `/ai/mace/optimize/stream` and `/ai/mace/md/stream` provide real-time SSE progress via `streamMaceSSE()` in maceUtils.js
- **Fine-tuning**: `/ai/mace/finetune` endpoint trains custom MACE models on DFT data with streaming epoch-by-epoch loss. Models saved to `MACE_FINETUNE_DIR` and reusable in energy/optimization/MD calculations.

### DFT Integration (PySCF + GPU4PySCF)

Ab initio DFT calculations via PySCF with optional GPU acceleration:

- **GPU acceleration**: Uses `gpu4pyscf.dft.rks` (CUDA 12.x) when available, falls back to CPU PySCF
- **Dispersion corrections**: Standalone `dftd3`/`dftd4` packages (patched for numpy 2.x compatibility)
- **Configurable**: Arbitrary basis sets (def2-svp, def2-tzvp, 6-31g*, etc.), XC functionals (B3LYP, PBE, PBE0, WB97X-D, etc.), charge + spin multiplicity
- **Endpoints**: `/ai/dft/energy` (single-point), `/ai/dft/energy-batch` (all frames)
- **Frontend tools**: `calculate_dft_energy`, `calculate_all_dft_energies` — results auto-saved to ExtXYZ files with timestamps
- **Conversion**: Hartree → eV (`27.211386245988`), Bohr → Å (`0.529177210903`)

### Orbital Visualization

Two rendering paths:

1. **Cube files**: Parsed by `fileHandler.js` (always Bohr → Angstrom conversion). Frontend Marching Cubes via `orbitalUtils.js` or Web Worker `marchingCubesWorker.js`. Positive/negative isosurfaces with distinct colors.
2. **Molden files**: Parsed by `fileHandler.js`, sent to backend `/ai/molden/*` endpoints. PySCF evaluates AO basis on a 3D grid. Backend computes MO coefficients × AO values via batch GPU `torch.matmul`. Streams results as NDJSON. Frontend decompresses and renders with `moldenOrbitalUtils.js`. Cached AO grids (30min TTL) keyed by content hash.

### File System

**Local files** (`fileExplorer.js`): Web File System Access API (`showDirectoryPicker()`). Persists directory handle in IndexedDB. Supports create/read/write/delete. AI can create/edit files via `create_file`/`edit_file` tools. Text editor modal for non-molecule files.

**Cloud files**: Firebase Firestore integration for saving/loading molecules to cloud. Stripe payment for premium features.

**Remote files** (`remoteFiles.js`): SSH/SFTP via backend paramiko proxy. Connect with password or SSH key. Browse, read, write, delete, mkdir on remote servers.

### Scan Operations

Scans generate multi-frame trajectories by systematically varying geometric parameters:

- **Rotational scan** (`rotational_scan`): Rotates a fragment around an axis (two atoms) through angle range. Uses `graphUtils.js` to find connected fragment — always moves the **smaller** fragment.
- **Translation scan** (`translation_scan`): Translates a fragment along an axis through distance range.
- **Angle scan** (`angle_scan`): Varies A-B-C angle by rotating fragment around pivot atom.

All scans produce `window.xyzFrames` and show the frame slider. Follow with `calculate_all_energies` then `create_chart` to plot energy profiles.

### Undo System

`demo/utils/undo.js` wraps the UndoManager library:
- `undoManager.saveState()` deep-copies current molecule data + selection + labels
- `restoreMoleculeState(state)` recreates molecule from saved state
- 30-action limit. Always call `saveState()` before any molecule mutation.

### Bohr Auto-Detection and Conversion

`fileHandler.js` (`FileHandler.convertBohrIfNeeded()`) automatically detects and converts Bohr coordinates to Angstrom after any file is parsed:

1. **Explicit markers** (highest confidence): XYZ/ExtXYZ comment lines scanned for `unit=bohr`, `units=au`, `(BOHR)`, etc. Parser sets `_units: 'bohr'` on parsed data.
2. **Geometric heuristic** (fallback): Computes nearest-neighbor distances. With H atoms: H-X bonds > 1.3 indicates Bohr (H-X always < 1.3Å in Angstrom). Without H atoms: minimum distance > 2.0 with reasonable converted values.
3. **Force conversion**: Forces converted from Hartree/Bohr to eV/Å (factor ≈ 51.42) for both current frame and all trajectory frames.

Cube files and Molden files have their own built-in Bohr→Angstrom conversion in their parsers (`BOHR_TO_ANGSTROM = 0.529177249`).

### Backend Endpoints

| Endpoint | Method | Purpose |
|----------|--------|---------|
| `/health` | GET | Health check |
| `/ai/chat/stream` | POST | Main AI chat SSE stream |
| `/ai/mace/energy` | POST | Single-point MACE energy (+forces by default) |
| `/ai/mace/energy-batch` | POST | Batch energy for all frames (+forces by default) |
| `/ai/mace/optimize` | POST | Geometry optimization (+forces by default) |
| `/ai/mace/optimize/stream` | POST | Streaming geometry optimization (real-time SSE progress) |
| `/ai/mace/md` | POST | Langevin NVT molecular dynamics. Supports `frames` param for exact frame count |
| `/ai/mace/md/stream` | POST | Streaming MD with real-time SSE output |
| `/ai/mace/finetune` | POST | Fine-tune MACE foundation models with streaming epoch loss |
| `/ai/mace/finetune/models` | GET | List fine-tuned models |
| `/ai/mace/test` | GET | MACE availability test |
| `/ai/dft/energy` | POST | Single-point DFT energy via PySCF (GPU-accelerated) |
| `/ai/dft/energy-batch` | POST | Batch DFT for all frames |
| `/ai/jobs/<job_id>` | GET | Get long-running job status |
| `/ai/jobs/<job_id>` | DELETE | Cancel background job |
| `/ai/python/execute` | POST | Python code execution with `atoms`, `positions`, `energies`, `frames` variables |
| `/ai/chart` | POST | Chart data generation for Chart.js |
| `/ai/clear` | POST | Clear AI session history |
| `/ai/knowledge/search` | POST | Web search via Tavily API |
| `/ai/transcribe` | POST | Audio transcription via OpenAI Whisper |
| `/ai/molden/info` | POST | Parse molden file metadata |
| `/ai/molden/prepare` | POST | Prepare AO grid cache for molden |
| `/ai/molden/orbital` | POST | Compute single orbital volume/mesh |
| `/ai/molden/orbital-batch` | POST | Batch compute orbitals via NDJSON streaming |
| `/api/remote/connect` | POST | SSH/SFTP connection |
| `/api/remote/disconnect` | POST | Close SFTP connection |
| `/api/remote/list` | POST | List remote directory |
| `/api/remote/read` | POST | Read remote file |
| `/api/remote/write` | POST | Write remote file |
| `/api/remote/delete` | POST | Delete remote file |
| `/api/remote/mkdir` | POST | Create remote directory |
| `/api/remote/status` | POST | Check connection status |

## Critical Patterns

### Atom Indexing

All atom indices are **0-based** in code. Validate before use: `if (index < 0 || index >= atoms.length)`.

### Undo Before Mutations

```javascript
window.undoManager.saveState();
// ... modify molecule ...
```

### Fragment Operations

Always use `graphUtils.js` for molecular graph operations:
```javascript
const adj = buildAdjacencyList(atoms, bonds);
const fragment = findConnectedFragment(startIdx, excludeSet, adj);
```
For torsion scans, always use the **smaller** fragment as `atomsToMove`.

### Frame/Energy Alignment

`window.xyzFrames` and `window.frameEnergies` must always have the same length. Use `mergeForcesIntoFrames()` to align MACE force results with frames. Use `updateCurrentFrameForces()` to sync molecule force data with current slider frame.

### Scene Updates

```javascript
window.molecule.atoms = newAtoms;
window.molecule.bonds = newBonds;
window.molecule.draw();  // Disposes old geometry, recreates scene
```

Always let `molecule.draw()` handle Three.js disposal. Don't manually manage mesh lifecycles.

### Coordinate Scale Factor

Molecule uses `stretch = 4` to scale coordinates for visualization. Internal positions = file coordinates × 4. When sending coordinates to backend (MACE, Python), divide by 4: `atom.x / 4`. The `offset` property tracks centering translation.

### Adding a New AI Tool

1. Add tool schema to `TOOLS_JSON` in backend `app.py` (OpenAI format, auto-converted to Claude format at startup)
2. Add corresponding function in `aiagent.js` under `FUNCTIONS` object
3. Add entry in `toolStatusMap` (human-readable label) and `toolIconMap` (Font Awesome icon) in `index.html`
4. If the tool returns large data not needed by the AI (like images), store it as a separate property on the action object (like `pythonFigures`, `chartData`) and only send a summary in `compressToolResult()`
5. Optionally add a `NEXT_STEPS` entry for composability hints
6. Keep schemas in sync between frontend and backend (currently 59 schemas, 58 implementations)

### Tool Result Compression

`compressToolResult()` in `aiagent.js` strips large payloads before sending results back to the AI. Only essential data (success, message, key metrics) is kept. Large binary data (base64 images, full atom lists) must be stored separately on the action object for frontend rendering. The `getMoleculeState()` function also strips full `atomData` from frames to reduce request payload size.

### Chat UI Flowing Layout

The AI response `contentEl` uses a flowing layout — children are appended chronologically:
```
[thinking block]           ← .ai-response-thinking (static, always first)
[text block 1]             ← .ai-response-text (created dynamically)
[tool row: get_atom_info]  ← .ai-tool-row (appended to contentEl)
[tool row: execute_python] ← .ai-tool-row (with inline permission bar)
[text block 2]             ← .ai-response-text (new block after tools)
[inline chart/figure]      ← appended after action processing
```

When `tool_status` arrives, `currentTextBlock` is set to `null` so the next text chunk creates a fresh `.ai-response-text` div after the tool rows.

### File Format Support

**Parsing** (`demo/utils/fileHandler.js`): 13 formats — XYZ, ExtXYZ, PDB, CIF, MOL/SDF, MOL2, PQR, GRO, CML, ORCA OUT, Cube, Molden. Automatic Bohr→Angstrom conversion for all formats. XYZ generic parser only assigns forces if comment mentions "forces" (ExtXYZ uses Properties header for column mapping).

**Export** (`demo/utils/fileWriter.js`): 8 formats — XYZ, ExtXYZ, MOL/SDF, PDB, CIF, GRO, PQR, MOL2. Auto-includes energy, forces, charges when available.

### MACE Defaults

- **Forces always included** by default in all MACE calculations (`includeForces` defaults to `true`)
- Model must be specified by user before energy/optimization/MD calculations
- `run_md` supports `frames` parameter for exact output frame count (e.g., `frames: 10` = exactly 10 frames)

## Backend Configuration

### AI Models Supported

**Claude** (via Anthropic):
- `claude-opus-4-6` — Adaptive extended thinking (automatic budget)
- `claude-sonnet-4-6` — Interleaved thinking via beta endpoint
- `claude-sonnet-4` — Extended thinking with `budget_tokens`
- `claude-haiku-4-5` — Extended thinking with `budget_tokens`
- Legacy Claude versions (3.0, 3.5, etc.)

**OpenAI/GPT** (via OpenAI):
- `gpt-5`, `gpt-5-mini`, `gpt-5.1`, `gpt-5.2` (including Pro variant)
- `gpt-4.1` (including Mini, Nano variants)
- Supports extended reasoning via `reasoning_content` streaming

**Default model**: `gpt-5-mini` (fallback if not specified)

### Extended Thinking

- Frontend sends `thinkingBudget` (0=off, 4096/10000/32000) in POST payload, persisted in localStorage
- **Opus 4.6**: Adaptive thinking (ignores budget_tokens, automatic)
- **Sonnet 4.6**: Interleaved thinking via beta endpoint
- **Sonnet 4 & Haiku 4.5**: Manual thinking with configurable `budget_tokens`
- Hidden in UI for GPT models

### Session & Job Management

| Config | Value | Purpose |
|--------|-------|---------|
| MAX_SESSIONS | 500 | Max concurrent sessions |
| SESSION_TTL | 3600s (1hr) | Session expiration |
| MAX_HISTORY_TOKENS | 120,000 | Token limit for history pruning |
| MAX_JOBS | 200 | Concurrent background jobs |
| JOB_TTL | 3600s (1hr) | Job timeout |
| MOLDEN_CACHE_TTL | 1800s (30min) | AO grid cache lifetime |
| MAX_MOLDEN_CACHE | 10 | Max cached AO grids |

### Deployment

- **Render.com**: Auto-deploys from git push. Python 3.11, Gunicorn 1 worker, 4 threads, 600s timeout.
- **RunPod GPU**: Docker image based on `nvidia/cuda:12.4.1-devel-ubuntu22.04`. PyTorch CUDA 12.4, cupy-cuda12x for GPU4PySCF. SSH with public key auth. Port 10000 (HTTP) + 22 (SSH). Gunicorn without `--preload` (CUDA init in worker).
- **Frontend auto-detects backend URL**: localhost → `127.0.0.1:10000`, production → tries RunPod health check first (3s timeout), falls back to `chopchopmol-ai-backend.onrender.com`. Press `\` five times to manually switch backend.

### Device Auto-Detection

| Config | Detection | Purpose |
|--------|-----------|---------|
| MACE_DEVICE | CUDA > MPS > CPU | ML potential computation (always CPU due to MPS float64 incompatibility) |
| TORCH_DEVICE | CUDA > MPS > CPU | General tensor ops (orbital math can use GPU) |
| MACE_DTYPE | `float32` | Model precision (inference AND fine-tuning). Foundation models are pre-converted from float64→float32 before training. |

**CUDA Recovery**: If CUDA fails at runtime (e.g., transient OOM), the server temporarily falls back to CPU. Before each compute request, `_try_recover_cuda()` checks if CUDA is available again (with 30s cooldown). This prevents permanent CPU fallback for the rest of the server's lifetime.

### History Repair

Claude requires strict pairing of `tool_use`/`tool_result` blocks. Backend calls `repair_claude_history_for_tool_pairing()` before every Claude request to fix orphaned pairs. OpenAI history used as-is.

### System Prompt

- Built dynamically by `build_system_prompt()` with model name detection
- Includes full tool layer descriptions (L1-L6)
- Dynamic STATE line: atom count, element distribution, selection, frames, cached energies, file info
- Prompt cache keyed by `state_hash + model` (max 50 entries)
- Uses ephemeral prompt cache control for Claude API
