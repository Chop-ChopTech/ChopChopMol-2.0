import * as THREE from 'three';
import { OrbitControls } from 'jsm/controls/OrbitControls.js';
import { TrackballControls } from 'jsm/controls/TrackballControls.js';
import { ArcballControls } from 'jsm/controls/ArcballControls.js';

import Molecule from './atom/molecule.js';
import FileHandler from './utils/fileHandler.js';
import {
    hideRestrictionMessage,
    showRestrictionMessage,
    showSignInPrompt,
    restoreOriginalHandlers,
    enableAtomInteraction,
    enableAllFeatures,
    disableAtomInteraction,
    storeOriginalHandlers,
    restrictFeatures,
    updateFeatureAccess,
    originalEventHandlers,
    isUserSignedIn

} from './handleFeatures.js';

import {
    saveStylePreferences,
    loadStylePreferences,
    applyStylePreferences,
    showNotification,
    resetToDefaults,

} from './handleStyles.js';

const scene = new THREE.Scene();
const camera = new THREE.PerspectiveCamera(70, window.innerWidth / window.innerHeight, 0.1, 1000000);

let renderer = new THREE.WebGLRenderer({
    antialias: false,
    powerPreference: "high-performance",
    alpha: true,
    preserveDrawingBuffer: true
}); renderer.setSize(window.innerWidth, window.innerHeight);
renderer.setPixelRatio(window.devicePixelRatio);
document.body.appendChild(renderer.domElement);

let controls = new ArcballControls(camera, renderer.domElement);

controls.rotateSpeed = 5.0;
controls.zoomSpeed = 2.0;
controls.panSpeed = 1.0;
controls.dynamicDampingFactor = 1.0; // No drag smoothing
controls.cursorZoom = true;

let shiftDown = false;
let cmdDown = false;
let ribbonMode = false;
let ribbonGroup = null;
let atomsSelected = [];
let fragments = [];
let fragmentsSelected = [];
let hoveredAtom = null;
let bondLengthLabels = []; // Store bond length label objects
let contextMenuOpen = false;
let arrowKeyRotationStep = 0.1; // degrees per arrow key press
let arrowKeyTranslationStep = 0.1; // units per arrow key press
let currentRotationAngle = 0; // Track the current rotation angle globally
let baseAtomPositions = {}; // The TRUE original positions before ANY rotation
let rotationBasePositions = {}; // Original positions before any rotation
let rotationState = {
    basePositions: {},           // Original positions before any transformation
    currentAngle: 0,             // Current rotation angle in degrees
    isActive: false,              // Whether rotation is currently active
    axis: null,                   // Current rotation axis {point: Vector3, direction: Vector3}
    selectedAtoms: []             // Indices of atoms to rotate
};
let orthoCamera = null;
let useOrthographic = false;

window.fragments = fragments;
let editingMolecule = true;


const light = new THREE.DirectionalLight(0xffffff, 3);
const ambientLight = new THREE.AmbientLight(0xffffff, 2);
const raycaster = new THREE.Raycaster();
const mouse = new THREE.Vector2();



scene.add(light);
scene.add(ambientLight);
camera.position.z = 15;
let mode = 0;
let antialiasToggled = false
let labelMode = false; // Track label mode

const switchModeButton = document.getElementById('switchMode');
const toggleLabelsButton = document.getElementById('toggleLabels');
const saveImageButton = document.getElementById('captureScreen');
const analyzeMoleculeButton = document.getElementById('analyze-molecule');
const editMoleculePanel = document.getElementById('editMoleculePanel');
const editMoleculeButton = document.getElementById('editMolecule');
const editMoleculeContent = document.getElementById('editMoleculeContent');
const closeStyleSelectorButton = document.getElementById('closeStyleSelector');
const initialCameraPosition = new THREE.Vector3(0, 0, 15);
const initialCameraTarget = new THREE.Vector3(0, 0, 0);

