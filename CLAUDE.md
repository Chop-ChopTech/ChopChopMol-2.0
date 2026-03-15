# CLAUDE.md

This file provides guidance to Claude Code (claude.ai/code) when working with code in this repository.

## Project Overview

ChopChopMol 2.0 is a web-based 3D molecular visualization and AI-powered editing platform. Users visualize molecular structures in Three.js, then manipulate them via natural language commands powered by Claude AI with MACE machine learning potentials for energy calculations.

## Repository Layout

This is a **two-repo** setup:

- **Frontend** (`demo/`): Vanilla HTML/JS app (no build step, ES6 modules, Three.js)
- **Backend** (separate repo at `chopchopmol-ai-backend/`): Python Flask server for Claude AI proxy, MACE ML calculations, DFT calculations, and Python code execution

The frontend is a static site deployed to Firebase Hosting. The backend deploys to Render.com via `render.yaml` and RunPod GPU via Docker (`Dockerfile` + `deploy.sh`).

**Reference repos** (read-only, for copying patterns — do NOT modify):
- `ChopChopMol 3.0/` — Next-gen frontend (FastAPI-based patterns, streaming tools)
- `ChopChopMol Backend/` — Next-gen backend (native torch_geometric batching, streaming MD, FastAPI+Uvicorn). The working backend is `chopchopmol-ai-backend/`, not this one.

### Frontend File Structure

| File | Lines | Purpose |
|------|-------|---------|
| `demo/main.js` | ~7500 | Main controller: molecule lifecycle, pointer/keyboard handlers, camera, rendering loop, atom editing, viewport management |
| `demo/index.html` | ~4200 | Full app HTML + inline JS for chat UI, SSE parsing, tool row rendering, thinking blocks, chart rendering |
| `demo/style.css` | ~7000 | All styles: 3D viewport, chat panel, tool rows, file explorer, modals, force arrows, orbital viewer |
| `demo/aiagent.js` | ~2700 | AI agent: `FUNCTIONS` object (54 tool implementations), `streamChat()` SSE loop, `compressToolResult()`, `getMoleculeState()` |
| `demo/atom/molecule.js` | ~2200 | Molecule class: InstancedMesh atoms, bonds, labels, force arrows, frame animation, draw/dispose |
| `demo/atom/atom.js` | | Atom class: position, element, selection state |
| `demo/atom/bond.js` | | Bond class: cylinder geometry, half-bond coloring |
| `demo/fileExplorer.js` | ~1980 | File explorer panel: Web File System API, cloud saves (Firebase), IndexedDB persistence, text editor, drag-drop |
| `demo/remoteFiles.js` | ~660 | SSH/SFTP remote file browser via backend paramiko proxy |
| `demo/handleFeatures.js` | ~500 | Feature toggles: labels, force arrows, charge visualization, ribbon |
| `demo/handleStyles.js` | ~450 | Atom rendering styles: ball-and-stick, space-fill, wireframe |
| `demo/utils/fileHandler.js` | ~2250 | File parser: XYZ, ExtXYZ, PDB, CIF, MOL/SDF, MOL2, PQR, GRO, CML, ORCA OUT, Cube, Molden + Bohr auto-detection |
| `demo/utils/fileWriter.js` | ~500 | File export: XYZ, ExtXYZ, MOL/SDF, PDB, CIF, GRO, PQR, MOL2 |
| `demo/utils/orbitalUtils.js` | ~860 | Marching Cubes isosurface generation for Cube file volumetric data |
| `demo/utils/moldenOrbitalUtils.js` | ~480 | Molden orbital rendering: volume/mesh decompression, Three.js mesh creation |
| `demo/utils/maceUtils.js` | ~220 | MACE helpers: `callMaceEnergy`, `callMaceEnergyBatch`, `callMaceOptimize`, `callMaceMD`, ExtXYZ generation, force merging |
| `demo/utils/scanUtils.js` | ~280 | Scan generators: rotational, angle, translation scans |
| `demo/utils/frameUtils.js` | ~120 | Frame slider setup, `loadFrames()`, `generateTransformFrames()` |
| `demo/utils/graphUtils.js` | ~100 | Molecular graph: `buildAdjacencyList()`, `findConnectedFragment()`, `findFragmentAvoidingVertex()` |
| `demo/utils/undo.js` | ~260 | Undo/redo via UndoManager: deep-copies molecule state, 30-action limit |
| `demo/utils/ribbon.js` | ~310 | Protein ribbon rendering from backbone CA atoms |
| `demo/utils/stripe.js` | ~660 | Stripe payment integration |
| `demo/utils/marchingCubesWorker.js` | ~330 | Web Worker for marching cubes (parallel isosurface) |
| `demo/utils/apiUtils.js` | ~130 | `safeFetch()` wrapper with auto backend URL detection |
| `demo/utils/domUtils.js` | | DOM helper utilities |
| `demo/utils/errorHandler.js` | | Global error handler |
| `demo/utils/toast.js` | | Toast notification system |
| `demo/utils/atomSettings.json` | | Per-element atom radii, colors, covalent radii |

