# fixes.pdf — Testing Checklist

## Status Summary

| # | Fix | Status | Action Taken |
|---|-----|--------|-------------|
| 1 | MACE model caching | Already handled | Backend uses `TORCH_HOME` for persistent cache (app.py:16-23). Models download once. |
| 2 | UI covers model names | **Fixed** | Added `overflow: hidden; text-overflow: ellipsis; white-space: nowrap` to `.ai-model-select` |
| 3 | Mobile responsiveness | **Fixed** (separate work) | Full mobile layout rewrite: toolbar, always-visible chat panel, overflow menu |
| 4 | Open File accepts all formats | **Fixed** | `#fileInput` accept now includes `.extxyz`, `.out`, `.cube`, `.cub`, `.molden`, `.mold` |
| 5 | Python script for text writing | **Fixed** (separate work) | Backend system prompt updated to forbid trivial `execute_python` calls |
| 6 | window.undoManager exposed | Already in code | `window.undoManager = undoManager` at undo.js:2 |
| 7 | Frame/energy desync | Already in code | All `xyzFrames` assignments clear `frameEnergies` and `lastMaceResults` |
| 8 | SSE JSON.parse try/catch | Already in code | Both SSE parse sites wrapped in try/catch (aiagent.js:2383, 2599) |
| 9 | Mutating tools serialized | Already in code | READ_ONLY_TOOLS set + sequential loop for mutating tools (aiagent.js:2705) |
| 10 | Feature gating | Already in code | `updateFeatureAccess()` uses `signedIn` param correctly |
| 11 | ORCA parser frame/energy | Already in code | `frameEnergies.push()` inside `if (atomData.length > 0)` block |
| 12 | Duplicate pointerdown listeners | **Fixed** | Added `removeEventListener` before `addEventListener` in `recreateRenderer` |
| 13 | Mismatched event targets | Already in code | Both functions consistently use `window` |
| 14 | selectAtom bounds check | Already in code | Early return for `index < 0 || index >= atoms.length` |
| 15 | Missing undo snapshots | Already in code | `transform_atoms` and `split_molecule` call `saveUndoState()` |
| 16 | analyzeMolecule error handler | Already in code | Hides correct `explorationCanvas` element |
| 17 | generateAngleScan validation | Already in code | Validates `atomsToMove` before use |
| 18 | Tool arguments JSON.parse | Already in code | Wrapped with graceful error return |
| 19 | Hardcoded /4 to stretch | Already in code | All use `molecule.stretch \|\| 4` |
| 20 | Chart.js memory leak | Already in code | Previous chart destroyed before new one |
| 21 | Thinking timer cleanup | Already in code | `clearInterval` on stream end, error, and thinking_done |
| 22 | SSE timeout timer leak | Already in code | `clearTimeout` on both success and error paths |
| 23 | streamMaceSSE buffer tail | Already in code | Remaining buffer processed after stream ends |
| 24 | Zero force as missing | Already in code | Uses `Array.isArray(force)` not `if (force)` |
| 25 | Unknown file type default | Already in code | Returns `null` not `'mol'` |
| 26 | get_bonded_atoms compression | Already in code | Checks `result.bonds` |
| 27 | postJson body override | Already in code | `body` set after `...options` spread |
| 28 | Input validation (6 tools) | Already in code | All validate params before use |
| 29 | Three.js memory leaks | **Fixed** | `recreateRenderer` now removes old listener before re-attaching |
| 30 | parsedData null check | Already in code | Graceful error if no atoms parsed |

---

## How to Test Each Fix

### Fix #2 — Model name dropdown not clipped
1. Open the app on desktop
2. Look at the AI model selector dropdown at the bottom of the chat panel
3. Select models with long names like "Claude Opus 4.5" or "GPT-5.1 Codex Max"
4. **Verify:** The selected model name shows with ellipsis (...) if too long, not overflowing or being covered by adjacent UI elements

