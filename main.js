import * as THREE from 'three';
import { OrbitControls } from 'jsm/controls/OrbitControls.js';
import { TrackballControls } from 'jsm/controls/TrackballControls.js';
import Molecule from './atom/molecule.js';
import FileHandler from './utils/fileHandler.js';
// WE WILL NOW TRY TO MAKE THIS AMAZING WEBSITE AN APP. IT MAY GO AMAZINGLY OR IT MAY GO HORRIBLY.

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
    mode = main.setNewMode(true);
    main.newMolecule(main.data, main.mode, false, { x: 0, y: 0, z: 0 }, { x: 0, y: 0, z: 0 });
}

toggleStyleChanges.addEventListener('change', () => {
    if (mode == 0) {
        mode = main.setNewMode(true);
    } else {
        mode = main.setNewMode();
    }
    main.newMolecule(main.data, main.mode, false, { x: 0, y: 0, z: 0 }, { x: 0, y: 0, z: 0 });
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
    // console.log(mode);
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
    console.log(window.imgToAnalyze);
})

// editMoleculeButton.addEventListener('click', () => {
//     editMoleculePanel.classList.toggle('on');
//     editingMolecule = !editingMolecule;
//     console.log(editingMolecule);
// })
renderer.domElement.addEventListener('pointerdown', onPointerDown, false);

// 3D to 2D projection for atoms
function worldToScreen(worldPos, camera) {
    projectionVector.copy(worldPos);
    projectionVector.project(camera);

    const x = (projectionVector.x * 0.5 + 0.5) * window.innerWidth;
    const y = (projectionVector.y * -0.5 + 0.5) * window.innerHeight;

    return { x, y };
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

    // For box selection, we want to show what WOULD be selected
    // Clear visual selection for all atoms first
    unselectAtom();

    // Show selection for: existing selected atoms + atoms in box
    const allSelected = [...new Set([...atomsSelected, ...atomsInBox])];

    allSelected.forEach(idx => {
        selectAtom(idx);
    });

    console.log('Preview selection:', allSelected);

    // Update UI
    if (allSelected.length > 0) {
        editMoleculePanel.classList.remove('on');
        const element = main.molecule.atoms[allSelected[0]].type;
        updateEditingContent(element, main.molecule.atomSettings[element].color);
    } else {
        editMoleculePanel.classList.add('on');
    }
}

// Add to your existing window event listeners
window.addEventListener('pointermove', onSelectionMove, false);
window.addEventListener('pointerup', onSelectionUp, false);

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
            console.log('Final selected atoms:', atomsSelected);
        }

        render();
    }
}

