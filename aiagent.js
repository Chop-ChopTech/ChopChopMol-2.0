// aiAgent.js - AI Agent for ChopChopMol

const AI_CONFIG = {
    apiKey: '',
    model: 'gpt-5-nano',
    max_completion_tokens: 16384
};

let conversationHistory = [];

// ALL functions the AI can execute
const FUNCTIONS = {
    select_atoms: {
        description: "Select atoms by their indices. Use this before any transformation.",
        parameters: {
            type: "object",
            properties: {
                indices: { type: "array", items: { type: "integer" }, description: "Array of atom indices to select" },
                add: { type: "boolean", description: "If true, add to current selection; if false, replace selection" }
            },
            required: ["indices"]
        },
        execute: (params) => {
            if (!window.main?.molecule?.atoms) return { success: false, message: "No molecule loaded" };

            if (!params.add && typeof window.unselectAtom === 'function') {
                window.unselectAtom();
                window.atomsSelected = [];
            }

            params.indices.forEach(idx => {
                if (idx >= 0 && idx < window.main.molecule.atoms.length) {
                    if (typeof window.selectAtom === 'function') window.selectAtom(idx, false);
                    if (!window.atomsSelected) window.atomsSelected = [];
                    if (!window.atomsSelected.includes(idx)) window.atomsSelected.push(idx);
                }
            });

            if (window.atomsSelected?.length > 0) {
                const el = window.main.molecule.atoms[window.atomsSelected[0]].type;
                if (typeof window.updateEditingContent === 'function')
                    window.updateEditingContent(el, window.main.molecule.atomSettings[el].color);
                if (typeof window.attachButtonEventListeners === 'function')
                    window.attachButtonEventListeners();
            }
            if (typeof window.render === 'function') window.render();
            return { success: true, message: `Selected ${params.indices.length} atoms: [${params.indices.join(', ')}]` };
        }
    },

    add_atom: {
        description: "Add a new atom at a specific position or bonded to a selected atom",
        parameters: {
            type: "object",
            properties: {
                element: { type: "string", description: "Element symbol (e.g., 'C', 'H', 'O')" },
                x: { type: "number", description: "X coordinate (optional if bonding to selected atom)" },
                y: { type: "number", description: "Y coordinate" },
                z: { type: "number", description: "Z coordinate" },
                bondToSelected: { type: "boolean", description: "If true, add atom bonded to the selected atom at typical bond length" }
            },
            required: ["element"]
        },
        execute: (params) => {
            if (!window.main?.data?.atomData) return { success: false, message: "No molecule loaded" };

            let x, y, z;
            if (params.bondToSelected && window.atomsSelected?.length === 1) {
                // Add at typical bond distance from selected atom
                const selectedIdx = window.atomsSelected[0];
                const selectedAtom = window.main.data.atomData[selectedIdx];
                const bondLength = 1.5; // Typical C-C bond in Angstroms
                x = selectedAtom.x + bondLength;
                y = selectedAtom.y;
                z = selectedAtom.z;
            } else {
                x = params.x ?? 0;
                y = params.y ?? 0;
                z = params.z ?? 0;
            }

            window.main.data.atomData.push({ element: params.element.toUpperCase(), x, y, z });
            window.main.data.numAtoms++;
            window.main.newMolecule(window.main.data, window.main.mode, false, { x: 0, y: 0, z: 0 }, { x: 0, y: 0, z: 0 }, true, true);
            return { success: true, message: `Added ${params.element} at (${x.toFixed(2)}, ${y.toFixed(2)}, ${z.toFixed(2)})` };
        }
    },

    set_bond_distance: {
        description: "Set exact distance between two selected atoms (in Angstroms)",
        parameters: {
            type: "object",
            properties: {
                distance: { type: "number", description: "Target distance in Angstroms" }
            },
            required: ["distance"]
        },
        execute: (params) => {
            if (!window.atomsSelected || window.atomsSelected.length !== 2)
                return { success: false, message: "Select exactly 2 atoms first" };

            const idx1 = window.atomsSelected[0], idx2 = window.atomsSelected[1];
            const atom1 = window.main.molecule.atoms[idx1];
            const atom2 = window.main.molecule.atoms[idx2];

            const targetInternal = params.distance * 4; // Convert to internal units
            const currentVector = new window.THREE.Vector3().subVectors(atom2.position, atom1.position);
            const currentDist = currentVector.length();

            if (currentDist === 0) return { success: false, message: "Atoms at same position" };

            const translation = currentVector.normalize().multiplyScalar(targetInternal - currentDist);
            atom2.position.add(translation);
            atom2.x = atom2.position.x;
            atom2.y = atom2.position.y;
            atom2.z = atom2.position.z;

            if (typeof window.updateMoleculeVisualization === 'function') window.updateMoleculeVisualization();
            return { success: true, message: `Set distance to ${params.distance} Å` };
        }
    },

    clear_selection: {
        description: "Clear all atom selections",
        parameters: { type: "object", properties: {} },
        execute: () => {
            if (typeof window.unselectAtom === 'function') window.unselectAtom();
            window.atomsSelected = [];
            if (typeof window.render === 'function') window.render();
            return { success: true, message: "Selection cleared" };
        }
    },

    select_all_atoms: {
        description: "Select all atoms in the molecule",
        parameters: { type: "object", properties: {} },
        execute: () => {
            if (!window.main?.molecule?.atoms) return { success: false, message: "No molecule loaded" };
            const all = Array.from({ length: window.main.molecule.atoms.length }, (_, i) => i);
            return FUNCTIONS.select_atoms.execute({ indices: all, add: false });
        }
    },

    select_atoms_by_element: {
        description: "Select all atoms of a specific element type (e.g., C, N, O, H). Much faster than selecting by indices.",
        parameters: {
            type: "object",
            properties: {
                element: {
                    type: "string",
                    description: "Element symbol (e.g., 'C' for carbon, 'N' for nitrogen, 'O' for oxygen, 'H' for hydrogen)"
                },
                add: {
                    type: "boolean",
                    description: "If true, add to current selection; if false, replace selection"
                }
            },
            required: ["element"]
        },
        execute: (params) => {
            if (!window.main?.molecule?.atoms) return { success: false, message: "No molecule loaded" };

            // Find all atoms matching the element
            const matchingIndices = [];
            window.main.molecule.atoms.forEach((atom, idx) => {
                if (atom.type.toUpperCase() === params.element.toUpperCase()) {
                    matchingIndices.push(idx);
                }
            });

            if (matchingIndices.length === 0) {
                return { success: false, message: `No ${params.element} atoms found` };
            }

            // Use existing select_atoms logic
            return FUNCTIONS.select_atoms.execute({
                indices: matchingIndices,
                add: params.add || false
            });
        }
    },

    // === AXIS DEFINITION ===
    define_axis: {
        description: "Define rotation/translation axis from 2 selected atoms. MUST have exactly 2 atoms selected first.",
        parameters: { type: "object", properties: {} },
        execute: () => {
            if (!window.main?.molecule?.atoms) return { success: false, message: "No molecule loaded" };
            if (!window.atomsSelected || window.atomsSelected.length !== 2)
                return { success: false, message: `Need exactly 2 atoms selected. Have ${window.atomsSelected?.length || 0}. Use select_atoms first.` };

            const idx1 = window.atomsSelected[0], idx2 = window.atomsSelected[1];
            const atom1 = window.main.molecule.atoms[idx1], atom2 = window.main.molecule.atoms[idx2];

            if (window.THREE) {
                const pos1 = new window.THREE.Vector3(atom1.x, atom1.y, atom1.z);
                const pos2 = new window.THREE.Vector3(atom2.x, atom2.y, atom2.z);
                window.rotationAxis = {
                    point: pos1.clone(),
                    direction: new window.THREE.Vector3().subVectors(pos2, pos1).normalize()
                };
                window.axisAtoms = [idx1, idx2];
            }

            const btn = document.getElementById('defineAxisBtn');
            if (btn) btn.click();
            if (typeof window.render === 'function') window.render();
            return { success: true, message: `Axis defined between atoms ${idx1} and ${idx2}` };
        }
    },

    remove_axis: {
        description: "Remove the currently defined axis",
        parameters: { type: "object", properties: {} },
        execute: () => {
            window.rotationAxis = null;
            window.axisAtoms = [];
            const btn = document.getElementById('removeAxisBtn');
            if (btn) btn.click();
            if (typeof window.render === 'function') window.render();
            return { success: true, message: "Axis removed" };
        }
    },

    // === TRANSFORMATIONS ===
    rotate_molecule: {
        description: "Rotate selected atoms (or all if none selected) around the defined axis by given angle",
        parameters: {
            type: "object",
            properties: {
                angle: { type: "number", description: "Rotation angle in degrees (-180 to 180)" }
            },
            required: ["angle"]
        },
        execute: (params) => {
            if (!window.rotationAxis) return { success: false, message: "No axis defined. Select 2 atoms and call define_axis first." };
            if (typeof window.rotateSelectedAtoms !== 'function') return { success: false, message: "Rotation function not available" };

            if (typeof window.initializeRotationState === 'function' && window.rotationState) {
                const atoms = window.atomsSelected?.length > 0 ? window.atomsSelected
                    : Array.from({ length: window.main.molecule.atoms.length }, (_, i) => i);
                window.initializeRotationState(atoms, window.rotationAxis);
            }

            window.rotateSelectedAtoms(params.angle, { relative: false });
            if (typeof window.render === 'function') window.render();
            return { success: true, message: `Rotated ${params.angle}°` };
        }
    },

    translate_molecule: {
        description: "Move selected atoms (or all if none selected) along the defined axis by given distance in angstroms",
        parameters: {
            type: "object",
            properties: {
                distance: { type: "number", description: "Distance to translate in angstroms (positive or negative)" }
            },
            required: ["distance"]
        },
        execute: (params) => {
            if (!window.rotationAxis) return { success: false, message: "No axis defined. Select 2 atoms and call define_axis first." };
            if (typeof window.translateSelectedAtoms !== 'function') return { success: false, message: "Translation function not available" };

            window.translateSelectedAtoms(params.distance);
            if (typeof window.updateMoleculeVisualization === 'function') window.updateMoleculeVisualization();
            else if (typeof window.render === 'function') window.render();
            return { success: true, message: `Translated ${params.distance} Å` };
        }
    },

    // === ATOM EDITING ===
    change_atom_element: {
        description: "Change the element type of selected atoms (e.g., change Carbon to Nitrogen)",
        parameters: {
            type: "object",
            properties: {
                element: { type: "string", description: "New element symbol (e.g., 'C', 'N', 'O', 'H', 'S', 'P')" }
            },
            required: ["element"]
        },
        execute: (params) => {
            if (!window.main?.data?.atomData) return { success: false, message: "No molecule loaded" };
            if (!window.atomsSelected?.length) return { success: false, message: "No atoms selected" };

            window.atomsSelected.forEach(idx => {
                if (window.main.data.atomData[idx]) {
                    window.main.data.atomData[idx].element = params.element.toUpperCase();
                }
            });
            window.main.newMolecule(window.main.data, window.main.mode, false, { x: 0, y: 0, z: 0 }, { x: 0, y: 0, z: 0 }, true, true);
            return { success: true, message: `Changed ${window.atomsSelected.length} atom(s) to ${params.element}` };
        }
    },

    remove_atoms: {
        description: "Delete the currently selected atoms from the molecule",
        parameters: { type: "object", properties: {} },
        execute: () => {
            if (!window.main?.data?.atomData) return { success: false, message: "No molecule loaded" };
            if (!window.atomsSelected?.length) return { success: false, message: "No atoms selected" };

            const sorted = [...window.atomsSelected].sort((a, b) => b - a);
            sorted.forEach(idx => window.main.data.atomData.splice(idx, 1));
            window.main.data.numAtoms -= window.atomsSelected.length;
            const removed = window.atomsSelected.length;
            window.atomsSelected = [];
            window.main.newMolecule(window.main.data, window.main.mode, false, { x: 0, y: 0, z: 0 }, { x: 0, y: 0, z: 0 }, true, true);
            return { success: true, message: `Removed ${removed} atom(s)` };
        }
    },

    // === MEASUREMENTS ===
    measure_distance: {
        description: "Measure and display the distance between 2 atoms. Select exactly 2 atoms first.",
        parameters: { type: "object", properties: {} },
        execute: () => {
            if (!window.atomsSelected || window.atomsSelected.length !== 2)
                return { success: false, message: "Select exactly 2 atoms to measure distance" };

            if (typeof window.createInfoLabel === 'function') {
                window.createInfoLabel(window.atomsSelected[0], window.atomsSelected[1]);
                return { success: true, message: "Distance label created" };
            }

            // Fallback calculation
            const a1 = window.main.molecule.atoms[window.atomsSelected[0]];
            const a2 = window.main.molecule.atoms[window.atomsSelected[1]];
            const dist = Math.sqrt((a2.x - a1.x) ** 2 + (a2.y - a1.y) ** 2 + (a2.z - a1.z) ** 2);
            return { success: true, message: `Distance: ${(dist / 4).toFixed(2)} Å` };
        }
    },

    measure_angle: {
        description: "Measure and display the angle between 3 atoms. Select exactly 3 atoms (middle atom is vertex).",
        parameters: { type: "object", properties: {} },
        execute: () => {
            if (!window.atomsSelected || window.atomsSelected.length !== 3)
                return { success: false, message: "Select exactly 3 atoms to measure angle (middle = vertex)" };

            if (typeof window.createInfoLabel === 'function') {
                window.createInfoLabel(window.atomsSelected[0], window.atomsSelected[1], window.atomsSelected[2]);
                return { success: true, message: "Angle label created" };
            }
            return { success: false, message: "Angle measurement not available" };
        }
    },

    measure_dihedral: {
        description: "Measure dihedral/torsion angle between 4 atoms. Select exactly 4 atoms in order.",
        parameters: { type: "object", properties: {} },
        execute: () => {
            if (!window.atomsSelected || window.atomsSelected.length !== 4)
                return { success: false, message: "Select exactly 4 atoms for dihedral angle" };

            if (typeof window.createInfoLabel === 'function') {
                window.createInfoLabel(window.atomsSelected[0], window.atomsSelected[1], window.atomsSelected[2], window.atomsSelected[3]);
                return { success: true, message: "Dihedral angle label created" };
            }
            return { success: false, message: "Dihedral measurement not available" };
        }
    },

    clear_measurements: {
        description: "Remove all distance/angle measurement labels",
        parameters: { type: "object", properties: {} },
        execute: () => {
            if (typeof window.clearAllBondLengthLabels === 'function') {
                window.clearAllBondLengthLabels();
                return { success: true, message: "All measurements cleared" };
            }
            return { success: false, message: "Clear function not available" };
        }
    },

    // === FRAGMENTS ===
    create_fragment: {
        description: "Create a fragment (group) from currently selected atoms for easier manipulation",
        parameters: { type: "object", properties: {} },
        execute: () => {
            if (!window.atomsSelected?.length) return { success: false, message: "No atoms selected" };
            const btn = document.getElementById('createFragment');
            if (btn) { btn.click(); return { success: true, message: `Fragment created with ${window.atomsSelected.length} atoms` }; }
            return { success: false, message: "Fragment creation not available" };
        }
    },

    isolate_selection: {
        description: "Isolate selected atoms/fragment to view and edit them separately",
        parameters: { type: "object", properties: {} },
        execute: () => {
            const btn = document.getElementById('isolateFragmentBtn');
            if (btn) { btn.click(); return { success: true, message: "Selection isolated" }; }
            return { success: false, message: "Isolate function not available" };
        }
    },

    // === VIEW CONTROLS ===
    reset_camera: {
        description: "Reset camera to default view position",
        parameters: { type: "object", properties: {} },
        execute: () => {
            if (typeof window.resetCamera === 'function') { window.resetCamera(); return { success: true, message: "Camera reset" }; }
            return { success: false, message: "Reset not available" };
        }
    },

    zoom_to_fit: {
        description: "Zoom camera to fit the entire molecule in view",
        parameters: { type: "object", properties: {} },
        execute: () => {
            if (window.main?.zoomCameraToFitMolecule) {
                window.main.zoomCameraToFitMolecule();
                if (typeof window.render === 'function') window.render();
                return { success: true, message: "Zoomed to fit" };
            }
            return { success: false, message: "Zoom not available" };
        }
    },

    rotate_camera: {
        description: "Rotate camera view around the molecule",
        parameters: {
            type: "object",
            properties: { angle: { type: "number", description: "Rotation angle in degrees" } },
            required: ["angle"]
        },
        execute: (params) => {
            if (typeof window.rotateCamera === 'function' && window.camera) {
                window.rotateCamera(params.angle * Math.PI / 180, window.camera, window.controls);
                if (typeof window.render === 'function') window.render();
                return { success: true, message: `Camera rotated ${params.angle}°` };
            }
            return { success: false, message: "Camera rotation not available" };
        }
    },

    toggle_labels: {
        description: "Show or hide atom labels (element symbols or indices)",
        parameters: {
            type: "object",
            properties: {
                show: { type: "boolean", description: "True to show, false to hide" },
                showIndices: { type: "boolean", description: "If true, show atom numbers instead of elements" }
            },
            required: ["show"]
        },
        execute: (params) => {
            if (!window.main?.molecule) return { success: false, message: "No molecule loaded" };

            if (params.showIndices !== undefined) window.labelIndexMode = params.showIndices;
            window.main.toggleLabels(params.show);
            if (typeof window.render === 'function') window.render();
            return { success: true, message: params.show ? "Labels shown" : "Labels hidden" };
        }
    },

    select_connected: {
        description: "Expand selection to all atoms connected (bonded) to currently selected atoms",
        parameters: { type: "object", properties: {} },
        execute: () => {
            if (!window.main?.molecule?.bonds) return { success: false, message: "No molecule loaded" };
            if (!window.atomsSelected?.length) return { success: false, message: "No atoms selected" };

            const connected = new Set(window.atomsSelected);
            let added = true;

            while (added) {
                added = false;
                window.main.molecule.bonds.forEach(bond => {
                    const idx1 = window.main.molecule.atoms.indexOf(bond.atom1);
                    const idx2 = window.main.molecule.atoms.indexOf(bond.atom2);
                    if (connected.has(idx1) && !connected.has(idx2)) { connected.add(idx2); added = true; }
                    if (connected.has(idx2) && !connected.has(idx1)) { connected.add(idx1); added = true; }
                });
            }

            return FUNCTIONS.select_atoms.execute({ indices: Array.from(connected), add: false });
        }
    },

    toggle_ribbon: {
        description: "Toggle ribbon view for protein structures",
        parameters: { type: "object", properties: {} },
        execute: () => {
            if (!window.main?.data?.ribbonData) return { success: false, message: "Not a protein - no ribbon data" };
            if (typeof window.toggleRibbon === 'function') {
                window.toggleRibbon();
                return { success: true, message: `Ribbon mode ${window.ribbonMode ? 'enabled' : 'disabled'}` };
            }
            return { success: false, message: "Ribbon toggle not available" };
        }
    },

    // === STYLE ===
    set_style: {
        description: "Change visual appearance of the molecule",
        parameters: {
            type: "object",
            properties: {
                roughness: { type: "number", description: "Surface roughness 0-1" },
                metalness: { type: "number", description: "Metallic look 0-1" },
                opacity: { type: "number", description: "Transparency 0-1 (1=solid)" },
                atomSize: { type: "number", description: "Atom size multiplier 0.1-3" },
                backgroundColor: { type: "string", description: "Background color as hex e.g. #000000" }
            }
        },
        execute: (params) => {
            let changed = [];
            if (params.roughness !== undefined) { document.getElementById('style1').value = params.roughness; window.main.roughness = params.roughness; changed.push('roughness'); }
            if (params.metalness !== undefined) { document.getElementById('style2').value = params.metalness; window.main.metalness = params.metalness; changed.push('metalness'); }
            if (params.opacity !== undefined) { document.getElementById('style3').value = params.opacity; window.main.opacity = params.opacity; changed.push('opacity'); }
            if (params.atomSize !== undefined) { document.getElementById('style5').value = params.atomSize; window.main.atomSize = params.atomSize; changed.push('atomSize'); }
            if (params.backgroundColor !== undefined && window.scene && window.THREE) {
                document.getElementById('style8').value = params.backgroundColor;
                window.scene.background = new window.THREE.Color(params.backgroundColor);
                changed.push('background');
            }

            if (window.main?.data && changed.length > 0) {
                document.getElementById('toggleStyleChanges').checked = true;
                const mode = window.main.setNewMode(true);
                window.main.newMolecule(window.main.data, mode, false, { x: 0, y: 0, z: 0 }, { x: 0, y: 0, z: 0 }, true, true);
            }
            if (typeof window.render === 'function') window.render();
            return { success: true, message: `Changed: ${changed.join(', ')}` };
        }
    },

    // === FILE OPERATIONS ===
    save_image: {
        description: "Save a screenshot of the current view as PNG",
        parameters: { type: "object", properties: {} },
        execute: () => {
            const btn = document.getElementById('captureScreen');
            if (btn) { btn.click(); return { success: true, message: "Image saved" }; }
            return { success: false, message: "Save not available" };
        }
    },

    save_xyz: {
        description: "Save molecule as XYZ file",
        parameters: { type: "object", properties: {} },
        execute: () => {
            const btn = document.getElementById('saveXYZ');
            if (btn) { btn.click(); return { success: true, message: "XYZ file saved" }; }
            return { success: false, message: "Save not available" };
        }
    },

    load_molecule: {
        description: "Search and load a molecule by name from PubChem database",
        parameters: {
            type: "object",
            properties: { name: { type: "string", description: "Molecule name e.g. caffeine, aspirin" } },
            required: ["name"]
        },
        execute: (params) => {
            const input = document.getElementById('dbSearchInput');
            if (input) {
                input.value = params.name;
                input.dispatchEvent(new Event('input', { bubbles: true }));
                input.focus();
                return { success: true, message: `Searching for "${params.name}"... Select from dropdown.` };
            }
            return { success: false, message: "Search not available" };
        }
    },

    // === INFO ===
    get_molecule_info: {
        description: "Get information about the loaded molecule",
        parameters: { type: "object", properties: {} },
        execute: () => {
            if (!window.main?.molecule?.atoms) return { success: false, message: "No molecule loaded" };
            const atoms = window.main.molecule.atoms;
            const counts = {};
            atoms.forEach(a => counts[a.type] = (counts[a.type] || 0) + 1);
            return {
                success: true,
                message: `${atoms.length} atoms: ${Object.entries(counts).map(([k, v]) => `${v} ${k}`).join(', ')}`,
                data: { totalAtoms: atoms.length, elements: counts, selected: window.atomsSelected?.length || 0, hasAxis: !!window.rotationAxis }
            };
        }
    },

    get_atom_info: {
        description: "Get detailed info about specific atoms",
        parameters: {
            type: "object",
            properties: { indices: { type: "array", items: { type: "integer" }, description: "Atom indices to get info for" } },
            required: ["indices"]
        },
        execute: (params) => {
            if (!window.main?.molecule?.atoms) return { success: false, message: "No molecule loaded" };
            const info = params.indices.map(i => {
                const a = window.main.molecule.atoms[i];
                if (!a) return { index: i, error: "not found" };
                return { index: i, element: a.type, x: a.x.toFixed(3), y: a.y.toFixed(3), z: a.z.toFixed(3) };
            });
            return { success: true, message: `Info for ${params.indices.length} atom(s)`, data: info };
        }
    },

    // === UNDO/REDO ===
    undo: {
        description: "Undo the last action",
        parameters: { type: "object", properties: {} },
        execute: () => {
            if (window.undoManager?.hasUndo?.()) { window.undoManager.undo(); return { success: true, message: "Undone" }; }
            return { success: false, message: "Nothing to undo" };
        }
    },

    redo: {
        description: "Redo the last undone action",
        parameters: { type: "object", properties: {} },
        execute: () => {
            if (window.undoManager?.hasRedo?.()) { window.undoManager.redo(); return { success: true, message: "Redone" }; }
            return { success: false, message: "Nothing to redo" };
        }
    }
};