### Fix #3 — Mobile responsiveness
1. Open Chrome DevTools (F12) > toggle device toolbar (Ctrl+Shift+M)
2. Select iPhone 14 Pro or Pixel 7
3. **Verify:**
   - Toolbar is a full-width bar at the top with icon-only buttons
   - 3D viewport fills the middle of the screen
   - Chat messages and input are always visible at the bottom (~40% of screen)
   - Overflow menu (...) opens a dropdown with hidden items (Reset Camera, Properties, Fragments, etc.)
   - File explorer opens as a full-screen overlay and can be dismissed

### Fix #4 — Open File accepts all formats
1. Click the hidden file input (via Search > Open File or drag-drop)
2. **Verify:** File picker shows `.extxyz`, `.out`, `.cube`, `.molden` files (not just `.xyz`, `.pdb`, `.mol`)

### Fix #5 — AI doesn't write trivial Python
1. Ask the AI to "add a hydrogen to atom 1"
2. After it succeeds, check that it does NOT call `execute_python` with `print("success")`
3. Ask "what is the energy?" when energies are cached
4. **Verify:** It uses `get_cached_energies`, not `execute_python`

### Fix #6 — Undo/redo works from AI
1. Load a molecule
2. Ask the AI to "remove atom 1"
3. Type "undo" or ask AI to undo
4. **Verify:** The atom reappears

### Fix #7 — Frame/energy sync
1. Load a multi-frame XYZ file
2. Run `calculate_all_energies` to get energies
3. Load a different molecule
4. **Verify:** Frame slider disappears, energy chart is empty (no stale data from previous molecule)

### Fix #8 — SSE malformed chunks don't crash
1. Open browser console (F12 > Console)
2. Send any AI chat message
3. **Verify:** No `JSON.parse` errors in console. If the backend sends a malformed chunk, it logs a warning and continues.

### Fix #9 — Mutating tools don't race
1. Ask the AI to do something that triggers multiple tool calls (e.g. "select all carbon atoms, then remove them")
2. **Verify:** Tools execute in order — selection happens before removal, not simultaneously

### Fix #12/29 — No duplicate pointer listeners
1. Open the app, load a molecule
2. Go to Style panel > change antialias setting (triggers `recreateRenderer`)
3. Click on atoms to select them
4. **Verify:** Single click selects one atom (not firing twice). No duplicate behavior.

### Fix #14 — selectAtom with invalid index
1. Open browser console
2. Run: `selectAtom(-1)` and `selectAtom(99999)`
3. **Verify:** No errors thrown, function returns silently

### Fix #15 — Undo after transform/split
1. Load a molecule, select some atoms
2. Ask AI to "transform selected atoms by translating x+1"
3. Press Ctrl+Z or click undo
4. **Verify:** The atoms return to their original positions

### Fix #17 — Angle scan validation
1. Try running an angle scan with invalid atom selections
2. **Verify:** Error message returned instead of a crash

### Fix #20 — Chart memory
1. Run multiple energy calculations and create charts
2. Open browser DevTools > Memory tab > take heap snapshot
3. **Verify:** No accumulating Chart instances (previous ones are destroyed)

### Fix #24 — Zero forces displayed correctly
1. Load a molecule with forces where some atoms have [0, 0, 0] force
2. Toggle force arrows on
3. **Verify:** Zero-force atoms show tiny/no arrows (not missing entirely)

### Fix #25 — Unknown file type
1. Try to open a `.txt` or `.json` file via the file input
2. **Verify:** Shows an error toast "Unsupported file type" instead of trying to parse it as MOL

### Fix #27 — postJson body not overridden
1. Any API call that uses `postJson` should work correctly
2. **Verify:** Network tab shows correct JSON body in POST requests

### Fix #30 — Empty file handling
1. Try to open an empty `.xyz` file (0 bytes or just whitespace)
2. **Verify:** Shows error toast "No atoms found in file" instead of crashing
