// aiAgent.js - AI Agent for ChopChopMol (Backend Version)

import { buildAdjacencyList, findConnectedFragment, findFragmentAvoidingVertex } from './utils/graphUtils.js';
import { setupFrameSlider, loadFrames, getCurrentFrameIndex } from './utils/frameUtils.js';
import {
    callMaceEnergy,
    callMaceEnergyBatch,
    callMaceOptimize,
    callMaceMD,
    generateSingleFrameExtxyz,
    generateMultiFrameExtxyz,
    generateTimestamp,
    saveExtxyzFile,
    mergeForcesIntoFrames,
    updateCurrentFrameForces
} from './utils/maceUtils.js';
import {
    saveFile,
    downloadFile,
    saveToFileExplorer,
    detectFormat
} from './utils/fileWriter.js';

const backendUrl = ['https://chopchopmol-ai-backend.onrender.com', 'http://127.0.0.1:10000'];

const AI_CONFIG = {
    backendUrl: backendUrl[1] || backendUrl[0],
    sessionId: crypto.randomUUID(),
    model: localStorage.getItem('chopchop_ai_model') || 'claude-haiku-4-5-20251001', // Haiku is 5x faster than Sonnet
    maceModel: localStorage.getItem('chopchop_mace_model') || null
};
// Save immediately if new
if (!localStorage.getItem('chopchop_ai_session')) {
    localStorage.setItem('chopchop_ai_session', AI_CONFIG.sessionId);
}
//
const toolStatusMap = {
    select_atoms: 'Selecting atoms',
    load_molecule: 'Loading molecule',
    transform_atoms: 'Transforming atoms',
    measure_distance: 'Measuring distance',
    measure_angle: 'Measuring angle',
    create_fragment: 'Creating fragment',
    delete_atoms: 'Deleting atoms',
    save_file: 'Saving file',
    save_image: 'Saving image',
    toggle_labels: 'Toggling labels',
    toggle_force_arrows: 'Toggling force arrows',
    calculate_energy: 'Calculating energy',
    calculate_all_energies: 'Calculating all frame energies',
    get_cached_energies: 'Retrieving cached energies',
    optimize_geometry: 'Optimizing geometry',
    create_chart: 'Creating chart',
    read_file: 'Reading file',
    list_folder_files: 'Listing files',
    create_file: 'Creating file',
    edit_file: 'Editing file',
    split_molecule: 'Splitting molecule',
    rotational_scan: 'Running rotational scan',
    translation_scan: 'Running translation scan',
    angle_scan: 'Running angle scan',
    run_md: 'Running MD simulation',
};
// ALL functions the AI can execute (kept on frontend - they manipulate DOM/Three.js)
const FUNCTIONS = {

    create_file: {
        execute: (params) => {
            if (!window.fileExplorer?.directoryHandle) {
                return { success: false, message: "No folder open in explorer" };
            }
            return window.fileExplorer.createFile(params.filename, params.content || '');
        }
    },

    edit_file: {
        execute: (params) => {
            if (!window.fileExplorer?.directoryHandle) {
                return { success: false, message: "No folder open in explorer" };
            }
            return window.fileExplorer.editFile(params.filename, params.content);
        }
    },

    read_file: {
        execute: (params) => {
            if (!window.fileExplorer?.directoryHandle) {
                return { success: false, message: "No folder open in explorer" };
            }
            return window.fileExplorer.readFile(params.filename);
        }
    },

    list_folder_files: {
        execute: () => {
            if (!window.fileExplorer?.directoryHandle) {
                return { success: false, message: "No folder open in explorer" };
            }
            return window.fileExplorer.listFiles();
        }
    },
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

            // Include axis status in return message
            const axisStatus = window.rotationAxis ? " (axis still defined)" : "";
            return { success: true, message: `Selected ${params.indices.length} atoms${axisStatus}` };
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
            // Use the new addAtom method which rebuilds mesh efficiently
            const newIndex = window.main.molecule.addAtom(
                { element: params.element.toUpperCase(), x, y, z },
                window.main.mode
            );
            if (newIndex >= 0) {
                if (typeof window.saveUndoState === 'function') {
                    window.saveUndoState("Add Atom");
                }
                if (typeof window.render === 'function') {
                    window.render();
                }
                return { success: true, message: `Added ${params.element}` };
            }
            return { success: false, message: "Failed to add atom" };
        }
    },
    set_angle: {
        execute: (params) => {
            if (!window.atomsSelected || window.atomsSelected.length !== 3) return { success: false, message: "Select exactly 3 atoms (A-B-C where B is the vertex)" };

            const [idx1, idx2, idx3] = window.atomsSelected;
            const atoms = window.main.molecule.atoms;
            const bonds = window.main.molecule.bonds;

            // Build adjacency list and find fragment
            const adj = buildAdjacencyList(atoms, bonds);
            const atomsToMove = findConnectedFragment(idx1, idx2, adj);

            // Calculate current angle
            const a1 = atoms[idx1], a2 = atoms[idx2], a3 = atoms[idx3];
            const vecBA = new window.THREE.Vector3().subVectors(a1.position, a2.position);
            const vecBC = new window.THREE.Vector3().subVectors(a3.position, a2.position);
            const currentAngle = vecBA.angleTo(vecBC) * 180 / Math.PI;

            const deltaAngle = params.angle - currentAngle;
            const deltaRadians = deltaAngle * Math.PI / 180;

            // Rotation axis = perpendicular to plane ABC
            const rotationAxis = new window.THREE.Vector3().crossVectors(vecBA, vecBC).normalize();
            if (rotationAxis.lengthSq() < 0.0001) return { success: false, message: "Atoms are collinear" };

            const rotMatrix = new window.THREE.Matrix4().makeRotationAxis(rotationAxis, -deltaRadians);
            const pivot = a2.position.clone();

            atomsToMove.forEach(atomIdx => {
                const atom = atoms[atomIdx];
                const pos = atom.position.clone().sub(pivot);
                pos.applyMatrix4(rotMatrix);
                pos.add(pivot);
                atom.position.copy(pos);
                atom.x = atom.position.x;
                atom.y = atom.position.y;
                atom.z = atom.position.z;
                if (typeof window.updateAtomMatrix === 'function') {
                    window.updateAtomMatrix(atomIdx);
                }
            });

            window.main.molecule.instancedMesh.instanceMatrix.needsUpdate = true;
            window.main.molecule.updateBonds(window.main.mode);
            if (window.main.molecule.labels && window.main.molecule.labels.length > 0 && window.main.molecule.updateLabels) {
                window.main.molecule.updateLabels();
            }
            if (typeof window.updateAllBondLengthLabels === 'function') {
                window.updateAllBondLengthLabels();
            }
            if (typeof window.saveUndoState === 'function') {
                window.saveUndoState("Set Angle");
            }
            window.main.molecule.updateMainCoordinates();
            if (typeof window.render === 'function') {
                window.render();
            }

            return { success: true, message: `Set angle to ${params.angle}° (moved ${atomsToMove.length} atoms)` };
        }
    },

    angle_scan: {
        execute: (params) => {
            if (!window.main?.molecule?.atoms) return { success: false, message: "No molecule loaded" };

            const { atom1, atom2, atom3, increment = 10, startAngle = 0, endAngle = 360 } = params;
            const molecule = window.main.molecule;
            const stretch = molecule.stretch || 4;
            const offset = molecule.offset || { x: 0, y: 0, z: 0 };
            const allAtoms = molecule.atoms;
            const bonds = molecule.bonds;

            const a1 = allAtoms[atom1], a2 = allAtoms[atom2], a3 = allAtoms[atom3];
            if (!a1 || !a2 || !a3) return { success: false, message: "Invalid atom indices" };
            if (increment <= 0) return { success: false, message: "Increment must be positive" };

            // Build adjacency list and find fragment
            const adj = buildAdjacencyList(allAtoms, bonds);
            const atomsToMove = params.atomsToMove || findFragmentAvoidingVertex(atom1, atom2, adj);
            if (atomsToMove.length === 0) return { success: false, message: "No atoms to move" };

            const range = endAngle - startAngle;
            const steps = Math.floor(Math.abs(range) / increment) + 1;

            // Rotation axis = perpendicular to plane ABC
            const vecBA = new window.THREE.Vector3().subVectors(a1.position, a2.position);
            const vecBC = new window.THREE.Vector3().subVectors(a3.position, a2.position);
            const rotationAxis = new window.THREE.Vector3().crossVectors(vecBA, vecBC).normalize();
            if (rotationAxis.lengthSq() < 0.0001) return { success: false, message: "Atoms are collinear" };

            const pivot = a2.position.clone();

            const originalPositions = {};
            atomsToMove.forEach(idx => {
                const atom = allAtoms[idx];
                if (atom) originalPositions[idx] = atom.position.clone();
            });

            const parsedFrames = [];
            const direction = range >= 0 ? 1 : -1;

            for (let step = 0; step < steps; step++) {
                const angle = startAngle + step * increment * direction;
                const angleRadians = angle * Math.PI / 180;
                const rotMatrix = new window.THREE.Matrix4().makeRotationAxis(rotationAxis, -angleRadians);

                const atomData = [];

                allAtoms.forEach((atom, idx) => {
                    let x, y, z;

                    if (atomsToMove.includes(idx)) {
                        const basePos = originalPositions[idx].clone();
                        basePos.sub(pivot);
                        basePos.applyMatrix4(rotMatrix);
                        basePos.add(pivot);
                        x = (basePos.x + offset.x) / stretch;
                        y = (basePos.y + offset.y) / stretch;
                        z = (basePos.z + offset.z) / stretch;
                    } else {
                        x = (atom.position.x + offset.x) / stretch;
                        y = (atom.position.y + offset.y) / stretch;
                        z = (atom.position.z + offset.z) / stretch;
                    }

                    atomData.push({ element: atom.type, x, y, z });
                });

                parsedFrames.push({ atomData, numAtoms: atomData.length, comment: `angle=${angle}` });
            }

            loadFrames(parsedFrames, 0);

            return {
                success: true,
                message: `Generated ${steps} frames (${startAngle}° to ${startAngle + (steps - 1) * increment * direction}° in ${increment}° steps). Rotating ${atomsToMove.length} atoms. Use frame slider to play.`
            };
        }
    },
    transform_atoms: {
        execute: async (params) => {
            if (!window.main?.molecule?.atoms) return { success: false, message: "No molecule loaded" };

            const { axisAtom1, axisAtom2, atomsToMove, angle, distance } = params;
            const molecule = window.main.molecule;

            // Validate axis atoms
            const atom1 = molecule.atoms[axisAtom1];
            const atom2 = molecule.atoms[axisAtom2];
            if (!atom1 || !atom2) return { success: false, message: "Invalid axis atoms" };

            // Capture starting positions
            const startPositions = {};
            atomsToMove.forEach(idx => {
                const atom = molecule.atoms[idx];
                if (atom) startPositions[idx] = { x: atom.x, y: atom.y, z: atom.z };
            });

            // Set up axis
            const pos1 = atom1.position.clone();
            const pos2 = atom2.position.clone();
            window.rotationAxis = {
                point: pos1.clone(),
                direction: new window.THREE.Vector3().subVectors(pos2, pos1).normalize()
            };
            window.axisAtoms = [axisAtom1, axisAtom2];
            window.atomsSelected = [...atomsToMove];

            // Apply transformation instantly to get target positions
            if (angle !== undefined) {
                if (window.rotationState) {
                    window.rotationState.basePositions = {};
                    window.rotationState.currentAngle = 0;
                    window.rotationState.isActive = false;
                }
                window.rotateSelectedAtoms(angle, { relative: false });
                if (typeof window.finalizeRotation === 'function') window.finalizeRotation();
            } else if (distance !== undefined) {
                const stretch = molecule.stretch || 4;
                window.translateSelectedAtoms(distance * stretch);
            }

            // Capture target positions
            const targetPositions = {};
            atomsToMove.forEach(idx => {
                const atom = molecule.atoms[idx];
                if (atom) targetPositions[idx] = { x: atom.x, y: atom.y, z: atom.z };
            });

            // Restore starting positions
            atomsToMove.forEach(idx => {
                const atom = molecule.atoms[idx];
                const start = startPositions[idx];
                if (atom && start) {
                    atom.x = start.x;
                    atom.y = start.y;
                    atom.z = start.z;
                    atom.position.set(start.x, start.y, start.z);
                }
            });

            // Animate from start to target
            const duration = 400;
            const startTime = performance.now();

            await new Promise(resolve => {
                function tick() {
                    const t = Math.min((performance.now() - startTime) / duration, 1);
                    const eased = 1 - Math.pow(1 - t, 3); // ease-out cubic

                    atomsToMove.forEach(idx => {
                        const atom = molecule.atoms[idx];
                        const start = startPositions[idx];
                        const end = targetPositions[idx];
                        if (!atom || !start || !end) return;

                        atom.x = start.x + (end.x - start.x) * eased;
                        atom.y = start.y + (end.y - start.y) * eased;
                        atom.z = start.z + (end.z - start.z) * eased;
                        atom.position.set(atom.x, atom.y, atom.z);

                        if (typeof window.updateAtomMatrix === 'function') {
                            window.updateAtomMatrix(idx);
                        }
                    });

                    if (molecule.instancedMesh) {
                        molecule.instancedMesh.instanceMatrix.needsUpdate = true;
                    }
                    molecule.updateBonds?.(window.main.mode);
                    window.render?.();

                    if (t < 1) {
                        requestAnimationFrame(tick);
                    } else {
                        resolve();
                    }
                }
                requestAnimationFrame(tick);
            });

            if (typeof window.updateMoleculeVisualization === 'function') window.updateMoleculeVisualization();

            const action = angle !== undefined ? `Rotated ${angle}°` : `Translated ${distance} Å`;
            return { success: true, message: `${action} for ${atomsToMove.length} atoms` };
        }
    },

    set_bond_distance: {
        execute: (params) => {
            if (!window.atomsSelected || window.atomsSelected.length !== 2) return { success: false, message: "Select exactly 2 atoms" };

            const idx1 = window.atomsSelected[0], idx2 = window.atomsSelected[1];
            const atoms = window.main.molecule.atoms;
            const bonds = window.main.molecule.bonds;

            // Build adjacency list
            const adj = buildAdjacencyList(atoms, bonds);

            // Find fragments on each side (works whether bonded or not)
            const frag1 = findConnectedFragment(idx1, idx2, adj);
            const frag2 = findConnectedFragment(idx2, idx1, adj);
            let atomsToMove, anchorIdx;

            if (frag2.length <= frag1.length) {
                atomsToMove = frag2;
                anchorIdx = idx1;
            } else {
                atomsToMove = frag1;
                anchorIdx = idx2;
            }

            const refIdx = atomsToMove.includes(idx1) ? idx1 : idx2;
            const anchorAtom = atoms[anchorIdx];
            const refAtom = atoms[refIdx];

            const targetInternal = params.distance * 4;
            const currentVector = new window.THREE.Vector3().subVectors(refAtom.position, anchorAtom.position);
            const currentDist = currentVector.length();
            if (currentDist === 0) return { success: false, message: "Atoms at same position" };

            const translation = currentVector.normalize().multiplyScalar(targetInternal - currentDist);

            atomsToMove.forEach(atomIdx => {
                const atom = atoms[atomIdx];
                atom.position.add(translation.clone());
                atom.x = atom.position.x;
                atom.y = atom.position.y;
                atom.z = atom.position.z;
                // Call updateAtomMatrix like the UI does
                if (typeof window.updateAtomMatrix === 'function') {
                    window.updateAtomMatrix(atomIdx);
                }
            });

            // Update exactly like the UI does
            window.main.molecule.instancedMesh.instanceMatrix.needsUpdate = true;
            window.main.molecule.updateBonds(window.main.mode);
            if (window.main.molecule.labels && window.main.molecule.labels.length > 0 && window.main.molecule.updateLabels) {
                window.main.molecule.updateLabels();
            }
            if (typeof window.updateAllBondLengthLabels === 'function') {
                window.updateAllBondLengthLabels();
            }
            if (typeof window.saveUndoState === 'function') {
                window.saveUndoState("Set Distance");
            }
            window.main.molecule.updateMainCoordinates();
            if (typeof window.render === 'function') {
                window.render();
            }

            return { success: true, message: `Set distance to ${params.distance} Å (moved ${atomsToMove.length} atoms)` };
        }
    },

    set_dihedral_angle: {
        execute: (params) => {
            if (!window.atomsSelected || window.atomsSelected.length !== 4) return { success: false, message: "Select exactly 4 atoms for dihedral" };

            const [idx1, idx2, idx3, idx4] = window.atomsSelected;
            const atoms = window.main.molecule.atoms;
            const bonds = window.main.molecule.bonds;

            // Build adjacency list
            const adj = new Map();
            for (let i = 0; i < atoms.length; i++) adj.set(i, []);
            bonds.forEach(bond => {
                const i1 = atoms.indexOf(bond.atom1);
                const i2 = atoms.indexOf(bond.atom2);
                if (i1 !== -1 && i2 !== -1) {
                    adj.get(i1).push(i2);
                    adj.get(i2).push(i1);
                }
            });

            // Find fragment connected to atom3, excluding atom2
            const findFragment = (start, exclude) => {
                const visited = new Set([start]);
                const queue = [start];
                while (queue.length > 0) {
                    const current = queue.shift();
                    for (const neighbor of (adj.get(current) || [])) {
                        if (current === start && neighbor === exclude) continue;
                        if (!visited.has(neighbor)) {
                            visited.add(neighbor);
                            queue.push(neighbor);
                        }
                    }
                }
                return Array.from(visited);
            };


            const atomsToMove = findFragment(idx3, idx2);

            // Calculate current dihedral
            const a1 = atoms[idx1], a2 = atoms[idx2], a3 = atoms[idx3], a4 = atoms[idx4];
            const b1 = new window.THREE.Vector3().subVectors(a2.position, a1.position);
            const b2 = new window.THREE.Vector3().subVectors(a3.position, a2.position);
            const b3 = new window.THREE.Vector3().subVectors(a4.position, a3.position);

            const n1 = new window.THREE.Vector3().crossVectors(b1, b2).normalize();
            const n2 = new window.THREE.Vector3().crossVectors(b2, b3).normalize();
            const cosAngle = n1.dot(n2);
            const sinAngle = new window.THREE.Vector3().crossVectors(n1, n2).dot(b2.clone().normalize());
            let currentAngle = Math.atan2(sinAngle, cosAngle) * 180 / Math.PI;
            if (currentAngle < 0) currentAngle += 360;

            let deltaAngle = params.angle - currentAngle;
            while (deltaAngle > 180) deltaAngle -= 360;
            while (deltaAngle < -180) deltaAngle += 360;

            const deltaRadians = deltaAngle * Math.PI / 180;
            const axisStart = a2.position.clone();
            const axisDir = new window.THREE.Vector3().subVectors(a3.position, a2.position).normalize();
            const rotMatrix = new window.THREE.Matrix4().makeRotationAxis(axisDir, deltaRadians);

            atomsToMove.forEach(atomIdx => {
                const atom = atoms[atomIdx];
                const pos = atom.position.clone().sub(axisStart);
                pos.applyMatrix4(rotMatrix);
                pos.add(axisStart);
                atom.position.copy(pos);
                atom.x = atom.position.x;
                atom.y = atom.position.y;
                atom.z = atom.position.z;
                if (typeof window.updateAtomMatrix === 'function') {
                    window.updateAtomMatrix(atomIdx);
                }
            });

            // Update exactly like the UI does
            window.main.molecule.instancedMesh.instanceMatrix.needsUpdate = true;
            window.main.molecule.updateBonds(window.main.mode);
            if (window.main.molecule.labels && window.main.molecule.labels.length > 0 && window.main.molecule.updateLabels) {
                window.main.molecule.updateLabels();
            }
            if (typeof window.updateAllBondLengthLabels === 'function') {
                window.updateAllBondLengthLabels();
            }
            if (typeof window.saveUndoState === 'function') {
                window.saveUndoState("Set Dihedral");
            }
            window.main.molecule.updateMainCoordinates();
            if (typeof window.render === 'function') {
                window.render();
            }

            return { success: true, message: `Set dihedral to ${params.angle}° (rotated ${atomsToMove.length} atoms)` };
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

            if (!atom1 || !atom2) return { success: false, message: "Invalid atom indices" };

            if (window.THREE) {
                const pos1 = atom1.position.clone();
                const pos2 = atom2.position.clone();
                const direction = new window.THREE.Vector3().subVectors(pos2, pos1);

                if (direction.length() < 0.001) {
                    return { success: false, message: "Atoms too close - cannot define axis" };
                }

                window.rotationAxis = {
                    point: pos1.clone(),
                    direction: direction.normalize()
                };
                window.axisAtoms = [idx1, idx2];

                // Also reset rotation state for clean transformation
                if (window.rotationState) {
                    window.rotationState.basePositions = {};
                    window.rotationState.currentAngle = 0;
                    window.rotationState.isActive = false;
                }
            }

            const btn = document.getElementById('defineAxisBtn');
            if (btn) btn.click();
            if (typeof window.render === 'function') window.render();

            return { success: true, message: `Axis defined from atom ${idx1 + 1} to atom ${idx2 + 1}` };
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

    get_bonded_atoms: {
        execute: (params) => {
            if (!window.main?.molecule?.bonds) return { success: false, message: "No molecule loaded" };

            const atoms = window.main.molecule.atoms;
            const bonds = window.main.molecule.bonds;
            const queryIndices = params.indices || window.atomsSelected || [];

            if (queryIndices.length === 0) {
                return { success: false, message: "No atoms specified" };
            }

            const querySet = new Set(queryIndices);
            const result = {};

            // For each queried atom, find what it's bonded to
            queryIndices.forEach(idx => {
                result[idx] = [];
            });

            bonds.forEach(bond => {
                const idx1 = atoms.indexOf(bond.atom1);
                const idx2 = atoms.indexOf(bond.atom2);

                if (querySet.has(idx1)) {
                    result[idx1].push({
                        atom: idx2,
                        element: atoms[idx2].type
                    });
                }
                if (querySet.has(idx2)) {
                    result[idx2].push({
                        atom: idx1,
                        element: atoms[idx1].type
                    });
                }
            });

            // Build readable summary
            const summary = queryIndices.map(idx => {
                const bondedTo = result[idx];
                const atomEl = atoms[idx].type;
                if (bondedTo.length === 0) {
                    return `Atom ${idx} (${atomEl}): no bonds`;
                }
                const bondList = bondedTo.map(b => `${b.atom}(${b.element})`).join(', ');
                return `Atom ${idx} (${atomEl}): bonded to ${bondList}`;
            }).join('; ');

            return {
                success: true,
                bonds: result,
                message: summary
            };
        }
    },

    split_molecule: {
        execute: (params) => {
            if (!window.main?.molecule?.atoms || !window.main?.molecule?.bonds) {
                return { success: false, message: "No molecule loaded" };
            }

            const atoms = window.main.molecule.atoms;
            const bonds = window.main.molecule.bonds;
            const { atom1, atom2 } = params;

            // Validate atom indices
            if (atom1 === undefined || atom2 === undefined) {
                return { success: false, message: "Must specify atom1 and atom2 indices" };
            }
            if (atom1 < 0 || atom1 >= atoms.length || atom2 < 0 || atom2 >= atoms.length) {
                return { success: false, message: "Invalid atom indices" };
            }
            if (atom1 === atom2) {
                return { success: false, message: "atom1 and atom2 must be different" };
            }

            // Build adjacency list
            const adj = Array.from({ length: atoms.length }, () => []);
            bonds.forEach(bond => {
                const idx1 = atoms.indexOf(bond.atom1);
                const idx2 = atoms.indexOf(bond.atom2);
                if (idx1 !== -1 && idx2 !== -1) {
                    adj[idx1].push(idx2);
                    adj[idx2].push(idx1);
                }
            });


            // BFS from atom1, excluding the bond to atom2
            const visited = new Set();
            const queue = [atom1];
            visited.add(atom1);

            while (queue.length > 0) {
                const current = queue.shift();
                for (const neighbor of adj[current]) {
                    // Skip the bond between atom1 and atom2
                    if (current === atom1 && neighbor === atom2) continue;
                    if (current === atom2 && neighbor === atom1) continue;

                    if (!visited.has(neighbor)) {
                        visited.add(neighbor);
                        queue.push(neighbor);
                    }
                }
            }

            // If atom2 is reachable, there's a ring - can't split
            if (visited.has(atom2)) {
                return { success: false, message: "Cannot split: atoms are part of a ring" };
            }

            // Create two fragments
            const fragment1 = [...visited].sort((a, b) => a - b);
            const fragment2 = [];
            for (let i = 0; i < atoms.length; i++) {
                if (!visited.has(i)) fragment2.push(i);
            }

            // Update global fragments array
            window.fragments = window.fragments || [];

            // Remove these atoms from existing fragments
            window.fragments = window.fragments.map(frag =>
                frag.filter(idx => !fragment1.includes(idx) && !fragment2.includes(idx))
            ).filter(frag => frag.length > 0);

            // Add new fragments
            window.fragments.push(fragment1);
            window.fragments.push(fragment2);

            // Update UI
            const fragmentList = document.getElementById('fragmentList');
            if (fragmentList && typeof window.updateFragmentList === 'function') {
                window.updateFragmentList(fragmentList);
            }
            if (typeof window.updateEditingContent === 'function') {
                window.updateEditingContent();
            }

            // Show create fragment button
            const createFragmentBtn = document.getElementById('createFragment');
            if (createFragmentBtn) {
                createFragmentBtn.style.display = 'block';
            }

            if (typeof window.render === 'function') {
                window.render();
            }

            return {
                success: true,
                message: `Split molecule into 2 fragments: [${fragment1.join(',')}] (${fragment1.length} atoms) and [${fragment2.join(',')}] (${fragment2.length} atoms)`,
                fragment1,
                fragment2
            };
        }
    },

    change_atom_element: {
        execute: (params) => {
            if (!window.main?.data?.atomData) return { success: false, message: "No molecule loaded" };
            if (!window.atomsSelected?.length) return { success: false, message: "No atoms selected" };
            const element = params.element.toUpperCase();
            // Validate element
            if (!window.main.molecule.atomSettings[element]) {
                return { success: false, message: `Unknown element: ${element}` };
            }
            // Update atoms in place using the new method (no rebuild needed)
            window.main.molecule.updateAtomElement(window.atomsSelected, element);
            // Update data array to match
            window.atomsSelected.forEach(idx => {
                if (window.main.data.atomData[idx]) window.main.data.atomData[idx].element = element;
            });
            // Update bonds since radii may change
            window.main.molecule.updateBonds(window.main.mode);
            if (typeof window.saveUndoState === 'function') {
                window.saveUndoState("Change Element");
            }
            if (typeof window.render === 'function') {
                window.render();
            }
            return { success: true, message: `Changed ${window.atomsSelected.length} atom(s) to ${params.element}` };
        }
    },

    remove_atoms: {
        execute: () => {
            if (!window.main?.data?.atomData) return { success: false, message: "No molecule loaded" };
            if (!window.atomsSelected?.length) return { success: false, message: "No atoms selected" };
            const removed = window.atomsSelected.length;
            // Use the new removeAtoms method which rebuilds mesh efficiently
            window.main.molecule.removeAtoms(window.atomsSelected, window.main.mode);
            window.atomsSelected = [];
            if (typeof window.saveUndoState === 'function') {
                window.saveUndoState("Remove Atoms");
            }
            if (typeof window.render === 'function') {
                window.render();
            }
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

    rotational_scan: {
        execute: (params) => {
            if (!window.main?.molecule?.atoms) return { success: false, message: "No molecule loaded" };

            const { axisAtom1, axisAtom2, atomsToMove, increment = 10, startAngle = 0, endAngle = 360 } = params;
            const molecule = window.main.molecule;
            const stretch = molecule.stretch || 4;
            const offset = molecule.offset || { x: 0, y: 0, z: 0 };

            const atom1 = molecule.atoms[axisAtom1];
            const atom2 = molecule.atoms[axisAtom2];
            if (!atom1 || !atom2) return { success: false, message: "Invalid axis atoms" };
            if (!atomsToMove || atomsToMove.length === 0) return { success: false, message: "No atoms to rotate" };
            if (!increment || increment <= 0) return { success: false, message: "Increment must be positive" };

            const range = endAngle - startAngle;
            const steps = Math.floor(Math.abs(range) / increment) + 1;
            const allAtoms = molecule.atoms;

            const originalPositions = {};
            atomsToMove.forEach(idx => {
                const atom = allAtoms[idx];
                if (atom) originalPositions[idx] = atom.position.clone();
            });

            const pos1 = atom1.position.clone();
            const pos2 = atom2.position.clone();
            const axisDirection = new window.THREE.Vector3().subVectors(pos2, pos1).normalize();
            const axisPoint = pos1.clone();

            const parsedFrames = [];
            const direction = range >= 0 ? 1 : -1;

            for (let step = 0; step < steps; step++) {
                const angle = startAngle + step * increment * direction;
                const angleRadians = angle * Math.PI / 180;
                const rotationMatrix = new window.THREE.Matrix4().makeRotationAxis(axisDirection, angleRadians);

                const atomData = [];

                allAtoms.forEach((atom, idx) => {
                    let x, y, z;

                    if (atomsToMove.includes(idx)) {
                        const basePos = originalPositions[idx].clone();
                        basePos.sub(axisPoint);
                        basePos.applyMatrix4(rotationMatrix);
                        basePos.add(axisPoint);
                        x = (basePos.x + offset.x) / stretch;
                        y = (basePos.y + offset.y) / stretch;
                        z = (basePos.z + offset.z) / stretch;
                    } else {
                        x = (atom.position.x + offset.x) / stretch;
                        y = (atom.position.y + offset.y) / stretch;
                        z = (atom.position.z + offset.z) / stretch;
                    }

                    atomData.push({ element: atom.type, x, y, z });
                });

                parsedFrames.push({ atomData, numAtoms: atomData.length, comment: `angle=${angle}` });
            }

            loadFrames(parsedFrames, 0);

            return {
                success: true,
                message: `Generated ${steps} frames (${startAngle}° to ${startAngle + (steps - 1) * increment * direction}° in ${increment}° steps). Use frame slider to play.`
            };
        }
    },

    translation_scan: {
        execute: (params) => {
            if (!window.main?.molecule?.atoms) return { success: false, message: "No molecule loaded" };

            const { axisAtom1, axisAtom2, atomsToMove, startDistance = 0, endDistance = 3, increment = 0.2 } = params;
            const molecule = window.main.molecule;
            const stretch = molecule.stretch || 4;
            const offset = molecule.offset || { x: 0, y: 0, z: 0 };

            const atom1 = molecule.atoms[axisAtom1];
            const atom2 = molecule.atoms[axisAtom2];
            if (!atom1 || !atom2) return { success: false, message: "Invalid axis atoms" };
            if (!atomsToMove || atomsToMove.length === 0) return { success: false, message: "No atoms to translate" };
            if (increment <= 0) return { success: false, message: "Increment must be positive" };

            const range = endDistance - startDistance;
            const steps = Math.floor(Math.abs(range) / increment) + 1;
            const allAtoms = molecule.atoms;

            const originalPositions = {};
            atomsToMove.forEach(idx => {
                const atom = allAtoms[idx];
                if (atom) originalPositions[idx] = atom.position.clone();
            });

            const pos1 = atom1.position.clone();
            const pos2 = atom2.position.clone();
            const axisDirection = new window.THREE.Vector3().subVectors(pos2, pos1).normalize();

            const parsedFrames = [];
            const direction = range >= 0 ? 1 : -1;

            for (let step = 0; step < steps; step++) {
                const dist = startDistance + step * increment * direction;
                const translationVec = axisDirection.clone().multiplyScalar(dist * stretch);

                const atomData = [];

                allAtoms.forEach((atom, idx) => {
                    let x, y, z;

                    if (atomsToMove.includes(idx)) {
                        const basePos = originalPositions[idx].clone();
                        basePos.add(translationVec);
                        x = (basePos.x + offset.x) / stretch;
                        y = (basePos.y + offset.y) / stretch;
                        z = (basePos.z + offset.z) / stretch;
                    } else {
                        x = (atom.position.x + offset.x) / stretch;
                        y = (atom.position.y + offset.y) / stretch;
                        z = (atom.position.z + offset.z) / stretch;
                    }

                    atomData.push({ element: atom.type, x, y, z });
                });

                parsedFrames.push({ atomData, numAtoms: atomData.length, comment: `dist=${dist.toFixed(2)}` });
            }

            loadFrames(parsedFrames, 0);

            return {
                success: true,
                message: `Generated ${steps} frames (${startDistance}Å to ${startDistance + (steps - 1) * increment * direction}Å in ${increment}Å steps). Use frame slider to play.`
            };
        }
    },

    run_md: {
        execute: async (params) => {
            const molecule = window.main?.molecule;
            if (!molecule?.atoms?.length) return { success: false, message: "No molecule loaded" };

            const atoms = molecule.atoms.map(a => ({ element: a.type, x: a.x / 4, y: a.y / 4, z: a.z / 4 }));
            const includeForces = params.includeForces || false;

            try {
                const res = await fetch(`${AI_CONFIG.backendUrl}/ai/mace/md`, {
                    method: 'POST',
                    headers: { 'Content-Type': 'application/json' },
                    body: JSON.stringify({
                        atoms,
                        model: params.model || AI_CONFIG.maceModel || 'medium',
                        temperature: params.temperature || 300,
                        steps: params.steps || 500,
                        timestep: params.timestep || 1.0,
                        friction: params.friction || 0.01,
                        saveInterval: params.saveInterval || 10,
                        includeForces
                    })
                });
                const result = await res.json();

                if (!result.success) {
                    return { success: false, message: result.error || "MD simulation failed" };
                }

                // Convert trajectory to frame format
                if (result.trajectory && result.trajectory.length > 0) {
                    const parsedFrames = result.trajectory.map((frame, idx) => {
                        const atomData = frame.positions.map((pos, i) => {
                            const atom = {
                                element: atoms[i].element,
                                x: pos[0],
                                y: pos[1],
                                z: pos[2]
                            };
                            // Include forces if available
                            if (frame.forces && frame.forces[i]) {
                                atom.fx = frame.forces[i][0];
                                atom.fy = frame.forces[i][1];
                                atom.fz = frame.forces[i][2];
                            }
                            return atom;
                        });

                        return {
                            atomData,
                            numAtoms: atomData.length,
                            energy: frame.energy_eV,  // ADDED: Store energy in frame object
                            comment: `step=${frame.step} T=${frame.temperature_K.toFixed(1)}K E=${frame.total_eV.toFixed(4)}eV`
                        };
                    });

                    window.xyzFrames = parsedFrames;

                    // ADDED: Extract energies into separate array for file writer
                    window.frameEnergies = result.trajectory.map(frame => frame.energy_eV);

                    // Cache energies for plotting
                    window.lastMaceResults = {
                        frameCount: result.trajectory.length,
                        energies: result.trajectory.map((frame, idx) => ({
                            frame: idx,
                            step: frame.step,
                            energy_eV: frame.energy_eV,
                            kinetic_eV: frame.kinetic_eV,
                            total_eV: frame.total_eV,
                            temperature_K: frame.temperature_K
                        })),
                        lowestEnergyFrame: 0,
                        highestEnergyFrame: result.trajectory.length - 1
                    };

                    // Show frame slider
                    const frameSliderContainer = document.getElementById('frameSliderContainer');
                    if (frameSliderContainer) {
                        frameSliderContainer.style.display = 'flex';
                        const slider = document.getElementById('frameSlider');
                        const label = document.getElementById('frameLabel');
                        if (slider) {
                            slider.max = parsedFrames.length - 1;
                            slider.value = parsedFrames.length - 1;
                        }
                        if (label) {
                            label.textContent = `Frame ${parsedFrames.length} / ${parsedFrames.length}`;
                        }
                    }

                    // Update molecule to final frame
                    window.undoManager?.saveState?.();
                    const targetPositions = {};
                    result.positions.forEach(p => {
                        targetPositions[p.index] = { x: p.x * 4, y: p.y * 4, z: p.z * 4 };
                    });
                    await animateAtomPositions(result.positions.map(p => p.index), targetPositions, 500);
                }

                // Store final forces for visualization if included
                if (result.forces) {
                    molecule.setForcesFromCalculation(result.forces);
                    if (window.updateForceArrowControls) window.updateForceArrowControls();
                }

                // Auto-save trajectory if folder open
                if (window.fileExplorer?.directoryHandle) {
                    const timestamp = new Date().toISOString().replace(/[:.]/g, '-').slice(0, 19);
                    const lattice = 'Lattice="100.0 0.0 0.0 0.0 100.0 0.0 0.0 0.0 100.0"';
                    // Check if any frame has forces
                    const hasForces = result.trajectory.some(f => f.forces && f.forces.length > 0);
                    const props = hasForces ? 'Properties=species:S:1:pos:R:3:forces:R:3' : 'Properties=species:S:1:pos:R:3';

                    let extxyz = '';
                    result.trajectory.forEach((frame, idx) => {
                        const comment = `${lattice} ${props} energy=${frame.energy_eV} temperature=${frame.temperature_K} step=${frame.step} pbc="F F F"`;
                        extxyz += `${atoms.length}\n${comment}\n`;
                        frame.positions.forEach((pos, i) => {
                            let line = `${atoms[i].element.padEnd(4)} ${pos[0].toFixed(8).padStart(14)} ${pos[1].toFixed(8).padStart(14)} ${pos[2].toFixed(8).padStart(14)}`;
                            if (hasForces && frame.forces && frame.forces[i]) {
                                const f = frame.forces[i];
                                line += ` ${f[0].toFixed(8).padStart(14)} ${f[1].toFixed(8).padStart(14)} ${f[2].toFixed(8).padStart(14)}`;
                            }
                            extxyz += line + '\n';
                        });
                    });

                    await window.fileExplorer.createFile(`mace_md_${timestamp}.extxyz`, extxyz);
                }

                return {
                    success: true,
                    message: `MD completed: ${result.steps} steps at ${result.temperature_K}K. Generated ${result.frameCount} frames. Final E = ${result.energy_eV.toFixed(4)} eV`,
                    frameCount: result.frameCount,
                    temperature_K: result.temperature_K,
                    energy_eV: result.energy_eV
                };

            } catch (e) {
                return { success: false, message: e.message };
            }
        }
    },

    toggle_labels: {
        execute: (params) => {
            if (!window.main?.molecule) return { success: false, message: "No molecule loaded" };

            // Update the flags based on parameters
            if (params.showElements !== undefined) {
                window.showElements = params.showElements;
            }
            if (params.showIndices !== undefined) {
                window.showIndices = params.showIndices;
            }

            // Determine if labels should be shown (either elements OR indices)
            const shouldShowLabels = window.showElements || window.showIndices;
            window.labelMode = shouldShowLabels;

            // Call toggleLabels with all three parameters
            window.main.molecule.toggleLabels(shouldShowLabels, window.showElements, window.showIndices);

            if (typeof window.render === 'function') window.render();

            // Build descriptive message
            let message = "Labels ";
            if (shouldShowLabels) {
                const parts = [];
                if (window.showElements) parts.push("elements");
                if (window.showIndices) parts.push("indices");
                message += `shown (${parts.join(" + ")})`;
            } else {
                message += "hidden";
            }

            return { success: true, message };
        }
    },

    toggle_force_arrows: {
        execute: (params) => {
            const molecule = window.main?.molecule;
            if (!molecule) return { success: false, message: "No molecule loaded" };

            // Check if force data is available
            if (!molecule.hasForceData()) {
                return {
                    success: false,
                    message: "No force data available. Run an energy calculation with includeForces: true first."
                };
            }

            // Determine whether to show or hide (toggle if not specified)
            const show = params.show !== undefined ? params.show : !molecule.forceArrowGroup?.visible;
            const scale = params.scale || window.forceArrowScale || 1.0;

            // Update the scale
            window.forceArrowScale = scale;

            // Toggle the force arrows
            molecule.toggleForceArrows(show, scale);

            // Sync the UI checkbox
            const checkbox = document.getElementById('toggleForceArrows');
            if (checkbox) checkbox.checked = show;

            // Update scale slider display
            const scaleSlider = document.getElementById('forceScaleSlider');
            const scaleValue = document.getElementById('forceScaleValue');
            if (scaleSlider) scaleSlider.value = scale;
            if (scaleValue) scaleValue.textContent = scale.toFixed(1);

            if (typeof window.render === 'function') window.render();

            return {
                success: true,
                message: show ? `Force arrows shown (scale: ${scale.toFixed(1)}x)` : "Force arrows hidden"
            };
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

    show_all_bond_lengths: {
        execute: () => {
            if (!window.main?.molecule?.bonds?.length) return { success: false, message: "No bonds in molecule" };

            if (typeof window.clearAllBondLengthLabels === 'function') {
                window.clearAllBondLengthLabels();
            }

            let count = 0;
            window.main.molecule.bonds.forEach(bond => {
                const idx1 = window.main.molecule.atoms.indexOf(bond.atom1);
                const idx2 = window.main.molecule.atoms.indexOf(bond.atom2);
                if (idx1 !== -1 && idx2 !== -1 && typeof window.createInfoLabel === 'function') {
                    window.createInfoLabel(idx1, idx2);
                    count++;
                }
            });

            if (typeof window.render === 'function') window.render();
            return { success: true, message: `Showing ${count} bond length labels` };
        }
    },

    remove_bond_label: {
        execute: (params) => {
            if (!window.bondLengthLabels?.length) return { success: false, message: "No labels to remove" };

            const { atom1, atom2, all } = params;

            if (all) {
                if (typeof window.clearAllBondLengthLabels === 'function') {
                    window.clearAllBondLengthLabels();
                    return { success: true, message: "All bond labels removed" };
                }
                return { success: false, message: "Clear function not available" };
            }

            if (atom1 === undefined || atom2 === undefined) {
                return { success: false, message: "Specify atom1 and atom2, or use all:true" };
            }

            const idx = window.bondLengthLabels.findIndex(label =>
                !label.isAngle && !label.isDihedral &&
                ((label.atom1Index === atom1 && label.atom2Index === atom2) ||
                    (label.atom1Index === atom2 && label.atom2Index === atom1))
            );

            if (idx === -1) return { success: false, message: `No label between atoms ${atom1} and ${atom2}` };

            if (typeof window.removeBondLengthLabel === 'function') {
                window.removeBondLengthLabel(idx);
                if (typeof window.render === 'function') window.render();
                return { success: true, message: `Removed label between atoms ${atom1} and ${atom2}` };
            }
            return { success: false, message: "Remove function not available" };
        }
    },

    save_image: {
        execute: () => {
            const btn = document.getElementById('saveImagePNG');
            if (btn) { btn.click(); return { success: true, message: "Image saved" }; }
            return { success: false, message: "Save image not available" };
        }
    },

    save_file: {
        execute: async (params) => {
            const timestamp = new Date().toISOString().replace(/[:.]/g, '-');
            const defaultExt = params.format || 'xyz';
            const filename = params.filename || `molecule_${timestamp}.${defaultExt}`;

            // Ensure filename has correct extension
            let finalFilename = filename;
            if (params.format && !filename.endsWith(`.${params.format}`)) {
                const parts = filename.split('.');
                if (parts.length > 1) parts.pop();
                finalFilename = parts.join('.') + `.${params.format}`;
            }

            // Detect format from filename
            const format = params.format || detectFormat(finalFilename);

            // Prepare data to save
            let saveData;

            // Check if we have multiple frames to export
            if (window.xyzFrames && window.xyzFrames.length > 1 && params.allFrames !== false) {
                // Multi-frame export
                const frames = window.xyzFrames.map((frame, idx) => ({
                    atomData: frame.atomData,
                    // Try frame.energy first, then window.frameEnergies
                    energy: frame.energy !== undefined && frame.energy !== null
                        ? frame.energy
                        : (window.frameEnergies ? window.frameEnergies[idx] : null),
                    metadata: frame.metadata || (window.frameMetadata ? window.frameMetadata[idx] : null)
                }));

                saveData = {
                    frames: frames,
                    energies: window.frameEnergies || frames.map(f => f.energy)
                };
            } else {
                // Single frame from current molecule
                if (!window.main?.data?.atomData?.length) {
                    return { success: false, message: "No molecule loaded" };
                }

                // Collect all available data (coordinates, forces, energies, metadata)
                const atoms = window.main.data.atomData;

                // Check for forces
                const hasForces = atoms.some(a => a.fx !== undefined);

                // Get energy (single value or first frame)
                let energy = window.main.data.energy;
                if (energy === undefined && window.frameEnergies && window.frameEnergies[0] !== undefined) {
                    energy = window.frameEnergies[0];
                }

                // Get metadata
                const metadata = window.main.data.metadata || (window.frameMetadata ? window.frameMetadata[0] : null);

                // Add ORCA metadata if available
                if (window.orcaMetadata) {
                    const combinedMetadata = { ...metadata, ...window.orcaMetadata };
                    saveData = {
                        atomData: atoms,
                        energy: energy,
                        metadata: combinedMetadata
                    };
                } else {
                    saveData = {
                        atomData: atoms,
                        energy: energy,
                        metadata: metadata
                    };
                }
            }

            // Generate file content using appropriate writer
            const fileContent = saveFile(saveData, finalFilename, format);

            const frameCount = saveData.frames ? saveData.frames.length : 1;

            // Save to local folder if requested
            if (params.saveToLocal) {
                if (!window.fileExplorer?.directoryHandle) {
                    return { success: false, message: "No folder open in file explorer. Open a folder first." };
                }

                const saved = await saveToFileExplorer(finalFilename, fileContent);
                if (saved) {
                    // Auto-save metadata summary if energy/forces available
                    const hasEnergy = saveData.energy || (saveData.energies && saveData.energies.length > 0);
                    const hasForces = saveData.atomData ? saveData.atomData.some(a => a.fx !== undefined) : false;

                    if (hasEnergy || hasForces) {
                        const summaryFilename = finalFilename.replace(/\.[^.]+$/, '_metadata.txt');
                        let summary = `Metadata for ${finalFilename}\n`;
                        summary += `Generated: ${new Date().toISOString()}\n\n`;

                        if (hasEnergy) {
                            if (saveData.energies) {
                                summary += `Energies (eV):\n`;
                                saveData.energies.forEach((e, i) => {
                                    if (e !== null && e !== undefined) {
                                        summary += `  Frame ${i + 1}: ${e}\n`;
                                    }
                                });
                            } else if (saveData.energy !== null && saveData.energy !== undefined) {
                                summary += `Energy: ${saveData.energy} eV\n`;
                            }
                        }

                        if (hasForces) {
                            summary += `\nForces: Included in ${format.toUpperCase()} file\n`;
                        }

                        if (saveData.metadata) {
                            summary += `\nAdditional Metadata:\n`;
                            summary += JSON.stringify(saveData.metadata, null, 2) + '\n';
                        }

                        await saveToFileExplorer(summaryFilename, summary);
                    }

                    return { success: true, message: `Saved ${frameCount} frame(s) to local folder: ${finalFilename}` };
                }
                return { success: false, message: "Failed to save to file explorer" };
            }

            // Download as file
            downloadFile(fileContent, finalFilename);

            return { success: true, message: `Exported ${frameCount} frame(s) to ${finalFilename} (${format.toUpperCase()} format)` };
        }
    },

    load_molecule: {
        execute: async (params) => {
            try {
                const cidRes = await fetch(`https://pubchem.ncbi.nlm.nih.gov/rest/pug/compound/name/${encodeURIComponent(params.name)}/cids/JSON`);
                if (!cidRes.ok) throw new Error('Molecule not found');
                const cidData = await cidRes.json();
                const cid = cidData.IdentifierList?.CID?.[0];
                if (!cid) throw new Error('No CID found');

                // Try 3D first, fall back to 2D
                let sdfRes = await fetch(`https://pubchem.ncbi.nlm.nih.gov/rest/pug/compound/cid/${cid}/record/SDF?record_type=3d`);
                if (!sdfRes.ok) {
                    sdfRes = await fetch(`https://pubchem.ncbi.nlm.nih.gov/rest/pug/compound/cid/${cid}/record/SDF`);
                    if (!sdfRes.ok) throw new Error('Structure unavailable');
                }

                const sdfText = await sdfRes.text();
                const lines = sdfText.split('\n');
                const numAtoms = parseInt(lines[3].slice(0, 3));
                const atomData = [];
                for (let i = 4; i < 4 + numAtoms; i++) {
                    const line = lines[i];
                    if (!line || line.length < 34) continue;
                    atomData.push({
                        element: line.slice(31, 34).trim(),
                        x: parseFloat(line.slice(0, 10).trim()),
                        y: parseFloat(line.slice(10, 20).trim()),
                        z: parseFloat(line.slice(20, 30).trim())
                    });
                }

                window.xyzFrames = null;
                const frameSlider = document.getElementById('frameSliderContainer');
                if (frameSlider) frameSlider.style.display = 'none';

                window.main.newMolecule({ atomData, numAtoms }, window.main.setNewMode(numAtoms <= 2000));
                window.main.zoomCameraToFitMolecule();

                return { success: true, message: `Loaded "${params.name}" (${numAtoms} atoms)` };
            } catch (err) {
                return { success: false, message: `Failed to load: ${err.message}` };
            }
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
    },
    calculate_energy: {
        execute: async (params) => {
            const molecule = window.main?.molecule;
            if (!molecule?.atoms?.length) return { success: false, message: "No molecule loaded" };

            const model = params.model || AI_CONFIG.maceModel || 'mace-mp-0a';
            AI_CONFIG.maceModel = model;
            localStorage.setItem('chopchop_mace_model', model);
            const includeForces = params.includeForces || false;

            const atoms = molecule.atoms.map(a => ({ element: a.type, x: a.x / 4, y: a.y / 4, z: a.z / 4 }));

            try {
                const result = await callMaceEnergy(AI_CONFIG.backendUrl, atoms, model, includeForces);

                // Store forces in molecule for visualization if included
                if (result.success && result.forces) {
                    molecule.setForcesFromCalculation(result.forces);
                    if (window.updateForceArrowControls) window.updateForceArrowControls();
                }

                // Auto-save extxyz to local folder if open
                if (result.success) {
                    const extxyz = generateSingleFrameExtxyz(atoms, result.energy_eV, result.forces);
                    await saveExtxyzFile(`mace_energy_${generateTimestamp()}.extxyz`, extxyz);
                }

                return result;
            } catch (e) {
                return { success: false, message: e.message };
            }
        }
    },

    optimize_geometry: {
        execute: async (params) => {
            const molecule = window.main?.molecule;
            if (!molecule?.atoms?.length) return { success: false, message: "No molecule loaded" };

            const atoms = molecule.atoms.map(a => ({ element: a.type, x: a.x / 4, y: a.y / 4, z: a.z / 4 }));
            const stretch = molecule.stretch || 4;
            const offset = molecule.offset || { x: 0, y: 0, z: 0 };
            const includeForces = params.includeForces || false;

            try {
                const res = await fetch(`${AI_CONFIG.backendUrl}/ai/mace/optimize`, {
                    method: 'POST',
                    headers: { 'Content-Type': 'application/json' },
                    body: JSON.stringify({
                        atoms,
                        model: params.model || AI_CONFIG.maceModel || 'medium',
                        fmax: params.fmax || 0.05,
                        maxSteps: params.maxSteps || 100,
                        includeForces
                    })
                });
                const result = await res.json();

                if (!result.success) {
                    return { success: false, message: result.error || "Optimization failed" };
                }

                // Convert trajectory to frame format
                if (result.trajectory && result.trajectory.length > 0) {
                    const parsedFrames = result.trajectory.map((frame, idx) => {
                        const atomData = frame.positions.map((pos, i) => {
                            const atom = {
                                element: atoms[i].element,
                                x: pos[0],
                                y: pos[1],
                                z: pos[2]
                            };
                            // Include forces if available
                            if (frame.forces && frame.forces[i]) {
                                atom.fx = frame.forces[i][0];
                                atom.fy = frame.forces[i][1];
                                atom.fz = frame.forces[i][2];
                            }
                            return atom;
                        });

                        return {
                            atomData,
                            numAtoms: atomData.length,
                            energy: frame.energy_eV,  // ADDED: Store energy in frame object
                            comment: `step=${idx} energy=${frame.energy_eV.toFixed(4)}eV fmax=${frame.max_force.toFixed(4)}eV/Å`
                        };
                    });

                    // Store frames globally
                    window.xyzFrames = parsedFrames;

                    // ADDED: Extract energies into separate array for file writer
                    window.frameEnergies = result.trajectory.map(frame => frame.energy_eV);

                    window.lastMaceResults = {
                        frameCount: result.trajectory.length,
                        energies: result.trajectory.map((frame, idx) => ({
                            frame: idx,
                            energy_eV: frame.energy_eV,
                            energy_kcal: frame.energy_eV * 23.0609,
                            max_force_eV_A: frame.max_force
                        })),
                        lowestEnergyFrame: 0,  // Will be recalculated if needed
                        highestEnergyFrame: result.trajectory.length - 1
                    };

                    // Show frame slider
                    const frameSliderContainer = document.getElementById('frameSliderContainer');
                    if (frameSliderContainer) {
                        frameSliderContainer.style.display = 'flex';
                        const slider = document.getElementById('frameSlider');
                        const label = document.getElementById('frameLabel');
                        if (slider) {
                            slider.max = parsedFrames.length - 1;
                            slider.value = parsedFrames.length - 1; // Start at final frame
                        }
                        if (label) {
                            label.textContent = `Frame ${parsedFrames.length} / ${parsedFrames.length}`;
                        }
                    }

                    // Update molecule to final frame
                    window.undoManager?.saveState?.();
                    const targetPositions = {};
                    result.positions.forEach(p => {
                        targetPositions[p.index] = { x: p.x * 4, y: p.y * 4, z: p.z * 4 };
                    });
                    await animateAtomPositions(result.positions.map(p => p.index), targetPositions, 500);
                }

                // Store final forces for visualization if included
                if (result.forces) {
                    molecule.setForcesFromCalculation(result.forces);
                    if (window.updateForceArrowControls) window.updateForceArrowControls();
                }

                // Auto-save extxyz to local folder if open
                if (window.fileExplorer?.directoryHandle) {
                    const timestamp = new Date().toISOString().replace(/[:.]/g, '-').slice(0, 19);
                    const lattice = 'Lattice="100.0 0.0 0.0 0.0 100.0 0.0 0.0 0.0 100.0"';
                    const hasForces = result.forces && result.forces.length > 0;
                    const props = hasForces ? 'Properties=species:S:1:pos:R:3:forces:R:3' : 'Properties=species:S:1:pos:R:3';
                    const comment = `${lattice} ${props} energy=${result.energy_eV} pbc="F F F" config_type="optimized"`;

                    let extxyz = `${atoms.length}\n${comment}\n`;
                    result.positions.forEach((p, i) => {
                        let line = `${atoms[i].element.padEnd(4)} ${p.x.toFixed(8).padStart(14)} ${p.y.toFixed(8).padStart(14)} ${p.z.toFixed(8).padStart(14)}`;
                        if (hasForces) {
                            const f = result.forces[i];
                            line += ` ${f[0].toFixed(8).padStart(14)} ${f[1].toFixed(8).padStart(14)} ${f[2].toFixed(8).padStart(14)}`;
                        }
                        extxyz += line + '\n';
                    });

                    await window.fileExplorer.createFile(`mace_opt_${timestamp}.extxyz`, extxyz);
                }

                return {
                    success: true,
                    message: `Optimization ${result.converged ? 'converged' : 'completed'} in ${result.steps} steps. Final energy: ${result.energy_eV.toFixed(4)} eV. Use frame slider to view trajectory.`,
                    ...result
                };
            } catch (e) {
                return { success: false, message: e.message };
            }
        }
    },

    calculate_all_energies: {
        execute: async (params = {}) => {
            const model = params.model || AI_CONFIG.maceModel || 'mace-mp-0a';
            AI_CONFIG.maceModel = model;
            localStorage.setItem('chopchop_mace_model', model);
            const includeForces = params.includeForces || false;
            const frames = window.xyzFrames;
            if (window.lastMaceResults && window.lastMaceResults.frameCount !== (frames?.length || 1)) {
                window.lastMaceResults = null;
            }
            if (!frames || frames.length === 0) {
                const molecule = window.main?.molecule;
                if (!molecule?.atoms?.length) return { success: false, message: "No molecule or frames loaded" };

                const atoms = molecule.atoms.map(a => ({ element: a.type, x: a.x / 4, y: a.y / 4, z: a.z / 4 }));
                try {
                    const res = await fetch(`${AI_CONFIG.backendUrl}/ai/mace/energy`, {
                        method: 'POST',
                        headers: { 'Content-Type': 'application/json' },
                        body: JSON.stringify({ atoms, model: params.model || AI_CONFIG.maceModel || 'mace-mp-0a', includeForces })
                    });
                    const result = await res.json();
                    return { success: true, frameCount: 1, energies: [result] };
                } catch (e) {
                    return { success: false, message: e.message };
                }
            }

            const allFrames = frames.map(f => f.atomData);

            try {
                const result = await callMaceEnergyBatch(AI_CONFIG.backendUrl, allFrames, params.model || AI_CONFIG.maceModel || 'mace-mp-0a', includeForces);

                if (result.success) window.lastMaceResults = result;

                // Merge forces back into window.xyzFrames and update current frame
                if (result.success && result.energies) {
                    mergeForcesIntoFrames(result.energies, includeForces);
                    updateCurrentFrameForces();
                }

                // Auto-save multi-frame extxyz to local folder if open
                if (result.success) {
                    const frameData = allFrames.map((atoms, i) => ({
                        atoms,
                        energy: result.energies[i].energy_eV,
                        forces: result.energies[i].forces,
                        extraProps: {}
                    }));
                    const extxyz = generateMultiFrameExtxyz(frameData);
                    await saveExtxyzFile(`mace_batch_${generateTimestamp()}.extxyz`, extxyz);
                }

                return result;
            } catch (e) {
                return { success: false, message: e.message };
            }
        }
    },

    get_cached_energies: {
        execute: () => {
            if (!window.lastMaceResults) {
                return { success: false, message: "No cached MACE results. Run calculate_all_energies first." };
            }
            return window.lastMaceResults;
        }
    },

    create_chart: {
        execute: async (params) => {
            window._pendingChartData = {
                type: params.type || 'line',
                title: params.title || '',
                xLabel: params.xLabel || '',
                yLabel: params.yLabel || '',
                x: params.x || [],
                y: params.y || []
            };
            window.updateEnergyChartButton?.();
            // Auto-open the dropdown and render
            const dropdown = document.getElementById('energyChartDropdown');
            if (dropdown && !dropdown.classList.contains('active')) {
                dropdown.classList.add('active');
            }
            setTimeout(() => window.renderEnergyChart?.(), 100);
            return { success: true, message: "Chart displayed", hasChart: true };
        }
    },
};

function getMoleculeState() {
    const hasAtoms = !!window.main?.molecule?.atoms?.length;
    const frames = window.xyzFrames || [];
    const energies = window.frameEnergies || [];
    const metadata = window.frameMetadata || [];

    // Check if current atoms have forces
    const currentAtoms = window.main?.molecule?.atoms || [];
    const hasForces = currentAtoms.some(atom =>
        atom.fx !== undefined || atom.fy !== undefined || atom.fz !== undefined
    );

    return {
        hasAtoms,
        atomCount: hasAtoms ? window.main.molecule.atoms.length : 0,
        selectedCount: window.atomsSelected?.length || 0,
        selectedIndices: window.atomsSelected?.slice(0, 20) || [],
        fragments: window.fragments || [],
        hasAxis: !!window.rotationAxis,
        axisAtoms: window.axisAtoms || [],
        hasRibbon: !!window.main?.data?.ribbonData,
        bondLabels: window.bondLengthLabels?.filter(l => !l.isAngle && !l.isDihedral).map(l => [l.atom1Index, l.atom2Index]) || [],
        // Frame info
        frameCount: frames.length,
        currentFrame: frames.length > 0 ? parseInt(document.getElementById('frameSlider')?.value || 0) : 0,
        hasMaceCache: !!window.lastMaceResults,
        maceFrameCount: window.lastMaceResults?.frameCount || 0,
        frames: frames.map((f, i) => ({
            index: i,
            atomCount: f.numAtoms,
            comment: f.comment || '',
            atoms: f.atomData,  // Full atom data for each frame (includes fx, fy, fz if present)
            energy: energies[i] !== undefined ? energies[i] : null,
            metadata: metadata[i] || null
        })),
        // Energy and force data
        hasEnergies: energies.some(e => e !== null && e !== undefined),
        energies: energies,
        hasForces: hasForces,
        hasMetadata: metadata.length > 0,
        maceModel: AI_CONFIG.maceModel || null,
        aiModel: AI_CONFIG.model,
        currentFileName: window.fileName
    };
}

async function sendToAI(userMessage, onChunk) {
    const state = getMoleculeState();
    let executed = [];
    let sessionId = AI_CONFIG.sessionId;
    let assistantMessage = null;
    let fullContent = "";
    const startTime = performance.now();
    let firstTokenTime = null;
    // Send initial status
    if (onChunk) onChunk(null, 'Analyzing request');

    try {
        const MAX_ITERATIONS = 10;
        for (let i = 0; i < MAX_ITERATIONS; i++) {
            const payload = {
                sessionId,
                message: userMessage,
                state,
                model: AI_CONFIG.model
            };

            if (assistantMessage) {
                payload.toolResults = {
                    assistantMessage,
                    results: executed.map(e => ({
                        tool_call_id: e.id,
                        content: JSON.stringify(e.result)
                    }))
                };
                // Keep chart images for final response, clear the rest
                // Keep chart data for final response, clear the rest
                executed = executed.filter(e => e.chartData);
            }
            if (i === 0 && onChunk) onChunk(null, 'Thinking');

            const response = await fetch(`${AI_CONFIG.backendUrl}/ai/chat/stream`, {
                method: 'POST',
                headers: { 'Content-Type': 'application/json' },
                body: JSON.stringify(payload)
            });

            if (!response.ok) {
                const err = await response.json();
                return { error: err.error || 'Backend error' };
            }

            const reader = response.body.getReader();
            const decoder = new TextDecoder();
            let buffer = "";
            let iterationContent = "";
            let toolCalls = null;

            while (true) {
                const { done, value } = await reader.read();
                if (done) break;

                buffer += decoder.decode(value, { stream: true });
                const lines = buffer.split('\n');
                buffer = lines.pop(); // Keep incomplete line in buffer

                for (const line of lines) {
                    if (line.startsWith('data: ')) {
                        const data = JSON.parse(line.slice(6));

                        if (data.type === 'text') {
                            if (!firstTokenTime) {
                                firstTokenTime = performance.now();
                                console.log(`⚡ TTFT: ${(firstTokenTime - startTime).toFixed(0)}ms`);
                            }
                            iterationContent += data.content;
                            fullContent += data.content;
                            if (onChunk) onChunk(data.content);
                        } else if (data.type === 'tool_status') {
                            // Real-time tool status from streaming (Claude)
                            if (onChunk) onChunk(null, data.toolName, 'tool_status');
                        } else if (data.type === 'tool_calls') {
                            toolCalls = data.toolCalls;
                            assistantMessage = data.assistantMessage;
                            if (data.sessionId) {
                                AI_CONFIG.sessionId = data.sessionId;
                                localStorage.setItem('chopchop_ai_session', data.sessionId);
                            }
                        } else if (data.type === 'done') {
                            if (data.sessionId) {
                                AI_CONFIG.sessionId = data.sessionId;
                                localStorage.setItem('chopchop_ai_session', data.sessionId);
                            }
                            console.log(`✅ Total: ${(performance.now() - startTime).toFixed(0)}ms`);
                            return { content: fullContent, actions: executed };
                        } else if (data.type === 'error') {
                            return { error: data.error };
                        }
                    }
                }
            }

            // Execute tool calls if any - IN PARALLEL for speed
            if (toolCalls?.length > 0) {
                // Execute all tools in parallel
                const toolPromises = toolCalls.map(async (tc) => {
                    const fn = tc.function.name;
                    const args = JSON.parse(tc.function.arguments || '{}');
                    console.log('AI calling:', fn, args);

                    if (onChunk) onChunk(null, toolStatusMap[fn] || fn.replace(/_/g, ' '));

                    if (FUNCTIONS[fn]) {
                        const res = await FUNCTIONS[fn].execute(args);
                        console.log('Result:', res);

                        // Compress result - send only essential data
                        const compressedResult = compressToolResult(fn, res);

                        // After executing a tool, check if it's a chart
                        if (fn === 'create_chart' && res.hasChart && window._pendingChartData) {
                            return {
                                id: tc.id,
                                name: fn,
                                args,
                                result: compressedResult,
                                chartData: window._pendingChartData
                            };
                        } else {
                            return { id: tc.id, name: fn, args, result: compressedResult };
                        }
                    } else {
                        return { id: tc.id, name: fn, args, result: { success: false, message: 'Function not found' } };
                    }
                });

                const results = await Promise.all(toolPromises);
                executed.push(...results);

                // Clear chart data after all tools
                if (window._pendingChartData) window._pendingChartData = null;
            } else {
                break;
            }
        }

        return { content: fullContent, actions: executed };

    } catch (e) {
        console.error('AI Error:', e);
        return { error: e.message };
    }
}

// Compress tool results to reduce payload size
function compressToolResult(functionName, result) {
    // For successful operations, only send minimal confirmation
    if (result.success) {
        // Don't send full molecule data back - backend doesn't need it
        const compressed = { success: true };

        // Only include essential data
        if (result.message) compressed.message = result.message;
        if (result.action) compressed.action = result.action;
        if (result.data && functionName === 'get_molecule_info') {
            // Keep only essential molecule info
            compressed.data = {
                atomCount: result.data.atomCount,
                elements: result.data.elements
            };
        }
        if (result.data && functionName === 'get_bonded_atoms') {
            compressed.data = result.data; // This is already minimal
        }
        if (result.chartData) compressed.chartData = result.chartData;
        if (result.hasChart) compressed.hasChart = result.hasChart;

        return compressed;
    }

    // For errors, send full result
    return result;
}

// Add this utility function (put it near the top of aiagent.js or in a utils file)

function animateAtomPositions(atomIndices, targetPositions, duration = 400) {
    const molecule = window.main?.molecule;
    if (!molecule) return Promise.resolve();

    // Capture starting positions
    const startPositions = {};
    atomIndices.forEach(idx => {
        const atom = molecule.atoms[idx];
        startPositions[idx] = { x: atom.x, y: atom.y, z: atom.z };
    });

    const startTime = performance.now();

    return new Promise(resolve => {
        function tick() {
            const elapsed = performance.now() - startTime;
            const t = Math.min(elapsed / duration, 1);

            // Ease-out cubic
            const eased = 1 - Math.pow(1 - t, 3);

            // Lerp all atoms
            atomIndices.forEach(idx => {
                const atom = molecule.atoms[idx];
                const start = startPositions[idx];
                const end = targetPositions[idx];

                atom.x = start.x + (end.x - start.x) * eased;
                atom.y = start.y + (end.y - start.y) * eased;
                atom.z = start.z + (end.z - start.z) * eased;
                atom.position.set(atom.x, atom.y, atom.z);

                // Update instanced mesh matrix
                if (typeof window.updateAtomMatrix === 'function') {
                    window.updateAtomMatrix(idx);
                }
            });

            // Update visuals
            if (molecule.instancedMesh) {
                molecule.instancedMesh.instanceMatrix.needsUpdate = true;
            }
            molecule.updateBonds?.(window.main.mode);
            window.render?.();

            if (t < 1) {
                requestAnimationFrame(tick);
            } else {
                resolve();
            }
        }
        requestAnimationFrame(tick);
    });
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
    hasApiKey: () => true, // Always true since backend handles it
    setModel: (m) => { AI_CONFIG.model = m; localStorage.setItem('chopchop_ai_model', m); },
    getModel: () => AI_CONFIG.model
};

// Warmup cache on page load to make first real request instant
if (document.readyState === 'loading') {
    document.addEventListener('DOMContentLoaded', warmupCache);
} else {
    setTimeout(warmupCache, 2000); // Delay if page already loaded
}

async function warmupCache() {
    try {
        console.log('🔥 Warming up AI cache...');
        const dummyState = getMoleculeState();
        const response = await fetch(`${AI_CONFIG.backendUrl}/ai/chat/stream`, {
            method: 'POST',
            headers: { 'Content-Type': 'application/json' },
            body: JSON.stringify({
                sessionId: AI_CONFIG.sessionId,
                message: 'ping',
                state: dummyState,
                model: AI_CONFIG.model
            })
        });
        await response.body?.cancel(); // Cancel immediately, we just want to warm the cache
        console.log('✅ AI cache warmed');
    } catch (e) {
        // Silent fail - warmup is optional
    }
}

// Cleanup session on tab/window close
window.addEventListener('beforeunload', () => {
    if (AI_CONFIG.sessionId) {
        const blob = new Blob(
            [JSON.stringify({ sessionId: AI_CONFIG.sessionId })],
            { type: 'application/json' }
        );
        navigator.sendBeacon(`${AI_CONFIG.backendUrl}/ai/clear`, blob);
    }
});

// Export utility functions for global access
window.buildAdjacencyList = buildAdjacencyList;
window.findConnectedFragment = findConnectedFragment;
window.findFragmentAvoidingVertex = findFragmentAvoidingVertex;
window.setupFrameSlider = setupFrameSlider;
window.loadFrames = loadFrames;
window.getCurrentFrameIndex = getCurrentFrameIndex;