import * as THREE from 'three';
import { OrbitControls } from 'jsm/controls/OrbitControls.js';
import { TrackballControls } from 'jsm/controls/TrackballControls.js';
import Molecule from './atom/molecule.js';
import FileHandler from './utils/fileHandler.js';
// WE WILL NOW TRY TO MAKE THIS AMAZING WEBSITE AN APP. IT MAY GO AMAZINGLY OR IT MAY GO HORRIBLY.
// It went well!!!!!!!!!!!!!!!!!!!!!!!!!!!!!!!!!!!!!!!!!!!!!!!!!!!!!!!!!!!!!!!!!!!!!!!!!!!!!!!!!!!!!!!
// Please refer the the README.md file for more information
// CLEANUP TIME!!!!

// Setup scene
const scene = new THREE.Scene();
const camera = new THREE.PerspectiveCamera(75, window.innerWidth / window.innerHeight, 0.1, 1000);

let renderer = new THREE.WebGLRenderer({ antialias: false, powerPreference: "high-performance" });
renderer.setSize(window.innerWidth, window.innerHeight);
renderer.setPixelRatio(window.devicePixelRatio);
document.body.appendChild(renderer.domElement);

// const controls = new OrbitControls(camera, renderer.domElement);
let controls = new TrackballControls(camera, renderer.domElement);

controls.rotateSpeed = 5.0;
controls.zoomSpeed = 2.0;
controls.panSpeed = 1.0;
controls.dynamicDampingFactor = 1.0; // No drag smoothing
let shiftDown = false;
let cmdDown = false;

let atomsSelected = [];
let fragments = [];
let hoveredAtom = null;


let editingMolecule = true;


const light = new THREE.DirectionalLight(0xffffff, 3);
const ambientLight = new THREE.AmbientLight(0xffffff, 2);
const raycaster = new THREE.Raycaster();
const mouse = new THREE.Vector2();



scene.add(light);
scene.add(ambientLight);
// testing 123
camera.position.z = 15;
let mode = 0;
let antialiasToggled = false
let labelMode = false; // Track label mode

const switchModeButton = document.getElementById('switchMode');
const toggleLabelsButton = document.getElementById('toggleLabels');
const saveImageButton = document.getElementById('captureScreen');
const clearSceneButton = document.getElementById('clear-canvas');
const analyzeMoleculeButton = document.getElementById('analyze-molecule');
const editMoleculePanel = document.getElementById('editMoleculePanel');
const editMoleculeButton = document.getElementById('editMolecule');
const editMoleculeContent = document.getElementById('editMoleculeContent');

let dragging = false;
// let draggedAtomIndex = null; // Remove this, use atomsSelected
let dragPlane = new THREE.Plane();
let dragOffsets = {}; // Store offsets for each selected atom
// Add these with your other global variables
let isSelecting = false;
let selectionStart = { x: 0, y: 0 };
let selectionEnd = { x: 0, y: 0 };
let rotationAxis = null; // Store the defined axis
let axisAtoms = []; // Store the two atoms that define the axis
let axisVisualizer = null; // Three.js object to visualize the axis
const selectionBox = document.getElementById('selectionBox');
const projectionVector = new THREE.Vector3();


export default class Main {
    constructor() {
        this.scene = scene;
        this.atomData = [];
        this.data = [];
        this.atomSettings = [];
        this.loader = new FileHandler(this);
        this.loader.parseJSON().then(settings => {
            this.atomSettings = settings || {};
            this.molecule = new Molecule(this, this.atomSettings, false);
            this.overlayMolecule = new Molecule(this, this.atomSettings, true);

        });
        this.mode = 0
        this.roughness = 0.17;
        this.metalness = 0.3;
        this.opacity = 1;
        this.atomSize = 1;
        this.resolution = 16


    }
    init(data, mode, rotation, translation) {
        this.molecule.init(data, mode);
        render()
        console.log(this.data);
    }
    reset() {
        // Clear atoms and bonds
        this.atoms = [];
        this.bonds = [];

        // Properly dispose of the instanced mesh
        if (this.instancedMesh) {
            // Remove from scene
            this.main.scene.remove(this.instancedMesh);

            // Dispose geometry
            if (this.instancedMesh.geometry) {
                this.instancedMesh.geometry.dispose();
            }

            // Dispose material
            if (this.instancedMesh.material) {
                if (Array.isArray(this.instancedMesh.material)) {
                    this.instancedMesh.material.forEach(mat => mat.dispose());
                } else {
                    this.instancedMesh.material.dispose();
                }
            }

            this.instancedMesh = null;
        }

        // Clear bond group
        if (this.bondGroup) {
            // Remove all children and dispose
            while (this.bondGroup.children.length > 0) {
                const child = this.bondGroup.children[0];
                this.bondGroup.remove(child);

                if (child.geometry) child.geometry.dispose();
                if (child.material) {
                    if (Array.isArray(child.material)) {
                        child.material.forEach(mat => mat.dispose());
                    } else {
                        child.material.dispose();
                    }
                }
            }

            this.main.scene.remove(this.bondGroup);
            this.bondGroup = new THREE.Group();
        }

        this.labels = [];

        atomsSelected = [];
        hoveredAtom = null;

        // Clear any axis definitions
        rotationAxis = null;
        axisAtoms = [];
        if (axisVisualizer) {
            this.scene.remove(axisVisualizer);
            axisVisualizer.geometry.dispose();
            axisVisualizer.material.dispose();
            axisVisualizer = null;
        }

        // Clear the edit panel
        editMoleculePanel.classList.add('on');

        clearScene(this.scene);
        render();
    }
    newMolecule(data, mode, overlay, rotation, translation) {

        if (overlay) {
            this.overlayMolecule.init(data, mode, rotation, translation);
        } else {
            this.reset();
            this.molecule.init(data, mode, rotation, translation);
        }
        if (labelMode) {
            this.molecule.toggleLabels(true); // Show labels if in label mode
        }
        render();

    }
    toggleLabels() {
        labelMode = !labelMode;
        this.molecule.toggleLabels(labelMode);
        render();
    }
    createNewMoleculeFromJSON(json, overlay, rotation, translation) {
        const data = JSON.parse(json);
        this.newMolecule(data, this.mode, overlay, rotation, translation);
        this.data = data;
    }
    setNewMode(style = false) {
        if (style) {
            this.mode = { roughness: main.roughness, metalness: main.metalness, opacity: main.opacity, atomSize: main.atomSize, resolution: main.resolution, antialias: antialiasToggled };
        } else {
            this.mode = 0
        }
        mode = this.mode
        return this.mode
    }
    // Add a method to zoom the camera to fit the molecule
    zoomCameraToFitMolecule() {
        if (!this.molecule || !this.molecule.instancedMesh) return;
        const boundingBox = this.molecule.getBoundingBox();
        if (!boundingBox) return;
        const size = new THREE.Vector3();
        boundingBox.getSize(size);
        const center = new THREE.Vector3();
        boundingBox.getCenter(center);

        // Get the largest dimension
        const maxDim = Math.max(size.x, size.y, size.z);
        // Camera fov is vertical, so use height
        const fov = camera.fov * (Math.PI / 180); // vertical fov in radians
        const fitHeightDistance = maxDim / (2 * Math.tan(fov / 2));
        const fitWidthDistance = maxDim / (2 * Math.tan(fov / 2) * camera.aspect);
        const distance = Math.max(fitHeightDistance, fitWidthDistance);

        // Move camera to look at center, at the right distance
        camera.position.set(center.x, center.y, center.z + distance * 1.5); // 1.1 for padding
        camera.lookAt(center);
        if (controls) {
            controls.target.copy(center);
            controls.update();
        }
    }
}

const main = new Main();
// Make main globally accessible for use in other scripts
window.main = main;

const fileInput = document.getElementById("fileInput")
// File input event listener
fileInput.addEventListener("change", (e) => {
    console.log(e)
    main.loader.handleFile(e, false);
}, false);

document.getElementById("compare").addEventListener("change", (e) => {
    const file = e.target.files[0]
    const event =
        main.loader.handleFile(file, true);
}, false);
let isLPressed = false;

const styleSelector = document.getElementById('styleSelector');
const roughnessSelector = document.getElementById('style1');
const metalnessSelector = document.getElementById('style2');
const opacitySelector = document.getElementById('style3');
const bondsSelector = document.getElementById('style4');
const atomSizeSelector = document.getElementById('style5');
const resSelector = document.getElementById('style6')
const toggleAntialiasing = document.getElementById('style7')
const backgroundColorSelector = document.getElementById('style8');

const toggleStyleChanges = document.getElementById('toggleStyleChanges');

roughnessSelector.addEventListener('input', () => {
    main.roughness = roughnessSelector.value;
    if (mode != 0) {
        updateStyles();
    }
});
metalnessSelector.addEventListener('input', () => {
    main.metalness = metalnessSelector.value;
    if (mode != 0) {
        updateStyles();
    }
});
opacitySelector.addEventListener('input', () => {
    main.opacity = opacitySelector.value;
    if (mode != 0) {
        updateStyles();
    }
});
atomSizeSelector.addEventListener('input', () => {
    main.atomSize = atomSizeSelector.value;
    if (mode != 0) {
        updateStyles();
    }
});

resSelector.addEventListener('input', () => {
    main.resolution = resSelector.value;
    if (mode != 0) {
        updateStyles();
    }
});

backgroundColorSelector.addEventListener('input', () => {
    const color = backgroundColorSelector.value;
    scene.background = new THREE.Color(color);
    document.body.style.backgroundColor = color;
    render();
});


function updateStyles() {
    // Store current selection before updating
    const previousSelection = [...atomsSelected];

    mode = main.setNewMode(true);
    main.newMolecule(main.data, main.mode, false, { x: 0, y: 0, z: 0 }, { x: 0, y: 0, z: 0 });

    // Restore selection after molecule is recreated
    atomsSelected = previousSelection;

    // Re-apply visual selection
    if (atomsSelected.length > 0) {
        atomsSelected.forEach(idx => {
            selectAtom(idx, false);
        });

        // Update UI
        const element = main.molecule.atoms[atomsSelected[0]].type;
        updateEditingContent(element, main.molecule.atomSettings[element].color);
        attachButtonEventListeners();
    }

    render();
}

