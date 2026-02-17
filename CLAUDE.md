# CLAUDE.md

This file provides guidance to Claude Code (claude.ai/code) when working with code in this repository.

## Project Overview

ChopChopMol 2.0 is a web-based 3D molecular visualization and AI-powered editing platform. Users visualize molecular structures in Three.js, then manipulate them via natural language commands powered by Claude AI with MACE machine learning potentials for energy calculations.

## Repository Layout

This is a **two-repo** setup:

- **Frontend** (`demo/`): Vanilla HTML/JS app (no build step, ES6 modules, Three.js)
- **Backend** (separate repo at `chopchopmol-ai-backend/`): Python Flask server for Claude AI proxy, MACE ML calculations, and Python code execution

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
2. `aiagent.js` sends message to Flask backend via SSE (`POST /ai/chat/stream`)
3. Backend calls Claude API (claude-haiku-4-5-20251001) or OpenAI with 60 tool definitions
4. Backend streams SSE events to frontend: `text`, `thinking_start/thinking/thinking_done`, `tool_status`, `tool_delta`, `tool_calls`, `done`, `error`
5. `aiagent.js` executes tool functions locally (they manipulate `window.molecule`, DOM, Three.js)
6. Results compressed via `compressToolResult()` and sent back to backend for the AI to continue reasoning
7. Loop continues (max 10 iterations) until AI responds with text only (no tool calls)

Tool functions are defined in `FUNCTIONS` object in `aiagent.js` (~63 entries). Tool schemas are defined in `TOOLS_JSON` in the backend `app.py` (60 schemas, OpenAI format, auto-converted to `CLAUDE_TOOLS` at startup). These must stay in sync.

### AI Chat UI

The chat panel (`demo/index.html` inline JS + `demo/style.css`) uses a modern flowing layout:

- **Full-width messages** with labels ("You" / "ChopChopMol"), no chat bubbles
- **Extended thinking**: Collapsible block with live timer, auto-collapses when done. User-configurable budget (Off/Low/Med/High) persisted in localStorage. Hidden for GPT models.
- **Stacked tool rows**: Each tool call gets its own row with icon, label, spinner/checkmark, and expandable details. `execute_python` rows auto-expand to show live code streaming via `tool_delta` SSE events.
- **Flowing text layout**: Text and tool rows are appended to `contentEl` in chronological order. When text arrives after a tool call, a new `.ai-response-text` block is created, so the response flows naturally: text -> tool row -> text -> tool row -> text.
- **Stop button**: Send button swaps to stop icon during streaming, calls `AIAgent.abort()` via AbortController.
- **Inline charts**: Chart.js `<canvas>` elements rendered from `create_chart` tool results.
- **Inline matplotlib figures**: Base64 PNG `<img>` tags from `execute_python` results, click for fullscreen.

Key maps in `index.html`: `toolStatusMap` (56 human-readable labels) and `toolIconMap` (57 Font Awesome icons including `_default` fallback).

### SSE Streaming Protocol

Backend yields SSE events as `data: {json}\n\n`. Frontend (`aiagent.js`) parses in a streaming loop:

| Event | Payload | Purpose |
|-------|---------|---------|
| `text` | `{content}` | AI response text delta |
| `thinking_start` | `{}` | Begin extended thinking block |
| `thinking` | `{content}` | Thinking text delta |
| `thinking_done` | `{}` | End thinking block |
| `tool_status` | `{toolName}` | Tool call started (creates tool row) |
| `tool_delta` | `{toolName, delta}` | Partial JSON of tool arguments (live preview) |
| `tool_calls` | `{toolCalls, assistantMessage, sessionId}` | Complete tool calls batch for execution |
| `done` | `{sessionId}` | Stream complete, no more tool calls |
| `error` | `{error}` | Error message |

### Python Code Execution

The `execute_python` tool enables the AI to run Python code on the backend:

- **Backend** (`/ai/python/execute`): Runs code via `exec()` with numpy, matplotlib, math pre-imported. Molecule atom data injected as `atoms` variable. Captures stdout/stderr, renders matplotlib figures as base64 PNG with dark backgrounds. Truncates output (10K stdout / 5K stderr).
- **Frontend permission dialog**: Before execution, a modal overlay shows the code and description. User must click "Allow" or "Deny". Denial returns `{success: false, message: "User denied code execution"}` to the AI.
- **Figure handling**: Base64 figures stored as `pythonFigures` on the action object (not sent back to AI — only `figureCount` is compressed). Rendered as inline `<img>` tags in chat with click-to-fullscreen.