function buildToolsSchema() {
    return Object.entries(FUNCTIONS).map(([name, def]) => ({
        type: "function",
        function: { name, description: def.description, parameters: def.parameters }
    }));
}

function getMoleculeState() {
    const hasAtoms = !!window.main?.molecule?.atoms?.length;
    return {
        hasAtoms,
        atomCount: hasAtoms ? window.main.molecule.atoms.length : 0,
        selectedCount: window.atomsSelected?.length || 0,
        selectedIndices: window.atomsSelected?.slice(0, 20) || [],
        fragments: window.fragments || [],
        hasAxis: !!window.rotationAxis,
        hasRibbon: !!window.main?.data?.ribbonData
    };
}

async function sendToAI(userMessage) {
    if (!AI_CONFIG.apiKey) return { error: "API key not set. Click ⚙️ to add your OpenAI API key." };

    const state = getMoleculeState();

    const systemPrompt = `You are an AI assistant for ChopChopMol, a 3D molecular editor.

STATE:
- Molecule: ${state.hasAtoms ? state.atomCount + ' atoms' : 'None loaded'}
- Selected: ${state.selectedCount} atoms ${state.selectedCount > 0 ? '[' + state.selectedIndices.join(',') + ']' : ''}
- Fragments: ${state.fragments.length} fragments and list of fragments and atoms: ${JSON.stringify(state.fragments)} also it is zero based, so make sure you refer to the real fragment 0 as fragment 1 and so on. Same with atom indexes.
- Axis: ${state.hasAxis ? 'DEFINED' : 'NOT defined'}
- Protein: ${state.hasRibbon ? 'Yes' : 'No'}
Make sure that when talking about atoms, what you see is 0-based but what the user sees is 1-based, so refer to atom 0 as atom 1 and so on.

CRITICAL RULES FOR TRANSFORMATIONS:
To rotate or translate atoms, you MUST call functions in this EXACT order:
1. select_atoms([atom1, atom2]) - select 2 atoms that define the axis direction
2. define_axis() - creates the rotation/translation axis
3. select_atoms([atoms to move]) - select the atoms you want to transform
4. rotate_molecule(angle) OR translate_molecule(distance)

EXAMPLE: "rotate atoms 5,6,7 by 30 degrees around axis from atoms 0 to 1"
Call these 4 functions:
1. select_atoms({indices: [0, 1]})
2. define_axis()
3. select_atoms({indices: [5, 6, 7]})
4. rotate_molecule({angle: 30})

EXAMPLE: "move atoms 2,3 by 2 angstroms along the bond between atoms 0 and 1"
Call these 4 functions:
1. select_atoms({indices: [0, 1]})
2. define_axis()
3. select_atoms({indices: [2, 3]})
4. translate_molecule({distance: 2})

ALL AVAILABLE FUNCTIONS:

=== SELECTION ===
- select_atoms: Select atoms by indices array. Use add:true to add to selection, add:false to replace.
- clear_selection: Deselect all atoms
- select_all_atoms: Select every atom in the molecule
- select_atoms_by_element: Select all atoms of a specific element (e.g., "C", "N", "O", "H")
- select_connected: Expand selection to all atoms bonded/connected to currently selected atoms

=== BUILDING & EDITING ===
- add_atom: Add a new atom. Specify element and x,y,z coordinates, OR set bondToSelected:true to place near selected atom
- change_atom_element: Change selected atoms to a different element type
- remove_atoms: Delete all currently selected atoms
- set_bond_distance: Set exact distance (in Å) between 2 selected atoms

=== TRANSFORMATIONS (require axis) ===
- define_axis: Create rotation/translation axis from 2 selected atoms (MUST select 2 atoms first)
- remove_axis: Remove the current axis
- rotate_molecule: Rotate selected atoms around axis by angle in degrees (-180 to 180)
- translate_molecule: Move selected atoms along axis by distance in angstroms

=== MEASUREMENTS ===
- measure_distance: Create distance label between 2 selected atoms
- measure_angle: Create angle label for 3 selected atoms (middle atom is vertex)
- measure_dihedral: Create dihedral/torsion angle label for 4 selected atoms
- clear_measurements: Remove all measurement labels

=== FRAGMENTS ===
- create_fragment: Group selected atoms into a fragment for easier manipulation
- isolate_selection: Isolate selected atoms/fragment to view separately

=== VIEW & CAMERA ===
- reset_camera: Reset camera to default position
- zoom_to_fit: Zoom camera to fit entire molecule in view
- rotate_camera: Rotate camera view by angle in degrees
- toggle_labels: Show/hide atom labels. Use show:true/false, showIndices:true for atom numbers
- toggle_ribbon: Toggle ribbon view for proteins (only works if protein loaded)

=== STYLE ===
- set_style: Change appearance. Options: roughness (0-1), metalness (0-1), opacity (0-1), atomSize (0.1-3), backgroundColor (hex like "#000000")

=== FILE OPERATIONS ===
- save_image: Save screenshot as PNG
- save_xyz: Export molecule as XYZ file
- load_molecule: Search PubChem database by molecule name (e.g., "caffeine", "aspirin")

=== INFO ===
- get_molecule_info: Get atom count, element breakdown, selection status
- get_atom_info: Get coordinates and element type for specific atom indices

=== UNDO/REDO ===
- undo: Undo last action
- redo: Redo last undone action

Atom indices are 0-based internally. Always call ALL required functions in sequence. Be concise. Use multiple functions when needed!
After all tool calls, respond with 1-2 sentences max summarizing what was done. No need to explain steps or repeat results.`;

    conversationHistory.push({ role: "user", content: userMessage });
    let messages = [{ role: "system", content: systemPrompt }, ...conversationHistory.slice(-10)];

    let executed = [];
    let finalContent = null;

    try {
        while (true) {
            const response = await fetch('https://api.openai.com/v1/chat/completions', {
                method: 'POST',
                headers: { 'Content-Type': 'application/json', 'Authorization': `Bearer ${AI_CONFIG.apiKey}` },
                body: JSON.stringify({
                    model: AI_CONFIG.model,
                    messages,
                    tools: buildToolsSchema(),
                    tool_choice: "auto",
                    max_completion_tokens: AI_CONFIG.max_completion_tokens
                })
            });

            if (!response.ok) {
                const err = await response.json();
                return { error: err.error?.message || 'API error' };
            }

            const data = await response.json();
            const msg = data.choices[0].message;

            if (msg.content) {
                finalContent = msg.content;
                conversationHistory.push({ role: "assistant", content: finalContent });
                break;
            }

            if (msg.tool_calls?.length > 0) {
                const results = [];

                for (const tc of msg.tool_calls) {
                    const fn = tc.function.name;
                    const args = JSON.parse(tc.function.arguments || '{}');
                    if (FUNCTIONS[fn]) {
                        const res = await FUNCTIONS[fn].execute(args);
                        results.push({ tool_call_id: tc.id, role: "tool", name: fn, content: JSON.stringify(res) });
                        executed.push({ name: fn, args, result: res });
                    }
                }

                messages.push(msg);
                messages = messages.concat(results);
            } else {
                break;
            }
        }

        return { content: finalContent, actions: executed };

    } catch (e) {
        console.error('AI Error:', e);
        return { error: e.message };
    }
}

window.AIAgent = {
    send: sendToAI,
    setApiKey: (k) => { AI_CONFIG.apiKey = k; localStorage.setItem('chopchop_ai_key', k); },
    getApiKey: () => AI_CONFIG.apiKey,
    hasApiKey: () => !!AI_CONFIG.apiKey,
    clearHistory: () => { conversationHistory = []; }
};