toggleStyleChanges.addEventListener('change', () => {
    // Store current selection
    const previousSelection = [...atomsSelected];

    if (mode == 0) {
        mode = main.setNewMode(true);
    } else {
        mode = main.setNewMode();
    }
    main.newMolecule(main.data, main.mode, false, { x: 0, y: 0, z: 0 }, { x: 0, y: 0, z: 0 });

    // Restore selection
    atomsSelected = previousSelection;
    if (atomsSelected.length > 0) {
        atomsSelected.forEach(idx => {
            selectAtom(idx, false);
        });

        const element = main.molecule.atoms[atomsSelected[0]].type;
        updateEditingContent(element, main.molecule.atomSettings[element].color);
        attachButtonEventListeners();
    }

    console.log(mode);
    render();
});

toggleAntialiasing.addEventListener('change', () => {
    antialiasToggled = toggleAntialiasing.checked;
    recreateRenderer(antialiasToggled);
});

window.addEventListener('keydown', function (e) {
    if (e.key === 'l') {
        isLPressed = true;
    }
});

window.addEventListener('keyup', function (e) {
    if (e.key === 'l') {
        isLPressed = false;
    }
    if (e.key == "Shift") {
        shiftDown = false;
        controls.enabled = true;
    }
    if (e.key == "Meta") {
        cmdDown = false;
        controls.enabled = true;
    }
});

window.addEventListener('keydown', function (e) {
    if (isLPressed && e.key === 'Enter') {
        const newData = window.prompt("Enter the JSON data:");
        if (newData) {
            main.createNewMoleculeFromJSON(newData);
        }
    }
    if (e.key == "Shift") {
        shiftDown = true;
        if (editingMolecule) {
            controls.enabled = false;
        }
    }

    if (e.key == "Meta") {
        cmdDown = true;
        if (editingMolecule) {
            controls.enabled = false;
        }
    }
});
window.addEventListener('keydown', function (e) {
    if (e.key == "j") {
        copyTextToClipboard(JSON.stringify(main.data));
    }
})
window.addEventListener('resize', () => {
    camera.aspect = window.innerWidth / window.innerHeight;
    camera.updateProjectionMatrix();
    renderer.setSize(window.innerWidth, window.innerHeight);

    render()
});

switchModeButton.addEventListener('click', () => {
    // mode = 1 - mode;
    // main.newMolecule(main.data, mode, false, { x: 0, y: 0, z: 0 }, { x: 0, y: 0, z: 0 });
    styleSelector.classList.toggle('on');
});

toggleLabelsButton.addEventListener('click', () => {
    main.toggleLabels();
});

window.addEventListener('replyUpdated', (event) => {
    const newReply = event.detail;
    console.log(newReply);
    main.createNewMoleculeFromJSON(JSON.stringify(newReply));

});

saveImageButton.addEventListener('click', () => {
    saveImage();
});

clearSceneButton.addEventListener('click', () => {
    main.reset();
});
analyzeMoleculeButton.addEventListener('click', () => {
    const images = []
    const numImages = 3;
    for (let i = 0; i < numImages; i++) {
        const imgData = getScreenUrl();
        images.push(imgData)
        rotateCamera(Math.PI / (numImages / 2), camera, controls);
    }

    window.imgToAnalyze = { images: JSON.stringify(images), coordinates: main.data };
})

renderer.domElement.addEventListener('pointerdown', onPointerDown, false);

// 3D to 2D projection for atoms
function worldToScreen(worldPos, camera) {
    projectionVector.copy(worldPos);
    projectionVector.project(camera);

    const x = (projectionVector.x * 0.5 + 0.5) * window.innerWidth;
    const y = (projectionVector.y * -0.5 + 0.5) * window.innerHeight;

    return { x, y };
}

function getAtomWorldPosition(atomIndex, instancedMesh) {
    const matrix = new THREE.Matrix4();
    const position = new THREE.Vector3();

    instancedMesh.getMatrixAt(atomIndex, matrix);
    position.setFromMatrixPosition(matrix);
    position.applyMatrix4(instancedMesh.matrixWorld);

    return position;
}

// Helper function to get atom radius from matrix scale
function getAtomRadius(atomIndex, molecule) {
    const matrix = new THREE.Matrix4();
    const scale = new THREE.Vector3();

    molecule.instancedMesh.getMatrixAt(atomIndex, matrix);
    scale.setFromMatrixScale(matrix);

    // Assuming uniform scale, take X component
    return scale.x;
}

function saveAsXYZ() {
    if (!main.data || !main.data.atomData || main.data.atomData.length === 0) {
        alert('No molecule loaded to save!');
        return;
    }

    // Create XYZ file content
    let xyzContent = '';

    // First line: number of atoms
    xyzContent += main.data.numAtoms + '\n';

    // Second line: comment (can include molecule name, energy, etc.)
    const timestamp = new Date().toISOString().replace(/[:.]/g, '-');
    xyzContent += `Generated by ChopChopMol 2.0 - ${timestamp}\n`;

    // Atom lines: element x y z
    main.data.atomData.forEach(atom => {
        // Format: element symbol followed by coordinates with proper spacing
        // Using fixed decimal places for clean output
        const element = atom.element.padEnd(4); // Pad element symbol to 4 characters
        const x = atom.x.toFixed(6).padStart(12);
        const y = atom.y.toFixed(6).padStart(12);
        const z = atom.z.toFixed(6).padStart(12);

        xyzContent += `${element}${x}${y}${z}\n`;
    });

    // Create blob and download
    const blob = new Blob([xyzContent], { type: 'text/plain' });
    const url = URL.createObjectURL(blob);

    // Create download link
    const link = document.createElement('a');
    link.href = url;
    link.download = `molecule_${timestamp}.xyz`;

    // Trigger download
    document.body.appendChild(link);
    link.click();

    // Cleanup
    document.body.removeChild(link);
    URL.revokeObjectURL(url);
}

// Add event listener for the save XYZ button
document.addEventListener('DOMContentLoaded', () => {
    const saveXYZButton = document.getElementById('saveXYZ');
    if (saveXYZButton) {
        saveXYZButton.addEventListener('click', saveAsXYZ);
    }
});

// Enhanced raycasting that checks distance to atom centers
function enhancedRaycast(raycaster, instancedMesh, atoms) {
    // First try standard raycasting
    const intersects = raycaster.intersectObject(instancedMesh);

    if (intersects.length > 0) {
        return intersects;
    }

    // If no direct hit, check proximity to atom centers
    const ray = raycaster.ray;
    const threshold = 0.5; // Proximity threshold multiplier

    let closestAtom = null;
    let closestDistance = Infinity;

    for (let i = 0; i < atoms.length; i++) {
        const atomPos = getAtomWorldPosition(i, instancedMesh);
        const atomRadius = getAtomRadius(i, { instancedMesh }) * threshold;

        // Calculate distance from ray to atom center
        const rayToAtom = new THREE.Vector3().subVectors(atomPos, ray.origin);
        const projection = rayToAtom.dot(ray.direction);

        // Skip atoms behind the camera
        if (projection < 0) continue;

        // Find closest point on ray to atom center
        const closestPointOnRay = new THREE.Vector3()
            .copy(ray.direction)
            .multiplyScalar(projection)
            .add(ray.origin);

        const distanceToAtom = closestPointOnRay.distanceTo(atomPos);

        // Check if within selection radius
        if (distanceToAtom < atomRadius && distanceToAtom < closestDistance) {
            closestDistance = distanceToAtom;
            closestAtom = {
                instanceId: i,
                point: closestPointOnRay,
                distance: ray.origin.distanceTo(closestPointOnRay),
                object: instancedMesh
            };
        }
    }

    return closestAtom ? [closestAtom] : [];
}

// Update the bounding box computation for better selection
function updateInstancedMeshBounds(instancedMesh, atoms) {
    if (!instancedMesh) return;

    // Force update of bounding box
    instancedMesh.computeBoundingBox();
    instancedMesh.computeBoundingSphere();

    // Manually compute bounds if needed
    const box = new THREE.Box3();
    const matrix = new THREE.Matrix4();
    const position = new THREE.Vector3();

    for (let i = 0; i < atoms.length; i++) {
        instancedMesh.getMatrixAt(i, matrix);
        position.setFromMatrixPosition(matrix);
        box.expandByPoint(position);
    }

    instancedMesh.boundingBox = box;
}

// Check if atom is in selection box
function isAtomInSelection(atomIndex, camera) {
    const atom = main.molecule.atoms[atomIndex];
    if (!atom) return false;

    const screenPos = worldToScreen(atom.position, camera);

    const minX = Math.min(selectionStart.x, selectionEnd.x);
    const maxX = Math.max(selectionStart.x, selectionEnd.x);
    const minY = Math.min(selectionStart.y, selectionEnd.y);
    const maxY = Math.max(selectionStart.y, selectionEnd.y);

    return screenPos.x >= minX && screenPos.x <= maxX &&
        screenPos.y >= minY && screenPos.y <= maxY;
}

// Update visual selection box
function updateSelectionBox() {
    const minX = Math.min(selectionStart.x, selectionEnd.x);
    const maxX = Math.max(selectionStart.x, selectionEnd.x);
    const minY = Math.min(selectionStart.y, selectionEnd.y);
    const maxY = Math.max(selectionStart.y, selectionEnd.y);

    selectionBox.style.left = minX + 'px';
    selectionBox.style.top = minY + 'px';
    selectionBox.style.width = (maxX - minX) + 'px';
    selectionBox.style.height = (maxY - minY) + 'px';
}

// Update atom selection based on box
// Update atom selection based on box
// Update atom selection based on box
// Update atom selection based on box
function updateAtomSelection() {
    if (!main.molecule || !main.molecule.atoms) return;

    // Find atoms currently in selection box
    const atomsInBox = [];
    for (let i = 0; i < main.molecule.atoms.length; i++) {
        if (isAtomInSelection(i, camera)) {
            atomsInBox.push(i);
        }
    }

    // Show selection for: existing selected atoms + atoms in box
    const allSelected = [...new Set([...atomsSelected, ...atomsInBox])];

    // Clear visual selection for all atoms first
    unselectAtom();

    // Highlight all atoms that should be selected (existing + preview)
    allSelected.forEach(idx => {
        selectAtom(idx, false);
    });


    // Update UI - Check the TOTAL count of selected atoms (including preview)
    if (allSelected.length > 0) {
        editMoleculePanel.classList.remove('on');
        const element = main.molecule.atoms[allSelected[0]].type;

        // Pass the selection count to updateEditingContent
        updateEditingContent(element, main.molecule.atomSettings[element].color, allSelected.length);
    } else {
        // editMoleculePanel.classList.add('on');
    }
}