function onPointerDown(event) {
    if (editingMolecule) {
        // Convert mouse to normalized device coordinates
        const rect = renderer.domElement.getBoundingClientRect();
        mouse.x = ((event.clientX - rect.left) / rect.width) * 2 - 1;
        mouse.y = -((event.clientY - rect.top) / rect.height) * 2 + 1;

        if (event.button === 0) { // Left click
            raycaster.setFromCamera(mouse, camera);
            const intersects = raycaster.intersectObject(main.molecule.instancedMesh);

            if (intersects.length > 0) {
                // Clicking on an atom
                const instanceId = intersects[0].instanceId;
                if (instanceId !== undefined) {
                    if (cmdDown) {
                        // Cmd + click: toggle atom in selection
                        if (atomsSelected.includes(instanceId)) {
                            // Remove from selection
                            atomsSelected = atomsSelected.filter(id => id !== instanceId);
                            unselectAtom(instanceId);
                        } else {
                            // Add to selection
                            atomsSelected.push(instanceId);
                            selectAtom(instanceId);
                        }
                        console.log('Selected atoms:', atomsSelected);
                    } else {
                        // Normal click: select only this atom
                        atomsSelected = [instanceId];
                        unselectAtom(); // Clear all
                        selectAtom(instanceId);
                        console.log('Selected atoms:', atomsSelected);
                    }

                    render();

                    if (atomsSelected.length > 0) {
                        editMoleculePanel.classList.remove('on');
                        const element = main.molecule.atoms[atomsSelected[0]].type;
                        updateEditingContent(element, main.molecule.atomSettings[element].color);
                    }

                    // Your existing button event listeners...
                    document.getElementById('changeAtomBtn').addEventListener('click', () => {
                        const replacingMolecule = window.prompt("Enter the element you want to replace the current atom with");
                        main.data.atomData[instanceId].element = replacingMolecule
                        if (replacingMolecule) {
                            main.newMolecule(main.data, main.mode, false, { x: 0, y: 0, z: 0 }, { x: 0, y: 0, z: 0 });
                        }
                    });
                    document.getElementById('removeAtomBtn').addEventListener('click', () => {
                        main.data.atomData.splice(instanceId, 1);
                        main.data.numAtoms--;
                        main.newMolecule(main.data, main.mode, false, { x: 0, y: 0, z: 0 }, { x: 0, y: 0, z: 0 });
                    });
                    document.getElementById('createFragment').addEventListener('click', () => {
                        const fragment = atomsSelected
                        fragments.push(fragment)
                        addToList(fragment, document.getElementById('fragmentList'))
                    });

                    if (shiftDown) {
                        // Your existing drag logic...
                        dragging = true;
                        const atom = main.molecule.atoms[instanceId];
                        dragPlane.setFromNormalAndCoplanarPoint(
                            camera.getWorldDirection(new THREE.Vector3()),
                            atom.position
                        );
                        dragOffsets = {};
                        const intersectPoint = intersects[0].point;
                        atomsSelected.forEach(idx => {
                            const atom = main.molecule.atoms[idx];
                            dragOffsets[idx] = new THREE.Vector3().copy(intersectPoint).sub(atom.position);
                        });
                        window.addEventListener('pointermove', onPointerMove, false);
                        window.addEventListener('pointerup', onPointerUp, false);
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

    // Move all selected atoms
    atomsSelected.forEach(idx => {
        const atom = main.molecule.atoms[idx];
        const offset = dragOffsets[idx] || new THREE.Vector3();
        atom.position.copy(new THREE.Vector3().copy(intersection).sub(offset));
        atom.x = atom.position.x;
        atom.y = atom.position.y;
        atom.z = atom.position.z;

        // Update instanced mesh matrix for this atom
        const matrix = new THREE.Matrix4();
        let radius = main.molecule.atomSettings[atom.type]?.realRadius * 1.5 || 1;
        matrix.makeScale(radius, radius, radius);
        matrix.setPosition(atom.position);
        main.molecule.instancedMesh.setMatrixAt(idx, matrix);
    });
    main.molecule.instancedMesh.instanceMatrix.needsUpdate = true;

    // Update bonds
    main.molecule.updateBonds(mode);

    render();
}

function updateEditingContent(element = null, color = null) {
    if (element !== null) {
        editMoleculeContent.innerHTML = `
        <h2 style="color:${color};">Element: ${element}</h2><br>
        <span style="color:white;">Hold shift and drag to move the atom</span>
        <br>
        <span style="color:white;">Hold cmd or ctrl and to select more atoms in a group</span>

        <button id="changeAtomBtn" style="background-color:rgb(162, 0, 255); margin:10px;" class="fancy-button">Replace Atom</button>
        <button id="removeAtomBtn" style="background-color:rgb(0, 128, 255); margin:10px;" class="fancy-button">Remove Atom</button>
        <button id="createFragment" style="background-color:rgb(168, 146, 0); margin:10px; display:none; " class="fancy-button">Create Fragment</button>
        <ul id="fragmentList"></ul>
    `;
        if (atomsSelected.length > 1) {
            document.getElementById('createFragment').style.display = 'block';
        }
        fragments.forEach((fragment) => {
            addToList(fragment, document.getElementById('fragmentList'))
        })
    } else {
        editMoleculeContent.innerHTML = '<h2 id="select-an-atom">Select an atom</h2>';
    }
}

function onPointerUp(event) {
    dragging = false;
    // draggedAtomIndex = null; // Remove this
    dragOffsets = {};
    window.removeEventListener('pointermove', onPointerMove, false);
    window.removeEventListener('pointerup', onPointerUp, false);
}

function selectAtom(index) {
    console.log("Selecting atom", index);

    const colorAttr = main.molecule.instancedMesh.geometry.getAttribute('color');

    // Only reset all colors if we're not in box selection mode
    if (!isSelecting && !cmdDown) {
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
            console.log(successful ? 'Fallback: Copy successful!' : 'Fallback: Copy failed.');
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