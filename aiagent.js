// aiAgent.js - AI Agent for ChopChopMol (Backend Version)

const AI_CONFIG = {
    backendUrl: 'https://chopchopmol-ai-backend.onrender.com',
    sessionId: localStorage.getItem('chopchop_ai_session') || crypto.randomUUID(),
    model: localStorage.getItem('chopchop_ai_model') || 'gpt-5-mini'
};
// Save immediately if new
if (!localStorage.getItem('chopchop_ai_session')) {
    localStorage.setItem('chopchop_ai_session', AI_CONFIG.sessionId);
}
//

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
            window.main.data.atomData.push({ element: params.element.toUpperCase(), x, y, z });
            window.main.data.numAtoms++;
            window.main.newMolecule(window.main.data, window.main.mode, false, { x: 0, y: 0, z: 0 }, { x: 0, y: 0, z: 0 }, true, true);
            return { success: true, message: `Added ${params.element}` };
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

            // Check if atom1 and atom2 are bonded
            if (!adj[atom1].includes(atom2)) {
                return { success: false, message: `Atoms ${atom1} and ${atom2} are not bonded` };
            }

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

    rotational_scan: {
        execute: (params) => {
            if (!window.main?.molecule?.atoms) return { success: false, message: "No molecule loaded" };

            const { axisAtom1, axisAtom2, atomsToMove, increment } = params;
            const molecule = window.main.molecule;
            const stretch = molecule.stretch || 4;
            const offset = molecule.offset || { x: 0, y: 0, z: 0 };

            const atom1 = molecule.atoms[axisAtom1];
            const atom2 = molecule.atoms[axisAtom2];
            if (!atom1 || !atom2) return { success: false, message: "Invalid axis atoms" };
            if (!atomsToMove || atomsToMove.length === 0) return { success: false, message: "No atoms to rotate" };
            if (!increment || increment <= 0) return { success: false, message: "Increment must be positive" };

            const steps = Math.floor(360 / increment);
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

            for (let step = 0; step < steps; step++) {
                const angle = step * increment;
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
                        // Add offset back before dividing by stretch
                        x = (basePos.x + offset.x) / stretch;
                        y = (basePos.y + offset.y) / stretch;
                        z = (basePos.z + offset.z) / stretch;
                    } else {
                        // Add offset back before dividing by stretch
                        x = (atom.position.x + offset.x) / stretch;
                        y = (atom.position.y + offset.y) / stretch;
                        z = (atom.position.z + offset.z) / stretch;
                    }

                    atomData.push({ element: atom.type, x, y, z });
                });

                parsedFrames.push({ atomData, numAtoms: atomData.length, comment: `angle=${angle}` });
            }

            window.xyzFrames = parsedFrames;

            const frameSliderContainer = document.getElementById('frameSliderContainer');
            if (frameSliderContainer) {
                frameSliderContainer.style.display = 'flex';
                const slider = document.getElementById('frameSlider');
                const label = document.getElementById('frameLabel');
                if (slider) {
                    slider.max = parsedFrames.length - 1;
                    slider.value = 0;
                }
                if (label) {
                    label.textContent = `Frame 1 / ${parsedFrames.length}`;
                }
            }

            return {
                success: true,
                message: `Generated ${steps} frames (0° to ${(steps - 1) * increment}° in ${increment}° steps). Use frame slider to play.`
            };
        }
    },
    translation_scan: {
        execute: (params) => {
            if (!window.main?.molecule?.atoms) return { success: false, message: "No molecule loaded" };

            const { axisAtom1, axisAtom2, atomsToMove, totalDistance = 3, increment = 0.2 } = params;
            const molecule = window.main.molecule;
            const stretch = molecule.stretch || 4;
            const offset = molecule.offset || { x: 0, y: 0, z: 0 };

            const atom1 = molecule.atoms[axisAtom1];
            const atom2 = molecule.atoms[axisAtom2];
            if (!atom1 || !atom2) return { success: false, message: "Invalid axis atoms" };
            if (!atomsToMove || atomsToMove.length === 0) return { success: false, message: "No atoms to translate" };
            if (increment <= 0) return { success: false, message: "Increment must be positive" };

            const steps = Math.floor(totalDistance / increment) + 1;
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

            for (let step = 0; step < steps; step++) {
                const dist = step * increment;
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

            window.xyzFrames = parsedFrames;

            const frameSliderContainer = document.getElementById('frameSliderContainer');
            if (frameSliderContainer) {
                frameSliderContainer.style.display = 'flex';
                const slider = document.getElementById('frameSlider');
                const label = document.getElementById('frameLabel');
                if (slider) {
                    slider.max = parsedFrames.length - 1;
                    slider.value = 0;
                }
                if (label) {
                    label.textContent = `Frame 1 / ${parsedFrames.length}`;
                }
            }

            return {
                success: true,
                message: `Generated ${steps} frames (0 to ${totalDistance}Å in ${increment}Å steps). Use frame slider to play.`
            };
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

    save_xyz: {
        execute: async (params) => {
            const timestamp = new Date().toISOString().replace(/[:.]/g, '-');
            const filename = params.filename || `molecule_${timestamp}.xyz`;

            // Build XYZ content
            let xyzContent = '';

            // Check if we have multiple frames to export
            if (window.xyzFrames && window.xyzFrames.length > 1 && params.allFrames !== false) {
                // Export all frames as multi-frame XYZ
                window.xyzFrames.forEach((frame, index) => {
                    xyzContent += frame.numAtoms + '\n';
                    xyzContent += (frame.comment || `Frame ${index + 1}`) + '\n';
                    frame.atomData.forEach(atom => {
                        const element = atom.element.padEnd(4);
                        const x = atom.x.toFixed(6).padStart(12);
                        const y = atom.y.toFixed(6).padStart(12);
                        const z = atom.z.toFixed(6).padStart(12);
                        xyzContent += `${element}${x}${y}${z}\n`;
                    });
                });
            } else {
                // Single frame from current molecule
                if (!window.main?.data?.atomData?.length) {
                    return { success: false, message: "No molecule loaded" };
                }
                const atoms = window.main.data.atomData;
                xyzContent += atoms.length + '\n';
                xyzContent += `Generated by ChopChopMol - ${timestamp}\n`;
                atoms.forEach(atom => {
                    const element = atom.element.padEnd(4);
                    const x = atom.x.toFixed(6).padStart(12);
                    const y = atom.y.toFixed(6).padStart(12);
                    const z = atom.z.toFixed(6).padStart(12);
                    xyzContent += `${element}${x}${y}${z}\n`;
                });
            }

            const finalFilename = filename.endsWith('.xyz') ? filename : filename + '.xyz';
            const frameCount = (window.xyzFrames?.length > 1 && params.allFrames !== false) ? window.xyzFrames.length : 1;

            // Save to local folder if requested
            if (params.saveToLocal) {
                if (!window.fileExplorer?.directoryHandle) {
                    return { success: false, message: "No folder open in file explorer. Open a folder first." };
                }
                const result = await window.fileExplorer.createFile(finalFilename, xyzContent);
                if (result.success) {
                    return { success: true, message: `Saved ${frameCount} frame(s) to local folder: ${finalFilename}` };
                }
                return result;
            }

            // Download as file
            const blob = new Blob([xyzContent], { type: 'text/plain' });
            const url = URL.createObjectURL(blob);
            const a = document.createElement('a');
            a.href = url;
            a.download = finalFilename;
            document.body.appendChild(a);
            a.click();
            document.body.removeChild(a);
            URL.revokeObjectURL(url);

            return { success: true, message: `Exported ${frameCount} frame(s) to ${finalFilename}` };
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
    },
    calculate_energy: {
        execute: async () => {
            const molecule = window.main?.molecule;
            if (!molecule?.atoms?.length) {
                return { success: false, message: "No molecule loaded" };
            }

            const atoms = molecule.atoms.map(a => ({
                element: a.element,
                x: a.x,
                y: a.y,
                z: a.z
            }));

            try {
                const res = await fetch(`${AI_CONFIG.backendUrl}/ai/mace/energy`, {
                    method: 'POST',
                    headers: { 'Content-Type': 'application/json' },
                    body: JSON.stringify({ atoms })
                });
                return await res.json();
            } catch (e) {
                return { success: false, message: e.message };
            }
        }
    },

    optimize_geometry: {
        execute: async (params) => {
            const molecule = window.main?.molecule;
            if (!molecule?.atoms?.length) {
                return { success: false, message: "No molecule loaded" };
            }

            const atoms = molecule.atoms.map(a => ({
                element: a.element,
                x: a.x,
                y: a.y,
                z: a.z
            }));

            try {
                const res = await fetch(`${AI_CONFIG.backendUrl}/ai/mace/optimize`, {
                    method: 'POST',
                    headers: { 'Content-Type': 'application/json' },
                    body: JSON.stringify({
                        atoms,
                        fmax: params.fmax || 0.05,
                        maxSteps: params.maxSteps || 100
                    })
                });
                const result = await res.json();

                if (result.success && result.positions) {
                    // Save undo state
                    window.undoManager?.saveState?.();

                    // Animate atoms to new positions
                    const targetPositions = {};
                    result.positions.forEach(p => {
                        targetPositions[p.index] = { x: p.x, y: p.y, z: p.z };
                    });

                    const indices = result.positions.map(p => p.index);
                    await animateAtomPositions(indices, targetPositions, 600);
                }

                return result;
            } catch (e) {
                return { success: false, message: e.message };
            }
        }
    },
    calculate_all_energies: {
        execute: async () => {
            const frames = window.xyzFrames;
            if (!frames || frames.length === 0) {
                // Fall back to current molecule if no frames
                const molecule = window.main?.molecule;
                if (!molecule?.atoms?.length) return { success: false, message: "No molecule or frames loaded" };

                const atoms = molecule.atoms.map(a => ({ element: a.element, x: a.x, y: a.y, z: a.z }));
                try {
                    const res = await fetch(`${AI_CONFIG.backendUrl}/ai/mace/energy`, {
                        method: 'POST',
                        headers: { 'Content-Type': 'application/json' },
                        body: JSON.stringify({ atoms })
                    });
                    const result = await res.json();
                    return { success: true, frameCount: 1, energies: [result] };
                } catch (e) {
                    return { success: false, message: e.message };
                }
            }

            // Send all frames to backend
            const allFrames = frames.map(f => f.atomData);

            try {
                const res = await fetch(`${AI_CONFIG.backendUrl}/ai/mace/energy-batch`, {
                    method: 'POST',
                    headers: { 'Content-Type': 'application/json' },
                    body: JSON.stringify({ frames: allFrames })
                });
                return await res.json();
            } catch (e) {
                return { success: false, message: e.message };
            }
        }
    },
};

function getMoleculeState() {
    const hasAtoms = !!window.main?.molecule?.atoms?.length;
    const frames = window.xyzFrames || [];

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
        frames: frames.map((f, i) => ({
            index: i,
            atomCount: f.numAtoms,
            comment: f.comment || '',
            atoms: f.atomData  // Full atom data for each frame
        }))
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

    try {
        const MAX_ITERATIONS = 5;
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
                executed = [];
            }

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

            // Execute tool calls if any
            if (toolCalls?.length > 0) {
                for (const tc of toolCalls) {
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
                break;
            }
        }

        return { content: fullContent, actions: executed };

    } catch (e) {
        console.error('AI Error:', e);
        return { error: e.message };
    }
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