// Add to your existing window event listeners
window.addEventListener('pointermove', onSelectionMove, false);
window.addEventListener('pointerup', onSelectionUp, false);
window.addEventListener('pointermove', onPointerMove2, false);

function onSelectionMove(event) {
    if (isSelecting) {
        selectionEnd.x = event.clientX;
        selectionEnd.y = event.clientY;
        updateSelectionBox();
        updateAtomSelection();
        render();
    }
}

function onSelectionUp(event) {
    if (event.button === 0 && isSelecting) {
        isSelecting = false;
        selectionBox.style.display = 'none';

        // Finalize the box selection - add atoms in box to selection
        if (main.molecule && main.molecule.atoms) {
            for (let i = 0; i < main.molecule.atoms.length; i++) {
                if (isAtomInSelection(i, camera)) {
                    if (!atomsSelected.includes(i)) {
                        atomsSelected.push(i);
                    }
                }
            }

            // Refresh the highlighting for the final selection
            unselectAtom(); // Clear all
            atomsSelected.forEach(idx => {
                selectAtom(idx, false); // Highlight final selection
            });

            // Update the UI with the final selection count
            if (atomsSelected.length > 0) {
                editMoleculePanel.classList.remove('on');
                const element = main.molecule.atoms[atomsSelected[0]].type;
                updateEditingContent(element, main.molecule.atomSettings[element].color);

                // IMPORTANT: Attach button event listeners after box selection
                attachButtonEventListeners();
            } else {
                // editMoleculePanel.classList.add('on');
            }
        }

        render();
    }
}

function createAxisVisualizer(atom1, atom2) {
    // Remove existing axis visualizer
    if (axisVisualizer) {
        main.scene.remove(axisVisualizer);
        axisVisualizer.geometry.dispose();
        axisVisualizer.material.dispose();
        axisVisualizer = null;
    }

    // Create a line to visualize the axis
    const geometry = new THREE.BufferGeometry();
    const positions = new Float32Array(6);

    // Get the actual world positions of the atoms
    const matrix1 = new THREE.Matrix4();
    const matrix2 = new THREE.Matrix4();
    main.molecule.instancedMesh.getMatrixAt(axisAtoms[0], matrix1);
    main.molecule.instancedMesh.getMatrixAt(axisAtoms[1], matrix2);

    const pos1 = new THREE.Vector3();
    const pos2 = new THREE.Vector3();
    pos1.setFromMatrixPosition(matrix1);
    pos2.setFromMatrixPosition(matrix2);

    // Apply the instancedMesh world transformation
    pos1.applyMatrix4(main.molecule.instancedMesh.matrixWorld);
    pos2.applyMatrix4(main.molecule.instancedMesh.matrixWorld);

    // Extend the line beyond the atoms for better visibility
    const direction = new THREE.Vector3().subVectors(pos2, pos1).normalize();
    const extendDistance = 1000; // Extend 10 units in each direction

    const start = new THREE.Vector3().copy(pos1).sub(direction.clone().multiplyScalar(extendDistance));
    const end = new THREE.Vector3().copy(pos2).add(direction.clone().multiplyScalar(extendDistance));

    positions[0] = start.x;
    positions[1] = start.y;
    positions[2] = start.z;
    positions[3] = end.x;
    positions[4] = end.y;
    positions[5] = end.z;

    geometry.setAttribute('position', new THREE.BufferAttribute(positions, 3));

    const material = new THREE.LineBasicMaterial({
        color: 0xff00ff, // Magenta color for visibility
        linewidth: 3,
        opacity: 0.8,
        transparent: true
    });

    axisVisualizer = new THREE.Line(geometry, material);
    main.scene.add(axisVisualizer);
    render(); // Make sure to render after adding the axis
}

function rotateAroundAxis(atomIndices, angle) {
    if (!rotationAxis || !rotationAxis.point || !rotationAxis.direction) {
        console.error("No axis defined for rotation");
        return;
    }

    const axis = new THREE.Vector3(rotationAxis.direction.x, rotationAxis.direction.y, rotationAxis.direction.z).normalize();
    const point = new THREE.Vector3(rotationAxis.point.x, rotationAxis.point.y, rotationAxis.point.z);

    // Create rotation matrix
    const rotationMatrix = new THREE.Matrix4().makeRotationAxis(axis, angle);

    atomIndices.forEach(idx => {
        const atom = main.molecule.atoms[idx];

        // Translate to origin (relative to axis point)
        const relativePos = new THREE.Vector3().copy(atom.position).sub(point);

        // Apply rotation
        relativePos.applyMatrix4(rotationMatrix);

        // Translate back
        atom.position.copy(relativePos).add(point);
        atom.x = atom.position.x;
        atom.y = atom.position.y;
        atom.z = atom.position.z;

        // Update instanced mesh
        const matrix = new THREE.Matrix4();
        let radius = main.molecule.atomSettings[atom.type]?.realRadius * 1.5 || 1;
        if (main.mode && main.mode.atomSize) {
            radius *= main.mode.atomSize;
        }
        matrix.makeScale(radius, radius, radius);
        matrix.setPosition(atom.position);
        main.molecule.instancedMesh.setMatrixAt(idx, matrix);
    });

    main.molecule.instancedMesh.instanceMatrix.needsUpdate = true;
    main.molecule.updateBonds(mode);
    main.molecule.updateMainCoordinates();
    render();
}


function onPointerDown(event) {
    if (editingMolecule) {
        if (!main.molecule || !main.molecule.instancedMesh) {
            console.warn('Molecule or instancedMesh not initialized');
            return;
        }

        // Convert mouse to normalized device coordinates
        const rect = renderer.domElement.getBoundingClientRect();
        mouse.x = ((event.clientX - rect.left) / rect.width) * 2 - 1;
        mouse.y = -((event.clientY - rect.top) / rect.height) * 2 + 1;

        if (event.button === 0) { // Left click
            // Update bounds before raycasting
            updateInstancedMeshBounds(main.molecule.instancedMesh, main.molecule.atoms);

            raycaster.setFromCamera(mouse, camera);

            // Use enhanced raycasting
            const intersects = enhancedRaycast(raycaster, main.molecule.instancedMesh, main.molecule.atoms);

            if (intersects.length > 0) {
                // Clicking on an atom
                const instanceId = intersects[0].instanceId;
                if (instanceId !== undefined) {
                    if (shiftDown) {
                        // Shift + click: start dragging
                        dragging = true;

                        // If the clicked atom isn't in the selection, add it
                        if (!atomsSelected.includes(instanceId)) {
                            atomsSelected.push(instanceId);
                            selectAtom(instanceId);
                        }

                        // Set up drag plane through the clicked atom
                        const atom = main.molecule.atoms[instanceId];

                        // Use actual world position for better accuracy
                        const worldPos = getAtomWorldPosition(instanceId, main.molecule.instancedMesh);

                        dragPlane.setFromNormalAndCoplanarPoint(
                            camera.getWorldDirection(new THREE.Vector3()),
                            worldPos
                        );

                        // Calculate offsets for ALL selected atoms relative to click point
                        dragOffsets = {};
                        const intersectPoint = intersects[0].point;
                        atomsSelected.forEach(idx => {
                            const atomWorldPos = getAtomWorldPosition(idx, main.molecule.instancedMesh);
                            dragOffsets[idx] = new THREE.Vector3().copy(atomWorldPos).sub(intersectPoint);
                        });

                        window.addEventListener('pointermove', onPointerMove, false);
                        window.addEventListener('pointerup', onPointerUp, false);
                        return; // Don't do normal selection logic
                    }

                    if (cmdDown) {
                        // Cmd + click: toggle atom in selection
                        if (atomsSelected.includes(instanceId)) {
                            // Remove from selection
                            atomsSelected = atomsSelected.filter(id => id !== instanceId);
                            unselectAtom(instanceId);
                        } else {
                            // Add to selection
                            atomsSelected.push(instanceId);
                            selectAtom(instanceId, false);
                        }
                    } else {
                        // Normal click: select only this atom
                        atomsSelected = [instanceId];
                        unselectAtom(); // Clear all
                        selectAtom(instanceId);
                    }

                    render();

                    if (atomsSelected.length > 0) {
                        editMoleculePanel.classList.remove('on');
                        const element = main.molecule.atoms[atomsSelected[0]].type;
                        updateEditingContent(element, main.molecule.atomSettings[element].color);

                        // Attach button event listeners
                        attachButtonEventListeners();
                    }
                }
            } else {
                // Clicking on empty space
                if (cmdDown) {
                    // Cmd + drag on empty space: start box selection
                    isSelecting = true;
                    selectionStart.x = event.clientX;
                    selectionStart.y = event.clientY;
                    selectionEnd.x = event.clientX;
                    selectionEnd.y = event.clientY;

                    selectionBox.style.display = 'block';
                    updateSelectionBox();
                } else {
                    // Normal click on empty space: clear selection
                    // editMoleculePanel.classList.add('on');
                    atomsSelected = [];
                    unselectAtom();
                    render();
                }
            }
        }
    }
}
function addToList(itemText, list) {
    const listItem = document.createElement('li');
    listItem.textContent = `Fragment: [${itemText.join(', ')}]`;
    listItem.style.cursor = 'pointer';
    listItem.style.padding = '5px';
    listItem.style.borderRadius = '3px';
    listItem.style.transition = 'background-color 0.2s ease';

    // Add hover effect
    listItem.addEventListener('mouseenter', () => {
        listItem.style.backgroundColor = 'rgba(255, 255, 255, 0.2)';
    });

    listItem.addEventListener('mouseleave', () => {
        listItem.style.backgroundColor = 'transparent';
    });

    // Add click handler to select fragment
    listItem.addEventListener('click', () => {
        selectFragment(itemText);
    });

    list.appendChild(listItem);
}