let dragging = false;
let dragPlane = new THREE.Plane();
let dragOffsets = {};
let isSelecting = false;
let selectionStart = { x: 0, y: 0 };
let selectionEnd = { x: 0, y: 0 };
let rotationAxis = null; // Store the defined axis
let axisAtoms = []; // Store the two atoms that define the axis
let axisVisualizer = null; // Three.js object to visualize the axis
let labels = [];
let premiumActive = false
const selectionBox = document.getElementById('selectionBox');
const projectionVector = new THREE.Vector3();
let isolationHistory = [];
let currentIsolationIndex = -1;
let originalMoleculeData = null;
let originalFragments = [];
let isInIsolationMode = false;
let globalFragmentStore = {
    originalAtomCount: 0,
    fragments: [],  // Array of fragments, each is an array of original atom indices
    fragmentIdMap: new Map() // Maps fragment signatures to avoid duplicates
};
const fragmentColors = [
    0x0352ff,
    0xf5b638,
    0x7af538,
    0xd75eff,
    0x5eb9ff,
    0x00ffff,
    0x715eff,
    0xf7baff,
    0xff6b6b,
    0x4ecdc4,
    0xffe66d,
    0x95e1d3,
    0xf38181,
    0xaa96da,
    0xfcbad3,
    0xa8d8ea
];

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
        this.bondThickness = 0.15;
        this.opacity = 1;
        this.atomSize = 1;
        this.resolution = 16
        this.labelsToggled = false;
        initializeSelectionBox();


    }
    init(data, mode) {
        this.molecule.init(data, mode, true, false);
        render()
        console.log(this.data);
    }
    reset(soft = false) {
        // Clear atoms and bonds
        this.atoms = [];
        this.bonds = [];

        if (this.instancedMesh) {
            this.main.scene.remove(this.instancedMesh);

            if (this.instancedMesh.geometry) {
                this.instancedMesh.geometry.dispose();
            }

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

        // Clear ribbon
        if (ribbonGroup) {
            import('./utils/ribbon.js').then(module => {
                module.removeRibbon(ribbonGroup, scene);
                ribbonGroup = null;
            });
        }

        this.labels = [];

        atomsSelected = [];
        hoveredAtom = null;

        if (!soft) {
            rotationAxis = null;
            axisAtoms = [];
            if (axisVisualizer) {
                this.scene.remove(axisVisualizer);
                axisVisualizer.geometry.dispose();
                axisVisualizer.material.dispose();
                axisVisualizer = null;
            }
            fragments = [];
            labels = [];
            clearAllBondLengthLabels();
            fragmentsSelected = [];
        }
        this.molecule.reset();

        clearScene(this.scene);

        // When soft reset, re-add existing bondLengthLabel lines to scene (but not axis)
        if (soft && bondLengthLabels.length > 0) {
            bondLengthLabels.forEach(labelInfo => {
                if (labelInfo.line) {
                    this.scene.add(labelInfo.line);
                }
            });
        } else {
            labels.forEach(label => {
                createInfoLabel(label[0], label[1], label[2] ?? null, label[3] ?? null);
            });
        }
        updateFragmentList(document.getElementById('fragmentList'));
        render();
    }
    newMolecule(data, mode, center = true, soft = false, useRibbonMode = false) {
        this.reset(soft);
        this.molecule.init(data, mode, center, useRibbonMode);

        // If ribbon mode, create ribbon instead of showing atoms
        if (useRibbonMode && data.ribbonData) {
            import('./utils/ribbon.js').then(module => {
                ribbonGroup = module.createRibbon(
                    data.ribbonData,
                    scene,
                    this.molecule.stretch,
                    this.molecule.offset
                );
                render();
            });
            ribbonMode = true;
            disableAtomInteractions();
        } else {
            // Normal mode - ensure interactions are enabled
            ribbonMode = false;
            console.log("numAtoms", this.molecule.atoms.length);
            enableAtomInteractions();
        }

        this.molecule.updateBonds(this.mode);

        // Labels only work in normal mode
        if (!useRibbonMode && labelMode && this.molecule.atoms && this.molecule.atoms.length > 0) {
            this.toggleLabels(true);
        }

        render();
        window.endMeasurement = performance.now();
        const loadTimeMs = window.endMeasurement - window.startMeasurement;
        const loadTimeSec = loadTimeMs / 1000;
        console.log(`Load time: ${loadTimeSec} s`);

        window.startMeasurement = null;
        window.endMeasurement = null;
        this.data = data;
    }
    toggleLabels(override = null) {
        labelMode = override ?? !labelMode;
        if (this.molecule && this.molecule.atoms && this.molecule.atoms.length > 0) {
            this.molecule.toggleLabels(labelMode, window.labelIndexMode);
        }
        render();
    }
    setNewMode(style = false) {
        if (style) {
            this.mode = { roughness: main.roughness, metalness: main.metalness, bondThickness: main.bondThickness, opacity: main.opacity, atomSize: main.atomSize, resolution: main.resolution, antialias: antialiasToggled, labels: main.labelsToggled };
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
        camera.position.set(center.x, center.y, center.z + distance * 1.5);
        camera.lookAt(center);
        if (controls) {
            controls.target.copy(center);
            controls.update();
        }
        render();
    }
}

const main = new Main();
window.main = main;


const fileInput = document.getElementById("fileInput")

document.addEventListener('keydown', (event) => {
    if (event.metaKey && event.key.toLowerCase() === 'o') {
        event.preventDefault();
        fileInput.click();
    }
});

// In main.js, replace the fileInput event listener:

fileInput.addEventListener("change", (e) => {
    console.log(e)
    main.loader.handleFile(e, false);
}, false);

window.addEventListener('blur', () => {
    cmdDown = false;
    shiftDown = false;
    controls.enabled = true;
});
window.addEventListener('focus', () => {
    cmdDown = false;
    shiftDown = false;
});

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
const toggleOrthoCamera = document.getElementById('toggleOrtho');
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
bondsSelector.addEventListener('input', () => {
    main.bondThickness = bondsSelector.value;
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
    const previousSelection = [...atomsSelected];

    mode = main.setNewMode(true);

    main.newMolecule(main.data,
        main.mode,
        true,
        true,
        false
    );

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
    main.newMolecule(
        main.data,
        main.mode,
        true,
        true,
        false
    );

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
        saveImage();
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

switchModeButton.addEventListener('click', (e) => {
    e.stopPropagation();
    styleSelector.classList.remove('on');
});

// closeStyleSelectorButton.addEventListener('click', () => {
//     styleSelector.classList.add('on');
// });

toggleLabelsButton.addEventListener('change', () => {
    main.toggleLabels(toggleLabelsButton.checked);
    render();
});

window.addEventListener('replyUpdated', (event) => {
    const newReply = event.detail;
    console.log(newReply);
    main.newMolecule(JSON.stringify(newReply), main.mode);

});

renderer.domElement.addEventListener('pointerdown', enhancedOnPointerDown, false);
renderer.domElement.addEventListener('contextmenu', (event) => {
    event.preventDefault();
    return false;
});

function worldToScreen(worldPos, camera) {
    const vector = new THREE.Vector3();
    vector.copy(worldPos);
    vector.project(camera);

    // Use renderer dimensions and account for canvas offset
    const canvas = renderer.domElement;
    const canvasRect = canvas.getBoundingClientRect();

    const x = (vector.x * 0.5 + 0.5) * canvasRect.width + canvasRect.left;
    const y = (vector.y * -0.5 + 0.5) * canvasRect.height + canvasRect.top;

    return { x, y };
}

function getAtomWorldPosition(atomIndex, instancedMesh) {
    if (!instancedMesh) return new THREE.Vector3();
    const matrix = new THREE.Matrix4();
    const position = new THREE.Vector3();
    instancedMesh.getMatrixAt(atomIndex, matrix);
    position.setFromMatrixPosition(matrix);
    position.applyMatrix4(instancedMesh.matrixWorld);
    return position;
}

function getAtomRadius(atomIndex, molecule) {
    if (!molecule || !molecule.instancedMesh) return 1;
    const matrix = new THREE.Matrix4();
    const scale = new THREE.Vector3();

    molecule.instancedMesh.getMatrixAt(atomIndex, matrix);
    scale.setFromMatrixScale(matrix);
    return scale.x;
}

function getActiveCamera() {
    return useOrthographic ? orthoCamera : camera;
}

function saveAsXYZ() {
    if (!main.data || !main.data.atomData || main.data.atomData.length === 0) {
        alert('No molecule loaded to save!');
        return;
    }
    let xyzContent = '';
    xyzContent += main.data.numAtoms + '\n';

    const timestamp = new Date().toISOString().replace(/[:.]/g, '-');
    xyzContent += `Generated by ChopChopMol 2.0 - ${timestamp}\n`;

    // Atom lines: element x y z
    main.data.atomData.forEach(atom => {
        const element = atom.element.padEnd(4); // Pad element symbol to 4 characters
        const x = atom.x.toFixed(6).padStart(12);
        const y = atom.y.toFixed(6).padStart(12);
        const z = atom.z.toFixed(6).padStart(12);

        xyzContent += `${element}${x}${y}${z}\n`;
    });

    const blob = new Blob([xyzContent], { type: 'text/plain' });
    const url = URL.createObjectURL(blob);

    const link = document.createElement('a');
    link.href = url;
    link.download = `molecule_${timestamp}.xyz`;

    document.body.appendChild(link);
    link.click();

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
    if (!instancedMesh || !atoms || atoms.length === 0) return [];
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
    if (!instancedMesh || !atoms || atoms.length === 0) return;

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

function generateDataFromAtoms(atomIndexes) {
    const data = {}
    const cooordinates = []
    atomIndexes.forEach(idx => {
        const pos = main.molecule.atoms[idx].position
        const atom = main.molecule.atoms[idx];
        cooordinates.push({
            element: atom.type,
            x: pos.x / 4,
            y: pos.y / 4,
            z: pos.z / 4,
            originalIndex: atom.originalIndex  // JUST ADD THIS LINE
        })
    })
    data.atomData = cooordinates
    data.numAtoms = atomIndexes.length
    return data
}
function combineMultipleFragments(fragments) {
    return fragments.reduce((combined, fragment) => {
        return {
            atomData: [...combined.atomData, ...fragment.atomData],
            numAtoms: combined.numAtoms + fragment.numAtoms
        };
    }, { atomData: [], numAtoms: 0 });
}


// Check if atom is in selection box
function isAtomInSelection(atomIndex, camera) {
    if (!main.molecule || !main.molecule.atoms || !main.molecule.atoms[atomIndex] || !main.molecule.instancedMesh) {
        return false;
    }

    // Get the actual world position from the instanced mesh
    const worldPos = getAtomWorldPosition(atomIndex, main.molecule.instancedMesh);
    const screenPos = worldToScreen(worldPos, getActiveCamera());

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
function updateAtomSelection() {
    if (!main.molecule || !main.molecule.atoms || !main.molecule.instancedMesh) return;

    // Find atoms currently in selection box
    const atomsInBox = [];
    for (let i = 0; i < main.molecule.atoms.length; i++) {
        if (isAtomInSelection(i, getActiveCamera())) {
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
    if (isSelecting && cmdDown) {  // Check cmdDown to ensure we're still in selection mode
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

        // Remove the selection-specific event listeners
        window.removeEventListener('pointermove', onSelectionMove, false);
        window.removeEventListener('pointerup', onSelectionUp, false);

        // Finalize the box selection - add atoms in box to selection
        if (main.molecule && main.molecule.atoms) {
            const newlySelected = [];
            for (let i = 0; i < main.molecule.atoms.length; i++) {
                if (isAtomInSelection(i, getActiveCamera())) {
                    if (!atomsSelected.includes(i)) {
                        newlySelected.push(i);
                        atomsSelected.push(i);
                    }
                }
            }

            // Refresh the highlighting for the final selection
            if (newlySelected.length > 0) {
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
                }
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

function onPointerDown(event) {
    if (ribbonMode) return;
    if (editingMolecule) {
        if (isUserSignedIn) {
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

                raycaster.setFromCamera(mouse, getActiveCamera());

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
                            fragments.forEach((fragment, fragIdx) => {
                                // Check if atomsSelected matches this fragment exactly
                                if (fragment.length === atomsSelected.length &&
                                    fragment.every(atom => atomsSelected.includes(atom))) {
                                    // This selection matches a fragment - add to fragmentsSelected if not there
                                    if (!fragmentsSelected.includes(fragIdx)) {
                                        fragmentsSelected.push(fragIdx);
                                    }
                                }
                            });
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

                        // Add the selection event listeners
                        window.addEventListener('pointermove', onSelectionMove, false);
                        window.addEventListener('pointerup', onSelectionUp, false);
                    } else {
                        // Normal click on empty space: clear atom selection but keep fragments selected
                        // Don't clear fragmentsSelected - fragments stay selected
                        // Only clear atomsSelected if no fragments are selected
                        if (fragmentsSelected.length === 0) {
                            atomsSelected = [];
                            unselectAtom();
                        }
                        // If fragments are selected, keep their atoms selected
                        else {
                            atomsSelected = [];
                            fragmentsSelected.forEach(fragIdx => {
                                if (fragIdx < fragments.length) {
                                    atomsSelected.push(...fragments[fragIdx]);
                                }
                            });
                            // Re-highlight the fragment atoms
                            selectFragment([], -1); // Call with empty to just update highlighting
                        }
                        render();
                    }
                }
            }
        }
    }
}



function onPointerMove(event) {
    if (ribbonMode) return;
    if (!dragging) return;

    // Convert mouse to normalized device coordinates
    const rect = renderer.domElement.getBoundingClientRect();
    mouse.x = ((event.clientX - rect.left) / rect.width) * 2 - 1;
    mouse.y = -((event.clientY - rect.top) / rect.height) * 2 + 1;

    raycaster.setFromCamera(mouse, getActiveCamera());
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
        main.molecule.instancedMesh.instanceMatrix.needsUpdate = true;
        mode = main.mode
        main.molecule.updateBonds(main.mode);

        updateAllBondLengthLabels();
        render();
    } else {
        // NORMAL FREE DRAGGING
        if (!main.molecule || !main.molecule.atoms || !main.molecule.instancedMesh) {
            dragging = false;
            return;
        }
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
    mode = main.mode
    main.molecule.updateBonds(main.mode);
    if (main.molecule.labels && main.molecule.labels.length > 0) {
        main.molecule.updateLabels();
        render()
    }

    render();
}


function onPointerMove2(event) {
    if (ribbonMode) return;
    if (dragging || isSelecting) return;

    if (!editingMolecule || !main.molecule || !main.molecule.instancedMesh || !main.molecule.atoms) return;

    const rect = renderer.domElement.getBoundingClientRect();
    mouse.x = ((event.clientX - rect.left) / rect.width) * 2 - 1;
    mouse.y = -((event.clientY - rect.top) / rect.height) * 2 + 1;

    raycaster.setFromCamera(mouse, getActiveCamera());

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
                if (!atom || !colorAttr) return;
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
            if (!atom || !colorAttr) {
                hoveredAtom = null;
                return;
            }
            const color = new THREE.Color(main.molecule.atomSettings[atom.type].color);
            colorAttr.setXYZ(hoveredAtom, color.r, color.g, color.b);
            colorAttr.needsUpdate = true;
            render();
        }
        hoveredAtom = null;
        renderer.domElement.style.cursor = 'default';
    }
}
function initializeFragmentStore(atomCount) {
    globalFragmentStore = {
        originalAtomCount: atomCount,
        fragments: [],
        fragmentIdMap: new Map()
    };
    console.log('Initialized fragment store for', atomCount, 'atoms');
}

// Add a fragment to the global store (always with original indices)
function addFragmentToGlobalStore(atomIndices, currentIsolationIndices = null) {
    let originalIndices;

    if (currentIsolationIndices) {
        originalIndices = atomIndices.map(localIdx => {
            if (localIdx < currentIsolationIndices.length) {
                return currentIsolationIndices[localIdx];
            }
            return null;
        }).filter(idx => idx !== null);
    } else {
        originalIndices = [...atomIndices];
    }

    const signature = originalIndices.slice().sort((a, b) => a - b).join(',');

    if (!globalFragmentStore.fragmentIdMap.has(signature)) {
        // NEW: Check and remove overlapping fragments before adding
        removeOverlappingFragments(originalIndices);  // <-- THIS IS NEW!

        globalFragmentStore.fragments.push(originalIndices);
        globalFragmentStore.fragmentIdMap.set(signature, globalFragmentStore.fragments.length - 1);
        console.log('Added fragment with original indices:', originalIndices);
        return true;
    }
    return false;
}

// Get fragments visible in current isolation (converts to local indices)
function getFragmentsForIsolation(isolationIndices = null) {
    if (!isolationIndices) {
        // At root level - return all fragments as-is
        return globalFragmentStore.fragments.map(f => [...f]);
    }

    // Create mapping from original to local indices
    const originalToLocal = new Map();
    isolationIndices.forEach((origIdx, localIdx) => {
        originalToLocal.set(origIdx, localIdx);
    });

    // Convert global fragments to local indices for current isolation
    const localFragments = [];
    const isolationSet = new Set(isolationIndices);

    globalFragmentStore.fragments.forEach(fragment => {
        // Check if all atoms of this fragment are in current isolation
        const allInIsolation = fragment.every(origIdx => isolationSet.has(origIdx));

        if (allInIsolation) {
            // Convert to local indices
            const localIndices = fragment.map(origIdx => originalToLocal.get(origIdx));
            if (localIndices.every(idx => idx !== undefined)) {
                localFragments.push(localIndices);
            }
        }
    });

    return localFragments;
}
// Solution 1: Create a separate function to attach button event listeners
function attachButtonEventListeners() {
    // Remove any existing listeners first to avoid duplicates
    const changeBtn = document.getElementById('changeAtomBtn');
    const removeBtn = document.getElementById('removeAtomBtn');
    const fragmentBtn = document.getElementById('createFragment');
    const closeEditing = document.getElementById('closeEditing');
    const isolateBtn = document.getElementById('isolateFragmentBtn');

    // Clone and replace to remove all existing event listeners
    if (changeBtn) {
        const newChangeBtn = changeBtn.cloneNode(true);
        changeBtn.parentNode.replaceChild(newChangeBtn, changeBtn);

        newChangeBtn.addEventListener('click', () => {
            if (atomsSelected.length > 0) {
                const replacingMolecule = window.prompt("Enter the element you want to replace the current atom with");
                if (replacingMolecule && replacingMolecule.trim()) {
                    const element = replacingMolecule.trim();
                    // Validate it's a known element
                    if (!main.molecule.atomSettings[element]) {
                        alert(`Unknown element: ${element}`);
                        return;
                    }
                    // Update all selected atoms
                    atomsSelected.forEach(idx => {
                        main.data.atomData[idx].element = replacingMolecule;
                    });
                    main.newMolecule(main.data,
                        main.mode,
                        true,
                        true,
                        false
                    );
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
            main.data.numAtoms = main.data.atomData.length;  // Use actual length instead
            atomsSelected = [];
            main.newMolecule(
                main.data,
                main.mode,
                true,
                true,
                false
            );
        });

    }

    if (fragmentBtn) {
        const newFragmentBtn = fragmentBtn.cloneNode(true);
        fragmentBtn.parentNode.replaceChild(newFragmentBtn, fragmentBtn);

        newFragmentBtn.addEventListener('click', () => {
            // Create a copy of the selected atoms for the new fragment
            const newFragment = [...atomsSelected];

            // Get all atom indices in the molecule
            const totalAtoms = main.molecule.atoms.length;
            const allAtomIndices = Array.from({ length: totalAtoms }, (_, i) => i);

            // Process existing fragments to remove atoms that are now in the new fragment
            let updatedFragments = fragments.map(fragment => {
                // Remove atoms from existing fragments if they're in the new fragment
                return fragment.filter(atomIndex => !newFragment.includes(atomIndex));
            }).filter(fragment => fragment.length > 0); // Remove empty fragments

            // Find all atoms that are not in any fragment (including the new one)
            const atomsInFragments = new Set([
                ...newFragment,
                ...updatedFragments.flat()
            ]);

            const unassignedAtoms = allAtomIndices.filter(index => !atomsInFragments.has(index));

            // Create a new fragment for unassigned atoms if there are any
            if (unassignedAtoms.length > 0) {
                // Check if there's already an "unassigned" fragment (could be from previous operations)
                // If not, create one
                updatedFragments.push(unassignedAtoms);
            }

            // Add the new fragment
            updatedFragments.push(newFragment);

            // Update the global fragments array
            fragments = updatedFragments;

            // Log for debugging
            console.log('Fragment created:', newFragment);
            console.log('All fragments:', fragments);
            console.log('Total atoms covered:', fragments.flat().length, '/', totalAtoms);

            // Update the editing content to show the new fragment list
            if (atomsSelected.length > 0) {
                const firstAtom = main.molecule.atoms[atomsSelected[0]];
                updateEditingContent(firstAtom.type, main.molecule.atomSettings[firstAtom.type].color);
            }
        });
    }

    if (isolateBtn) {
        const newIsolateBtn = isolateBtn.cloneNode(true);
        isolateBtn.parentNode.replaceChild(newIsolateBtn, isolateBtn);

        newIsolateBtn.addEventListener('click', () => {
            if (fragmentsSelected.length > 0) {
                if (fragmentsSelected.length > 1) {
                    // Multiple fragments: create combined isolation
                    const combinedAtomIndices = [];
                    let combinedName = 'Combined: ';

                    fragmentsSelected.forEach((fragIdx, i) => {
                        if (fragIdx < fragments.length) {
                            combinedAtomIndices.push(...fragments[fragIdx]);
                            combinedName += `F${fragIdx + 1}${i < fragmentsSelected.length - 1 ? '+' : ''}`;
                        }
                    });

                    storeOriginalMolecule();

                    if (!isInIsolationMode) {
                        originalFragments = JSON.parse(JSON.stringify(fragments));
                    }

                    // FIX: Map indices for nested isolations
                    let mappedCombinedIndices;
                    if (isInIsolationMode && currentIsolationIndex >= 0) {
                        const currentIsolation = isolationHistory[currentIsolationIndex];
                        mappedCombinedIndices = combinedAtomIndices.map(localIdx => {
                            if (localIdx < currentIsolation.originalIndices.length) {
                                return currentIsolation.originalIndices[localIdx];
                            }
                            return null;
                        }).filter(idx => idx !== null);
                    } else {
                        mappedCombinedIndices = combinedAtomIndices;
                    }

                    const newData = generateDataFromAtoms(combinedAtomIndices);

                    const isolationEntry = {
                        name: combinedName,
                        atomCount: combinedAtomIndices.length,
                        data: newData,
                        fragmentIndices: [...fragmentsSelected],
                        originalIndices: mappedCombinedIndices, // Use mapped indices
                        localIndices: combinedAtomIndices, // Keep local indices
                        timestamp: Date.now()
                    };

                    isolationHistory.push(isolationEntry);
                    currentIsolationIndex = isolationHistory.length - 1;

                    atomsSelected = [];
                    fragmentsSelected = [];
                    fragments = [];

                    isInIsolationMode = true;

                    main.newMolecule(
                        newData,
                        main.mode,
                        true,
                        true,
                        false
                    );
                    main.data = newData;

                    updateIsolationModeUI();
                } else {
                    // Single fragment
                    isolateFragment(fragmentsSelected[0]);
                }
            } else if (atomsSelected.length > 0) {
                storeOriginalMolecule();

                if (!isInIsolationMode) {
                    originalFragments = JSON.parse(JSON.stringify(fragments));
                }

                // FIX: Map atom selection indices for nested isolations
                let mappedAtomIndices;
                if (isInIsolationMode && currentIsolationIndex >= 0) {
                    const currentIsolation = isolationHistory[currentIsolationIndex];
                    mappedAtomIndices = atomsSelected.map(localIdx => {
                        if (localIdx < currentIsolation.originalIndices.length) {
                            return currentIsolation.originalIndices[localIdx];
                        }
                        return null;
                    }).filter(idx => idx !== null);
                } else {
                    mappedAtomIndices = [...atomsSelected];
                }

                const newData = generateDataFromAtoms(atomsSelected);

                const isolationEntry = {
                    name: `${atomsSelected.length} Selected Atoms`,
                    atomCount: atomsSelected.length,
                    data: newData,
                    originalIndices: mappedAtomIndices, // Use mapped indices
                    localIndices: [...atomsSelected], // Keep local indices
                    timestamp: Date.now()
                };

                isolationHistory.push(isolationEntry);
                currentIsolationIndex = isolationHistory.length - 1;

                atomsSelected = [];
                fragmentsSelected = [];
                fragments = [];

                isInIsolationMode = true;

                main.newMolecule(
                    newData,
                    main.mode,
                    true,
                    true,
                    false
                );
                main.data = newData;

                updateIsolationModeUI();
                console.log(`Isolated ${isolationEntry.atomCount} selected atoms`);
            }

            // Update UI
            const editMoleculePanel = document.getElementById('editMoleculePanel');
            if (editMoleculePanel) {
                editMoleculePanel.classList.add('on');
            }
            updateEditingContent();
            render();
        });
    }


    if (closeEditing) {
        closeEditing.onclick = function () {
            editMoleculePanel.classList.add('on');
        };
    }

    // Attach axis event listeners
    attachAxisEventListeners();
}

function resetRotationState() {
    // Reset the rotation state object
    rotationState.basePositions = {};
    rotationState.selectedAtoms = [];
    rotationState.currentAngle = 0;
    rotationState.isActive = false;
    rotationState.axis = null;

    // Reset slider flags - CRITICAL FIX
    window.rotationSliderOn = false;
    window.translationSliderOn = false;
    window.lastPosition = 0;
    window.lastTranslationPosition = 0;

    // Reset UI sliders
    const rotationSlider = document.getElementById('rotationSlider');
    if (rotationSlider) {
        rotationSlider.value = 0;
        rotationSlider.removeEventListener('input', rotationSlider._handler);
    }
    const translationSlider = document.getElementById('translationSlider');
    if (translationSlider) {
        translationSlider.value = 0;
        translationSlider.removeEventListener('input', translationSlider._handler);
    }
}

function saveCurrentFragments() {
    if (!fragments || fragments.length === 0) return;

    let isolationIndices = null;
    if (isInIsolationMode && currentIsolationIndex >= 0) {
        const currentIsolation = isolationHistory[currentIsolationIndex];
        isolationIndices = currentIsolation.originalIndices;
    }

    // NEW: Map all fragments to original indices first
    const newFragmentOriginalIndices = [];

    fragments.forEach(fragment => {
        let originalIndices;
        if (isolationIndices) {
            originalIndices = fragment.map(localIdx => {
                if (localIdx < isolationIndices.length) {
                    return isolationIndices[localIdx];
                }
                return null;
            }).filter(idx => idx !== null);
        } else {
            originalIndices = [...fragment];
        }
        newFragmentOriginalIndices.push(originalIndices);
    });

    // NEW: Remove parent fragment if we're subdividing it
    if (isolationIndices && newFragmentOriginalIndices.length > 1) {
        removeParentFragment(isolationIndices);  // <-- THIS IS NEW!
    }

    // Now add the new fragments
    newFragmentOriginalIndices.forEach(indices => {
        addFragmentToGlobalStore(indices);
    });

    console.log('Saved', fragments.length, 'fragments. Total stored:', globalFragmentStore.fragments.length);
}


function isolateFragment(fragmentIndex) {
    storeOriginalMolecule();

    if (fragmentIndex < 0 || fragmentIndex >= fragments.length) {
        console.error('Invalid fragment index:', fragmentIndex);
        return;
    }

    // Initialize global store on first isolation
    if (!isInIsolationMode && globalFragmentStore.fragments.length === 0) {
        initializeFragmentStore(originalMoleculeData.numAtoms);
    }

    // Save current fragments before isolating
    saveCurrentFragments();

    const fragmentAtomIndices = fragments[fragmentIndex];

    // Map to original indices
    let originalIndices;
    if (isInIsolationMode && currentIsolationIndex >= 0) {
        const currentIsolation = isolationHistory[currentIsolationIndex];
        originalIndices = fragmentAtomIndices.map(localIdx => {
            if (localIdx < currentIsolation.originalIndices.length) {
                return currentIsolation.originalIndices[localIdx];
            }
            return null;
        }).filter(idx => idx !== null);
    } else {
        originalIndices = [...fragmentAtomIndices];
    }

    console.log('Isolating fragment with original indices:', originalIndices);

    const newData = generateDataFromAtoms(fragmentAtomIndices);

    const isolationEntry = {
        name: `Fragment ${fragmentIndex + 1}`,
        atomCount: fragmentAtomIndices.length,
        data: newData,
        fragmentIndex: fragmentIndex,
        originalIndices: originalIndices,  // Always store original indices
        timestamp: Date.now()
    };

    if (isInIsolationMode && currentIsolationIndex < isolationHistory.length - 1) {
        isolationHistory = isolationHistory.slice(0, currentIsolationIndex + 1);
    }
    isolationHistory.push(isolationEntry);
    currentIsolationIndex = isolationHistory.length - 1;

    // Clear selections
    atomsSelected = [];
    fragmentsSelected = [];

    // Get fragments for new isolation level
    fragments = getFragmentsForIsolation(originalIndices);

    resetRotationState();
    isInIsolationMode = true;

    main.mode = newData.numAtoms <= 2000 ? 1 : 0;
    main.newMolecule(
        newData,
        main.setNewMode(newData.numAtoms <= 2000),
    );

    main.data = newData;
    resetCamera();
    updateIsolationModeUI();

    const fragmentList = document.getElementById('fragmentList');
    if (fragmentList) {
        updateFragmentList(fragmentList);
    }

    updateEditingContent();
    render();

    console.log('Fragment isolated. Fragments at this level:', fragments.length);
}

function removeOverlappingFragments(newFragmentIndices) {
    const newSet = new Set(newFragmentIndices);
    const fragmentsToRemove = [];

    // Find fragments that are supersets of the new fragment
    globalFragmentStore.fragments.forEach((fragment, index) => {
        const fragmentSet = new Set(fragment);

        // Check if existing fragment is a superset of new fragment
        if (fragment.length > newFragmentIndices.length) {
            let isSuperset = true;
            for (const idx of newFragmentIndices) {
                if (!fragmentSet.has(idx)) {
                    isSuperset = false;
                    break;
                }
            }
            if (isSuperset) {
                fragmentsToRemove.push(index);
            }
        }
    });

    // Remove superset fragments in reverse order to maintain indices
    fragmentsToRemove.sort((a, b) => b - a);
    fragmentsToRemove.forEach(index => {
        const removed = globalFragmentStore.fragments.splice(index, 1)[0];
        const signature = removed.slice().sort((a, b) => a - b).join(',');
        globalFragmentStore.fragmentIdMap.delete(signature);
        console.log('Removed superset fragment:', removed);
    });
}

function removeParentFragment(parentIndices) {
    const parentSignature = parentIndices.slice().sort((a, b) => a - b).join(',');

    // Find and remove the parent fragment
    const fragmentIndex = globalFragmentStore.fragments.findIndex(fragment => {
        const signature = fragment.slice().sort((a, b) => a - b).join(',');
        return signature === parentSignature;
    });

    if (fragmentIndex !== -1) {
        globalFragmentStore.fragments.splice(fragmentIndex, 1);
        globalFragmentStore.fragmentIdMap.delete(parentSignature);
        console.log('Removed parent fragment that was subdivided:', parentIndices);
    }
}
function restoreOriginalMolecule() {
    if (!originalMoleculeData) {
        console.error('No original molecule data to restore');
        return;
    }

    // Save current fragments before restoring
    saveCurrentFragments();

    // Update atom positions in original molecule
    if (isInIsolationMode && currentIsolationIndex >= 0) {
        const currentIsolation = isolationHistory[currentIsolationIndex];

        if (currentIsolation && currentIsolation.originalIndices && main.molecule.atoms) {
            const editedAtoms = main.molecule.atoms;
            currentIsolation.originalIndices.forEach((originalIdx, localIdx) => {
                if (localIdx < editedAtoms.length && originalIdx < originalMoleculeData.atomData.length) {
                    const editedAtom = editedAtoms[localIdx];
                    originalMoleculeData.atomData[originalIdx] = {
                        ...originalMoleculeData.atomData[originalIdx],
                        x: editedAtom.position.x / 4,
                        y: editedAtom.position.y / 4,
                        z: editedAtom.position.z / 4
                    };
                }
            });
        }
    }

    console.log('Restoring original molecule with', originalMoleculeData.numAtoms, 'atoms');
    console.log('Total fragments in global store:', globalFragmentStore.fragments.length);

    // Clear isolation mode
    isInIsolationMode = false;
    isolationHistory = [];
    currentIsolationIndex = -1;

    const restoredData = JSON.parse(JSON.stringify(originalMoleculeData));

    // Clear selections
    atomsSelected = [];
    fragmentsSelected = [];

    resetRotationState();

    // Restore all fragments at root level
    fragments = getFragmentsForIsolation(null);

    main.newMolecule(
        restoredData,
        main.setNewMode(restoredData.numAtoms <= 2000),
        true,
        true,
        false
    );

    main.data = restoredData;
    resetCamera();

    const fragmentList = document.getElementById('fragmentList');
    if (fragmentList) {
        updateFragmentList(fragmentList);
    }

    updateEditingContent();
    render();

    console.log('Restored with', fragments.length, 'fragments');
}


function highlightFragment(fragmentIndex) {
    if (!main.molecule || !main.molecule.instancedMesh) return;
    if (fragmentIndex >= fragments.length) {
        console.error('Invalid fragment index');
        return;
    }

    const fragment = fragments[fragmentIndex];
    const colorAttr = main.molecule.instancedMesh.geometry.getAttribute('color');
    if (!colorAttr) return;

    // Define distinct colors for fragments


    const color = new THREE.Color(fragmentColors[fragmentIndex % fragmentColors.length]);

    // Apply the fragment color
    fragment.forEach(atomIndex => {
        colorAttr.setXYZ(atomIndex, color.r, color.g, color.b);
        main.molecule.atoms[atomIndex].displayColor = color;
    });

    colorAttr.needsUpdate = true;
    render();
}

function resetIsolationState() {
    isInIsolationMode = false;
    isolationHistory = [];
    currentIsolationIndex = -1;
    originalMoleculeData = null;
    originalFragments = [];

    globalFragmentStore = {
        originalAtomCount: 0,
        fragments: [],
        fragmentIdMap: new Map()
    };
}

window.resetIsolationState = resetIsolationState;

function resetFragments() {
    fragments = [];

    if (!main.molecule || !main.molecule.instancedMesh || !main.molecule.atoms) return;

    // Reset atom colors to their original element colors
    const colorAttr = main.molecule.instancedMesh.geometry.getAttribute('color');
    if (!colorAttr) return;
    for (let i = 0; i < colorAttr.count; i++) {
        const atom = main.molecule.atoms[i];
        const color = new THREE.Color(main.molecule.atomSettings[atom.type].color);
        atom.displayColor = color;
        colorAttr.setXYZ(i, color.r, color.g, color.b);
    }
    colorAttr.needsUpdate = true;

    // Update UI
    if (atomsSelected.length > 0) {
        const firstAtom = main.molecule.atoms[atomsSelected[0]];
        updateEditingContent(firstAtom.type, main.molecule.atomSettings[firstAtom.type].color);
    }

    render();
}

// Updated updateEditingContent function in main.js
function updateEditingContent(element = null, color = null) {
    if (element !== null) {
        let axisButtonHtml = '';
        let axisControlsHtml = '';

        // Show "Define Axis" button only when exactly 2 atoms are selected
        if (atomsSelected.length === 2) {
            axisButtonHtml = `<button id="defineAxisBtn" style="background-color:rgb(255, 0, 255); margin:10px; " class="fancy-button">Define Axis</button>`;
        }

        // Show axis controls if an axis is defined
        if (rotationAxis) {
            axisControlsHtml = `
                <div style="margin-top: 20px; padding: 20px; background-color: rgba(0, 115, 255, 0.2); border-radius: 15px;" class="shine">
                    <button id="removeAxisBtn" style="background-color:rgb(255, 100, 100); margin:5px;" class="fancy-button">Remove Axis</button>
                    <div style="margin-top: 10px;">
                        <label style="color: white; display: block; margin-bottom: 5px; font-size: 14px;">Rotate ${atomsSelected.length > 0 ? 'Selected Atoms' : 'Entire Molecule'}:</label>
                        <input type="range" id="rotationSlider" min="-180" max="180" value="0" step="1" style="width: 100%;">
                    </div>
                    <div style="margin-top: 10px;">
                        <label style="color: white; display: block; margin-bottom: 5px; font-size: 14px;">Translate ${atomsSelected.length > 0 ? 'Selected Atoms' : 'Entire Molecule'}:</label>
                        <input type="range" id="translationSlider" min="-180" max="180" value="0" step="0.1" style="width: 100%;">
                    </div>
                </div>
            `;
        }

        editMoleculeContent.innerHTML = `
            <button id="closeEditing" class="dismiss" title="Dismiss" style="position: absolute; top: 0%; left: 0%; margin: 10px;"><i class="fa-solid fa-angles-left"></i></button>
        `;
        editMoleculeContent.innerHTML += `
            <button id="changeAtomBtn" style="background-color:rgb(162, 0, 255); margin:10px;" class="fancy-button">Replace Atom</button>
            <button id="removeAtomBtn" style="background-color:rgb(0, 128, 255); margin:10px;" class="fancy-button">Remove Atom</button>
            ${axisButtonHtml}
            ${axisControlsHtml}
        `;

        if (atomsSelected.length > 1) {
            document.getElementById('createFragment').style.display = 'block';
        } else {
            document.getElementById('createFragment').style.display = 'none';
        }

        // Recreate fragment list with click handlers
        const fragmentList = document.getElementById('fragmentList');
        updateFragmentList(fragmentList);

        // Attach axis-related event listeners
        attachAxisEventListeners();
    } else {
        editMoleculePanel.classList.add('on');
    }
}

function updateFragmentList(fragmentList) {
    fragmentList.innerHTML = '';
    fragmentList.style.alignItems = 'center';

    // Add "Show All Fragments" button if in isolation mode
    if (isInIsolationMode) {
        const showAllBtn = document.createElement('button');
        showAllBtn.textContent = 'Back to Full Molecule';
        showAllBtn.className = 'fancy-button';
        showAllBtn.style.cssText = `
            display: block;
            margin-bottom: 10px;
            background-color: rgb(64, 215, 64);
            padding: 8px 12px;
            font-size: 13px;
            width: 50px%;
            z-index: 10000000000000000000!important;
        `;
        showAllBtn.addEventListener('click', restoreOriginalMolecule);
        fragmentList.appendChild(showAllBtn);

        // Add navigation buttons if there's history


        // Show current isolation info
        if (currentIsolationIndex >= 0 && currentIsolationIndex < isolationHistory.length) {
            const currentInfo = document.createElement('div');
            currentInfo.style.cssText = `
                padding: 5px;
                margin-bottom: 10px;
                background-color: rgba(255, 140, 0, 0.2);
                border-radius: 5px;
                color: white;
                font-size: 12px;
                text-align: center;
            `;
            const isolationData = isolationHistory[currentIsolationIndex];
            currentInfo.textContent = `Viewing: ${isolationData.name} (${isolationData.atomCount} atoms)`;
            fragmentList.appendChild(currentInfo);
        }
    }
    function hexToRGBA(hex, alpha = 1) {
        const r = (hex >> 16) & 0xff;
        const g = (hex >> 8) & 0xff;
        const b = hex & 0xff;
        return `rgba(${r}, ${g}, ${b}, ${alpha})`;
    }
    fragments.forEach((fragment, index) => {
        const listItem = document.createElement('li');
        const color = hexToRGBA(fragmentColors[index % fragmentColors.length], 0.3);
        listItem.innerHTML = '';
        listItem.textContent = `Fragment ${index + 1}`;
        listItem.style.cursor = 'pointer';
        listItem.style.padding = '7px';
        listItem.style.margin = '2px';
        listItem.style.borderRadius = '20px';
        listItem.style.transition = 'all ease-in-out 0.3s';
        listItem.style.paddingLeft = '20px';
        listItem.style.paddingRight = '20px';
        listItem.style.boxShadow = `0 4px 10px rgba(0, 0, 0, 0.513), inset 1px 1px 5px rgba(145, 145, 145, 0.396), inset -8px -8px 16px rgba(255, 255, 255, 0.07)`;
        listItem.style.backgroundColor = color;
        listItem.dataset.fragmentIndex = index;


        // Check if this fragment is currently selected
        if (fragmentsSelected.includes(index)) {
            listItem.classList.add('selected');
            listItem.style.backgroundColor = hexToRGBA(fragmentColors[index % fragmentColors.length], 0.7);
            listItem.style.boxShadow = `0px 0px 20px rgba(255, 255, 255, 0.23)`;

            // Add action buttons container
            const buttonContainer = document.createElement('div');
            buttonContainer.style.cssText = 'display: flex; gap: 5px; margin-top: 10px;';

            // Isolate Fragment button
            const isolateBtn = document.createElement('button');
            isolateBtn.textContent = 'Isolate';
            isolateBtn.className = 'fancy-button';
            isolateBtn.style.cssText = `
                flex: 1;
                background-color: rgb(255, 140, 0);
                padding: 5px 10px;
                font-size: 12px;
                width: fit-content;

            `;

            isolateBtn.addEventListener('click', (e) => {
                e.stopPropagation();
                isolateFragment(index);
            });

            buttonContainer.appendChild(isolateBtn);
            listItem.appendChild(buttonContainer);
        }

        // Add hover effect
        listItem.addEventListener('mouseenter', () => {
            if (!fragmentsSelected.includes(index)) {
                listItem.style.transform = 'scale(1.05)';
            }
        });

        listItem.addEventListener('mouseleave', () => {
            if (!fragmentsSelected.includes(index)) {
                listItem.style.transform = 'scale(1)';
                listItem.style.backgroundColor = color;
            }
        });

        // Add click handler with cmd/ctrl support
        listItem.addEventListener('click', (event) => {
            if (event.target.tagName === 'BUTTON') {
                return;
            }

            if (event.metaKey || event.ctrlKey) {
                // Cmd/Ctrl + click: toggle fragment in selection
                if (fragmentsSelected.includes(index)) {
                    fragmentsSelected = fragmentsSelected.filter(idx => idx !== index);
                    listItem.classList.remove('selected');
                    listItem.style.backgroundColor = 'transparent';
                } else {
                    fragmentsSelected.push(index);
                    listItem.classList.add('selected');
                    listItem.style.backgroundColor = 'rgba(255, 255, 255, 0.3)';
                }
            } else {
                // Normal click
                if (fragmentsSelected.includes(index)) {
                    fragmentsSelected = fragmentsSelected.filter(idx => idx !== index);
                    listItem.classList.remove('selected');
                    listItem.style.backgroundColor = 'transparent';
                } else {
                    fragmentList.querySelectorAll('li').forEach(item => {
                        item.classList.remove('selected');
                        item.style.backgroundColor = 'transparent';
                    });

                    fragmentsSelected = [index];
                    listItem.classList.add('selected');
                    listItem.style.backgroundColor = 'rgba(255, 255, 255, 0.3)';
                }
            }

            selectFragment(fragment, index);
            updateFragmentList(fragmentList);
        });

        fragmentList.appendChild(listItem);
    });

    attachButtonEventListeners();
}

function storeOriginalMolecule() {
    if (!originalMoleculeData) {
        originalMoleculeData = {
            atomData: JSON.parse(JSON.stringify(main.data.atomData)),
            numAtoms: main.data.numAtoms,
            // Store any other relevant data fields
        };
        console.log('Original molecule stored with', originalMoleculeData.numAtoms, 'atoms');
    }
}
let rotationSliderOn = false
let translationSliderOn = false
let lastPosition = 0

function attachAxisEventListeners() {
    const defineAxisBtn = document.getElementById('defineAxisBtn');
    const removeAxisBtn = document.getElementById('removeAxisBtn');
    const rotationSlider = document.getElementById('rotationSlider');
    const translationSlider = document.getElementById('translationSlider');
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
            currentRotationAngle = 0;
            rotationBasePositions = {};
            render();
        });
    }

    if (rotationSlider) {
        let previousAngle = 0;
        let originalPositions = {}; // Store original positions when slider starts
        let isSliderActive = false;

        // Store original positions when starting to drag


        rotationSlider.addEventListener('input', (e) => {
            if (rotationSliderOn) {
                previousAngle = rotationState.currentAngle
                rotationSliderOn = false
            }

            const angle = previousAngle + parseFloat(e.target.value);
            console.log('Rotation angle:', angle);

            rotateSelectedAtoms(angle, { relative: false });
        });
    }
    if (translationSlider) {
        translationSlider.addEventListener('input', (e) => {
            if (translationSliderOn) {
                lastPosition = 0
                translationSliderOn = false
            }
            const pos = parseFloat(e.target.value) - lastPosition;
            lastPosition = parseFloat(e.target.value)
            translateSelectedAtoms(pos / 10);
        });
    }
}

function rotateSelectedAtoms(angle, options = {}) {
    // Default options
    const defaults = {
        relative: false,
        updateUI: true,
        atomIndices: null,
        axis: null
    };

    const opts = { ...defaults, ...options };

    // Validate molecule exists
    if (!main?.molecule?.atoms || main.molecule.atoms.length === 0) {
        console.warn('No molecule or atoms available for rotation');
        return false;
    }

    // Use provided axis or global rotationAxis
    const axis = opts.axis || rotationAxis;
    if (!axis?.direction || !axis?.point) {
        console.warn('No rotation axis defined');
        return false;
    }

    // Determine which atoms to rotate
    let atomsToRotate = opts.atomIndices;
    if (!atomsToRotate) {
        if (atomsSelected && atomsSelected.length > 0) {
            atomsToRotate = atomsSelected;
        } else {
            // Rotate all atoms if none selected
            atomsToRotate = Array.from({ length: main.molecule.atoms.length }, (_, i) => i);
        }
    }

    // Initialize base positions if needed
    if (!rotationState.isActive || Object.keys(rotationState.basePositions).length === 0) {
        initializeRotationState(atomsToRotate, axis);
    }

    // Calculate the actual angle to apply
    let targetAngle;
    if (opts.relative) {
        // Relative rotation: add to current angle
        targetAngle = rotationState.currentAngle + angle;
    } else {
        // Absolute rotation: set to specific angle
        targetAngle = angle;
    }

    // Clamp angle to -180 to 180 range
    targetAngle = clampAngle(targetAngle);

    // Perform the rotation
    performRotation(atomsToRotate, targetAngle, axis);

    // Update state
    rotationState.currentAngle = targetAngle;
    rotationState.isActive = true;

    // Update UI if requested
    if (opts.updateUI) {
        updateRotationUI(targetAngle);
    }

    // Update molecule visualization
    updateMoleculeVisualization();

    return true;
}

function initializeRotationState(atomIndices, axis) {
    rotationState.basePositions = {};
    rotationState.selectedAtoms = atomIndices;
    rotationState.axis = {
        point: axis.point.clone(),
        direction: axis.direction.clone().normalize()
    };

    // If there's already a rotation applied, reverse it to get base positions
    if (rotationState.currentAngle !== 0 && rotationState.isActive) {
        const reverseMatrix = new THREE.Matrix4().makeRotationAxis(
            rotationState.axis.direction,
            -rotationState.currentAngle * Math.PI / 180
        );

        atomIndices.forEach(idx => {
            const atom = main.molecule.atoms[idx];
            const tempPos = atom.position.clone();
            tempPos.sub(rotationState.axis.point);
            tempPos.applyMatrix4(reverseMatrix);
            tempPos.add(rotationState.axis.point);
            rotationState.basePositions[idx] = tempPos;
        });
    } else {
        // Store current positions as base
        atomIndices.forEach(idx => {
            const atom = main.molecule.atoms[idx];
            rotationState.basePositions[idx] = atom.position.clone();
        });
    }
}

function performRotation(atomIndices, targetAngle, axis) {
    const angleRadians = targetAngle * Math.PI / 180;
    const axisDirection = axis.direction.clone().normalize();
    const axisPoint = axis.point.clone();
    const rotationMatrix = new THREE.Matrix4().makeRotationAxis(axisDirection, angleRadians);

    atomIndices.forEach(idx => {
        const atom = main.molecule.atoms[idx];
        const basePos = rotationState.basePositions[idx];

        if (basePos) {
            // Start from base position
            const tempPos = basePos.clone();

            // Translate to origin (relative to axis point)
            tempPos.sub(axisPoint);

            // Apply rotation
            tempPos.applyMatrix4(rotationMatrix);

            // Translate back
            tempPos.add(axisPoint);

            // Update atom position
            atom.position.copy(tempPos);
            atom.x = atom.position.x;
            atom.y = atom.position.y;
            atom.z = atom.position.z;

            // Update visual matrix
            updateAtomMatrix(idx);
        }
    });
}

function translateSelectedAtoms(distance, options = {}) {
    const defaults = {
        atomIndices: null,
        axis: null,
        updateUI: true
    };

    const opts = { ...defaults, ...options };

    // Validate
    if (!main?.molecule?.atoms) {
        console.warn('No molecule available for translation');
        return false;
    }

    const axis = opts.axis || rotationAxis;
    if (!axis?.direction) {
        console.warn('No axis defined for translation');
        return false;
    }

    // Determine atoms to translate
    let atomsToTranslate = opts.atomIndices;
    if (!atomsToTranslate) {
        if (atomsSelected && atomsSelected.length > 0) {
            atomsToTranslate = atomsSelected;
        } else {
            atomsToTranslate = Array.from({ length: main.molecule.atoms.length }, (_, i) => i);
        }
    }

    // Calculate translation vector
    const axisDirection = axis.direction.clone().normalize();
    const translationVector = axisDirection.multiplyScalar(distance);

    // Apply translation
    atomsToTranslate.forEach(idx => {
        const atom = main.molecule.atoms[idx];
        atom.position.add(translationVector);
        atom.x = atom.position.x;
        atom.y = atom.position.y;
        atom.z = atom.position.z;

        // Update base positions if rotation is active
        if (rotationState.basePositions[idx]) {
            rotationState.basePositions[idx].add(translationVector);
        }

        updateAtomMatrix(idx);
    });

    // Update axis point if it moves with the atoms
    if (axisAtoms && axisAtoms.length > 0) {
        const movingAxisAtoms = axisAtoms.filter(idx => atomsToTranslate.includes(idx));
        if (movingAxisAtoms.length > 0) {
            if (axis.point) {
                axis.point.add(translationVector);
            }
            if (rotationState.axis?.point) {
                rotationState.axis.point.add(translationVector);
            }

            // Update axis visualizer if it exists
            if (axisVisualizer && axisAtoms.length === 2) {
                const atom1 = main.molecule.atoms[axisAtoms[0]];
                const atom2 = main.molecule.atoms[axisAtoms[1]];
                main.scene.remove(axisVisualizer);
                axisVisualizer.geometry.dispose();
                axisVisualizer.material.dispose();
                createAxisVisualizer(atom1, atom2);
            }
        }
    }

    // Update visualization
    updateMoleculeVisualization();

    return true;
}
function resetRotation() {
    if (Object.keys(rotationState.basePositions).length === 0) {
        console.log('No rotation to reset');
        return;
    }

    // Restore base positions
    Object.keys(rotationState.basePositions).forEach(idx => {
        const atom = main.molecule.atoms[idx];
        const basePos = rotationState.basePositions[idx];

        if (atom && basePos) {
            atom.position.copy(basePos);
            atom.x = atom.position.x;
            atom.y = atom.position.y;
            atom.z = atom.position.z;
            updateAtomMatrix(parseInt(idx));
        }
    });

    // Reset state
    rotationState.currentAngle = 0;
    rotationState.isActive = false;

    // Update UI
    updateRotationUI(0);
    updateMoleculeVisualization();
}

function finalizeRotation() {
    if (!rotationState.isActive) return;

    // Save undo state if available
    if (typeof saveUndoState === 'function') {
        saveUndoState("Rotate Atoms");
    }

    // Update base positions to current positions
    rotationState.selectedAtoms.forEach(idx => {
        const atom = main.molecule.atoms[idx];
        if (atom) {
            rotationState.basePositions[idx] = atom.position.clone();
        }
    });

    // Update molecule coordinates
    if (main.molecule.updateMainCoordinates) {
        main.molecule.updateMainCoordinates();
    }

    console.log(`Rotation finalized at ${rotationState.currentAngle}°`);
}

function clampAngle(angle) {
    while (angle > 180) angle -= 360;
    while (angle < -180) angle += 360;
    return angle;
}

function updateRotationUI(angle) {
    const rotationSlider = document.getElementById('rotationSlider');
    if (rotationSlider) {
        rotationSlider.value = angle;
    }

    const rotationValue = document.getElementById('rotationValue');
    if (rotationValue) {
        rotationValue.textContent = `${angle.toFixed(1)}°`;
    }
}

function updateMoleculeVisualization() {
    mode = main.mode
    if (main?.molecule) {
        // Update instanced mesh
        if (main.molecule.instancedMesh) {
            main.molecule.instancedMesh.instanceMatrix.needsUpdate = true;
        }

        // Update bonds
        if (main.molecule.updateBonds) {
            main.molecule.updateBonds(main.mode);
        }

        // Update labels
        if (main.molecule.labels && main.molecule.labels.length > 0 && main.molecule.updateLabels) {
            main.molecule.updateLabels();
        }

        // Update bond length labels if function exists
        if (typeof updateAllBondLengthLabels === 'function') {
            updateAllBondLengthLabels();
        }
    }

    // Render the scene
    if (typeof render === 'function') {
        render();
    }
}

function attachEnhancedRotationHandlers() {
    const rotationSlider = document.getElementById('rotationSlider');
    const rotationValue = document.getElementById('rotationValue');

    if (!rotationSlider) return;

    let sliderActive = false;

    // Mouse down - prepare for rotation
    rotationSlider.addEventListener('mousedown', () => {
        sliderActive = true;

        // Initialize rotation state if needed
        if (!rotationState.isActive) {
            const atomsToRotate = atomsSelected.length > 0
                ? atomsSelected
                : Array.from({ length: main.molecule.atoms.length }, (_, i) => i);

            if (rotationAxis) {
                initializeRotationState(atomsToRotate, rotationAxis);
                rotationState.isActive = true;
            }
        }
    });

    // Input - perform rotation
    rotationSlider.addEventListener('input', (e) => {
        if (!sliderActive || !rotationAxis) return;

        const angle = parseFloat(e.target.value);

        // Rotate to absolute angle
        rotateSelectedAtoms(angle, {
            relative: false,
            updateUI: false  // Don't update slider since we're already handling it
        });

        // Update display
        if (rotationValue) {
            rotationValue.textContent = `${angle.toFixed(1)}°`;
        }
    });

    // Mouse up - finalize rotation
    rotationSlider.addEventListener('mouseup', () => {
        if (!sliderActive) return;
        sliderActive = false;
        finalizeRotation();
    });

    // Touch support
    rotationSlider.addEventListener('touchend', () => {
        if (!sliderActive) return;
        sliderActive = false;
        finalizeRotation();
    });
}

function attachKeyboardShortcuts() {
    const ROTATION_STEP = 0.1;     // degrees
    const TRANSLATION_STEP = 0.1; // units

    window.addEventListener('keydown', (e) => {
        if (!editingMolecule || !rotationAxis) return;

        // Check for shift key
        if (!e.shiftKey) return;

        // Prevent default behavior for arrow keys
        if (['ArrowUp', 'ArrowDown', 'ArrowLeft', 'ArrowRight'].includes(e.key)) {
            e.preventDefault();

            // Disable orbit controls temporarily
            if (controls) controls.enabled = false;

            switch (e.key) {
                case 'ArrowUp':
                    // Rotate forward
                    rotateSelectedAtoms(ROTATION_STEP, { relative: true });
                    break;

                case 'ArrowDown':
                    // Rotate backward
                    rotateSelectedAtoms(-ROTATION_STEP, { relative: true });
                    break;

                case 'ArrowRight':
                    // Translate forward along axis
                    translateSelectedAtoms(TRANSLATION_STEP);
                    break;

                case 'ArrowLeft':
                    // Translate backward along axis
                    translateSelectedAtoms(-TRANSLATION_STEP);
                    break;
            }
        }

        // Reset rotation with R key
        if (e.key === 'r' || e.key === 'R') {
            resetRotation();
        }

    });

    window.addEventListener('keyup', (e) => {
        if (e.key === 'Shift' && controls) {
            controls.enabled = true;

            // Finalize any ongoing transformations
            if (rotationState.isActive) {
                finalizeRotation();
            }
        }
    });
}

function initializeRotationSystem() {
    // Attach all event handlers
    attachEnhancedRotationHandlers();
    attachKeyboardShortcuts();
    attachMouseWheelRotation();

    // Reset state
    rotationState = {
        basePositions: {},
        currentAngle: 0,
        isActive: false,
        axis: null,
        selectedAtoms: []
    };

    console.log('Enhanced rotation system initialized');
}

function recreateRenderer(antialiasEnabled) {
    // Store current renderer size
    const width = renderer.domElement.width;
    const height = renderer.domElement.height;

    // Remove old renderer
    document.body.removeChild(renderer.domElement);

    // Create new renderer with updated antialias
    renderer = new THREE.WebGLRenderer({
        antialias: antialiasEnabled,
        powerPreference: "high-performance",
        alpha: true,
        preserveDrawingBuffer: true
    });
    renderer.setSize(window.innerWidth, window.innerHeight);
    renderer.setPixelRatio(window.devicePixelRatio);
    document.body.appendChild(renderer.domElement);
    window.renderer = renderer;
    console.log("Render Limits:", renderer.capabilities.maxInstances);


    // Recreate controls
    controls = new ArcballControls(camera, renderer.domElement);
    controls.rotateSpeed = 1.0;
    controls.zoomSpeed = 2.0;
    controls.panSpeed = 1.0;
    controls.dynamicDampingFactor = 1.0;
    controls.cursorZoom = true;
    controls.enableAnimations = false;


    // IMPORTANT: Re-attach the controls change event listener
    controls.addEventListener('change', () => {
        render();
    });

    // IMPORTANT: Re-attach the pointer down event for atom selection
    renderer.domElement.addEventListener('pointerdown', onPointerDown, false);

    render();
}


function updateAtomMatrix(atomIndex) {
    if (!main.molecule || !main.molecule.atoms || !main.molecule.atoms[atomIndex]) return;
    const atom = main.molecule.atoms[atomIndex];
    const matrix = new THREE.Matrix4();
    const settings = main.molecule.atomSettings[atom.type];
    let radius = (settings?.realRadius || 0.67) * 1.5;
    if (main.mode && main.mode.atomSize) {
        radius *= main.mode.atomSize;
    }
    matrix.makeScale(radius, radius, radius);
    matrix.setPosition(atom.position);
    main.molecule.instancedMesh.setMatrixAt(atomIndex, matrix);
}

function onPointerUp(event) {
    // Handle dragging cleanup
    if (dragging) {
        dragging = false;
        saveUndoState("Move Atoms");
        dragOffsets = {};

        // Clean up axis dragging variables
        window.dragStartIntersection = null;
        window.originalDragPositions = null;
        if (main.molecule && main.molecule.labels && main.molecule.labels.length > 0) {
            main.molecule.updateLabels();
            render();
        }
        window.removeEventListener('pointermove', onPointerMove, false);
        window.removeEventListener('pointerup', onPointerUp, false);
    }

    // Handle selection box cleanup (backup in case onSelectionUp wasn't called)
    if (event.button === 0 && isSelecting) {
        onSelectionUp(event);
    }

    if (main.molecule) {
        main.molecule.updateMainCoordinates();
    }
}
function selectFragment(fragmentAtoms, fragmentIndex) {
    if (!main.molecule || !main.molecule.instancedMesh || !main.molecule.atoms) return;

    // Clear previous atom selection
    atomsSelected = [];

    // Build atomsSelected from all selected fragments
    fragmentsSelected.forEach(fragIdx => {
        if (fragIdx < fragments.length) {
            atomsSelected.push(...fragments[fragIdx]);
        }
    });

    // Reset color attributes for all atoms
    const colorAttr = main.molecule.instancedMesh.geometry.getAttribute('color');
    if (!colorAttr) return;
    for (let i = 0; i < colorAttr.count; i++) {
        const atom = main.molecule.atoms[i];
        if (!atom) continue;
        const color = new THREE.Color(main.molecule.atomSettings[atom.type].color);
        atom.displayColor = color;
        colorAttr.setXYZ(i, color.r, color.g, color.b);
    }

    // Highlight selected fragments
    fragmentsSelected.forEach(fragIdx => {
        if (fragIdx < fragments.length) {
            highlightFragment(fragIdx);
        }
    });

    colorAttr.needsUpdate = true;

    window.rotationSliderOn = true;  // Mark slider as needing reset
    window.translationSliderOn = true;  // Mark translation slider as needing reset

    // Reset the rotation state to ensure clean slate for fragment rotation
    if (rotationState) {
        rotationState.currentAngle = 0;
        rotationState.isActive = false;
    }

    // Reset slider UI values
    const rotationSlider = document.getElementById('rotationSlider');
    if (rotationSlider) {
        rotationSlider.value = 0;
    }

    const translationSlider = document.getElementById('translationSlider');
    if (translationSlider) {
        translationSlider.value = 0;
    }

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
function initializeSelectionBox() {
    if (!document.getElementById('selectionBox')) {
        const selectionBoxElement = document.createElement('div');
        selectionBoxElement.id = 'selectionBox';
        selectionBoxElement.style.cssText = `
            position: fixed;
            border: 2px dashed rgba(255, 255, 255, 0.7);
            background-color: rgba(255, 255, 255, 0.1);
            pointer-events: none;
            display: none;
            z-index: 1000;
        `;
        document.body.appendChild(selectionBoxElement);
    }
}

function arraysEqual(a, b) {
    if (a.length !== b.length) return false;
    const sortedA = [...a].sort((x, y) => x - y);
    const sortedB = [...b].sort((x, y) => x - y);  // Fixed: x - y
    return sortedA.every((val, index) => val === sortedB[index]);
}

function selectAtom(index, reset = true) {
    if (!main.molecule || !main.molecule.instancedMesh || !main.molecule.atoms) return;

    const colorAttr = main.molecule.instancedMesh.geometry.getAttribute('color');
    if (!colorAttr) return;

    // Only reset all colors if we're not in box selection mode
    if ((!isSelecting || !cmdDown) && reset) {
        for (let i = 0; i < colorAttr.count; i++) {
            const atom = main.molecule.atoms[i];
            const color = new THREE.Color(main.molecule.atomSettings[atom.type].color);
            atom.displayColor = color;
            colorAttr.setXYZ(i, color.r, color.g, color.b);
        }
    }

    // Highlight selected atom (yellow)
    main.molecule.atoms[index].displayColor = new THREE.Color(1, 1, 0);
    colorAttr.setXYZ(index, 1, 1, 0);
    colorAttr.needsUpdate = true;
}


function unselectAtom(index = null) {
    if (!main.molecule || !main.molecule.instancedMesh || !main.molecule.atoms) return;

    const colorAttr = main.molecule.instancedMesh.geometry.getAttribute('color');
    if (!colorAttr) return;

    if (index === null) {
        // Reset all atoms to their default color
        for (let i = 0; i < colorAttr.count; i++) {
            const atom = main.molecule.atoms[i];
            const color = new THREE.Color(main.molecule.atomSettings[atom.type].color);
            atom.displayColor = color;
            colorAttr.setXYZ(i, color.r, color.g, color.b);
        }
    } else {
        // Reset only the specified atom to its default color
        const atom = main.molecule.atoms[index];
        const color = new THREE.Color(main.molecule.atomSettings[atom.type].color);
        atom.displayColor = color;
        colorAttr.setXYZ(index, color.r, color.g, color.b);
    }
    colorAttr.needsUpdate = true;
}

function saveImage() {
    if (!main.data || main.data.numAtoms === 0) {
        alert('No molecule loaded to capture');
        return;
    }

    const originalBackground = scene.background;
    const width = window.innerWidth;
    const height = window.innerHeight;
    const scale = 2; // 2x resolution, increase for higher quality

    // Temporarily increase resolution
    renderer.setSize(width * scale, height * scale, false);
    scene.background = null;
    renderer.render(scene, camera);

    let imgData = renderer.domElement.toDataURL("image/png", 1.0);
    const link = document.createElement('a');
    link.setAttribute('href', imgData);
    link.setAttribute('target', '_blank');
    link.setAttribute('download', 'molecule.png');
    link.click();

    // Restore original
    renderer.setSize(width, height, false);
    scene.background = originalBackground;
    renderer.render(scene, camera);
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

window.addEventListener('authStateChanged', (event) => {
    const { user, isSignedIn, premiumState } = event.detail;
    premiumActive = premiumState.isActive
    updateFeatureAccess(user, isSignedIn, premiumActive);
    editingMolecule = isSignedIn
    window.currentUserEmail = user ? user.email : null

    const saveSection = document.getElementById('molecule-save-section');
    const message = document.getElementById('molecule-save-message');
    if (saveSection) {
        saveSection.style.display = 'none'

        // Check if prompt already exists to avoid duplicates
        let prompt = saveSection.parentElement.querySelector('.save-molecules-prompt');
        if (!prompt) {
            prompt = document.createElement('div');
            prompt.className = 'save-molecules-prompt';
            saveSection.parentElement.insertBefore(prompt, saveSection);
        }

        if (!user) {
            saveSection.style.display = 'none'
            prompt.innerHTML = '<p style="color: white; padding: 10px;">Sign in to save molecules</p>';
        } else {
            // Check if user has premium OR is on trial
            if (premiumState.isActive || premiumState.isTrial) {
                prompt.innerHTML = '';
                saveSection.style.display = 'block'
            } else {
                prompt.innerHTML = '<p style="color: white; padding: 10px;">Purchase premium to save molecules</p>';
                saveSection.style.display = 'none'
            }
        }
    }
});

document.addEventListener('DOMContentLoaded', () => {
    // Start with restricted access
    restrictFeatures();
});

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

if (typeof main !== 'undefined') {
    restrictFeatures();
}

function setSceneColor(color) {
    scene.background = new THREE.Color(color);
}

window.loadStylePreferences = loadStylePreferences;
window.saveStylePreferences = saveStylePreferences;
window.resetToDefaults = resetToDefaults;
window.recreateRenderer = recreateRenderer;
window.render = render;
window.setSceneColor = setSceneColor;
window.renderer = renderer;
window.mode = mode
window.labelMode = labelMode
window.mouse = mouse
window.raycaster = raycaster
window.camera = camera
window.labels = labels
window.rotateSelectedAtoms = rotateSelectedAtoms;
window.translateSelectedAtoms = translateSelectedAtoms;
window.updateAtomMatrix = updateAtomMatrix;
window.resetRotation = resetRotation;
window.finalizeRotation = finalizeRotation;
window.initializeRotationSystem = initializeRotationSystem;
window.rotationState = rotationState;
window.startMeasurement = null;
window.endMeasurement = null;

// Auto-initialize if the script is loaded after DOM is ready
if (document.readyState === 'loading') {
    document.addEventListener('DOMContentLoaded', initializeRotationSystem);
} else {
    initializeRotationSystem();
}
function attachMouseWheelRotation() {
    window.addEventListener('wheel', (e) => {
        if (!shiftDown || !rotationAxis || !main?.molecule?.atoms) return;

        // e.preventDefault();

        // Calculate rotation angle from wheel delta
        const angle = e.deltaY * 0.5; // Scale factor for sensitivity

        // Apply relative rotation
        rotateSelectedAtoms(angle, { relative: true });
    });
}
window.attachMouseWheelRotation = attachMouseWheelRotation
const buttonSound = new Audio()
buttonSound.src = "Create.wav"

document.querySelectorAll('button').forEach(button => {
    button.addEventListener('click', (event) => {
        buttonSound.play()
    });
});

function loopAround180(value) {
    if (value > 180 || value < -180) {
        let sign = value < 0 ? -1 : 1;
        let absVal = Math.abs(value);
        return sign * (absVal % 180);
    }
    return value;
}


document.addEventListener('DOMContentLoaded', () => {
    // Save molecule
    // In main.js, update the save-molecule-btn event listener:
    document.getElementById('save-molecule-btn')?.addEventListener('click', async () => {
        const nameInput = document.getElementById('molecule-name-input');
        const name = nameInput.value.trim();

        if (!name) {
            alert('Please enter a molecule name');
            return;
        }

        const saved = await saveMolecule(name);
        if (saved) {
            nameInput.value = '';

            const select = document.getElementById('molecules-list');
            if (select.style.display !== 'none') {
                const molecules = await loadMoleculesList();
                select.innerHTML = '<option value="">Select a molecule...</option>';
                molecules.forEach(mol => {
                    const option = document.createElement('option');
                    option.value = JSON.stringify(mol);
                    option.textContent = `${mol.name} (${mol.atomCount} atoms)`;
                    select.appendChild(option);
                });
            }
        }
    });

    // Load molecules list
    document.getElementById('load-molecules-btn')?.addEventListener('click', async () => {
        const molecules = await loadMoleculesList();
        const select = document.getElementById('molecules-list');
        const actions = document.getElementById('molecule-actions');

        if (molecules.length === 0) {
            alert('No saved molecules found');
            return;
        }

        // Clear and populate
        select.innerHTML = '<option value="">Select a molecule...</option>';
        molecules.forEach(mol => {
            const option = document.createElement('option');
            option.value = JSON.stringify(mol);
            option.textContent = `${mol.name} (${mol.atomCount} atoms)`;
            select.appendChild(option);
        });

        select.style.display = 'block';
        actions.style.display = 'block';
    });

    // Load selected
    document.getElementById('load-selected-btn')?.addEventListener('click', () => {
        const select = document.getElementById('molecules-list');
        if (!select.value) {
            alert('Please select a molecule');
            return;
        }

        const moleculeData = JSON.parse(select.value);
        resetIsolationState();
        loadMolecule(moleculeData);

        // Hide the selection UI
        select.style.display = 'none';
        document.getElementById('molecule-actions').style.display = 'none';
        console.log(moleculeData.data.fragments);
        fragments = moleculeData.data.fragments.map(f => f.atoms);

        // Reset isolation state - we're viewing the full molecule
        isInIsolationMode = false;
        isolationHistory = [];
        currentIsolationIndex = -1;
        originalMoleculeData = null;
        originalFragments = [];
        if (fragments.length > 0) {
            document.getElementById('createFragment').style.display = 'block';
        }
        // Update the fragment list UI
        updateFragmentList(document.getElementById('fragmentList'));
        updateEditingContent();
    });

    // Delete selected
    document.getElementById('delete-selected-btn')?.addEventListener('click', async () => {
        const select = document.getElementById('molecules-list');
        if (!select.value) {
            alert('Please select a molecule');
            return;
        }

        const moleculeData = JSON.parse(select.value);
        const deleted = await deleteMolecule(moleculeData.id);

        if (deleted) {
            // Refresh the list
            document.getElementById('load-molecules-btn').click();
        }
    });
});


const resetToDefaultsButton = document.getElementById('resetToDefaultButton');
if (resetToDefaultsButton) {
    resetToDefaultsButton.addEventListener('click', function () {
        resetToDefaults();
        updateStyles();
        render();
    });

}
function calculateBondLength(atom1, atom2) {
    const distance = atom1.position.distanceTo(atom2.position);
    return (distance / 4).toFixed(2); // Return distance with 3 decimal places
}

function calculateAngle(atom1, atom2, atom3) {
    // atom2 is the vertex/middle atom
    // Calculate vectors from middle atom to the other two
    const vector1 = new THREE.Vector3().subVectors(atom1.position, atom2.position);
    const vector2 = new THREE.Vector3().subVectors(atom3.position, atom2.position);

    // Calculate angle in radians, then convert to degrees
    const angleRadians = vector1.angleTo(vector2);
    const angleDegrees = (angleRadians * 180 / Math.PI).toFixed(1);

    return angleDegrees;
}
function calculateDihedral(atom1, atom2, atom3, atom4) {
    // Create vectors for the bonds
    const b1 = new THREE.Vector3().subVectors(atom2.position, atom1.position);
    const b2 = new THREE.Vector3().subVectors(atom3.position, atom2.position);
    const b3 = new THREE.Vector3().subVectors(atom4.position, atom3.position);

    // Calculate normal vectors to the planes
    const n1 = new THREE.Vector3().crossVectors(b1, b2).normalize();
    const n2 = new THREE.Vector3().crossVectors(b2, b3).normalize();

    // Calculate the dihedral angle
    const cosAngle = n1.dot(n2);
    const sinAngle = new THREE.Vector3().crossVectors(n1, n2).dot(b2.normalize());

    // Get angle in radians
    let angleRadians = Math.atan2(sinAngle, cosAngle);

    // Convert to 0-360 range instead of -180 to +180
    if (angleRadians < 0) {
        angleRadians += 2 * Math.PI;
    }

    // Convert to degrees
    const angleDegrees = (angleRadians * 180 / Math.PI).toFixed(1);

    return angleDegrees;
}
function createInfoLabel(atom1Index, atom2Index, atom3Index = null, atom4Index = null) {
    if (!main.molecule || !main.molecule.atoms || !main.molecule.instancedMesh) return;
    const atom1 = main.molecule.atoms[atom1Index];
    const atom2 = main.molecule.atoms[atom2Index];
    const atom3 = atom3Index !== null ? main.molecule.atoms[atom3Index] : null;
    const atom4 = atom4Index !== null ? main.molecule.atoms[atom4Index] : null;

    if (!atom1 || !atom2) return;

    // Get actual world positions from the instanced mesh
    const atom1WorldPos = getAtomWorldPosition(atom1Index, main.molecule.instancedMesh);
    const atom2WorldPos = getAtomWorldPosition(atom2Index, main.molecule.instancedMesh);
    const atom3WorldPos = atom3 ? getAtomWorldPosition(atom3Index, main.molecule.instancedMesh) : null;
    const atom4WorldPos = atom4 ? getAtomWorldPosition(atom4Index, main.molecule.instancedMesh) : null;

    // Determine measurement type
    const isDihedral = atom4 !== null;
    const isAngle = !isDihedral && atom3 !== null;

    // Calculate the value and position for the label
    let value, labelPosition, color;

    if (isDihedral) {
        // For dihedral: measure angle between two planes
        value = calculateDihedral(atom1, atom2, atom3, atom4) + "°";
        // Position label at the midpoint of the central bond (B-C)
        labelPosition = new THREE.Vector3()
            .addVectors(atom2WorldPos, atom3WorldPos)
            .multiplyScalar(0.5);
        color = "rgb(255, 140, 0)"; // Orange for dihedrals
    } else if (isAngle) {
        // For angle: atom2 is the vertex (middle atom)
        value = calculateAngle(atom1, atom2, atom3) + "°";
        // Position label closer to the vertex atom (atom2)
        const centroid = new THREE.Vector3()
            .add(atom1WorldPos)
            .add(atom2WorldPos)
            .add(atom3WorldPos)
            .divideScalar(3);
        labelPosition = new THREE.Vector3().lerpVectors(atom2WorldPos, centroid, 0.3);
        color = "rgb(221, 255, 0)"; // Yellow for angles
    } else {
        // For bond length: calculate midpoint between two atoms
        value = calculateBondLength(atom1, atom2);
        labelPosition = new THREE.Vector3()
            .addVectors(atom1WorldPos, atom2WorldPos)
            .multiplyScalar(0.5);
        color = "rgb(0, 170, 255)"; // Blue for bond lengths
    }

    // Create label element
    const labelDiv = document.createElement('div');
    labelDiv.className = isDihedral ? 'dihedral-label' : (isAngle ? 'angle-label' : 'bond-length-label');

    if (!isDihedral && !isAngle) {
        // For bond length: create an editable input that looks like a label
        const input = document.createElement('input');
        labelDiv.inputElement = input;  // Store reference for updateBondLengthLabel
        input.type = 'text';
        input.value = value;
        input.style.cssText = `
            color: ${color};
            font-family: 'Segoe UI', system-ui, sans-serif;
            font-size: 14px;
            font-weight: 600;
            background: transparent;
            border: none;
            padding: 2px 4px;
            text-align: center;
            width: 60px;
            cursor: text;
            outline: none;
            text-shadow: 
                -1px -1px 0 #000,
                1px -1px 0 #000,
                -1px 1px 0 #000,
                1px 1px 0 #000,
                0 0 3px rgba(0,0,0,0.9);
            transition: none!important;
        `;

        let justAppliedTransform = false; // Flag to prevent blur from resetting

        // Handle Enter key to apply distance
        // Handle Enter key to apply distance
        // Handle Enter key to apply distance
        input.addEventListener('keydown', (e) => {
            if (e.key === 'Enter') {
                const targetDistance = parseFloat(input.value);
                if (!isNaN(targetDistance) && targetDistance > 0) {
                    // Determine which atoms to move and which atom is the anchor
                    let atomsToMove = [];
                    let anchorAtomIndex;

                    if (atomsSelected.length > 0) {
                        // Check which label atom is in the selection
                        const atom1InSelection = atomsSelected.includes(atom1Index);
                        const atom2InSelection = atomsSelected.includes(atom2Index);

                        if (atom1InSelection && !atom2InSelection) {
                            // Move all selected atoms, anchor is atom2
                            atomsToMove = [...atomsSelected];
                            anchorAtomIndex = atom2Index;
                        } else if (atom2InSelection && !atom1InSelection) {
                            // Move all selected atoms, anchor is atom1
                            atomsToMove = [...atomsSelected];
                            anchorAtomIndex = atom1Index;
                        } else {
                            // If both or neither in selection, move atom2 only
                            atomsToMove = [atom2Index];
                            anchorAtomIndex = atom1Index;
                        }
                    } else {
                        // No selection - default to moving atom2 relative to atom1
                        atomsToMove = [atom2Index];
                        anchorAtomIndex = atom1Index;
                    }

                    // Get the reference atom from the label (the one in atomsToMove)
                    let referenceAtomIndex;
                    if (atomsToMove.includes(atom1Index)) {
                        referenceAtomIndex = atom1Index;
                    } else {
                        referenceAtomIndex = atom2Index;
                    }

                    // Convert from displayed units to internal units
                    const targetDistanceInternal = targetDistance * 4;
                    const anchorAtom = main.molecule.atoms[anchorAtomIndex];
                    const referenceAtom = main.molecule.atoms[referenceAtomIndex];

                    // Calculate translation needed
                    const currentVector = new THREE.Vector3().subVectors(referenceAtom.position, anchorAtom.position);
                    const currentDistance = currentVector.length();

                    if (currentDistance === 0) {
                        console.warn('Cannot set distance between atoms at the same position');
                        input.blur();
                        return;
                    }

                    const translationDistance = targetDistanceInternal - currentDistance;
                    const direction = currentVector.normalize();
                    const translationVector = direction.multiplyScalar(translationDistance);

                    // Move ALL atoms in the group by the same translation
                    atomsToMove.forEach(atomIdx => {
                        const atom = main.molecule.atoms[atomIdx];
                        atom.position.add(translationVector);
                        atom.x = atom.position.x;
                        atom.y = atom.position.y;
                        atom.z = atom.position.z;
                        updateAtomMatrix(atomIdx);
                    });

                    // Update everything
                    main.molecule.instancedMesh.instanceMatrix.needsUpdate = true;
                    main.molecule.updateBonds(main.mode);
                    if (main.molecule.labels && main.molecule.labels.length > 0) {
                        main.molecule.updateLabels();
                    }

                    // Set flag before updating labels and blurring
                    justAppliedTransform = true;

                    // Update all labels (this will update our input to the new correct value)
                    updateAllBondLengthLabels();

                    saveUndoState("Set Distance");
                    main.molecule.updateMainCoordinates();
                    render();

                    console.log(`Moved ${atomsToMove.length} atom(s) to set distance to ${targetDistance}`);

                    // Blur after everything is updated
                    input.blur();
                    return;
                }
                input.blur();
            } else if (e.key === 'Escape') {
                input.value = calculateBondLength(atom1, atom2);
                input.blur();
            }
        });

        // Focus effect
        input.addEventListener('focus', () => {
            input.style.textShadow = `
                -1px -1px 0 #000,
                1px -1px 0 #000,
                -1px 1px 0 #000,
                1px 1px 0 #000,
                0 0 8px ${color}`;
            input.select();
        });

        input.addEventListener('blur', () => {
            input.style.textShadow = `
                -1px -1px 0 #000,
                1px -1px 0 #000,
                -1px 1px 0 #000,
                1px 1px 0 #000,
                0 0 3px rgba(0,0,0,0.9)`;

            // Only reset value if we didn't just apply a transform
            if (!justAppliedTransform) {
                input.value = calculateBondLength(atom1, atom2);
            }

            // Reset the flag for next time
            justAppliedTransform = false;
        });

        labelDiv.appendChild(input);
        input.style.setProperty('transition', 'none', 'important');
        labelDiv.style.setProperty('transition', 'none', 'important');
        labelDiv.style.pointerEvents = 'auto';
        labelDiv.inputElement = input; // Store reference
    } else {
        labelDiv.textContent = value;
        labelDiv.style.cssText = `
            color: ${color};
            font-family: 'Segoe UI', system-ui, sans-serif;
            font-size: 14px;
            font-weight: 600;
            background: transparent;
            padding: 2px 4px;
            text-shadow: 
                -1px -1px 0 #000,
                1px -1px 0 #000,
                -1px 1px 0 #000,
                1px 1px 0 #000,
                0 0 3px rgba(0,0,0,0.9);
            pointer-events: none;
            transition: none;
        `;
    }

    // CREATE VISUALIZATION
    let visualElement;

    if (isDihedral) {
        // For dihedral: create two semi-transparent triangular planes
        const planeGroup = new THREE.Group();

        // First plane (A-B-C)
        const geometry1 = new THREE.BufferGeometry();
        const vertices1 = new Float32Array([
            atom1WorldPos.x, atom1WorldPos.y, atom1WorldPos.z,
            atom2WorldPos.x, atom2WorldPos.y, atom2WorldPos.z,
            atom3WorldPos.x, atom3WorldPos.y, atom3WorldPos.z
        ]);

        const colors1 = new Float32Array([
            1.0, 0.55, 0.0,  // Orange
            1.0, 0.55, 0.0,
            1.0, 1.0, 1.0    // Fade to white
        ]);

        const indices1 = new Uint16Array([0, 1, 2]);

        geometry1.setAttribute('position', new THREE.BufferAttribute(vertices1, 3));
        geometry1.setAttribute('color', new THREE.BufferAttribute(colors1, 3));
        geometry1.setIndex(new THREE.BufferAttribute(indices1, 1));
        geometry1.computeVertexNormals();

        const material1 = new THREE.MeshBasicMaterial({
            vertexColors: true,
            opacity: 0.3,
            transparent: true,
            side: THREE.DoubleSide,
            depthWrite: false,
            depthTest: true
        });

        const plane1 = new THREE.Mesh(geometry1, material1);
        planeGroup.add(plane1);

        // Second plane (B-C-D)
        const geometry2 = new THREE.BufferGeometry();
        const vertices2 = new Float32Array([
            atom2WorldPos.x, atom2WorldPos.y, atom2WorldPos.z,
            atom3WorldPos.x, atom3WorldPos.y, atom3WorldPos.z,
            atom4WorldPos.x, atom4WorldPos.y, atom4WorldPos.z
        ]);

        const colors2 = new Float32Array([
            1.0, 0.55, 0.0,  // Orange
            1.0, 0.55, 0.0,
            1.0, 1.0, 1.0    // Fade to white
        ]);

        const indices2 = new Uint16Array([0, 1, 2]);

        geometry2.setAttribute('position', new THREE.BufferAttribute(vertices2, 3));
        geometry2.setAttribute('color', new THREE.BufferAttribute(colors2, 3));
        geometry2.setIndex(new THREE.BufferAttribute(indices2, 1));
        geometry2.computeVertexNormals();

        const material2 = new THREE.MeshBasicMaterial({
            vertexColors: true,
            opacity: 0.3,
            transparent: true,
            side: THREE.DoubleSide,
            depthWrite: false,
            depthTest: true
        });

        const plane2 = new THREE.Mesh(geometry2, material2);
        planeGroup.add(plane2);

        // Add edge lines for the central bond (B-C)
        const centralBondGeometry = new THREE.BufferGeometry();
        const centralBondVertices = new Float32Array([
            atom2WorldPos.x, atom2WorldPos.y, atom2WorldPos.z,
            atom3WorldPos.x, atom3WorldPos.y, atom3WorldPos.z
        ]);
        centralBondGeometry.setAttribute('position', new THREE.BufferAttribute(centralBondVertices, 3));

        const centralBondMaterial = new THREE.LineBasicMaterial({
            color: 0xff8c00,  // Orange
            linewidth: 3,
            opacity: 0.8,
            transparent: true
        });

        const centralBondLine = new THREE.Line(centralBondGeometry, centralBondMaterial);
        planeGroup.add(centralBondLine);

        visualElement = planeGroup;

    } else if (isAngle) {
        // Existing angle visualization code
        const geometry = new THREE.BufferGeometry();
        const vertices = new Float32Array([
            atom1WorldPos.x, atom1WorldPos.y, atom1WorldPos.z,
            atom2WorldPos.x, atom2WorldPos.y, atom2WorldPos.z,
            atom3WorldPos.x, atom3WorldPos.y, atom3WorldPos.z
        ]);

        const colors = new Float32Array([
            1.0, 1.0, 1.0,
            0.0353, 1.0, 0.0,
            1.0, 1.0, 1.0,
        ]);

        const indices = new Uint16Array([0, 1, 2]);

        geometry.setAttribute('position', new THREE.BufferAttribute(vertices, 3));
        geometry.setAttribute('color', new THREE.BufferAttribute(colors, 3));
        geometry.setIndex(new THREE.BufferAttribute(indices, 1));
        geometry.computeVertexNormals();

        const material = new THREE.MeshBasicMaterial({
            vertexColors: true,
            opacity: 0.5,
            transparent: true,
            side: THREE.DoubleSide,
            depthWrite: false,
            depthTest: true
        });

        visualElement = new THREE.Mesh(geometry, material);

        const edgeGeometry = new THREE.EdgesGeometry(geometry);
        const edgeMaterial = new THREE.LineBasicMaterial({
            color: 0x00ff00,
            opacity: 0,
            transparent: true,
            linewidth: 2
        });
        const edges = new THREE.LineSegments(edgeGeometry, edgeMaterial);
        visualElement.add(edges);

    } else {
        // Existing bond length visualization code
        const geometry = new THREE.BufferGeometry();
        const positions = new Float32Array(6);

        positions[0] = atom1WorldPos.x;
        positions[1] = atom1WorldPos.y;
        positions[2] = atom1WorldPos.z;
        positions[3] = atom2WorldPos.x;
        positions[4] = atom2WorldPos.y;
        positions[5] = atom2WorldPos.z;

        geometry.setAttribute('position', new THREE.BufferAttribute(positions, 3));

        const material = new THREE.LineDashedMaterial({
            color: 0x52a3fa,
            linewidth: 2,
            scale: 1,
            dashSize: 0.2,
            gapSize: 0.2,
            opacity: 0.8,
            transparent: true,
            depthTest: true,
            depthWrite: false
        });

        visualElement = new THREE.Line(geometry, material);
        visualElement.computeLineDistances();
    }

    // Add the visual element to the scene
    scene.add(visualElement);

    // Store the label info
    const labelInfo = {
        element: labelDiv,
        atom1Index: atom1Index,
        atom2Index: atom2Index,
        atom3Index: atom3Index,
        atom4Index: atom4Index,
        midpoint: labelPosition,
        line: visualElement,
        isAngle: isAngle,
        isDihedral: isDihedral
    };

    bondLengthLabels.push(labelInfo);

    // Update label position on screen
    updateBondLengthLabel(labelInfo);

    // Add to DOM
    document.body.appendChild(labelDiv);
    render();
}

function showAllBondLengths() {
    if (!main.molecule || !main.molecule.bonds || main.molecule.bonds.length === 0) return;

    // Toggle: if labels exist, clear them; otherwise show all
    if (bondLengthLabels.length > 0) {
        clearAllBondLengthLabels();
    } else {
        main.molecule.bonds.forEach(bond => {
            const atom1Index = main.molecule.atoms.indexOf(bond.atom1);
            const atom2Index = main.molecule.atoms.indexOf(bond.atom2);
            if (atom1Index !== -1 && atom2Index !== -1) {
                createInfoLabel(atom1Index, atom2Index);
            }
        });
    }
    render();
}

document.getElementById('showAllBondLengths')?.addEventListener('click', showAllBondLengths);


function performRotationFromBase(targetAngle, atomIndices) {
    if (!rotationAxis || !rotationAxis.direction) return;

    const angleRadians = targetAngle * Math.PI / 180;
    const axis = rotationAxis.direction.clone().normalize();
    const point = rotationAxis.point.clone();
    const rotationMatrix = new THREE.Matrix4().makeRotationAxis(axis, angleRadians);

    atomIndices.forEach(idx => {
        const atom = main.molecule.atoms[idx];
        const basePos = baseAtomPositions[idx];

        if (basePos) {
            // Start from base position
            const tempPos = basePos.clone();

            // Translate to rotation point
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

            // Update visual representation
            updateAtomMatrix(idx);
        }
    });

    // Update the molecule
    main.molecule.instancedMesh.instanceMatrix.needsUpdate = true;
    mode = main.mode
    main.molecule.updateBonds(main.mode);
    if (main.molecule.labels && main.molecule.labels.length > 0) {
        main.molecule.updateLabels();
    }
}

// Translation function

// Enhanced keyup handler
window.addEventListener('keyup', function (e) {
    if (e.key === 'Shift') {
        shiftDown = false;
        controls.enabled = true;

        if (Object.keys(rotationBasePositions).length > 0) {
            saveUndoState("Fine-tune Transformation");
            main.molecule.updateMainCoordinates();
        }
    }
});



// Reset camera function
function resetCamera() {
    // Reset camera position
    camera.position.copy(initialCameraPosition);

    // Reset camera rotation by looking at origin
    camera.lookAt(initialCameraTarget);
    camera.up.set(0, 1, 0);

    // Reset controls target and update
    if (controls) {
        controls.target.copy(initialCameraTarget);
        controls.reset();
        controls.update();
    }

    // Trigger a render
    if (typeof render !== 'undefined') {
        render();
    }
    main.zoomCameraToFitMolecule();
    render();
}
window.resetCamera = resetCamera

// Function to update bond length label position
function updateBondLengthLabel(labelInfo) {
    if (!main.molecule || !main.molecule.atoms || !main.molecule.instancedMesh) return;
    const atom1 = main.molecule.atoms[labelInfo.atom1Index];
    const atom2 = main.molecule.atoms[labelInfo.atom2Index];
    const atom3 = labelInfo.atom3Index !== null ? main.molecule.atoms[labelInfo.atom3Index] : null;
    const atom4 = labelInfo.atom4Index !== null ? main.molecule.atoms[labelInfo.atom4Index] : null;

    if (!atom1 || !atom2) return;

    // Get actual world positions from the instanced mesh
    const atom1WorldPos = getAtomWorldPosition(labelInfo.atom1Index, main.molecule.instancedMesh);
    const atom2WorldPos = getAtomWorldPosition(labelInfo.atom2Index, main.molecule.instancedMesh);
    const atom3WorldPos = atom3 ? getAtomWorldPosition(labelInfo.atom3Index, main.molecule.instancedMesh) : null;
    const atom4WorldPos = atom4 ? getAtomWorldPosition(labelInfo.atom4Index, main.molecule.instancedMesh) : null;

    // Recalculate position based on type
    if (labelInfo.isDihedral) {
        // For dihedral: midpoint of central bond
        labelInfo.midpoint.addVectors(atom2WorldPos, atom3WorldPos).multiplyScalar(0.5);
    } else if (labelInfo.isAngle) {
        // For angle: position closer to vertex atom
        const centroid = new THREE.Vector3()
            .add(atom1WorldPos)
            .add(atom2WorldPos)
            .add(atom3WorldPos)
            .divideScalar(3);
        labelInfo.midpoint.lerpVectors(atom2WorldPos, centroid, 0.3);
    } else {
        // For bond length: midpoint between two atoms
        labelInfo.midpoint.addVectors(atom1WorldPos, atom2WorldPos).multiplyScalar(0.5);
    }

    // Convert 3D position to 2D screen position
    const screenPos = worldToScreen(labelInfo.midpoint, getActiveCamera());

    // Update label position
    labelInfo.element.style.position = 'absolute';
    labelInfo.element.style.left = `${screenPos.x}px`;
    labelInfo.element.style.top = `${screenPos.y}px`;
    labelInfo.element.style.transform = 'translate(-50%, -50%)';

    // Update value if atoms have moved
    if (labelInfo.isDihedral) {
        const newDihedral = calculateDihedral(atom1, atom2, atom3, atom4);
        labelInfo.element.textContent = `${newDihedral}°`;
    } else if (labelInfo.isAngle) {
        const newAngle = calculateAngle(atom1, atom2, atom3);
        labelInfo.element.textContent = `${newAngle}°`;
    } else {
        const newDistance = calculateBondLength(atom1, atom2);
        // Update input value if it exists and is not focused
        if (labelInfo.element.inputElement && document.activeElement !== labelInfo.element.inputElement) {
            labelInfo.element.inputElement.value = newDistance;
        } else if (!labelInfo.element.inputElement) {
            labelInfo.element.textContent = newDistance;
        }
    }

    // UPDATE THE VISUALIZATION GEOMETRY
    if (labelInfo.line) {
        if (labelInfo.isDihedral) {
            // Update both planes for dihedral
            const planeGroup = labelInfo.line;

            // Update first plane (A-B-C)
            const plane1 = planeGroup.children[0];
            const vertices1 = plane1.geometry.attributes.position.array;
            vertices1[0] = atom1WorldPos.x;
            vertices1[1] = atom1WorldPos.y;
            vertices1[2] = atom1WorldPos.z;
            vertices1[3] = atom2WorldPos.x;
            vertices1[4] = atom2WorldPos.y;
            vertices1[5] = atom2WorldPos.z;
            vertices1[6] = atom3WorldPos.x;
            vertices1[7] = atom3WorldPos.y;
            vertices1[8] = atom3WorldPos.z;
            plane1.geometry.attributes.position.needsUpdate = true;
            plane1.geometry.computeVertexNormals();

            // Update second plane (B-C-D)
            const plane2 = planeGroup.children[1];
            const vertices2 = plane2.geometry.attributes.position.array;
            vertices2[0] = atom2WorldPos.x;
            vertices2[1] = atom2WorldPos.y;
            vertices2[2] = atom2WorldPos.z;
            vertices2[3] = atom3WorldPos.x;
            vertices2[4] = atom3WorldPos.y;
            vertices2[5] = atom3WorldPos.z;
            vertices2[6] = atom4WorldPos.x;
            vertices2[7] = atom4WorldPos.y;
            vertices2[8] = atom4WorldPos.z;
            plane2.geometry.attributes.position.needsUpdate = true;
            plane2.geometry.computeVertexNormals();

            // Update central bond line
            const centralBond = planeGroup.children[2];
            const centralVertices = centralBond.geometry.attributes.position.array;
            centralVertices[0] = atom2WorldPos.x;
            centralVertices[1] = atom2WorldPos.y;
            centralVertices[2] = atom2WorldPos.z;
            centralVertices[3] = atom3WorldPos.x;
            centralVertices[4] = atom3WorldPos.y;
            centralVertices[5] = atom3WorldPos.z;
            centralBond.geometry.attributes.position.needsUpdate = true;

        } else if (labelInfo.isAngle) {
            // Update plane geometry for angle
            const geometry = labelInfo.line.geometry;
            const vertices = geometry.attributes.position.array;

            vertices[0] = atom1WorldPos.x;
            vertices[1] = atom1WorldPos.y;
            vertices[2] = atom1WorldPos.z;
            vertices[3] = atom2WorldPos.x;
            vertices[4] = atom2WorldPos.y;
            vertices[5] = atom2WorldPos.z;
            vertices[6] = atom3WorldPos.x;
            vertices[7] = atom3WorldPos.y;
            vertices[8] = atom3WorldPos.z;

            geometry.attributes.position.needsUpdate = true;
            geometry.computeVertexNormals();

            // Update the edge lines if they exist
            if (labelInfo.line.children[0]) {
                const edgeGeometry = labelInfo.line.children[0].geometry;
                edgeGeometry.dispose();
                labelInfo.line.children[0].geometry = new THREE.EdgesGeometry(geometry);
            }
        } else {
            // Update bond line
            const positions = labelInfo.line.geometry.attributes.position.array;
            positions[0] = atom1WorldPos.x;
            positions[1] = atom1WorldPos.y;
            positions[2] = atom1WorldPos.z;
            positions[3] = atom2WorldPos.x;
            positions[4] = atom2WorldPos.y;
            positions[5] = atom2WorldPos.z;

            labelInfo.line.geometry.attributes.position.needsUpdate = true;
            labelInfo.line.computeLineDistances();
        }
    }
}

function updateAllBondLengthLabels() {
    bondLengthLabels.forEach(labelInfo => {
        updateBondLengthLabel(labelInfo);
    });
}

function removeBondLengthLabel(index) {
    if (bondLengthLabels[index]) {
        // Remove the label from DOM
        document.body.removeChild(bondLengthLabels[index].element);

        // Remove the dotted line from the scene
        if (bondLengthLabels[index].line) {
            scene.remove(bondLengthLabels[index].line);
            // Dispose of geometry and material to free memory
            bondLengthLabels[index].line.geometry.dispose();
            bondLengthLabels[index].line.material.dispose();
        }

        bondLengthLabels.splice(index, 1);
    }
}

window.bondLengthLabels = bondLengthLabels;
window.removeBondLengthLabel = removeBondLengthLabel;

function clearAllBondLengthLabels() {
    bondLengthLabels.forEach(labelInfo => {
        // Remove label from DOM
        document.body.removeChild(labelInfo.element);

        // Remove dotted line from scene
        if (labelInfo.line) {
            scene.remove(labelInfo.line);
            // Dispose of geometry and material to free memory
            labelInfo.line.geometry.dispose();
            labelInfo.line.material.dispose();
        }
    });
    bondLengthLabels = [];
}



// Create context menu
function createContextMenu(x, y, atom1Index, atom2Index) {
    // Remove any existing context menu
    removeContextMenu();

    const menu = document.createElement('div');
    menu.id = 'atom-context-menu';
    menu.style.cssText = `
        position: absolute;
        left: ${x}px;
        top: ${y}px;
        background: rgba(30, 30, 30, 0.95);
        border: 1px solid #444;
        border-radius: 4px;
        padding: 4px 0;
        box-shadow: 2px 2px 10px rgba(0,0,0,0.5);
        z-index: 10000;
        min-width: 150px;
    `;

    // Check if label already exists for this pair
    const existingLabel = bondLengthLabels.findIndex(label =>
        (label.atom1Index === atom1Index && label.atom2Index === atom2Index) ||
        (label.atom1Index === atom2Index && label.atom2Index === atom1Index)
    );

    if (existingLabel === -1) {
        // Add "Show Bond Length" option
        const showLengthOption = document.createElement('div');
        showLengthOption.textContent = 'Show Bond Length';
        showLengthOption.style.cssText = `
            padding: 8px 16px;
            cursor: pointer;
            color: white;
            font-size: 14px;
            transition: background-color 0.2s;
        `;
        showLengthOption.onmouseover = () => {
            showLengthOption.style.backgroundColor = 'rgba(0, 132, 255, 0.3)';
        };
        showLengthOption.onmouseout = () => {
            showLengthOption.style.backgroundColor = 'transparent';
        };
        showLengthOption.onclick = () => {
            createInfoLabel(atom1Index, atom2Index);
            removeContextMenu();
        };
        menu.appendChild(showLengthOption);
    } else {
        // Add "Hide Bond Length" option
        const hideLengthOption = document.createElement('div');
        hideLengthOption.textContent = 'Hide Bond Length';
        hideLengthOption.style.cssText = `
            padding: 8px 16px;
            cursor: pointer;
            color: white;
            font-size: 14px;
            transition: background-color 0.2s;
        `;
        hideLengthOption.onmouseover = () => {
            hideLengthOption.style.backgroundColor = 'rgba(255, 0, 0, 0.3)';
        };
        hideLengthOption.onmouseout = () => {
            hideLengthOption.style.backgroundColor = 'transparent';
        };
        hideLengthOption.onclick = () => {
            removeBondLengthLabel(existingLabel);
            removeContextMenu();
        };
        menu.appendChild(hideLengthOption);
    }

    // Add separator
    const separator = document.createElement('hr');
    separator.style.cssText = `
        margin: 4px 0;
        border: none;
        border-top: 1px solid #444;
    `;
    menu.appendChild(separator);

    // Add "Clear All Labels" option
    const clearAllOption = document.createElement('div');
    clearAllOption.textContent = 'Clear All Labels';
    clearAllOption.style.cssText = `
        padding: 8px 16px;
        cursor: pointer;
        color: white;
        font-size: 14px;
        transition: background-color 0.2s;
    `;
    clearAllOption.onmouseover = () => {
        clearAllOption.style.backgroundColor = 'rgba(255, 132, 0, 0.3)';
    };
    clearAllOption.onmouseout = () => {
        clearAllOption.style.backgroundColor = 'transparent';
    };
    clearAllOption.onclick = () => {
        clearAllBondLengthLabels();
        removeContextMenu();
    };
    menu.appendChild(clearAllOption);

    document.body.appendChild(menu);
    contextMenuOpen = true;
}

// Remove context menu
function removeContextMenu() {
    const menu = document.getElementById('atom-context-menu');
    if (menu) {
        document.body.removeChild(menu);
    }
    contextMenuOpen = false;
}

function enhancedOnPointerDown(event) {
    // Call your existing onPointerDown logic first for left clicks
    if (event.button === 0) {
        // Your existing left-click code here
        onPointerDown(event);
    }

    // Handle right-click or two-finger tap
    if (event.button === 2) { // Right-click
        event.preventDefault();

        // Check if exactly 2 atoms are selected
        if (atomsSelected.length === 2) {
            const rect = renderer.domElement.getBoundingClientRect();
            const menuX = event.clientX;
            const menuY = event.clientY;

            createContextMenu(menuX, menuY, atomsSelected[0], atomsSelected[1]);
        }
    }
}

// Replace the existing event listener
renderer.domElement.removeEventListener('pointerdown', onPointerDown, false);
renderer.domElement.addEventListener('pointerdown', enhancedOnPointerDown, false);

// Prevent default context menu
renderer.domElement.addEventListener('contextmenu', (event) => {
    event.preventDefault();
    return false;
});

// Close context menu when clicking elsewhere
document.addEventListener('click', (event) => {
    if (contextMenuOpen && !event.target.closest('#atom-context-menu')) {
        removeContextMenu();
    }
});

if (controls) {
    controls.addEventListener('change', () => {
        updateAllBondLengthLabels();
    });
}

function onAtomsMoved() {
    updateAllBondLengthLabels();
}

function onMoleculeReset() {
    clearAllBondLengthLabels();
}

document.addEventListener('keydown', (event) => {
    // Press 'B' to show/hide measurements
    if (event.key === 'b' || event.key === 'B') {
        if (atomsSelected.length === 2) {
            // Bond length functionality for 2 atoms
            const existingLabel = bondLengthLabels.findIndex(label =>
                !label.isAngle && !label.isDihedral &&
                ((label.atom1Index === atomsSelected[0] && label.atom2Index === atomsSelected[1]) ||
                    (label.atom1Index === atomsSelected[1] && label.atom2Index === atomsSelected[0]))
            );

            if (existingLabel === -1) {
                // Create label
                labels.push([atomsSelected[0], atomsSelected[1]]);
                console.log(labels);
                createInfoLabel(atomsSelected[0], atomsSelected[1]);

                // Also create axis automatically
                const atom1 = main.molecule.atoms[atomsSelected[0]];
                const atom2 = main.molecule.atoms[atomsSelected[1]];

                const pos1 = atom1.position.clone();
                const pos2 = atom2.position.clone();

                rotationAxis = {
                    point: pos1.clone(),
                    direction: new THREE.Vector3().subVectors(pos2, pos1).normalize()
                };

                axisAtoms = [...atomsSelected];
                createAxisVisualizer(atom1, atom2);

                // Update UI to show axis controls
                const element = main.molecule.atoms[atomsSelected[0]].type;
                updateEditingContent(element, main.molecule.atomSettings[element].color);

                console.log('Created bond length label and axis');
            } else {
                // Remove both label and axis
                removeBondLengthLabel(existingLabel);

                // Remove axis
                rotationAxis = null;
                axisAtoms = [];
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

                console.log('Removed bond length label and axis');
            }
        } else if (atomsSelected.length === 3) {
            // Angle functionality for 3 atoms
            const existingLabel = bondLengthLabels.findIndex(label =>
                label.isAngle &&
                label.atom1Index === atomsSelected[0] &&
                label.atom2Index === atomsSelected[1] &&
                label.atom3Index === atomsSelected[2]
            );

            if (existingLabel === -1) {
                labels.push([atomsSelected[0], atomsSelected[1], atomsSelected[2]]);
                console.log(labels);
                createInfoLabel(atomsSelected[0], atomsSelected[1], atomsSelected[2]);
            } else {
                removeBondLengthLabel(existingLabel);
            }
        } else if (atomsSelected.length === 4) {
            // Dihedral angle functionality for 4 atoms
            const existingLabel = bondLengthLabels.findIndex(label =>
                label.isDihedral &&
                label.atom1Index === atomsSelected[0] &&
                label.atom2Index === atomsSelected[1] &&
                label.atom3Index === atomsSelected[2] &&
                label.atom4Index === atomsSelected[3]
            );

            if (existingLabel === -1) {
                labels.push([atomsSelected[0], atomsSelected[1], atomsSelected[2], atomsSelected[3]]);
                console.log('Creating dihedral measurement for atoms:', atomsSelected);
                createInfoLabel(atomsSelected[0], atomsSelected[1], atomsSelected[2], atomsSelected[3]);
            } else {
                removeBondLengthLabel(existingLabel);
            }
        }
    }

    // Press 'L' to clear all labels
    if (event.key === 'l' || event.key === 'L') {
        if (event.shiftKey) {
            clearAllBondLengthLabels();

            // Also remove axis
            rotationAxis = null;
            axisAtoms = [];
            if (axisVisualizer) {
                main.scene.remove(axisVisualizer);
                axisVisualizer.geometry.dispose();
                axisVisualizer.material.dispose();
                axisVisualizer = null;
            }
        }
    }
    if (event.key == ' ') {
        if (atomsSelected.length === 2) {
            const atom1 = main.molecule.atoms[atomsSelected[0]];
            const atom2 = main.molecule.atoms[atomsSelected[1]];

            const pos1 = atom1.position.clone();
            const pos2 = atom2.position.clone();

            rotationAxis = {
                point: pos1.clone(),
                direction: new THREE.Vector3().subVectors(pos2, pos1).normalize()
            };

            axisAtoms = [...atomsSelected];
            createAxisVisualizer(atom1, atom2);

            // Also create label if it doesn't exist
            const existingLabel = bondLengthLabels.findIndex(label =>
                !label.isAngle && !label.isDihedral &&
                ((label.atom1Index === atomsSelected[0] && label.atom2Index === atomsSelected[1]) ||
                    (label.atom1Index === atomsSelected[1] && label.atom2Index === atomsSelected[0]))
            );

            if (existingLabel === -1) {
                labels.push([atomsSelected[0], atomsSelected[1]]);
                createInfoLabel(atomsSelected[0], atomsSelected[1]);
            }

            updateEditingContent(atom1.type, main.molecule.atomSettings[atom1.type].color);
            console.log('Axis and label defined');
        }
    }
});

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

function createOrthoCamera() {
    const aspect = window.innerWidth / window.innerHeight;
    const frustumSize = 30;
    orthoCamera = new THREE.OrthographicCamera(
        -frustumSize * aspect / 2,
        frustumSize * aspect / 2,
        frustumSize / 2,
        -frustumSize / 2,
        0.1,
        1000000
    );
    orthoCamera.position.copy(camera.position);
    orthoCamera.lookAt(controls.target);
}

toggleOrthoCamera.addEventListener('change', () => {
    useOrthographic = toggleOrthoCamera.checked;

    if (useOrthographic) {
        if (!orthoCamera) createOrthoCamera();
        orthoCamera.position.copy(camera.position);
        orthoCamera.lookAt(controls.target);
        controls.object = orthoCamera;
    } else {
        camera.position.copy(orthoCamera.position);
        camera.lookAt(controls.target);
        controls.object = camera;
    }
    controls.update();
    render();
});

function animate() {
    window.fragments = fragments;
    requestAnimationFrame(animate);
    controls.update();
}
function render() {
    renderer.render(scene, getActiveCamera());
    updateAllBondLengthLabels();
    if (main.molecule && main.molecule.labelInstancedMesh && main.molecule.labelInstancedMesh.visible) {
        main.molecule.updateLabels();
    }
}

function updateRendererSize() {
    // Calculate available space accounting for open panels
    const aiPanel = document.getElementById('aiChatPanel');
    const explorerPanel = document.getElementById('fileExplorerPanel');

    const leftOffset = (aiPanel && aiPanel.classList.contains('open')) ? aiPanel.offsetWidth : 0;
    const rightOffset = (explorerPanel && explorerPanel.classList.contains('open')) ? explorerPanel.offsetWidth : 0;

    const width = window.innerWidth - leftOffset - rightOffset;
    const height = window.innerHeight;

    camera.aspect = width / height;
    camera.updateProjectionMatrix();

    if (orthoCamera) {
        const aspect = width / height;
        const frustumSize = 30;
        orthoCamera.left = -frustumSize * aspect / 2;
        orthoCamera.right = frustumSize * aspect / 2;
        orthoCamera.top = frustumSize / 2;
        orthoCamera.bottom = -frustumSize / 2;
        orthoCamera.updateProjectionMatrix();
    }

    renderer.setSize(width, height);
    renderer.domElement.style.marginLeft = leftOffset + 'px';

    // Center frame slider on canvas
    const frameSlider = document.getElementById('frameSliderContainer');
    if (frameSlider) {
        frameSlider.style.left = (leftOffset + width / 2) + 'px';
    }

    render();
}
window.addEventListener('resize', updateRendererSize);
window.updateRendererSize = updateRendererSize;
function toggleRibbon() {
    if (!window.main || !window.main.data) {
        alert('No molecule loaded');
        return;
    }

    if (!window.main.data.ribbonData) {
        alert('No protein backbone found - this molecule is not a protein');
        return;
    }

    ribbonMode = !ribbonMode;

    // Store current data and mode
    const currentData = window.main.data;
    const currentMode = window.main.mode;

    // Completely recreate the molecule in the new mode
    console.log(`Switching to ${ribbonMode ? 'ribbon' : 'ball-and-stick'} mode`);

    window.main.newMolecule(
        currentData,
        currentMode,
        true,
        false,
        ribbonMode  // Pass ribbonMode state
    );

    // Recenter camera
    window.main.zoomCameraToFitMolecule();
}

function disableAtomInteractions() {
    // Remove pointer event listeners
    renderer.domElement.removeEventListener('pointerdown', onPointerDown, false);
    renderer.domElement.removeEventListener('pointermove', onPointerMove2, false);
    renderer.domElement.style.cursor = 'default';

    // Clear any selections
    atomsSelected = [];
    hoveredAtom = null;

    // Hide editing panels
    const editPanel = document.getElementById('editMoleculePanel');
    if (editPanel) editPanel.classList.add('on');

    console.log('Atom interactions disabled');
}

function enableAtomInteractions() {
    // Re-attach pointer event listeners (avoid duplicates)
    renderer.domElement.removeEventListener('pointerdown', onPointerDown, false);
    renderer.domElement.removeEventListener('pointermove', onPointerMove2, false);

    renderer.domElement.addEventListener('pointerdown', onPointerDown, false);
    window.addEventListener('pointermove', onPointerMove2, false);

    console.log('Atom interactions enabled');
}

function testMoleculeFromJSON(json) {
    window.main.newMolecule(json, window.main.setNewMode(json.numAtoms <= 2000));
    window.main.zoomCameraToFitMolecule();
}
window.testMoleculeFromJSON = testMoleculeFromJSON;

window.toggleRibbon = toggleRibbon;
(function () {
    const panel = document.getElementById('dbSearchPanel');
    const input = document.getElementById('dbSearchInput');
    const dropdown = document.getElementById('dbSearchDropdown');
    const tbody = document.getElementById('dbSearchResults');
    const sourceSelect = document.getElementById('dbSourceSelect');
    panel.classList.add('active');

    if (!panel || !input || !dropdown || !tbody) return;

    const loader = panel.querySelector('.db-search-loader');
    let debounce;
    let activeIdx = -1;
    let items = [];

    // Update placeholder based on selected database
    sourceSelect?.addEventListener('change', () => {
        const placeholders = {
            pubchem: 'Search compounds (e.g., caffeine)...',
            pdb: 'Search PDB ID or name (e.g., 1CRN)...',
            chembl: 'Search ChEMBL (e.g., aspirin)...',
            drugbank: 'Enter DrugBank ID (e.g., DB00945)...'
        };
        input.placeholder = placeholders[sourceSelect.value] || 'Search molecules...';
        dropdown.classList.remove('show');
        items = [];
    });

    document.addEventListener('click', (e) => {
        if (window.dbSearchJustResized) return;
        if (!panel.contains(e.target)) dropdown.classList.remove('show');
    });

    input.addEventListener('focus', () => {
        if (items.length > 0) dropdown.classList.add('show');
    });

    input.oninput = (e) => {
        const q = e.target.value.trim();
        clearTimeout(debounce);
        if (q.length < 2) {
            dropdown.classList.remove('show');
            return;
        }
        loader.classList.add('show');
        debounce = setTimeout(() => search(q), 300);
    };

    async function search(q) {
        const source = sourceSelect?.value || 'pubchem';
        try {
            switch (source) {
                case 'pubchem': await searchPubChem(q); break;
                case 'pdb': await searchPDB(q); break;
                case 'chembl': await searchChEMBL(q); break;
                case 'drugbank': await searchDrugBank(q); break;
            }
        } catch (err) {
            console.error(err);
            tbody.innerHTML = '<tr><td colspan="3" class="db-search-empty">Search failed</td></tr>';
            dropdown.classList.add('show');
        } finally {
            loader.classList.remove('show');
        }
    }

    // PubChem search with descriptions for ALL results
    async function searchPubChem(q) {
        const res = await fetch(`https://pubchem.ncbi.nlm.nih.gov/rest/autocomplete/compound/${encodeURIComponent(q)}/json?limit=8`);
        const data = await res.json();
        const names = data.dictionary_terms?.compound || [];

        if (!names.length) {
            items = [];
            showResults([]);
            return;
        }

        // Fetch CIDs for each name in parallel
        const cidPromises = names.map(name =>
            fetch(`https://pubchem.ncbi.nlm.nih.gov/rest/pug/compound/name/${encodeURIComponent(name)}/cids/JSON`)
                .then(r => r.json())
                .then(d => ({ name, cid: d.IdentifierList?.CID?.[0] }))
                .catch(() => ({ name, cid: null }))
        );

        const cidResults = await Promise.all(cidPromises);
        const validCids = cidResults.filter(r => r.cid).map(r => r.cid);

        // Map name to CID
        const nameToCid = {};
        cidResults.forEach(r => nameToCid[r.name] = r.cid);

        // Fetch descriptions for all CIDs at once
        const cidDesc = {};
        if (validCids.length) {
            try {
                const descRes = await fetch(`https://pubchem.ncbi.nlm.nih.gov/rest/pug/compound/cid/${validCids.join(',')}/description/JSON`);
                const descData = await descRes.json();
                (descData.InformationList?.Information || []).forEach(d => {
                    if (d.Description && !cidDesc[d.CID]) cidDesc[d.CID] = d.Description;
                });
            } catch (e) { /* ignore */ }
        }

        items = names;
        showResults(names.map(name => ({
            name,
            source: 'PubChem',
            type: cidDesc[nameToCid[name]] || 'Compound'
        })));
    }

    // RCSB PDB search
    async function searchPDB(q) {
        const query = q.trim().toUpperCase();

        // Check if it looks like a PDB ID (4 characters, starts with number)
        const isPdbId = /^\d[A-Z0-9]{3}$/i.test(query);

        const searchQuery = isPdbId ? {
            type: 'terminal',
            service: 'text',
            parameters: {
                attribute: 'rcsb_entry_container_identifiers.entry_id',
                operator: 'exact_match',
                value: query
            }
        } : {
            type: 'terminal',
            service: 'full_text',
            parameters: { value: q }
        };

        const res = await fetch('https://search.rcsb.org/rcsbsearch/v2/query', {
            method: 'POST',
            headers: { 'Content-Type': 'application/json' },
            body: JSON.stringify({
                query: searchQuery,
                return_type: 'entry',
                request_options: { paginate: { start: 0, rows: 15 } }
            })
        });
        const data = await res.json();
        items = data.result_set?.map(r => r.identifier) || [];
        showResults(items.map(id => ({ name: id, source: 'PDB', type: 'Structure' })));
    }

    // ChEMBL search
    async function searchChEMBL(q) {
        const res = await fetch(`https://www.ebi.ac.uk/chembl/api/data/molecule/search?q=${encodeURIComponent(q)}&format=json&limit=15`);
        const data = await res.json();
        items = data.molecules || [];
        showResults(items.map(m => ({
            name: m.pref_name || m.molecule_chembl_id,
            id: m.molecule_chembl_id,
            source: 'ChEMBL',
            type: 'Molecule'
        })));
    }

    // DrugBank (direct ID lookup)
    async function searchDrugBank(q) {
        // DrugBank doesn't have a public search API, show direct ID entry
        items = [{ name: q.toUpperCase(), source: 'DrugBank', type: 'Drug ID' }];
        showResults(items);
    }

    function showResults(list) {
        if (!list.length) {
            tbody.innerHTML = '<tr><td colspan="3" class="db-search-empty">No results found</td></tr>';
            dropdown.classList.add('show');
            return;
        }

        tbody.innerHTML = list.slice(0, 15).map((item, i) => `
        <tr data-i="${i}" data-name="${item.name}" data-id="${item.id || item.name}" data-source="${item.source}">
            <td class="col-name" title="${item.name}">${item.name}</td>
            <td class="col-type">${item.source}</td>
            <td class="col-desc" title="Click to expand">${item.type || ''}</td>
        </tr>
    `).join('');

        dropdown.classList.add('show');
        activeIdx = -1;

        tbody.querySelectorAll('tr[data-name]').forEach(row => {
            row.onclick = (e) => {
                if (e.target.classList.contains('col-desc')) {
                    e.stopPropagation();
                    // Collapse others first
                    tbody.querySelectorAll('.col-desc.expanded').forEach(el => {
                        if (el !== e.target) el.classList.remove('expanded');
                    });
                    e.target.classList.toggle('expanded');
                    return;
                }
                load(row.dataset.name, row.dataset.source, row.dataset.id);
            };
        });
    }

    input.onkeydown = (e) => {
        const rows = tbody.querySelectorAll('tr[data-name]');
        if (e.key === 'ArrowDown') {
            e.preventDefault();
            activeIdx = Math.min(activeIdx + 1, rows.length - 1);
            updateActive(rows);
        } else if (e.key === 'ArrowUp') {
            e.preventDefault();
            activeIdx = Math.max(activeIdx - 1, 0);
            updateActive(rows);
        } else if (e.key === 'Enter') {
            e.preventDefault();
            if (activeIdx >= 0 && rows[activeIdx]) {
                const row = rows[activeIdx];
                load(row.dataset.name, row.dataset.source, row.dataset.id);
            }
        } else if (e.key === 'Escape') {
            dropdown.classList.remove('show');
        }
    };

    function updateActive(rows) {
        rows.forEach((row, i) => {
            row.classList.toggle('active', i === activeIdx);
            if (i === activeIdx) row.scrollIntoView({ block: 'nearest', behavior: 'smooth' });
        });
    }

    async function load(name, source, id) {
        dropdown.classList.remove('show');
        input.value = name;
        loader.classList.add('show');

        try {
            switch (source) {
                case 'PubChem': await loadPubChem(name); break;
                case 'PDB': await loadPDB(name); break;
                case 'ChEMBL': await loadChEMBL(id || name); break;
                case 'DrugBank': await loadDrugBank(name); break;
                default: await loadPubChem(name);
            }
        } catch (err) {
            console.error('Load error:', err);
            alert('Failed to load: ' + err.message);
        } finally {
            loader.classList.remove('show');
        }
    }

    // Load from PubChem
    async function loadPubChem(name) {
        const cidRes = await fetch(`https://pubchem.ncbi.nlm.nih.gov/rest/pug/compound/name/${encodeURIComponent(name)}/cids/JSON`);
        const cidData = await cidRes.json();
        const cid = cidData.IdentifierList.CID[0];

        const sdfRes = await fetch(`https://pubchem.ncbi.nlm.nih.gov/rest/pug/compound/cid/${cid}/record/SDF?record_type=3d`);
        if (!sdfRes.ok) throw new Error('3D structure unavailable');

        const sdfText = await sdfRes.text();
        const molData = parseSDF(sdfText);
        loadMolecule(molData);
    }

    // Load from RCSB PDB
    // Load from RCSB PDB - handles huge files like 4v88
    async function loadPDB(pdbId) {
        // Try compressed mmCIF first (smallest), then compressed PDB, then uncompressed
        const urls = [
            `https://files.rcsb.org/download/${pdbId}.cif.gz`,
            `https://files.rcsb.org/download/${pdbId}.pdb.gz`,
            `https://files.rcsb.org/download/${pdbId}.cif`,
            `https://files.rcsb.org/download/${pdbId}.pdb`
        ];

        let data = null;
        let ext = 'pdb';

        for (const url of urls) {
            try {
                const res = await fetch(url);
                if (!res.ok) continue;

                const isGzip = url.endsWith('.gz');
                ext = url.includes('.cif') ? 'cif' : 'pdb';

                if (isGzip) {
                    const buffer = await res.arrayBuffer();
                    const ds = new DecompressionStream('gzip');
                    const decompressed = new Response(new Blob([buffer]).stream().pipeThrough(ds));
                    data = await decompressed.text();
                } else {
                    data = await res.text();
                }
                break;
            } catch (e) {
                continue;
            }
        }

        if (!data) throw new Error('PDB structure not found');

        const blob = new Blob([data], { type: 'text/plain' });
        const file = new File([blob], `${pdbId}.${ext}`);
        window.main?.loader?.handleFile({ target: { files: [file] } }, false);
    }

    // Load from ChEMBL
    async function loadChEMBL(chemblId) {
        const res = await fetch(`https://www.ebi.ac.uk/chembl/api/data/molecule/${chemblId}?format=json`);
        if (!res.ok) throw new Error('ChEMBL molecule not found');

        const data = await res.json();
        const molfile = data.molecule_structures?.molfile;
        if (!molfile) throw new Error('No structure available');

        const molData = parseSDF(molfile);
        loadMolecule(molData);
    }

    // Load from DrugBank (requires structure file URL - limited without API key)
    async function loadDrugBank(drugId) {
        // Try PubChem as fallback since DrugBank API is restricted
        alert('DrugBank requires API access. Searching PubChem for: ' + drugId);
        await loadPubChem(drugId);
    }

    function parseSDF(sdfText) {
        const lines = sdfText.split('\n');
        const countsLine = lines[3];
        const numAtoms = parseInt(countsLine.slice(0, 3));
        const atomData = [];

        for (let i = 4; i < 4 + numAtoms; i++) {
            const line = lines[i];
            if (!line || line.length < 34) continue;
            const x = parseFloat(line.slice(0, 10).trim());
            const y = parseFloat(line.slice(10, 20).trim());
            const z = parseFloat(line.slice(20, 30).trim());
            const element = line.slice(31, 34).trim();
            atomData.push({ element, x, y, z });
        }

        return { atomData, numAtoms };
    }

    function loadMolecule(molData) {
        // Clear frames and hide slider when loading from database
        window.xyzFrames = null;
        const frameSliderContainer = document.getElementById('frameSliderContainer');
        if (frameSliderContainer) {
            frameSliderContainer.style.display = 'none';
        }

        window.main.newMolecule(molData, window.main.setNewMode(molData.numAtoms <= 2000));
        window.main.zoomCameraToFitMolecule();
    }

    (function () {
        const panel = document.getElementById('dbSearchPanel');
        if (!panel) return;

        const resizerLeft = panel.querySelector('.db-search-resizer-left');
        const resizerRight = panel.querySelector('.db-search-resizer-right');
        const resizerBottom = panel.querySelector('.db-search-resizer-bottom');

        let isResizing = false;
        let currentResizer = null;
        let startX, startY, startWidth, startHeight;

        function onMouseDown(e, resizer) {
            isResizing = true;
            currentResizer = resizer;
            startX = e.clientX;
            startY = e.clientY;
            startWidth = panel.offsetWidth;
            startHeight = panel.offsetHeight;

            document.body.style.cursor = resizer === 'bottom' ? 'ns-resize' : 'ew-resize';
            document.body.style.userSelect = 'none';
            e.preventDefault();
        }

        function onMouseMove(e) {
            if (!isResizing) return;

            if (currentResizer === 'right') {
                const newWidth = startWidth + ((e.clientX - startX) * 2);
                panel.style.width = Math.max(280, Math.min(800, newWidth)) + 'px';
            } else if (currentResizer === 'left') {
                const delta = (startX - e.clientX) * 2;
                const newWidth = startWidth + delta;
                if (newWidth >= 280 && newWidth <= 800) {
                    panel.style.width = newWidth + 'px';
                }
            } else if (currentResizer === 'bottom') {
                const newHeight = startHeight + (e.clientY - startY);
                panel.style.height = Math.max(94, Math.min(500, newHeight)) + 'px';
                const dropdown = document.getElementById('dbSearchDropdown');
                if (dropdown && dropdown.classList.contains('show')) {
                    dropdown.style.maxHeight = (newHeight - 100) + 'px';
                }
            }
        }

        function onMouseUp() {
            if (isResizing) {
                isResizing = false;
                currentResizer = null;
                document.body.style.cursor = '';
                document.body.style.userSelect = '';

                // Prevent click-outside from closing panel
                window.dbSearchJustResized = true;
                setTimeout(() => { window.dbSearchJustResized = false; }, 100);
            }
        }

        resizerLeft?.addEventListener('mousedown', (e) => onMouseDown(e, 'left'));
        resizerRight?.addEventListener('mousedown', (e) => onMouseDown(e, 'right'));
        resizerBottom?.addEventListener('mousedown', (e) => onMouseDown(e, 'bottom'));

        document.addEventListener('mousemove', onMouseMove);
        document.addEventListener('mouseup', onMouseUp);
    })();
})();
window.labelIndexMode = false;

// ADD this event listener (put it with other DOM event listeners):
document.getElementById('labelModeBtn').addEventListener('click', () => {
    if (!main.molecule || !main.molecule.atoms || main.molecule.atoms.length === 0) {
        return;
    }

    window.labelIndexMode = !window.labelIndexMode;
    document.getElementById('labelModeBtn').textContent =
        `Mode: ${window.labelIndexMode ? 'Indices' : 'Elements'}`;

    if (labelMode) {
        main.toggleLabels(true);
        render();
    }
});
render();
controls.addEventListener('change', () => {
    render();
});

// Export THREE.js
window.THREE = THREE;

// Export functions
window.selectAtom = selectAtom;
window.unselectAtom = unselectAtom;
window.rotateSelectedAtoms = rotateSelectedAtoms;
window.translateSelectedAtoms = translateSelectedAtoms;
window.updateEditingContent = updateEditingContent;
window.attachButtonEventListeners = attachButtonEventListeners;
window.rotateCamera = rotateCamera;
window.render = render;
window.initializeRotationState = initializeRotationState;
window.updateMoleculeVisualization = updateMoleculeVisualization;
window.createInfoLabel = createInfoLabel;
window.removeBondLengthLabel = removeBondLengthLabel;
window.clearAllBondLengthLabels = clearAllBondLengthLabels;
window.calculateBondLength = calculateBondLength;
window.calculateAngle = calculateAngle;
window.updateFragmentList = updateFragmentList;
window.updateEditingContent = updateEditingContent;

window.exportToXYZ = function (name = 'molecule') {
    const atoms = window.main?.data?.atomData;
    if (!atoms?.length) return null;

    let content = `${atoms.length}\n${name}\n`;
    atoms.forEach(a => {
        content += `${a.element.padEnd(4)} ${a.x.toFixed(6).padStart(12)} ${a.y.toFixed(6).padStart(12)} ${a.z.toFixed(6).padStart(12)}\n`;
    });
    return content;
};

window.exportToPDB = function () {
    const atoms = window.main?.data?.atomData;
    if (!atoms?.length) return null;

    // Calculate bonds
    const bonds = new Map(); // atom index -> array of bonded atom indices
    const covalentRadii = {
        'H': 0.31, 'C': 0.76, 'N': 0.71, 'O': 0.66, 'F': 0.57, 'P': 1.07, 'S': 1.05,
        'Cl': 1.02, 'Br': 1.20, 'I': 1.39, 'B': 0.84, 'Si': 1.11, 'Se': 1.20,
        'default': 0.77
    };

    const getRadius = (el) => covalentRadii[el] || covalentRadii['default'];

    for (let i = 0; i < atoms.length; i++) {
        bonds.set(i + 1, []);
        for (let j = i + 1; j < atoms.length; j++) {
            const a1 = atoms[i], a2 = atoms[j];
            const dx = a1.x - a2.x, dy = a1.y - a2.y, dz = a1.z - a2.z;
            const dist = Math.sqrt(dx * dx + dy * dy + dz * dz);
            const maxBondDist = (getRadius(a1.element) + getRadius(a2.element)) * 1.3;

            if (dist <= maxBondDist && dist > 0.4) {
                bonds.get(i + 1).push(j + 1);
                if (!bonds.has(j + 1)) bonds.set(j + 1, []);
                bonds.get(j + 1).push(i + 1);
            }
        }
    }

    let content = '';

    // ATOM records
    atoms.forEach((a, i) => {
        const serial = (i + 1).toString().padStart(5);
        const name = a.element.padStart(2).padEnd(4);
        const resName = 'MOL';
        const chainId = 'A';
        const resSeq = '1'.padStart(4);
        const x = a.x.toFixed(3).padStart(8);
        const y = a.y.toFixed(3).padStart(8);
        const z = a.z.toFixed(3).padStart(8);
        const occupancy = '1.00'.padStart(6);
        const tempFactor = '0.00'.padStart(6);
        const element = a.element.padStart(2);

        content += `HETATM${serial} ${name} ${resName} ${chainId}${resSeq}    ${x}${y}${z}${occupancy}${tempFactor}          ${element}\n`;
    });

    // CONECT records
    bonds.forEach((connected, atomNum) => {
        if (connected.length > 0) {
            let conect = `CONECT${atomNum.toString().padStart(5)}`;
            connected.forEach(c => {
                conect += c.toString().padStart(5);
            });
            content += conect + '\n';
        }
    });

    content += 'END\n';
    return content;
};

window.exportToSDF = function (name = 'molecule') {
    const atoms = window.main?.data?.atomData;
    if (!atoms?.length) return null;

    // Calculate bonds based on covalent radii
    const bonds = [];
    const covalentRadii = {
        'H': 0.31, 'C': 0.76, 'N': 0.71, 'O': 0.66, 'F': 0.57, 'P': 1.07, 'S': 1.05,
        'Cl': 1.02, 'Br': 1.20, 'I': 1.39, 'B': 0.84, 'Si': 1.11, 'Se': 1.20,
        'default': 0.77
    };

    const getRadius = (el) => covalentRadii[el] || covalentRadii['default'];

    for (let i = 0; i < atoms.length; i++) {
        for (let j = i + 1; j < atoms.length; j++) {
            const a1 = atoms[i], a2 = atoms[j];
            const dx = a1.x - a2.x, dy = a1.y - a2.y, dz = a1.z - a2.z;
            const dist = Math.sqrt(dx * dx + dy * dy + dz * dz);
            const maxBondDist = (getRadius(a1.element) + getRadius(a2.element)) * 1.3;

            if (dist <= maxBondDist && dist > 0.4) {
                bonds.push({ i: i + 1, j: j + 1, order: 1 });
            }
        }
    }

    const numAtoms = atoms.length.toString().padStart(3);
    const numBonds = bonds.length.toString().padStart(3);

    let content = `${name}\n`;
    content += `  ChopChopMol\n\n`;
    content += `${numAtoms}${numBonds}  0  0  0  0  0  0  0  0999 V2000\n`;

    // Atom block
    atoms.forEach(a => {
        const x = a.x.toFixed(4).padStart(10);
        const y = a.y.toFixed(4).padStart(10);
        const z = a.z.toFixed(4).padStart(10);
        const element = ` ${a.element.padEnd(3)}`;
        content += `${x}${y}${z}${element} 0  0  0  0  0  0  0  0  0  0  0  0\n`;
    });

    // Bond block
    bonds.forEach(b => {
        const i = b.i.toString().padStart(3);
        const j = b.j.toString().padStart(3);
        const order = b.order.toString().padStart(3);
        content += `${i}${j}${order}  0  0  0  0\n`;
    });

    content += 'M  END\n';
    return content;
};

window.exportToMol2 = function (name = 'molecule') {
    const atoms = window.main?.data?.atomData;
    if (!atoms?.length) return null;

    let content = `@<TRIPOS>MOLECULE\n${name}\n${atoms.length} 0 0 0 0\nSMALL\nNO_CHARGES\n\n@<TRIPOS>ATOM\n`;

    atoms.forEach((a, i) => {
        const id = (i + 1).toString().padStart(7);
        const name = `${a.element}${i + 1}`.padEnd(8);
        const x = a.x.toFixed(4).padStart(10);
        const y = a.y.toFixed(4).padStart(10);
        const z = a.z.toFixed(4).padStart(10);
        const type = a.element.padEnd(6);
        content += `${id} ${name}${x}${y}${z} ${type}    1 MOL         0.0000\n`;
    });

    return content;
};

window.exportToFormat = function (format, name = 'molecule') {
    switch (format) {
        case 'pdb': return window.exportToPDB();
        case 'mol': case 'sdf': return window.exportToSDF(name);
        case 'mol2': return window.exportToMol2(name);
        case 'xyz': default: return window.exportToXYZ(name);
    }
};

// Export variables using defineProperty to keep in sync
Object.defineProperty(window, 'atomsSelected', {
    get: function () { return atomsSelected; },
    set: function (val) { atomsSelected = val; },
    configurable: true
});

Object.defineProperty(window, 'rotationAxis', {
    get: function () { return rotationAxis; },
    set: function (val) { rotationAxis = val; },
    configurable: true
});

Object.defineProperty(window, 'axisAtoms', {
    get: function () { return axisAtoms; },
    set: function (val) { axisAtoms = val; },
    configurable: true
});

Object.defineProperty(window, 'rotationState', {
    get: function () { return rotationState; },
    set: function (val) { rotationState = val; },
    configurable: true
});

Object.defineProperty(window, 'labelMode', {
    get: function () { return labelMode; },
    set: function (val) { labelMode = val; },
    configurable: true
});

Object.defineProperty(window, 'ribbonMode', {
    get: function () { return typeof ribbonMode !== 'undefined' ? ribbonMode : false; },
    set: function (val) { if (typeof ribbonMode !== 'undefined') ribbonMode = val; },
    configurable: true
});

Object.defineProperty(window, 'fragments', {
    get: function () { return fragments; },
    set: function (val) { fragments = val; },
    configurable: true
});
Object.defineProperty(window, 'bondLengthLabels', {
    get: function () { return bondLengthLabels; },
    set: function (val) { bondLengthLabels = val; },
    configurable: true
});


animate();