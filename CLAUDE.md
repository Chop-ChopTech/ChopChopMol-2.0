# CLAUDE.md

This file provides guidance to Claude Code (claude.ai/code) when working with code in this repository.

## Project Overview

ChopChopMol 2.0 is a web-based 3D molecular visualization and AI-powered editing platform. The application enables researchers to visualize, manipulate, and analyze molecular structures with natural language commands powered by Claude AI and MACE machine learning potentials.

**Key Technologies**: Three.js, Claude AI (Anthropic), MACE-MP (ML potentials), Firebase, Python Flask backend

## Repository Structure

This is a **monorepo** with two main components:

1. **Frontend** (`/demo/`): HTML/JavaScript web application
2. **Backend** (`chopchopmol-ai-backend/`): Python Flask server for AI and ML calculations

### Frontend Structure (`/demo/`)

```
demo/
├── main.js                    # Core application controller & Three.js setup
├── aiagent.js                 # Claude AI agent system with 50+ tool functions
├── fileExplorer.js            # File management interface (Web File API)
├── handleFeatures.js          # Authentication & feature access control
├── handleStyles.js            # Rendering style management
├── atom/
│   ├── atom.js                # Atom class definition
│   ├── bond.js                # Bond class definition
│   └── molecule.js            # Molecule class (Three.js integration)
└── utils/
    ├── fileHandler.js         # File parsing (11 formats: XYZ, PDB, CIF, etc.)
    ├── fileWriter.js          # File export utilities
    ├── maceUtils.js           # MACE ML backend API integration
    ├── graphUtils.js          # Molecular graph/connectivity algorithms
    ├── frameUtils.js          # Multi-frame animation & slider management
    ├── scanUtils.js           # Molecular scans (rotation, angle, translation)
    ├── ribbon.js              # Protein ribbon visualization
    ├── apiUtils.js            # Safe HTTP request utilities
    ├── domUtils.js            # DOM manipulation helpers
    ├── undo.js                # Undo/redo functionality
    └── utils.js               # General utilities
```

## Common Development Commands

### Frontend (demo/)

**Install dependencies:**
```bash
cd demo
npm install
```

**Run AI tests:**
```bash
npm run test:ai              # Test against production backend
npm run test:ai:local        # Test against localhost:10000
```

**Serve locally:**
```bash
# Open index.html in browser or use any static server
python -m http.server 8000
# Navigate to http://localhost:8000/demo/
```

**Deploy to Firebase Hosting:**
```bash
firebase deploy
# Project: chopchopmol-2
```

### Backend (chopchopmol-ai-backend/)

**Setup Python environment:**
```bash
python -m venv venv
source venv/bin/activate  # or venv\Scripts\activate on Windows
pip install -r requirements.txt
```

**Run backend locally:**
```bash
# Set environment variables first
export OPENAI_API_KEY="your_key"
export ANTHROPIC_API_KEY="your_key"

# Development server
python app.py

# Production server (Gunicorn)
gunicorn app:app --workers 2 --timeout 120 --preload
```

**Deploy to Render:**
```bash
git push origin main  # Auto-deploys via render.yaml config
```

## Architecture Overview

### 1. Application Flow

```
User loads index.html
  ↓
main.js initializes Three.js scene
  ↓
User loads molecule file → fileHandler.js parses → molecule.js renders
  ↓
User types AI command → aiagent.js sends to backend
  ↓
Backend (Flask + Claude API) executes tool functions
  ↓
Frontend updates visualization
```

### 2. Global State Management

ChopChopMol uses `window` object for global state (no framework):

- `window.main` - Main controller instance
- `window.molecule` - Current Molecule object
- `window.scene`, `window.camera`, `window.renderer` - Three.js objects
- `window.atomsSelected[]` - Selected atom indices
- `window.xyzFrames` - Multi-frame trajectory data
- `window.frameEnergies` - Energy values for frames
- `window.fileExplorer` - File management system

### 3. Three.js Rendering Pipeline

**Molecule Class** (`atom/molecule.js`):
- **Atoms**: Rendered using `InstancedMesh` for efficiency (handles 2000+ atoms)
- **Bonds**: Cylinder geometry with half-bond coloring
- **Materials**: Two modes:
  - Mode 0: `MeshBasicMaterial` (fast, no lighting)
  - Mode 1+: `MeshStandardMaterial` (realistic, lighting-based)
- **Protein Ribbons**: CatmullRomCurve3 for backbone traces (PDB/CIF only)

**Optimization Strategy**:
- Instanced geometry for atoms (single draw call per element type)
- Proper disposal of old geometries/materials on scene updates
- Arcball camera controls with damping

### 4. AI Agent System

**Architecture** (`aiagent.js`):
- 50+ tool functions callable by Claude AI
- Tools categories:
  - **Selection**: `select_atoms`, `select_atoms_by_element`, `select_all_atoms`
  - **Transformation**: `transform_atoms`, `rotate_fragment`, `set_angle`, `set_bond_distance`
  - **Analysis**: `measure_distance`, `measure_angle`, `analyze_molecule`
  - **Calculations**: `calculate_energy`, `optimize_geometry`, `run_md`
  - **Scans**: `rotational_scan`, `angle_scan`, `translation_scan`
  - **File I/O**: `read_file`, `create_file`, `edit_file`, `save_file`
  - **Visualization**: `toggle_labels`, `toggle_force_arrows`, `save_image`