function onPointerMove(event) {
    if (!dragging) return;

    // Convert mouse to normalized device coordinates
    const rect = renderer.domElement.getBoundingClientRect();
    mouse.x = ((event.clientX - rect.left) / rect.width) * 2 - 1;
    mouse.y = -((event.clientY - rect.top) / rect.height) * 2 + 1;

    raycaster.setFromCamera(mouse, camera);

    // Find intersection with drag plane
    const intersection = new THREE.Vector3();
    raycaster.ray.intersectPlane(dragPlane, intersection);

    if (rotationAxis && rotationAxis.direction) {
        // AXIS-CONSTRAINED DRAGGING
        const axisDirection = rotationAxis.direction.clone().normalize();
        const axisPoint = rotationAxis.point.clone();

        if (!window.dragStartIntersection) {
            window.dragStartIntersection = intersection.clone();
            return;
        }

        const fullMovement = new THREE.Vector3().subVectors(intersection, window.dragStartIntersection);
        const projectedLength = fullMovement.dot(axisDirection);
        const projectedMovement = axisDirection.clone().multiplyScalar(projectedLength);

        atomsSelected.forEach(idx => {
            const atom = main.molecule.atoms[idx];

            if (!window.originalDragPositions) {
                window.originalDragPositions = {};
            }
            if (!window.originalDragPositions[idx]) {
                window.originalDragPositions[idx] = atom.position.clone();
            }

            atom.position.copy(window.originalDragPositions[idx]).add(projectedMovement);
            atom.x = atom.position.x;
            atom.y = atom.position.y;
            atom.z = atom.position.z;

            updateAtomMatrix(idx);
        });

    } else {
        // NORMAL FREE DRAGGING
        atomsSelected.forEach(idx => {
            const atom = main.molecule.atoms[idx];
            const offset = dragOffsets[idx] || new THREE.Vector3();

            // Apply the transformation accounting for instancedMesh transform
            const newPos = new THREE.Vector3().copy(intersection).add(offset);

            // Convert from world space to local space of instancedMesh
            const inverseMatrix = new THREE.Matrix4().copy(main.molecule.instancedMesh.matrixWorld).invert();
            newPos.applyMatrix4(inverseMatrix);

            atom.position.copy(newPos);
            atom.x = atom.position.x;
            atom.y = atom.position.y;
            atom.z = atom.position.z;

            updateAtomMatrix(idx);
        });
    }

    main.molecule.instancedMesh.instanceMatrix.needsUpdate = true;

    // Update bounds after moving atoms
    updateInstancedMeshBounds(main.molecule.instancedMesh, main.molecule.atoms);

    // Update bonds
    main.molecule.updateBonds(mode);

    render();
}


function onPointerMove2(event) {
    if (!editingMolecule || dragging || isSelecting) return;

    if (!main.molecule || !main.molecule.instancedMesh || !main.molecule.atoms) return;


    const rect = renderer.domElement.getBoundingClientRect();
    mouse.x = ((event.clientX - rect.left) / rect.width) * 2 - 1;
    mouse.y = -((event.clientY - rect.top) / rect.height) * 2 + 1;

    raycaster.setFromCamera(mouse, camera);

    // Update bounds before raycasting
    updateInstancedMeshBounds(main.molecule.instancedMesh, main.molecule.atoms);

    const intersects = enhancedRaycast(raycaster, main.molecule.instancedMesh, main.molecule.atoms);

    if (intersects.length > 0) {
        const instanceId = intersects[0].instanceId;

        if (hoveredAtom !== instanceId) {
            // Reset previous hover
            if (hoveredAtom !== null && !atomsSelected.includes(hoveredAtom)) {
                const colorAttr = main.molecule.instancedMesh.geometry.getAttribute('color');
                const atom = main.molecule.atoms[hoveredAtom];
                const color = new THREE.Color(main.molecule.atomSettings[atom.type].color);
                colorAttr.setXYZ(hoveredAtom, color.r, color.g, color.b);
                colorAttr.needsUpdate = true;
            }

            // Apply hover effect
            hoveredAtom = instanceId;
            if (!atomsSelected.includes(instanceId)) {
                const colorAttr = main.molecule.instancedMesh.geometry.getAttribute('color');
                const atom = main.molecule.atoms[instanceId];
                const color = new THREE.Color(main.molecule.atomSettings[atom.type].color);
                // Lighten the color for hover
                const hoverColor = color.clone().lerp(new THREE.Color(1, 1, 1), 0.3);
                colorAttr.setXYZ(instanceId, hoverColor.r, hoverColor.g, hoverColor.b);
                colorAttr.needsUpdate = true;
            }

            renderer.domElement.style.cursor = 'pointer';
            render();
        }
    } else {
        // No hover
        if (hoveredAtom !== null && !atomsSelected.includes(hoveredAtom)) {
            const colorAttr = main.molecule.instancedMesh.geometry.getAttribute('color');
            const atom = main.molecule.atoms[hoveredAtom];
            const color = new THREE.Color(main.molecule.atomSettings[atom.type].color);
            colorAttr.setXYZ(hoveredAtom, color.r, color.g, color.b);
            colorAttr.needsUpdate = true;
            render();
        }
        hoveredAtom = null;
        renderer.domElement.style.cursor = 'default';
    }
}

// Solution 1: Create a separate function to attach button event listeners
function attachButtonEventListeners() {
    // Remove any existing listeners first to avoid duplicates
    const changeBtn = document.getElementById('changeAtomBtn');
    const removeBtn = document.getElementById('removeAtomBtn');
    const fragmentBtn = document.getElementById('createFragment');
    const closeEditing = document.getElementById('closeEditing');


    // Clone and replace to remove all existing event listeners
    if (changeBtn) {
        const newChangeBtn = changeBtn.cloneNode(true);
        changeBtn.parentNode.replaceChild(newChangeBtn, changeBtn);

        newChangeBtn.addEventListener('click', () => {
            if (atomsSelected.length > 0) {
                const replacingMolecule = window.prompt("Enter the element you want to replace the current atom with");
                if (replacingMolecule) {
                    // Update all selected atoms
                    atomsSelected.forEach(idx => {
                        main.data.atomData[idx].element = replacingMolecule;
                    });
                    main.newMolecule(main.data, main.mode, false, { x: 0, y: 0, z: 0 }, { x: 0, y: 0, z: 0 });
                }
            }
        });
    }

    if (removeBtn) {
        const newRemoveBtn = removeBtn.cloneNode(true);
        removeBtn.parentNode.replaceChild(newRemoveBtn, removeBtn);

        newRemoveBtn.addEventListener('click', () => {
            // Remove all selected atoms (in reverse order to maintain indices)
            const sortedIndices = [...atomsSelected].sort((a, b) => b - a);
            sortedIndices.forEach(idx => {
                main.data.atomData.splice(idx, 1);
            });
            main.data.numAtoms -= atomsSelected.length;
            atomsSelected = [];
            main.newMolecule(main.data, main.mode, false, { x: 0, y: 0, z: 0 }, { x: 0, y: 0, z: 0 });
        });
    }

    if (fragmentBtn) {
        const newFragmentBtn = fragmentBtn.cloneNode(true);
        fragmentBtn.parentNode.replaceChild(newFragmentBtn, fragmentBtn);

        newFragmentBtn.addEventListener('click', () => {
            const fragment = [...atomsSelected]; // Create a copy of the array
            fragments.push(fragment);

            // Update the editing content to show the new fragment
            if (atomsSelected.length > 0) {
                const firstAtom = main.molecule.atoms[atomsSelected[0]];
                updateEditingContent(firstAtom.type, main.molecule.atomSettings[firstAtom.type].color);
            }
        });
    }

    if (closeEditing) {
        const newCloseEditing = closeEditing.cloneNode(true);
        closeEditing.parentNode.replaceChild(newCloseEditing, closeEditing);

        newCloseEditing.addEventListener('click', () => {
            editMoleculePanel.classList.add('on');
        });
    }

    // Attach axis event listeners
    attachAxisEventListeners();
}

// Updated updateEditingContent function in main.js
function updateEditingContent(element = null, color = null) {
    if (element !== null) {
        let axisButtonHtml = '';
        let axisControlsHtml = '';

        // Show "Define Axis" button only when exactly 2 atoms are selected
        if (atomsSelected.length === 2) {
            axisButtonHtml = `<button id="defineAxisBtn" style="background-color:rgb(255, 0, 255); margin:10px;" class="fancy-button">Define Axis</button>`;
        }

        // Show axis controls if an axis is defined
        if (rotationAxis) {
            axisControlsHtml = `
                <div style="margin-top: 20px; padding: 20px; background-color: rgba(255, 0, 255, 0.2); border-radius: 15px;">
                    <h3 style="color: white; margin: 5px 0;">Rotation Axis Defined</h3>
                    <p style="color: white; font-size: 12px; margin: 5px 0;">Atoms: ${axisAtoms[0]} → ${axisAtoms[1]}</p>
                    <button id="removeAxisBtn" style="background-color:rgb(255, 100, 100); margin:5px;" class="fancy-button">Remove Axis</button>
                    <div style="margin-top: 10px;">
                        <label style="color: white; display: block; margin-bottom: 5px;">Rotate ${atomsSelected.length > 0 && atomsSelected.length < main.molecule.atoms.length ? 'Selected Atoms' : 'Entire Molecule'}:</label>
                        <input type="range" id="rotationSlider" min="-180" max="180" value="0" step="1" style="width: 100%;">
                        <span id="rotationValue" style="color: white; display: block; text-align: center;">0°</span>
                    </div>
                </div>
            `;
        }

        editMoleculeContent.innerHTML = `
            <button id="closeEditing" class="dismiss" title="Dismiss">×</button>

            <h2 style="color:${color};">Element: ${element}</h2><br>
            <span style="color:white;">Hold shift and drag to move the atom</span>
            <br>
            <span style="color:white;">Hold cmd or ctrl and to select more atoms in a group</span>

            <button id="changeAtomBtn" style="background-color:rgb(162, 0, 255); margin:10px;" class="fancy-button">Replace Atom</button>
            <button id="removeAtomBtn" style="background-color:rgb(0, 128, 255); margin:10px;" class="fancy-button">Remove Atom</button>
            <button id="createFragment" style="background-color:rgb(168, 146, 0); margin:10px; display:none; " class="fancy-button">Create Fragment</button>
            ${axisButtonHtml}
            ${axisControlsHtml}
            <ul id="fragmentList"></ul>
        `;

        if (atomsSelected.length > 1) {
            document.getElementById('createFragment').style.display = 'block';
        }

        // Recreate fragment list with click handlers
        const fragmentList = document.getElementById('fragmentList');
        fragments.forEach((fragment, index) => {
            const listItem = document.createElement('li');
            listItem.textContent = `Fragment ${index + 1}: [${fragment.join(', ')}]`;
            listItem.style.cursor = 'pointer';
            listItem.style.padding = '5px';
            listItem.style.margin = '2px';
            listItem.style.borderRadius = '5px';
            listItem.style.transition = 'background-color 0.3s';
            listItem.dataset.fragmentIndex = index;

            // Check if this fragment is currently selected
            if (arraysEqual(fragment, atomsSelected)) {
                listItem.classList.add('selected');
                listItem.style.backgroundColor = 'rgba(255, 255, 255, 0.3)';
            }

            // Add hover effect
            listItem.addEventListener('mouseenter', () => {
                listItem.style.backgroundColor = 'rgba(255, 255, 255, 0.2)';
            });

            listItem.addEventListener('mouseleave', () => {
                if (!listItem.classList.contains('selected')) {
                    listItem.style.backgroundColor = 'transparent';
                }
            });

            // Add click handler
            listItem.addEventListener('click', () => {
                selectFragment(fragment, index);
                updateFragmentListSelection(index);
            });

            fragmentList.appendChild(listItem);
        });

        // Attach axis-related event listeners
        attachAxisEventListeners();
    } else {
        editMoleculeContent.innerHTML = '<h2 id="select-an-atom">Select an atom</h2>';
    }
}


