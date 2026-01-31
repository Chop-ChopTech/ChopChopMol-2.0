# CLAUDE.md

This file provides guidance to Claude Code (claude.ai/code) when working with code in this repository.

## Project Overview

ChopChopMol 2.0 is a web-based 3D molecular visualization and AI-powered editing platform. Users visualize molecular structures in Three.js, then manipulate them via natural language commands powered by Claude AI with MACE machine learning potentials for energy calculations.

## Repository Layout

This is a **two-repo** setup:

- **Frontend** (`demo/`): Vanilla HTML/JS app (no build step, ES6 modules, Three.js)
- **Backend** (separate repo at `chopchopmol-ai-backend/`): Python Flask server for Claude AI proxy and MACE ML calculations

The frontend is a static site deployed to Firebase Hosting. The backend deploys to Render.com via `render.yaml`.

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
python app.py                       # Dev server
gunicorn app:app --workers 2 --timeout 120 --preload  # Production
```

No linter, formatter, or build toolchain is configured for either component.

## Architecture

### Global State Model

All state lives on `window` (no framework, no state library):

- `window.molecule` - Current Molecule instance (atoms, bonds, Three.js meshes)
- `window.scene`, `window.camera`, `window.renderer` - Three.js objects
- `window.atomsSelected[]` - Currently selected atom indices
- `window.xyzFrames` - Multi-frame trajectory data (array of `{atomData, comment}`)
- `window.frameEnergies` - Energy values aligned 1:1 with `xyzFrames`
- `window.fileExplorer` - File management (Web File API)
- `window.main` - Main controller

### AI Agent Flow

1. User types natural language command in chat
2. `aiagent.js` sends message to Flask backend (`POST /ai/chat`)
3. Backend calls Claude API (claude-haiku-4-5-20251001) with 50+ tool definitions
4. Claude returns tool calls; backend streams them back to frontend
5. `aiagent.js` executes tool functions locally (they manipulate `window.molecule`, DOM, Three.js)
6. Results sent back to backend for Claude to continue reasoning

Tool functions are defined in `FUNCTIONS` object in `aiagent.js`. Tool schemas are defined in `TOOLS_JSON` in the backend `app.py`. These must stay in sync.

### Rendering

Molecule class (`demo/atom/molecule.js`) uses `InstancedMesh` for atoms (single draw call per element type). Bonds are cylinder geometries with half-bond coloring. Two material modes: mode 0 = `MeshBasicMaterial` (fast), mode 1+ = `MeshStandardMaterial` (lighting). Call `molecule.draw()` to re-render after changes (handles disposal).

### MACE Integration

ML potential calculations go through `demo/utils/maceUtils.js` → Flask backend → PyTorch/ASE. Three MACE models available: `mace-mp-0a` (fast), `mace-mp-0b3` (high-pressure), `mace-mpa-0` (most accurate). Calculators are lazily loaded and cached in the backend.

Backend endpoints: `/ai/mace/energy`, `/ai/mace/energy-batch`, `/ai/mace/optimize`, `/ai/mace/md`

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

`window.xyzFrames` and `window.frameEnergies` must always have the same length. Use `mergeForcesIntoFrames()` to align MACE results with frames.

### Scene Updates

```javascript
window.molecule.atoms = newAtoms;
window.molecule.bonds = newBonds;
window.molecule.draw();  // Disposes old geometry, recreates scene
```

Always let `molecule.draw()` handle Three.js disposal. Don't manually manage mesh lifecycles.

### Adding a New AI Tool

1. Add tool schema to `TOOLS_JSON` in backend `app.py`
2. Add corresponding function in `aiagent.js` under `FUNCTIONS` object
3. Export to window: `window.my_tool = my_tool;`
4. Keep schemas in sync between frontend and backend

### File Format Support

`demo/utils/fileHandler.js` parses 11 formats: XYZ, ExtXYZ, PDB, CIF, MOL/SDF, MOL2, PQR, GRO, CML, ORCA OUT. `demo/utils/fileWriter.js` handles export. XYZ first line = atom count, second = comment. PDB needs CONECT records for bonds. ExtXYZ Properties line must match actual columns.

## Backend Configuration

- Render.com auto-deploys from git push (`render.yaml`)
- Python 3.11, 2 Gunicorn workers, 120s timeout
- MACE + PyTorch + ASE + PySCF in `requirements.txt`
- Sessions stored in memory (500 max, 1hr TTL)
- Frontend auto-detects backend URL: localhost → `127.0.0.1:10000`, production → `chopchopmol-ai-backend.onrender.com`