**Backend Communication**:
- Frontend sends tool name + arguments to Flask backend
- Backend uses Claude API (`claude-haiku-4-5-20251001`) for reasoning
- Tools execute in frontend context (manipulate `window.molecule`)
- Streaming responses for real-time feedback

**MACE Integration** (`maceUtils.js`):
- ML potential models: `mace-mp-0a`, `mace-mp-0b3`, `mace-mpa-0`
- Endpoints: `/ai/mace/energy`, `/ai/mace/energy-batch`, `/ai/mace/optimize`, `/ai/mace/md`
- Format: ExtXYZ with lattice, pbc, forces

### 5. File Format Support

**Supported Formats** (11 total):

| Format | Description | Key Features |
|--------|-------------|--------------|
| XYZ | Simple Cartesian coordinates | Multi-frame, forces, charges |
| ExtXYZ | Extended XYZ with metadata | Lattice, virial, stress, pbc |
| PDB | Protein Data Bank | Ribbon data, CONECT bonds, CRYST1 |
| CIF | Crystallographic | Secondary structures, backbone atoms |
| MOL/SDF | MDL Molfile | Atomic blocks, chemical structures |
| MOL2 | Tripos | @<TRIPOS>ATOM sections |
| PQR | Modified PDB | Charge & radius data |
| GRO | GROMACS | nm→Å conversion |
| CML | Chemical Markup | XML-based |
| OUT | ORCA output | Vibrations, charges, thermodynamics |

**Parser Location**: `utils/fileHandler.js` (FileHandler class)
**Exporter Location**: `utils/fileWriter.js`

### 6. Molecular Graph Operations

**Key Utility**: `utils/graphUtils.js`

- `buildAdjacencyList(atoms, bonds)` - Creates molecular connectivity graph
- `findConnectedFragment(start, exclude, adjacencyList)` - BFS-based fragment detection
- `findFragmentAvoidingVertex(start, vertex, adjacencyList)` - Fragment without crossing atom

**When to Use**:
- Torsion scans (split molecule along bond)
- Fragment rotation (detect which atoms to move)
- Angle setting (identify movable groups)

### 7. Multi-Frame System

**Frame Storage** (`frameUtils.js`):
- `window.xyzFrames` - Array of frame objects: `{atomData: [], comment: ""}`
- `window.frameEnergies` - Corresponding energy values
- Frame slider UI for navigation

**Frame Generation**:
- `generateTransformFrames()` - Generic frame generator for scans
- `setupFrameSlider()` - Creates UI slider
- `loadFrames()` - Stores frames globally and initializes UI

**Use Cases**:
- Torsion scans (360° rotation with energy profile)
- MD trajectories (time-series data)
- Geometry optimization (convergence path)

### 8. Authentication & Persistence

**Firebase Integration** (`handleFeatures.js`):
- Firebase Auth for user authentication
- Firestore for molecule storage and user preferences
- Premium/free tier feature restrictions

**Stripe Integration** (`utils/stripe.js`):
- Payment processing for premium features
- Subscription management

## Important Patterns & Conventions

### ES6 Module Structure

All utility files are ES6 modules:
```javascript
// Import in HTML
<script type="module" src="aiagent.js"></script>

// Import in JS modules
import { buildAdjacencyList } from './utils/graphUtils.js';

// Export to window for legacy code
window.buildAdjacencyList = buildAdjacencyList;
```

### Undo/Redo Pattern

Before any mutation:
```javascript
window.undoManager.saveState();
// ... modify molecule ...
```

Restoration automatically rebuilds scene.

### Frame Slider Pattern

For any scan operation:
1. Generate frames: `const frames = generateTransformFrames({...})`
2. Load frames: `loadFrames(frames)`
3. Optional: Calculate energies for all frames
4. Optional: Create energy chart

### MACE Energy Calculation Pattern

```javascript
// Single molecule
const result = await callMaceEnergy(backendUrl, atoms, model, includeForces);
// result: {energy: -123.45, forces: [[fx, fy, fz], ...]}

// Batch (for scans)
const results = await callMaceEnergyBatch(backendUrl, frames, model, includeForces);
mergeForcesIntoFrames(results, includeForces);
```

### Scene Update Pattern

When molecule changes:
```javascript
window.molecule.atoms = newAtoms;
window.molecule.bonds = newBonds;
window.molecule.draw();  // Disposes old geometry, recreates scene
```

## Testing Workflows

### Manual Testing Checklist

1. **Load molecule**: Test all 11 file formats
2. **AI commands**:
   - "Select atoms 1,2,3"
   - "Rotate fragment around bond 4,5 by 90 degrees"
   - "Perform torsion scan around bond 10,11"
   - "Calculate energy with mace-mpa-0"
   - "Optimize geometry"