function attachAxisEventListeners() {
    const defineAxisBtn = document.getElementById('defineAxisBtn');
    const removeAxisBtn = document.getElementById('removeAxisBtn');
    const rotationSlider = document.getElementById('rotationSlider');
    const rotationValue = document.getElementById('rotationValue');

    if (defineAxisBtn) {
        defineAxisBtn.addEventListener('click', () => {
            if (atomsSelected.length === 2) {
                const atom1 = main.molecule.atoms[atomsSelected[0]];
                const atom2 = main.molecule.atoms[atomsSelected[1]];

                // Use atom positions directly (they're already in the correct coordinate system)
                const pos1 = atom1.position.clone();
                const pos2 = atom2.position.clone();

                rotationAxis = {
                    point: pos1.clone(),
                    direction: new THREE.Vector3().subVectors(pos2, pos1).normalize()
                };

                axisAtoms = [...atomsSelected];

                // Create visual representation
                createAxisVisualizer(atom1, atom2);

                // Update UI
                updateEditingContent(atom1.type, main.molecule.atomSettings[atom1.type].color);

                console.log('Axis defined:', rotationAxis);
            }
        });
    }

    if (removeAxisBtn) {
        removeAxisBtn.addEventListener('click', () => {
            // Remove axis
            rotationAxis = null;
            axisAtoms = [];

            // Remove visual representation
            if (axisVisualizer) {
                main.scene.remove(axisVisualizer);
                axisVisualizer.geometry.dispose();
                axisVisualizer.material.dispose();
                axisVisualizer = null;
            }

            // Update UI
            if (atomsSelected.length > 0) {
                const element = main.molecule.atoms[atomsSelected[0]].type;
                updateEditingContent(element, main.molecule.atomSettings[element].color);
            }

            render();
        });
    }

    if (rotationSlider && rotationValue) {
        let previousAngle = 0;
        let originalPositions = {}; // Store original positions when slider starts
        let isSliderActive = false;

        // Store original positions when starting to drag
        rotationSlider.addEventListener('mousedown', () => {
            isSliderActive = true;
            originalPositions = {};

            // Store the current slider angle as the base angle
            const currentAngle = parseFloat(rotationSlider.value) || 0;

            // Determine which atoms will be rotated
            let atomsToRotate = [];
            if (atomsSelected.length > 0 && atomsSelected.length < main.molecule.atoms.length) {
                atomsToRotate = atomsSelected;
            } else {
                atomsToRotate = Array.from({ length: main.molecule.atoms.length }, (_, i) => i);
            }

            // If the slider is not at 0, we need to "undo" the current rotation first
            // to get back to the true original positions
            if (currentAngle !== 0 && rotationAxis) {
                const axis = rotationAxis.direction.clone().normalize();
                const point = rotationAxis.point.clone();
                const inverseRotation = new THREE.Matrix4().makeRotationAxis(axis, -currentAngle * Math.PI / 180);

                atomsToRotate.forEach(idx => {
                    const atom = main.molecule.atoms[idx];
                    const tempPos = atom.position.clone();

                    // Translate to origin
                    tempPos.sub(point);
                    // Apply inverse rotation
                    tempPos.applyMatrix4(inverseRotation);
                    // Translate back
                    tempPos.add(point);

                    // Store this as the original position
                    originalPositions[idx] = tempPos;
                });
            } else {
                // If slider is at 0, just store current positions
                atomsToRotate.forEach(idx => {
                    const atom = main.molecule.atoms[idx];
                    originalPositions[idx] = atom.position.clone();
                });
            }

            console.log('Stored original positions for', Object.keys(originalPositions).length, 'atoms');
        });

        rotationSlider.addEventListener('input', (e) => {
            if (!isSliderActive || !rotationAxis) return;

            const angle = parseFloat(e.target.value);
            rotationValue.textContent = `${angle}°`;

            // Calculate the total angle from 0 (not delta)
            const totalAngle = angle * Math.PI / 180;

            // Determine which atoms to rotate
            let atomsToRotate = [];
            if (atomsSelected.length > 0 && atomsSelected.length < main.molecule.atoms.length) {
                atomsToRotate = atomsSelected;
            } else {
                atomsToRotate = Array.from({ length: main.molecule.atoms.length }, (_, i) => i);
            }

            // Create rotation matrix
            const axis = rotationAxis.direction.clone().normalize();
            const point = rotationAxis.point.clone();
            const rotationMatrix = new THREE.Matrix4().makeRotationAxis(axis, totalAngle);

            // Rotate atoms from their original positions
            atomsToRotate.forEach(idx => {
                const atom = main.molecule.atoms[idx];
                const originalPos = originalPositions[idx];

                if (originalPos) {
                    // Start from original position
                    const tempPos = originalPos.clone();

                    // Translate to origin (relative to axis point)
                    tempPos.sub(point);

                    // Apply rotation
                    tempPos.applyMatrix4(rotationMatrix);

                    // Translate back
                    tempPos.add(point);

                    // Update atom position
                    atom.position.copy(tempPos);
                    atom.x = atom.position.x;
                    atom.y = atom.position.y;
                    atom.z = atom.position.z;

                    // Update instanced mesh
                    updateAtomMatrix(idx);
                }
            });

            // Update rendering
            main.molecule.instancedMesh.instanceMatrix.needsUpdate = true;
            main.molecule.updateBonds(mode);
            render();
        });

        // Reset everything when releasing the slider
        rotationSlider.addEventListener('mouseup', () => {
            if (!isSliderActive) return;

            // Instead of resetting the slider to 0, just set the flag to false
            isSliderActive = false;

            // Update the stored positions to the current rotated positions
            // This makes the current rotation the new "original" position
            let atomsToRotate = [];
            if (atomsSelected.length > 0 && atomsSelected.length < main.molecule.atoms.length) {
                atomsToRotate = atomsSelected;
            } else {
                atomsToRotate = Array.from({ length: main.molecule.atoms.length }, (_, i) => i);
            }

            // Store the current (rotated) positions as the new base positions
            atomsToRotate.forEach(idx => {
                const atom = main.molecule.atoms[idx];
                originalPositions[idx] = atom.position.clone();
            });

            // Update the molecule's main coordinates to reflect the new positions
            main.molecule.updateMainCoordinates();

            // Don't reset the slider value or the rotation value display
            // rotationSlider.value = 0;  // REMOVE THIS LINE
            // rotationValue.textContent = '0°';  // REMOVE THIS LINE

            // Don't reset atom positions - they should stay where they are
            // Remove all the code that resets atoms to original positions
        });

        // Also handle the change event as backup
        rotationSlider.addEventListener('change', () => {
            if (isSliderActive) {
                // Trigger mouseup behavior
                rotationSlider.dispatchEvent(new Event('mouseup'));
            }
        });
    }
}


function updateAtomMatrix(atomIndex) {
    const atom = main.molecule.atoms[atomIndex];
    const matrix = new THREE.Matrix4();
    let radius = main.molecule.atomSettings[atom.type]?.realRadius * 1.5 || 1;
    if (main.mode && main.mode.atomSize) {
        radius *= main.mode.atomSize;
    }
    matrix.makeScale(radius, radius, radius);
    matrix.setPosition(atom.position);
    main.molecule.instancedMesh.setMatrixAt(atomIndex, matrix);
}

function onPointerUp(event) {
    if (dragging) {
        dragging = false;
        dragOffsets = {};

        // Clean up axis dragging variables
        window.dragStartIntersection = null;
        window.originalDragPositions = null;

        window.removeEventListener('pointermove', onPointerMove, false);
        window.removeEventListener('pointerup', onPointerUp, false);
    }

    if (event.button === 0 && isSelecting) {
        isSelecting = false;
        selectionBox.style.display = 'none';

        // Finalize the box selection - add atoms in box to selection
        if (main.molecule && main.molecule.atoms) {
            for (let i = 0; i < main.molecule.atoms.length; i++) {
                if (isAtomInSelection(i, camera)) {
                    if (!atomsSelected.includes(i)) {
                        atomsSelected.push(i);
                    }
                }
            }
            console.log('Final selected atoms:', atomsSelected);
        }

        render();
    }
    main.molecule.updateMainCoordinates()
}