### Backend Structure

| File | Lines | Purpose |
|------|-------|---------|
| `chopchopmol-ai-backend/app.py` | ~2500 | Single Flask app: AI chat proxy, MACE endpoints, Python execution, orbital calculations, SSH/SFTP, Tavily search |
| `chopchopmol-ai-backend/render.yaml` | | Render.com deployment config |
| `chopchopmol-ai-backend/requirements.txt` | | Python deps: Flask, PyTorch, ASE, MACE, PySCF, paramiko, orjson, httpx |

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
gunicorn app:app --workers 1 --threads 4 --timeout 120 --preload  # Production
```

No linter, formatter, or build toolchain is configured for either component.

## Architecture

### Global State Model

All state lives on `window` (no framework, no state library):

- `window.main` - Main controller instance (single singleton)
- `window.molecule` / `window.main.molecule` - Current Molecule instance (atoms, bonds, Three.js meshes)
- `window.scene`, `window.camera`, `window.renderer` - Three.js objects
- `window.atomsSelected[]` - Currently selected atom indices (0-based)
- `window.xyzFrames` - Multi-frame trajectory data (array of `{atomData, numAtoms, comment, energy}`)
- `window.frameEnergies` - Energy values aligned 1:1 with `xyzFrames`
- `window.frameMetadata` - Per-frame metadata (lattice, virial, stress, pbc, etc.)
- `window.lastMaceResults` - Cached MACE energy/force results for charting
- `window.fileExplorer` - File explorer instance (Web File API)
- `window.undoManager` - Undo/redo manager (30-action stack)
- `window.rotationAxis`, `window.axisAtoms` - Defined rotation axis for scans
- `window.forceArrowScale` - Scale factor for force arrow visualization
- `window.orbitalData`, `window.moldenData` - Orbital visualization data

### AI Agent Flow

1. User types natural language command in chat
2. `aiagent.js` sends message + molecule state to Flask backend via SSE (`POST /ai/chat/stream`)
3. Backend builds system prompt with dynamic STATE line, calls Claude API or OpenAI with 55 tool definitions
4. Backend streams SSE events to frontend: `text`, `thinking_start/thinking/thinking_done`, `tool_status`, `tool_delta`, `tool_calls`, `done`, `error`
5. `aiagent.js` executes tool functions locally in parallel (they manipulate `window.molecule`, DOM, Three.js)
6. Results compressed via `compressToolResult()` and sent back to backend for the AI to continue reasoning
7. Loop continues (max 10 iterations) until AI responds with text only (no tool calls)

**Tool counts**: 55 schemas in backend `TOOLS_JSON`, 54 frontend `FUNCTIONS` implementations (`add_hydrogens` has schema but no frontend impl).

### AI Tool Layers (compose bottom-up)

| Layer | Tools | Purpose |
|-------|-------|---------|
| L1 QUERY | `get_molecule_info`, `get_atom_info`, `get_bonded_atoms`, `measure_distance`, `measure_angle`, `measure_dihedral`, `get_cached_energies`, `web_search`, `read_file`, `list_folder_files` | Read-only, no side effects |
| L2 SELECT | `select_atoms`, `select_atoms_by_element`, `select_all_atoms`, `select_connected`, `clear_selection` | Set context for L3 |
| L3 EDIT | `add_atom`, `remove_atoms`, `change_atom_element`, `set_bond_distance`, `set_angle`, `set_dihedral_angle`, `transform_atoms`, `split_molecule`, `add_hydrogens` | Modify molecule |
| L4 GENERATE | `rotational_scan`, `translation_scan`, `angle_scan`, `calculate_energy`, `calculate_all_energies`, `optimize_geometry`, `run_md`, `load_molecule` | Create frames/data |
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
- **Inline charts**: Chart.js `<canvas>` elements rendered from `create_chart` tool results via `chart_ready` SSE event.
- **Inline matplotlib figures**: Base64 PNG `<img>` tags from `execute_python` results, click for fullscreen.

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

1. **Force data sources**: MACE energy calculations (`includeForces: true` by default), file parsing (ExtXYZ with forces columns, ORCA gradients), Bohr-converted files (Hartree/Bohr → eV/Å)
2. **Storage**: `molecule.forceData` array of `{element, x, y, z, fx, fy, fz}` objects
3. **Rendering**: `createForceArrows(scale)` creates `THREE.ArrowHelper` objects. Adaptive coloring: green (low force) → red (high force) based on magnitude
4. **Toggle**: `toggle_force_arrows` AI tool or checkbox in UI. `toggleForceArrows(show, scale)` method
5. **Frame sync**: When changing frames, `setForcesFromFrame()` updates force data, `updateForceArrowControls()` refreshes UI

### MACE Integration

ML potential calculations go through `demo/utils/maceUtils.js` -> Flask backend -> PyTorch/ASE:

- Three MACE models: `mace-mp-0a` (fast), `mace-mp-0b3` (high-pressure), `mace-mpa-0` (most accurate)
- For `optimize_geometry` and `run_md`: models are `small`, `medium`, `large`, `mace-mpa-0`
- Calculators lazily loaded and cached in backend. GPU auto-detect (`MACE_DEVICE`).
- **Forces included by default** in all MACE outputs (`includeForces` defaults to `true` in schemas and backend)
- `run_md` supports `frames` parameter for exact output frame count (preferred over `steps`/`saveInterval`)
- Results cached in `window.lastMaceResults` for charting via `get_cached_energies`

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
| `/ai/mace/md` | POST | Langevin NVT molecular dynamics. Supports `frames` param for exact frame count |
| `/ai/mace/test` | GET | MACE availability test |
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
5. Keep schemas in sync between frontend and backend (currently 55 schemas, 54 implementations)

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

- Render.com auto-deploys from git push (`render.yaml`)
- Python 3.11, 1 Gunicorn worker, 4 threads, 120s timeout
- MACE + PyTorch + ASE + PySCF + paramiko + orjson in `requirements.txt`
- Sessions stored in memory (500 max, 1hr TTL). Token-aware pruning at 120K tokens.
- `execute_python` tool_call arguments truncated in stored history to prevent token bloat
- Frontend auto-detects backend URL: localhost → `127.0.0.1:10000`, production → `chopchopmol-ai-backend.onrender.com`
- Extended thinking budget sent from frontend as `thinkingBudget` in POST payload, gated on model support
- MACE GPU auto-detect (`MACE_DEVICE`): CUDA > MPS > CPU. Default dtype `float64`.
- System prompt built dynamically with STATE line (atom count, selection, frames, cached energies, file info)
- Prompt cache keyed by `state_hash + model` (max 50 entries)
