import * as THREE from 'three';
import { OrbitControls } from 'jsm/controls/OrbitControls.js';
import { TrackballControls } from 'jsm/controls/TrackballControls.js';
import Molecule from './atom/molecule.js';
import FileHandler from './utils/fileHandler.js';
// WE WILL NOW TRY TO MAKE THIS AMAZING WEBSITE AN APP. IT MAY GO AMAZINGLY OR IT MAY GO HORRIBLY.
// It went well!!!!!!!!!!!!!!!!!!!!!!!!!!!!!!!!!!!!!!!!!!!!!!!!!!!!!!!!!!!!!!!!!!!!!!!!!!!!!!!!!!!!!!!
// Please refer the the README.md file for more information

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
    antialiasToggled = !antialiasToggled;
    renderer = createRenderer(antialiasToggled);
    document.body.appendChild(renderer.domElement);
    controls = new TrackballControls(camera, renderer.domElement);
    controls.addEventListener('change', () => {
        render();
    });
    controls.rotateSpeed = 5.0;
    controls.zoomSpeed = 2.0;
    controls.panSpeed = 1.0;
    controls.dynamicDampingFactor = 1.0; // No drag smoothing
    render();
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
        editMoleculePanel.classList.add('on');
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
                editMoleculePanel.classList.add('on');
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
                    editMoleculePanel.classList.add('on');
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

            // Determine which atoms will be rotated
            let atomsToRotate = [];
            if (atomsSelected.length > 0 && atomsSelected.length < main.molecule.atoms.length) {
                atomsToRotate = atomsSelected;
            } else {
                atomsToRotate = Array.from({ length: main.molecule.atoms.length }, (_, i) => i);
            }

            // Store CURRENT positions as original (not from some previous state)
            atomsToRotate.forEach(idx => {
                const atom = main.molecule.atoms[idx];
                originalPositions[idx] = atom.position.clone();
            });

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

            rotationSlider.value = 0;
            rotationValue.textContent = '0°';
            isSliderActive = false;

            // Reset atoms to original positions
            Object.keys(originalPositions).forEach(idx => {
                const atom = main.molecule.atoms[parseInt(idx)];
                if (originalPositions[idx]) {
                    atom.position.copy(originalPositions[idx]);
                    atom.x = atom.position.x;
                    atom.y = atom.position.y;
                    atom.z = atom.position.z;

                    // Update instanced mesh
                    updateAtomMatrix(parseInt(idx));
                }
            });

            main.molecule.instancedMesh.instanceMatrix.needsUpdate = true;
            main.molecule.updateBonds(mode);
            main.molecule.updateMainCoordinates();
            render();

            originalPositions = {};
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