function selectFragment(fragmentAtoms, fragmentIndex) {
    // Clear current selection
    unselectAtom();

    // Set atomsSelected to the fragment atoms
    atomsSelected = [...fragmentAtoms];
    console.log(atomsSelected);

    // Highlight all atoms in the fragment
    atomsSelected.forEach(atomIndex => {
        selectAtom(atomIndex, false);
        render();
    });
    render();


}

function updateFragmentListSelection(selectedIndex) {
    const fragmentList = document.getElementById('fragmentList');
    if (!fragmentList) return;

    // Remove selection from all items
    fragmentList.querySelectorAll('li').forEach((item, index) => {
        item.classList.remove('selected');
        item.style.backgroundColor = 'transparent';

        // Add selection to the clicked item
        if (index === selectedIndex) {
            item.classList.add('selected');
            item.style.backgroundColor = 'rgba(255, 255, 255, 0.3)';
        }
    });
}

function arraysEqual(a, b) {
    if (a.length !== b.length) return false;
    const sortedA = [...a].sort((x, y) => x - y);
    const sortedB = [...b].sort((x, y) => y - y);
    return sortedA.every((val, index) => val === sortedB[index]);
}

function selectAtom(index, reset = true) {

    const colorAttr = main.molecule.instancedMesh.geometry.getAttribute('color');

    // Only reset all colors if we're not in box selection mode
    if ((!isSelecting || !cmdDown) && reset) {
        for (let i = 0; i < colorAttr.count; i++) {
            const atom = main.molecule.atoms[i];
            const color = new THREE.Color(main.molecule.atomSettings[atom.type].color);
            colorAttr.setXYZ(i, color.r, color.g, color.b);
        }
    }

    // Highlight selected atom (yellow)
    colorAttr.setXYZ(index, 1, 1, 0);
    colorAttr.needsUpdate = true;
}


function unselectAtom(index = null) {
    const colorAttr = main.molecule.instancedMesh.geometry.getAttribute('color');

    if (index === null) {
        // Reset all atoms to their default color
        for (let i = 0; i < colorAttr.count; i++) {
            const atom = main.molecule.atoms[i];
            const color = new THREE.Color(main.molecule.atomSettings[atom.type].color);
            colorAttr.setXYZ(i, color.r, color.g, color.b);
        }
    } else {
        // Reset only the specified atom to its default color
        const atom = main.molecule.atoms[index];
        const color = new THREE.Color(main.molecule.atomSettings[atom.type].color);
        colorAttr.setXYZ(index, color.r, color.g, color.b);
    }
    colorAttr.needsUpdate = true;
}

function saveImage() {

    renderer.render(scene, camera);
    let imgData = renderer.domElement.toDataURL("image/png", 1.0);
    const link = document.createElement('a');
    link.setAttribute('href', imgData);
    link.setAttribute('target', '_blank');
    link.setAttribute('download', 'molecule.png');
    link.click();
}
function getScreenUrl() {

    const analysisPanel = document.getElementById('analysisResponseContainer');
    analysisPanel.querySelectorAll('p').forEach(p => p.remove());

    renderer.render(scene, camera);
    let imgData = renderer.domElement.toDataURL("image/png", 1.0);
    analysisPanel.classList.add('on');

    return imgData;
}
// Animation loop
function copyTextToClipboard(text) {
    if (!navigator.clipboard) {
        // fallback for older browsers
        const textArea = document.createElement("textarea");
        textArea.value = text;
        textArea.style.position = "fixed";  // prevent scrolling to bottom
        document.body.appendChild(textArea);
        textArea.focus();
        textArea.select();

        try {
            const successful = document.execCommand('copy');
        } catch (err) {
            console.error('Fallback: Copy error', err);
        }

        document.body.removeChild(textArea);
        return;
    }

    navigator.clipboard.writeText(text)
        .then(() => {
            console.log('Copy successful!');
        })
        .catch(err => {
            console.error('Copy error:', err);
        });
}
function rotateCamera(angleToRotate, camera, controls = null) {
    const pos = camera.position;
    const angle = angleToRotate;
    const newX = pos.x * Math.cos(angle) + pos.z * Math.sin(angle);
    const newZ = -pos.x * Math.sin(angle) + pos.z * Math.cos(angle);
    camera.position.set(newX, pos.y, newZ);
    camera.lookAt(0, 0, 0);
    if (controls) {
        controls.target.set(0, 0, 0);
        controls.update();
    }
}

// Add this to your index.html after the Firebase auth initialization

// Global variable to track authentication state
let isUserSignedIn = false;
let originalEventHandlers = {};

// Listen for auth state changes from Firebase (sent from HTML)
window.addEventListener('authStateChanged', (event) => {
    const { user, isSignedIn } = event.detail;
    updateFeatureAccess(user, isSignedIn);
});

// Function to update feature access based on authentication
function updateFeatureAccess(user, signedIn) {
    isUserSignedIn = signedIn;

    if (isUserSignedIn) {
        enableAllFeatures();
        hideRestrictionMessage();
    } else {
        restrictFeatures();
        showRestrictionMessage();
    }
}

// Function to restrict features for non-signed-in users
function restrictFeatures() {
    console.log('Restricting features for non-signed-in user');

    // Store original event handlers before removing them
    storeOriginalHandlers();

    // Disable editing functionality
    disableAtomInteraction();

    // Disable specific buttons with visual feedback
    const restrictedButtons = [
        'aiGenerate',
        'import-smiles',
        'import-json',
        'compareButton',
        'analyze-molecule',
        'clear-canvas',
        'switchMode'
    ];

    restrictedButtons.forEach(buttonId => {
        const button = document.getElementById(buttonId);
        if (button) {
            // Visual changes
            button.style.opacity = '0.5';
            button.style.cursor = 'not-allowed';
            button.title = 'Sign in to use this feature';
            button.classList.add('feature-tooltip');

            // Remove existing event listeners by cloning
            const newButton = button.cloneNode(true);
            button.parentNode.replaceChild(newButton, button);

            // Add restricted click handler - DON'T disable the button
            newButton.addEventListener('click', (e) => {
                e.preventDefault();
                e.stopPropagation();
                console.log('Restricted button clicked:', buttonId);
                showSignInPrompt();
            });
        }
    });

    // Hide editing panel
    const editPanel = document.getElementById('editMoleculePanel');
    if (editPanel) {
        editPanel.classList.add('restricted');
    }

    // Disable style controls
    const styleSelector = document.getElementById('styleSelector');
    if (styleSelector) {
        styleSelector.classList.add('restricted');
    }

    // Hide input panels
    const panels = ['chatContainer', 'smilesContainer', 'jsonContainer'];
    panels.forEach(panelId => {
        const panel = document.getElementById(panelId);
        if (panel) {
            panel.classList.remove('on');
            panel.classList.add('restricted');
        }
    });
}

// Function to store original event handlers
function storeOriginalHandlers() {
    // Store original pointer down handler
    if (renderer && renderer.domElement && renderer.domElement.onpointerdown) {
        originalEventHandlers.pointerdown = renderer.domElement.onpointerdown;
    }

    // Store other important handlers as needed
    originalEventHandlers.keydownHandlers = [];
}

// Function to disable atom interaction
function disableAtomInteraction() {
    // Override pointer events for atom selection
    if (renderer && renderer.domElement) {
        originalEventHandlers.pointerdown = renderer.domElement.onpointerdown;

        renderer.domElement.onpointerdown = function (event) {
            // Only show prompt if user actually clicked on an atom, not empty space
            if (!isUserSignedIn) {
                // Check if click hit an atom by using raycaster
                mouse.x = (event.clientX / window.innerWidth) * 2 - 1;
                mouse.y = -(event.clientY / window.innerHeight) * 2 + 1;

                raycaster.setFromCamera(mouse, camera);

                // Only show prompt if we actually hit something interactive
                if (main && main.molecule && main.molecule.instancedMesh) {
                    const intersects = raycaster.intersectObject(main.molecule.instancedMesh);
                    if (intersects.length > 0) {
                        // User clicked on an atom, show the sign-in prompt
                        showSignInPrompt();
                    }
                    // If no intersects, just allow normal camera controls (no prompt)
                }
                return;
            }

            // Call original if signed in
            if (originalEventHandlers.pointerdown) {
                originalEventHandlers.pointerdown.call(this, event);
            }
        };
    }

    // Override keyboard events for editing
    const restrictedKeyHandler = function (event) {
        if (!isUserSignedIn) {
            // Block editing keys silently - no prompts
            if (event.key === 'Shift' || event.key === 'Meta' || event.key === 'Control' ||
                event.key === 'j' || (event.key === 'l' && event.type === 'keydown')) {
                event.preventDefault();
                event.stopPropagation();
                return false;
            }
        }
    };

    document.addEventListener('keydown', restrictedKeyHandler, true);
    document.addEventListener('keyup', restrictedKeyHandler, true);
    originalEventHandlers.restrictedKeyHandler = restrictedKeyHandler;

    // Clear any existing atom selections
    if (typeof atomsSelected !== 'undefined') {
        atomsSelected = [];
    }

    // Disable editing mode
    if (typeof editingMolecule !== 'undefined') {
        editingMolecule = false;
    }
}

// Function to enable all features for signed-in users
function enableAllFeatures() {
    console.log('Enabling all features for signed-in user');

    // Remove restrictions from buttons
    const allButtons = document.querySelectorAll('.fancy-button');
    allButtons.forEach(button => {
        button.disabled = false;
        button.style.opacity = '1';
        button.style.cursor = 'pointer';
        button.title = '';
        button.classList.remove('feature-tooltip');
    });

    // Show editing panel
    const editPanel = document.getElementById('editMoleculePanel');
    if (editPanel) {
        editPanel.classList.remove('restricted');
        editPanel.style.display = 'block';
    }

    // Enable style controls
    const styleSelector = document.getElementById('styleSelector');
    if (styleSelector) {
        styleSelector.classList.remove('restricted');
    }

    // Enable input panels
    const panels = ['chatContainer', 'smilesContainer', 'jsonContainer'];
    panels.forEach(panelId => {
        const panel = document.getElementById(panelId);
        if (panel) {
            panel.classList.remove('restricted');
        }
    });

    // Restore atom interaction
    enableAtomInteraction();

    // Re-attach original event listeners
    restoreOriginalHandlers();
}

