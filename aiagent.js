// aiAgent.js - AI Agent for ChopChopMol (Backend Version)

const AI_CONFIG = {
    backendUrl: 'https://chopchopmol-ai-backend.onrender.com',
    sessionId: localStorage.getItem('chopchop_ai_session') || crypto.randomUUID()
};
// Save immediately if new
if (!localStorage.getItem('chopchop_ai_session')) {
    localStorage.setItem('chopchop_ai_session', AI_CONFIG.sessionId);
}

// ALL functions the AI can execute (kept on frontend - they manipulate DOM/Three.js)
const FUNCTIONS = {
    select_atoms: {
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
            return { success: true, message: `Selected ${params.indices.length} atoms` };
        }
    },

    add_atom: {
        execute: (params) => {
            if (!window.main?.data?.atomData) return { success: false, message: "No molecule loaded" };
            let x, y, z;
            if (params.bondToSelected && window.atomsSelected?.length === 1) {
                const selectedAtom = window.main.data.atomData[window.atomsSelected[0]];
                x = selectedAtom.x + 1.5;
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
            return { success: true, message: `Added ${params.element}` };
        }
    },

    set_bond_distance: {
        execute: (params) => {
            if (!window.atomsSelected || window.atomsSelected.length !== 2) return { success: false, message: "Select exactly 2 atoms" };
            const idx1 = window.atomsSelected[0], idx2 = window.atomsSelected[1];
            const atom1 = window.main.molecule.atoms[idx1], atom2 = window.main.molecule.atoms[idx2];
            const targetInternal = params.distance * 4;
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
        execute: () => {
            if (typeof window.unselectAtom === 'function') window.unselectAtom();
            window.atomsSelected = [];
            if (typeof window.render === 'function') window.render();
            return { success: true, message: "Selection cleared" };
        }
    },

    select_all_atoms: {
        execute: () => {
            if (!window.main?.molecule?.atoms) return { success: false, message: "No molecule loaded" };
            const all = Array.from({ length: window.main.molecule.atoms.length }, (_, i) => i);
            return FUNCTIONS.select_atoms.execute({ indices: all, add: false });
        }
    },

    select_atoms_by_element: {
        execute: (params) => {
            if (!window.main?.molecule?.atoms) return { success: false, message: "No molecule loaded" };
            const matchingIndices = [];
            window.main.molecule.atoms.forEach((atom, idx) => {
                if (atom.type.toUpperCase() === params.element.toUpperCase()) matchingIndices.push(idx);
            });
            if (matchingIndices.length === 0) return { success: false, message: `No ${params.element} atoms found` };
            return FUNCTIONS.select_atoms.execute({ indices: matchingIndices, add: params.add || false });
        }
    },

    define_axis: {
        execute: () => {
            if (!window.main?.molecule?.atoms) return { success: false, message: "No molecule loaded" };
            if (!window.atomsSelected || window.atomsSelected.length !== 2)
                return { success: false, message: `Need exactly 2 atoms selected. Have ${window.atomsSelected?.length || 0}.` };
            const idx1 = window.atomsSelected[0], idx2 = window.atomsSelected[1];
            const atom1 = window.main.molecule.atoms[idx1], atom2 = window.main.molecule.atoms[idx2];
            if (window.THREE) {
                const pos1 = new window.THREE.Vector3(atom1.x, atom1.y, atom1.z);
                const pos2 = new window.THREE.Vector3(atom2.x, atom2.y, atom2.z);
                window.rotationAxis = { point: pos1.clone(), direction: new window.THREE.Vector3().subVectors(pos2, pos1).normalize() };
                window.axisAtoms = [idx1, idx2];
            }
            const btn = document.getElementById('defineAxisBtn');
            if (btn) btn.click();
            if (typeof window.render === 'function') window.render();
            return { success: true, message: `Axis defined between atoms ${idx1} and ${idx2}` };
        }
    },

    remove_axis: {
        execute: () => {
            window.rotationAxis = null;
            window.axisAtoms = [];
            const btn = document.getElementById('removeAxisBtn');
            if (btn) btn.click();
            if (typeof window.render === 'function') window.render();
            return { success: true, message: "Axis removed" };
        }
    },

    rotate_molecule: {
        execute: (params) => {
            if (!window.rotationAxis) return { success: false, message: "No axis defined" };
            if (typeof window.rotateSelectedAtoms !== 'function') return { success: false, message: "Rotation not available" };
            if (typeof window.initializeRotationState === 'function' && window.rotationState) {
                const atoms = window.atomsSelected?.length > 0 ? window.atomsSelected : Array.from({ length: window.main.molecule.atoms.length }, (_, i) => i);
                window.initializeRotationState(atoms, window.rotationAxis);
            }
            window.rotateSelectedAtoms(params.angle, { relative: false });
            if (typeof window.render === 'function') window.render();
            return { success: true, message: `Rotated ${params.angle}°` };
        }
    },

    translate_molecule: {
        execute: (params) => {
            if (!window.rotationAxis) return { success: false, message: "No axis defined" };
            if (typeof window.translateSelectedAtoms !== 'function') return { success: false, message: "Translation not available" };
            window.translateSelectedAtoms(params.distance);
            if (typeof window.updateMoleculeVisualization === 'function') window.updateMoleculeVisualization();
            else if (typeof window.render === 'function') window.render();
            return { success: true, message: `Translated ${params.distance} Å` };
        }
    },

    change_atom_element: {
        execute: (params) => {
            if (!window.main?.data?.atomData) return { success: false, message: "No molecule loaded" };
            if (!window.atomsSelected?.length) return { success: false, message: "No atoms selected" };
            window.atomsSelected.forEach(idx => {
                if (window.main.data.atomData[idx]) window.main.data.atomData[idx].element = params.element.toUpperCase();
            });
            window.main.newMolecule(window.main.data, window.main.mode, false, { x: 0, y: 0, z: 0 }, { x: 0, y: 0, z: 0 }, true, true);
            return { success: true, message: `Changed ${window.atomsSelected.length} atom(s) to ${params.element}` };
        }
    },

    remove_atoms: {
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

    measure_distance: {
        execute: () => {
            if (!window.atomsSelected || window.atomsSelected.length !== 2) return { success: false, message: "Select exactly 2 atoms" };
            if (typeof window.createInfoLabel === 'function') {
                window.createInfoLabel(window.atomsSelected[0], window.atomsSelected[1]);
                return { success: true, message: "Distance label created" };
            }
            const a1 = window.main.molecule.atoms[window.atomsSelected[0]], a2 = window.main.molecule.atoms[window.atomsSelected[1]];
            const dist = Math.sqrt((a2.x - a1.x) ** 2 + (a2.y - a1.y) ** 2 + (a2.z - a1.z) ** 2);
            return { success: true, message: `Distance: ${(dist / 4).toFixed(2)} Å` };
        }
    },

    measure_angle: {
        execute: () => {
            if (!window.atomsSelected || window.atomsSelected.length !== 3) return { success: false, message: "Select exactly 3 atoms" };
            if (typeof window.createInfoLabel === 'function') {
                window.createInfoLabel(window.atomsSelected[0], window.atomsSelected[1], window.atomsSelected[2]);
                return { success: true, message: "Angle label created" };
            }
            return { success: false, message: "Angle measurement not available" };
        }
    },

    measure_dihedral: {
        execute: () => {
            if (!window.atomsSelected || window.atomsSelected.length !== 4) return { success: false, message: "Select exactly 4 atoms" };
            if (typeof window.createInfoLabel === 'function') {
                window.createInfoLabel(window.atomsSelected[0], window.atomsSelected[1], window.atomsSelected[2], window.atomsSelected[3]);
                return { success: true, message: "Dihedral angle label created" };
            }
            return { success: false, message: "Dihedral measurement not available" };
        }
    },

    clear_measurements: {
        execute: () => {
            if (typeof window.clearAllBondLengthLabels === 'function') {
                window.clearAllBondLengthLabels();
                return { success: true, message: "All measurements cleared" };
            }
            return { success: false, message: "Clear function not available" };
        }
    },

    create_fragment: {
        execute: () => {
            if (!window.atomsSelected?.length) return { success: false, message: "No atoms selected" };
            const btn = document.getElementById('createFragment');
            if (btn) { btn.click(); return { success: true, message: `Fragment created` }; }
            return { success: false, message: "Fragment creation not available" };
        }
    },

    isolate_selection: {
        execute: () => {
            const btn = document.getElementById('isolateFragmentBtn');
            if (btn) { btn.click(); return { success: true, message: "Selection isolated" }; }
            return { success: false, message: "Isolate function not available" };
        }
    },

    reset_camera: {
        execute: () => {
            if (typeof window.resetCamera === 'function') { window.resetCamera(); return { success: true, message: "Camera reset" }; }
            return { success: false, message: "Reset not available" };
        }
    },

    zoom_to_fit: {
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
        execute: (params) => {
            if (!window.main?.molecule) return { success: false, message: "No molecule loaded" };
            if (params.showIndices !== undefined) window.labelIndexMode = params.showIndices;
            window.main.toggleLabels(params.show);
            if (typeof window.render === 'function') window.render();
            return { success: true, message: params.show ? "Labels shown" : "Labels hidden" };
        }
    },

    select_connected: {
        execute: () => {
            if (!window.main?.molecule?.bonds) return { success: false, message: "No molecule loaded" };
            if (!window.atomsSelected?.length) return { success: false, message: "No atoms selected" };
            const selected = new Set(window.atomsSelected);
            const directlyBonded = new Set();
            window.main.molecule.bonds.forEach(bond => {
                const idx1 = window.main.molecule.atoms.indexOf(bond.atom1);
                const idx2 = window.main.molecule.atoms.indexOf(bond.atom2);
                if (selected.has(idx1) && !selected.has(idx2)) directlyBonded.add(idx2);
                if (selected.has(idx2) && !selected.has(idx1)) directlyBonded.add(idx1);
            });
            if (directlyBonded.size === 0) return { success: false, message: "No bonded atoms found" };
            return FUNCTIONS.select_atoms.execute({ indices: [...selected, ...directlyBonded], add: false });
        }
    },

    toggle_ribbon: {
        execute: () => {
            if (!window.main?.data?.ribbonData) return { success: false, message: "Not a protein" };
            if (typeof window.toggleRibbon === 'function') {
                window.toggleRibbon();
                return { success: true, message: `Ribbon ${window.ribbonMode ? 'enabled' : 'disabled'}` };
            }
            return { success: false, message: "Ribbon toggle not available" };
        }
    },

    set_style: {
        execute: (params) => {
            if (!window.main?.molecule) return { success: false, message: "No molecule loaded" };
            if (params.roughness !== undefined) window.main.molecule.material.roughness = params.roughness;
            if (params.metalness !== undefined) window.main.molecule.material.metalness = params.metalness;
            if (params.opacity !== undefined) {
                window.main.molecule.material.opacity = params.opacity;
                window.main.molecule.material.transparent = params.opacity < 1;
            }
            if (params.atomSize !== undefined && window.main.changeAtomSize) window.main.changeAtomSize(params.atomSize);
            if (params.backgroundColor && window.scene) window.scene.background = new window.THREE.Color(params.backgroundColor);
            if (typeof window.render === 'function') window.render();
            return { success: true, message: "Style updated" };
        }
    },

    save_image: {
        execute: () => {
            const btn = document.getElementById('saveImagePNG');
            if (btn) { btn.click(); return { success: true, message: "Image saved" }; }
            return { success: false, message: "Save image not available" };
        }
    },

    save_xyz: {
        execute: () => {
            const btn = document.getElementById('saveXYZ');
            if (btn) { btn.click(); return { success: true, message: "XYZ file saved" }; }
            return { success: false, message: "Save XYZ not available" };
        }
    },

    load_molecule: {
        execute: (params) => {
            const input = document.getElementById('dbSearchInput');
            if (input) {
                input.value = params.name;
                input.dispatchEvent(new Event('input', { bubbles: true }));
                input.focus();
                return { success: true, message: `Searching for "${params.name}"...` };
            }
            return { success: false, message: "Search not available" };
        }
    },

    get_molecule_info: {
        execute: () => {
            if (!window.main?.molecule?.atoms) return { success: false, message: "No molecule loaded" };
            const atoms = window.main.molecule.atoms;
            const counts = {};
            atoms.forEach(a => counts[a.type] = (counts[a.type] || 0) + 1);
            return {
                success: true,
                message: `${atoms.length} atoms: ${Object.entries(counts).map(([k, v]) => `${v} ${k}`).join(', ')}`,
                data: { totalAtoms: atoms.length, elements: counts, selected: window.atomsSelected?.length || 0 }
            };
        }
    },

    get_atom_info: {
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

    undo: {
        execute: () => {
            if (window.undoManager?.hasUndo?.()) { window.undoManager.undo(); return { success: true, message: "Undone" }; }
            return { success: false, message: "Nothing to undo" };
        }
    },

    redo: {
        execute: () => {
            if (window.undoManager?.hasRedo?.()) { window.undoManager.redo(); return { success: true, message: "Redone" }; }
            return { success: false, message: "Nothing to redo" };
        }
    }
};

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
    const state = getMoleculeState();
    let executed = [];
    let sessionId = AI_CONFIG.sessionId;
    let assistantMessage = null;

    try {
        const MAX_ITERATIONS = 5;
        for (let i = 0; i < MAX_ITERATIONS; i++) {
            const payload = {
                sessionId,
                message: userMessage,
                state
            };

            // If we have tool results to send back
            if (assistantMessage) {
                payload.toolResults = {
                    assistantMessage,
                    results: executed.map(e => ({
                        tool_call_id: e.id,
                        content: JSON.stringify(e.result)
                    }))
                };
                executed = []; // Clear for next iteration
            }

            const response = await fetch(`${AI_CONFIG.backendUrl}/ai/chat`, {
                method: 'POST',
                headers: { 'Content-Type': 'application/json' },
                body: JSON.stringify(payload)
            });

            if (!response.ok) {
                const err = await response.json();
                return { error: err.error || 'Backend error' };
            }

            const data = await response.json();

            // Update session ID
            if (data.sessionId) {
                AI_CONFIG.sessionId = data.sessionId;
                localStorage.setItem('chopchop_ai_session', data.sessionId);
            }

            // If done, return final response
            if (data.done) {
                return { content: data.content, actions: executed };
            }

            // If we have tool calls, execute them
            if (data.toolCalls?.length > 0) {
                assistantMessage = data.assistantMessage;

                for (const tc of data.toolCalls) {
                    const fn = tc.function.name;
                    const args = JSON.parse(tc.function.arguments || '{}');
                    console.log('AI calling:', fn, args);

                    if (FUNCTIONS[fn]) {
                        const res = FUNCTIONS[fn].execute(args);
                        console.log('Result:', res);
                        executed.push({ id: tc.id, name: fn, args, result: res });
                    } else {
                        executed.push({ id: tc.id, name: fn, args, result: { success: false, message: 'Function not found' } });
                    }
                }
            } else {
                // No tool calls and not done - shouldn't happen, but break to avoid infinite loop
                break;
            }
        }

        return { content: "Completed", actions: executed };

    } catch (e) {
        console.error('AI Error:', e);
        return { error: e.message };
    }
}

window.AIAgent = {
    send: sendToAI,
    clearHistory: async () => {
        // Clear on backend
        if (AI_CONFIG.sessionId) {
            await fetch(`${AI_CONFIG.backendUrl}/ai/clear`, {
                method: 'POST',
                headers: { 'Content-Type': 'application/json' },
                body: JSON.stringify({ sessionId: AI_CONFIG.sessionId })
            });
        }
        // Generate NEW session ID so it's a fresh conversation
        AI_CONFIG.sessionId = crypto.randomUUID();
        localStorage.setItem('chopchop_ai_session', AI_CONFIG.sessionId);
    },
    // Keep these for backwards compatibility but they're not needed anymore
    setApiKey: () => console.log('API key is now stored on the backend'),
    getApiKey: () => '',
    hasApiKey: () => true // Always true since backend handles it
};