### Rendering

Molecule class (`demo/atom/molecule.js`) uses `InstancedMesh` for atoms (single draw call per element type). Bonds are cylinder geometries with half-bond coloring. Two material modes: mode 0 = `MeshBasicMaterial` (fast), mode 1+ = `MeshStandardMaterial` (lighting). Call `molecule.draw()` to re-render after changes (handles disposal).

### MACE Integration

ML potential calculations go through `demo/utils/maceUtils.js` -> Flask backend -> PyTorch/ASE. Three MACE models available: `mace-mp-0a` (fast), `mace-mp-0b3` (high-pressure), `mace-mpa-0` (most accurate). Calculators are lazily loaded and cached in the backend.

### Backend Endpoints

| Prefix | Endpoints | Purpose |
|--------|-----------|---------|
| `/ai/chat/stream` | POST | Main AI chat SSE stream |
| `/ai/mace/*` | energy, energy-batch, optimize, md, test | MACE ML calculations |
| `/ai/python/execute` | POST | Python code execution |
| `/ai/chart` | POST | Chart data generation |
| `/ai/clear` | POST | Clear AI session |
| `/ai/knowledge/search` | POST | Web search via Tavily API |
| `/ai/transcribe` | POST | Audio transcription (Whisper) |
| `/ai/molden/*` | info, orbital, orbital-batch, prepare | PySCF orbital calculations |
| `/api/remote/*` | connect, disconnect, list, read, write, delete, mkdir, status | SSH/SFTP file operations |
| `/health` | GET | Health check |

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

1. Add tool schema to `TOOLS_JSON` in backend `app.py` (OpenAI format, auto-converted to Claude format)
2. Add corresponding function in `aiagent.js` under `FUNCTIONS` object
3. Add entry in `toolStatusMap` (human-readable label) and `toolIconMap` (Font Awesome icon) in `index.html`
4. If the tool returns large data not needed by the AI (like images), store it as a separate property on the action object (like `pythonFigures`, `chartData`) and only send a summary in `compressToolResult()`
5. Keep schemas in sync between frontend and backend

### Tool Result Compression

`compressToolResult()` in `aiagent.js` strips large payloads before sending results back to the AI. Only essential data (success, message, key metrics) is kept. Large binary data (base64 images, full atom lists) must be stored separately on the action object for frontend rendering.

### Chat UI Flowing Layout

The AI response `contentEl` uses a flowing layout — children are appended chronologically:
```
[thinking block]           ← .ai-response-thinking (static, always first)
[text block 1]             ← .ai-response-text (created dynamically)
[tool row: get_atom_info]  ← .ai-tool-row (appended to contentEl)
[tool row: execute_python] ← .ai-tool-row
[text block 2]             ← .ai-response-text (new block after tools)
[inline chart/figure]      ← appended after action processing
```

When `tool_status` arrives, `currentTextBlock` is set to `null` so the next text chunk creates a fresh `.ai-response-text` div after the tool rows.

### File Format Support

`demo/utils/fileHandler.js` parses 11 formats: XYZ, ExtXYZ, PDB, CIF, MOL/SDF, MOL2, PQR, GRO, CML, ORCA OUT. `demo/utils/fileWriter.js` handles export. XYZ first line = atom count, second = comment. PDB needs CONECT records for bonds. ExtXYZ Properties line must match actual columns.

## Backend Configuration

- Render.com auto-deploys from git push (`render.yaml`)
- Python 3.11, 2 Gunicorn workers, 120s timeout
- MACE + PyTorch + ASE + PySCF in `requirements.txt`
- Sessions stored in memory (500 max, 1hr TTL)
- Frontend auto-detects backend URL: localhost -> `127.0.0.1:10000`, production -> `chopchopmol-ai-backend.onrender.com`
- Extended thinking budget sent from frontend as `thinkingBudget` in POST payload, gated on model support (Sonnet 4+, Opus 4+, Haiku 4.5+)