// Function to restore atom interaction
function enableAtomInteraction() {
    // Restore original pointer events
    if (renderer && renderer.domElement && originalEventHandlers.pointerdown) {
        renderer.domElement.onpointerdown = originalEventHandlers.pointerdown;
    }

    // Remove restricted key handlers
    if (originalEventHandlers.restrictedKeyHandler) {
        document.removeEventListener('keydown', originalEventHandlers.restrictedKeyHandler, true);
        document.removeEventListener('keyup', originalEventHandlers.restrictedKeyHandler, true);
    }

    // Re-enable editing mode
    if (typeof editingMolecule !== 'undefined') {
        editingMolecule = true;
    }
}

// Function to restore original event handlers
function restoreOriginalHandlers() {
    // Re-attach AI Generate button
    const aiGenerateButton = document.getElementById('aiGenerate');
    if (aiGenerateButton) {
        const newButton = aiGenerateButton.cloneNode(true);
        aiGenerateButton.parentNode.replaceChild(newButton, aiGenerateButton);

        newButton.addEventListener('click', () => {
            const aiGeneratePanel = document.getElementById('chatContainer');
            const smilesPanel = document.getElementById('smilesContainer');
            const jsonPanel = document.getElementById('jsonContainer');

            if (aiGeneratePanel) aiGeneratePanel.classList.toggle('on');
            if (smilesPanel) smilesPanel.classList.remove('on');
            if (jsonPanel) jsonPanel.classList.remove('on');
        });
    }

    // Re-attach SMILES button
    const smilesButton = document.getElementById('import-smiles');
    if (smilesButton) {
        const newButton = smilesButton.cloneNode(true);
        smilesButton.parentNode.replaceChild(newButton, smilesButton);

        newButton.addEventListener('click', () => {
            const smilesPanel = document.getElementById('smilesContainer');
            const aiGeneratePanel = document.getElementById('chatContainer');
            const jsonPanel = document.getElementById('jsonContainer');

            if (smilesPanel) smilesPanel.classList.toggle('on');
            if (aiGeneratePanel) aiGeneratePanel.classList.remove('on');
            if (jsonPanel) jsonPanel.classList.remove('on');
        });
    }

    // Re-attach JSON button
    const jsonButton = document.getElementById('import-json');
    if (jsonButton) {
        const newButton = jsonButton.cloneNode(true);
        jsonButton.parentNode.replaceChild(newButton, jsonButton);

        newButton.addEventListener('click', () => {
            const jsonPanel = document.getElementById('jsonContainer');
            const smilesPanel = document.getElementById('smilesContainer');
            const aiGeneratePanel = document.getElementById('chatContainer');

            if (jsonPanel) jsonPanel.classList.toggle('on');
            if (smilesPanel) smilesPanel.classList.remove('on');
            if (aiGeneratePanel) aiGeneratePanel.classList.remove('on');
        });
    }

    // Re-attach analyze molecule button
    const analyzeMoleculeButton = document.getElementById('analyze-molecule');
    if (analyzeMoleculeButton) {
        const newButton = analyzeMoleculeButton.cloneNode(true);
        analyzeMoleculeButton.parentNode.replaceChild(newButton, analyzeMoleculeButton);

        newButton.addEventListener('click', () => {
            const images = [];
            const numImages = 3;
            for (let i = 0; i < numImages; i++) {
                if (typeof getScreenUrl === 'function') {
                    const imgData = getScreenUrl();
                    images.push(imgData);
                }
                if (typeof rotateCamera === 'function' && typeof camera !== 'undefined' && typeof controls !== 'undefined') {
                    rotateCamera(Math.PI / (numImages / 2), camera, controls);
                }
            }
            if (typeof main !== 'undefined' && main.data) {
                window.imgToAnalyze = { images: JSON.stringify(images), coordinates: main.data };
            }
        });
    }

    // Re-attach clear canvas button
    const clearSceneButton = document.getElementById('clear-canvas');
    if (clearSceneButton) {
        const newButton = clearSceneButton.cloneNode(true);
        clearSceneButton.parentNode.replaceChild(newButton, clearSceneButton);

        newButton.addEventListener('click', () => {
            if (typeof main !== 'undefined' && typeof main.reset === 'function') {
                main.reset();
            }
        });
    }

    // Re-attach switch mode button
    const switchModeButton = document.getElementById('switchMode');
    if (switchModeButton) {
        const newButton = switchModeButton.cloneNode(true);
        switchModeButton.parentNode.replaceChild(newButton, switchModeButton);

        newButton.addEventListener('click', () => {
            const styleSelector = document.getElementById('styleSelector');
            if (styleSelector) {
                styleSelector.classList.toggle('on');
            }
        });
    }
}

// Function to show sign-in prompt
function showSignInPrompt() {
    const message = '';

    // Create a nicer modal instead of alert
    let modal = document.getElementById('signInModal');
    if (!modal) {
        modal = document.createElement('div');
        modal.id = 'signInModal';
        modal.style.cssText = `
            position: fixed;
            top: 0;
            left: 0;
            width: 100%;
            height: 100%;
            background: rgba(0, 0, 0, 0.7);
            display: flex;
            justify-content: center;
            align-items: center;
            z-index: 20000;
            backdrop-filter: blur(5px);
        `;

        const modalContent = document.createElement('div');
        modalContent.style.cssText = `
            background: white;
            padding: 30px;
            border-radius: 15px;
            text-align: center;
            max-width: 400px;
            box-shadow: 0 20px 40px rgba(0,0,0,0.3);
        `;

        modalContent.innerHTML = `
            <h3 style="color: #333; margin-bottom: 15px;"><span style="font-size: 35px;">🔒</span><br> Sign in with Google to unlock this feature!</h3>
            <p style="color: #666; margin-bottom: 25px;">${message}</p>
            <button id="modalSignIn" style="
                background: linear-gradient(135deg,rgb(102, 130, 255) 0%,rgb(124, 39, 208) 100%);

                color: white;
                border: none;
                padding: 12px 24px;
                border-radius: 8px;
                cursor: pointer;
                margin-right: 10px;
                font-weight: 600;
            ">Sign In with Google</button>
            <button id="modalCancel" class="shake-button" style="
                background: #f0f0f0;
                color:rgb(255, 141, 141);
                border: none;
                padding: 12px 24px;
                border-radius: 8px;
                cursor: pointer;
                font-weight: 600;
            ">Maybe Later</button>
        `;


        modal.appendChild(modalContent);
        document.body.appendChild(modal);

        // Handle modal buttons
        document.getElementById('modalSignIn').addEventListener('click', () => {
            const signInButton = document.getElementById('signInButton');
            if (signInButton) {
                signInButton.click();
            }
            modal.remove();
        });

        document.getElementById('modalCancel').addEventListener('click', () => {
            modal.remove();
        });

        // Close on background click
        modal.addEventListener('click', (e) => {
            if (e.target === modal) {
                modal.remove();
            }
        });
    }
}

// Function to show restriction message
function showRestrictionMessage() {
    let restrictionMessage = document.getElementById('restrictionMessage');
    if (!restrictionMessage) {
        restrictionMessage = document.createElement('div');
        restrictionMessage.id = 'restrictionMessage';
        restrictionMessage.style.cssText = `
            position: fixed;
            top: 20px;
            left: 50%;
            transform: translateX(-50%);
            background: linear-gradient(135deg, #667eea 0%, #764ba2 100%);
            color: white;
            padding: 12px 20px;
            border-radius: 10px;
            z-index: 10000;
            font-family: 'Rubik', sans-serif;
            font-size: 14px;
            box-shadow: 0 4px 15px rgba(0,0,0,0.2);
            text-align: center;
            animation: slideInFromTop 0.5s ease-out;
            display: flex;
            align-items: center;
            gap: 15px;
        `;
        document.body.appendChild(restrictionMessage);
    }

    restrictionMessage.innerHTML = `
        <div style="display: flex; align-items: center; gap: 8px;">
            <i class="fas fa-eye"></i>
            <span><strong>View Mode:</strong> Sign in to unlock editing, AI generation, and analysis features</span>
        </div>
        <button id="dismissBanner" class="dismiss" title="Dismiss">×</button>
    `;
    restrictionMessage.style.display = 'flex';

    // Add dismiss functionality
    const dismissButton = document.getElementById('dismissBanner');
    if (dismissButton) {
        dismissButton.addEventListener('click', () => {
            restrictionMessage.style.animation = 'slideOutToTop 0.3s ease-in forwards';
            setTimeout(() => {
                if (restrictionMessage.parentNode) {
                    restrictionMessage.remove();
                }
            }, 300);
        });

        // Hover effect for dismiss button
        dismissButton.addEventListener('mouseenter', () => {
            dismissButton.style.background = 'rgba(255, 255, 255, 0.3)';
        });

        dismissButton.addEventListener('mouseleave', () => {
            dismissButton.style.background = 'rgba(255, 255, 255, 0.2)';
        });
    }

    // Auto-dismiss after 8 seconds
    setTimeout(() => {
        if (restrictionMessage && restrictionMessage.parentNode && !isUserSignedIn) {
            restrictionMessage.style.animation = 'slideOutToTop 0.3s ease-in forwards';
            setTimeout(() => {
                if (restrictionMessage.parentNode) {
                    restrictionMessage.remove();
                }
            }, 300);
        }
    }, 8000);

    // Enhance sign-in button
    const signInButton = document.getElementById('signInButton');
    if (signInButton) {
        signInButton.classList.add('featured');
    }
}

// Function to hide restriction message
function hideRestrictionMessage() {
    const restrictionMessage = document.getElementById('restrictionMessage');
    if (restrictionMessage) {
        restrictionMessage.style.display = 'none';
    }

    // Remove enhancement from sign-in button
    const signInButton = document.getElementById('signInButton');
    if (signInButton) {
        signInButton.classList.remove('featured');
    }
}

// Initialize with restrictions (will be overridden when auth state is determined)
document.addEventListener('DOMContentLoaded', () => {
    // Start with restricted access
    restrictFeatures();
});