3. **Multi-frame navigation**: Load XYZ with multiple frames, use slider
4. **Protein ribbon**: Load PDB, enable ribbon mode
5. **Force visualization**: After MD/optimization, toggle force arrows
6. **Undo/redo**: Perform edits, test undo/redo
7. **File export**: Save as XYZ, PDB, ExtXYZ

### AI Agent Test Suite

Located in `demo/tests/ai-tests.js`:
```bash
npm run test:ai        # Production backend
npm run test:ai:local  # Local backend on port 10000
```

## Backend Architecture (Python Flask)

### Endpoints

**AI Chat**:
- `POST /ai/chat` - Claude API proxy with tool execution

**MACE ML Potentials**:
- `POST /ai/mace/energy` - Single molecule energy + optional forces
- `POST /ai/mace/energy-batch` - Batch energy for multiple frames
- `POST /ai/mace/optimize` - Geometry optimization (BFGS)
- `POST /ai/mace/md` - Molecular dynamics simulation (Langevin)

### Dependencies

Key packages in `requirements.txt`:
- `Flask` + `Flask-CORS` - Web server
- `anthropic` - Claude API client
- `torch` + `mace-torch` - MACE ML potentials
- `ase` - Atomic Simulation Environment
- `gunicorn` - Production WSGI server

### Deployment

**Render.com** (auto-deploy from git):
- `render.yaml` defines service configuration
- Environment variables: `ANTHROPIC_API_KEY`, `PYTHON_VERSION`
- 2 workers, 120s timeout, preload mode

## Common Pitfalls

### 1. Atom Indexing
- **All atom indices are 0-based** in code
- User-facing displays may show 1-based indices
- Always validate indices: `if (index < 0 || index >= atoms.length)`

### 2. Fragment Detection
- Use `buildAdjacencyList()` first, then `findConnectedFragment()`
- Don't implement custom BFS - use graph utils
- For torsion scans: Use the **smaller fragment** as `atomsToMove`

### 3. Frame Energy Alignment
- `window.xyzFrames` and `window.frameEnergies` must have same length
- Use `mergeForcesIntoFrames()` to align MACE results with frames
- Check `window.frameEnergies[i]` is defined before charting

### 4. Three.js Memory Leaks
- Always dispose geometries/materials when removing from scene:
  ```javascript
  mesh.geometry.dispose();
  mesh.material.dispose();
  scene.remove(mesh);
  ```
- Use `molecule.draw()` which handles disposal automatically

### 5. MACE Backend Timeout
- Large molecules or long MD runs may timeout (120s limit)
- Use batch endpoints for scans (more efficient than individual calls)
- Consider reducing frames or using faster models (`mace-mp-0a`)

### 6. File Format Parsing
- XYZ files: First line is atom count, second line is comment
- PDB files: CONECT records are essential for bonding
- ExtXYZ: Properties line must match actual columns

## Adding New Features

### Adding a New AI Tool

1. Add tool definition to backend `app.py` (`TOOLS_JSON`)
2. Implement function in `aiagent.js`:
   ```javascript
   async function my_new_tool(params) {
     // Implementation
     return { success: true, message: "..." };
   }
   ```
3. Export to window: `window.my_new_tool = my_new_tool;`
4. Test with natural language command

### Adding a New File Format

1. Add parser to `utils/fileHandler.js`:
   ```javascript
   parseNewFormatToJson(text) {
     // Return {atoms: [...], bonds: [...]}
   }
   ```
2. Register in `FileHandler.openFileFromDialog()`
3. Add writer to `utils/fileWriter.js`
4. Update format badges in landing page

### Adding a New Rendering Style

1. Add style controls in `handleStyles.js`
2. Modify `molecule.js` material creation
3. Save preferences to Firebase (if authenticated)

## Performance Optimization

### For Large Molecules (>1000 atoms)
- Use mode 0 rendering (faster materials)
- Reduce sphere resolution: `atomSettings.resolution = 8`
- Disable force arrows initially
- Use `select_atoms_by_element` instead of individual selection

### For Long Scans (>100 frames)
- Increase increment angle (fewer frames)
- Use batch energy calculation
- Consider downsampling for charting

### For Backend Performance
- Cache MACE calculators (done automatically)
- Use GPU if available (PyTorch CUDA)
- Increase Gunicorn workers for parallel requests

## Key Differences from Version 1.0

1. **17x faster rendering** - Instanced geometry instead of individual meshes
2. **AI-powered editing** - Natural language commands via Claude
3. **MACE integration** - ML potentials for energy/optimization
4. **Multi-frame support** - Trajectories, scans, animations
5. **Modular utilities** - DRY refactoring eliminates ~356 lines of duplicates
6. **Cloud storage** - Firebase integration for persistence

## Support & Resources

- **Backend URL**: `https://chopchopmol-ai-backend.onrender.com`
- **Firebase Project**: `chopchopmol-2`
- **MACE Models**: https://github.com/ACEsuit/mace-foundations
- **Three.js Docs**: https://threejs.org/docs/