// Function to save style preferences to Firestore
async function saveStylePreferences(userId) {
    if (!window.firebaseDB || !userId) {
        console.error('Firebase DB not initialized or no user ID');
        return false;
    }

    try {
        const stylePrefs = {
            roughness: parseFloat(document.getElementById('style1').value),
            metalness: parseFloat(document.getElementById('style2').value),
            opacity: parseFloat(document.getElementById('style3').value),
            bonds: parseFloat(document.getElementById('style4').value) || 1, // Default if no value
            atomSize: parseFloat(document.getElementById('style5').value),
            resolution: parseInt(document.getElementById('style6').value),
            antialias: document.getElementById('style7').checked,
            backgroundColor: document.getElementById('style8').value,
            toggleStyleChanges: document.getElementById('toggleStyleChanges').checked,
            toggleLabels: document.getElementById('toggleLabels').checked,
            lastUpdated: new Date().toISOString()
        };

        console.log('Saving preferences:', stylePrefs);

        const { doc, setDoc } = await import('https://www.gstatic.com/firebasejs/12.0.0/firebase-firestore.js');
        await setDoc(doc(window.firebaseDB, 'userPreferences', userId), {
            stylePreferences: stylePrefs
        }, { merge: true });

        // Show success feedback
        showNotification('Style preferences saved as default!', 'success');
        return true;
    } catch (error) {
        console.error('Error saving style preferences:', error);
        showNotification('Failed to save preferences', 'error');
        return false;
    }
}

// Function to load style preferences from Firestore
async function loadStylePreferences(userId) {
    if (!window.firebaseDB || !userId) {
        console.error('Firebase DB not initialized or no user ID');
        return null;
    }

    try {
        const { doc, getDoc } = await import('https://www.gstatic.com/firebasejs/12.0.0/firebase-firestore.js');
        const docRef = doc(window.firebaseDB, 'userPreferences', userId);
        const docSnap = await getDoc(docRef);

        if (docSnap.exists()) {
            const data = docSnap.data();
            if (data.stylePreferences) {
                console.log('Loading preferences:', data.stylePreferences);
                applyStylePreferences(data.stylePreferences);
                showNotification('Default styles loaded!', 'info');
                return data.stylePreferences;
            }
        }
        console.log('No saved preferences found for user');
        return null;
    } catch (error) {
        console.error('Error loading style preferences:', error);
        return null;
    }
}

// Function to apply loaded style preferences
function applyStylePreferences(prefs) {
    // Apply roughness
    if (prefs.roughness !== undefined) {
        document.getElementById('style1').value = prefs.roughness;
        main.roughness = prefs.roughness;
    }

    // Apply metalness
    if (prefs.metalness !== undefined) {
        document.getElementById('style2').value = prefs.metalness;
        main.metalness = prefs.metalness;
    }

    // Apply opacity
    if (prefs.opacity !== undefined) {
        document.getElementById('style3').value = prefs.opacity;
        main.opacity = prefs.opacity;
    }

    // Apply bonds
    if (prefs.bonds !== undefined) {
        document.getElementById('style4').value = prefs.bonds;
        // Note: You may need to add main.bonds or similar variable
    }

    // Apply atom size
    if (prefs.atomSize !== undefined) {
        document.getElementById('style5').value = prefs.atomSize;
        main.atomSize = prefs.atomSize;
    }

    // Apply resolution
    if (prefs.resolution !== undefined) {
        document.getElementById('style6').value = prefs.resolution;
        main.resolution = prefs.resolution;
    }

    // Apply antialias
    if (prefs.antialias !== undefined) {
        document.getElementById('style7').checked = prefs.antialias;
        antialiasToggled = prefs.antialias;

        // If antialias setting changed, recreate renderer
        if (renderer.antialias !== prefs.antialias) {
            recreateRenderer(prefs.antialias);
        }
    }

    // Apply background color
    if (prefs.backgroundColor !== undefined && prefs.backgroundColor !== '#ff0000') {
        document.getElementById('style8').value = prefs.backgroundColor;
        const color = prefs.backgroundColor;
        scene.background = new THREE.Color(color);
        document.body.style.backgroundColor = color;
    }

    // Apply toggle style changes
    if (prefs.toggleStyleChanges !== undefined) {
        document.getElementById('toggleStyleChanges').checked = prefs.toggleStyleChanges;
        // Trigger the toggle event if needed
        if (prefs.toggleStyleChanges && mode === 0) {
            document.getElementById('toggleStyleChanges').dispatchEvent(new Event('change'));
        }
    }

    // Apply toggle labels
    if (prefs.toggleLabels !== undefined) {
        document.getElementById('toggleLabels').checked = prefs.toggleLabels;
        labelMode = prefs.toggleLabels;
        if (main && main.molecule) {
            main.molecule.toggleLabels(labelMode);
        }
    }

    // Update the visualization if a molecule is loaded
    if (main && main.molecule && mode !== 0) {
        updateStyles();
    }

    render();
}

// Function to recreate renderer with new antialias setting
function recreateRenderer(antialiasEnabled) {
    // Store current renderer size
    const width = renderer.domElement.width;
    const height = renderer.domElement.height;

    // Remove old renderer
    document.body.removeChild(renderer.domElement);

    // Create new renderer with updated antialias
    renderer = new THREE.WebGLRenderer({
        antialias: antialiasEnabled,
        powerPreference: "high-performance"
    });
    renderer.setSize(window.innerWidth, window.innerHeight);
    renderer.setPixelRatio(window.devicePixelRatio);
    document.body.appendChild(renderer.domElement);

    // Recreate controls
    controls = new TrackballControls(camera, renderer.domElement);
    controls.rotateSpeed = 5.0;
    controls.zoomSpeed = 2.0;
    controls.panSpeed = 1.0;
    controls.dynamicDampingFactor = 1.0;

    // IMPORTANT: Re-attach the controls change event listener
    controls.addEventListener('change', () => {
        render();
    });

    // IMPORTANT: Re-attach the pointer down event for atom selection
    renderer.domElement.addEventListener('pointerdown', onPointerDown, false);

    render();
}

// Function to show notification
function showNotification(message, type) {
    // Remove existing notification if any
    const existingNotif = document.getElementById('styleNotification');
    if (existingNotif) {
        existingNotif.remove();
    }

    const notification = document.createElement('div');
    notification.id = 'styleNotification';
    notification.textContent = message;
    notification.style.cssText = `
        position: fixed;
        bottom: 20px;
        right: 20px;
        padding: 15px 25px;
        border-radius: 8px;
        color: white;
        font-weight: 600;
        z-index: 10000;
        animation: slideIn 0.3s ease-out;
        ${type === 'success' ? 'background: linear-gradient(135deg, #00c851 0%, #00ff00 100%);' : ''}
        ${type === 'error' ? 'background: linear-gradient(135deg, #ff4444 0%, #cc0000 100%);' : ''}
        ${type === 'info' ? 'background: linear-gradient(135deg, #33b5e5 0%, #0099cc 100%);' : ''}
    `;

    document.body.appendChild(notification);

    // Auto remove after 3 seconds
    setTimeout(() => {
        notification.style.animation = 'slideOut 0.3s ease-out';
        setTimeout(() => notification.remove(), 300);
    }, 3000);
}

// Add this after other event listeners in main.js
const makeDefaultButton = document.getElementById('makeDefaultButton');
if (makeDefaultButton) {
    makeDefaultButton.addEventListener('click', async () => {
        // Get current user from Firebase Auth
        const { getAuth } = await import('https://www.gstatic.com/firebasejs/12.0.0/firebase-auth.js');
        const auth = getAuth();
        const user = auth.currentUser;

        if (user) {
            makeDefaultButton.disabled = true;
            makeDefaultButton.innerHTML = ' Saving...';

            const success = await saveStylePreferences(user.uid);

            setTimeout(() => {
                makeDefaultButton.disabled = false;
                makeDefaultButton.innerHTML = ' Make Default';
            }, 1000);
        } else {
            showNotification('Please sign in to save preferences', 'error');
        }
    });
}

// Make functions available globally
window.loadStylePreferences = loadStylePreferences;
window.saveStylePreferences = saveStylePreferences;

// Function to reset to default values
function resetToDefaults() {
    // Reset sliders to default values
    document.getElementById('style1').value = 0.17; // Roughness
    document.getElementById('style2').value = 0.3;  // Metalness
    document.getElementById('style3').value = 1;    // Opacity
    document.getElementById('style4').value = 1;    // Bonds
    document.getElementById('style5').value = 1;    // Atom Size
    document.getElementById('style6').value = 16;   // Resolution
    document.getElementById('style7').checked = false; // Antialias
    document.getElementById('style8').value = '#000000'; // Background (black, not red)
    document.getElementById('toggleStyleChanges').checked = false;
    document.getElementById('toggleLabels').checked = false;

    // Reset main object values
    main.roughness = 0.17;
    main.metalness = 0.3;
    main.opacity = 1;
    main.atomSize = 1;
    main.resolution = 16;

    // Reset background
    scene.background = new THREE.Color('#000000');
    document.body.style.backgroundColor = '#000000';

    // Reset other states
    antialiasToggled = false;
    labelMode = false;

    render();
}

const resetToDefaultsButton = document.getElementById('resetToDefaultButton');
if (resetToDefaultsButton) {
    resetToDefaultsButton.addEventListener('click', function () {
        resetToDefaults();
        updateStyles();
        render();
    });

}

// Make it globally available
window.resetToDefaults = resetToDefaults;
// Also listen for when the main object is ready
if (typeof main !== 'undefined') {
    restrictFeatures();
}
function createRenderer(antialiasOn) {
    if (renderer) {
        // Remove old canvas
        renderer.domElement.remove();
        renderer.dispose();
    }

    renderer = new THREE.WebGLRenderer({ antialias: antialiasOn, powerPreference: "high-performance" });
    renderer.setSize(window.innerWidth, window.innerHeight);
    renderer.setPixelRatio(window.devicePixelRatio);

    document.body.appendChild(renderer.domElement);
    return renderer
}

function animate() {
    requestAnimationFrame(animate);
    controls.update();
}
function render() {
    renderer.render(scene, camera);

}
render();
controls.addEventListener('change', () => {
    render();
});

animate();