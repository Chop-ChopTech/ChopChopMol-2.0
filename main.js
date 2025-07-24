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
// controls.minPolarAngle = 0;
// controls.maxPolarAngle = Math.PI;
// controls.minAzimuthAngle = -Infinity;
// controls.maxAzimuthAngle = Infinity;
// controls.enablePan = false;
// controls.enableDamping = false;
// controls.dampingFactor = 0.05;
controls.rotateSpeed = 5.0;
controls.zoomSpeed = 2.0;
controls.panSpeed = 1.0;
controls.dynamicDampingFactor = 1.0; // No drag smoothing
let shiftDown = false;
let editingMolecule = false;


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
let draggedAtomIndex = null;
let dragPlane = new THREE.Plane();
let dragOffset = new THREE.Vector3();


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
        this.roughness = 1;
        this.metalness = 0;
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
        this.newMolecule(data, 0, overlay, rotation, translation);
        this.data = data;
    }
}

const main = new Main();

// File input event listener
document.getElementById("fileInput").addEventListener("change", (e) => {
    main.loader.handleFile(e, false);
}, false);
document.getElementById("compare").addEventListener("change", (e) => {
    main.loader.handleFile(e, true);
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

function setNewMode() {
    return { roughness: main.roughness, metalness: main.metalness, opacity: main.opacity, atomSize: main.atomSize, resolution: main.resolution, antialias: antialiasToggled };
}
function updateStyles() {
    mode = setNewMode();
    main.newMolecule(main.data, mode, false, { x: 0, y: 0, z: 0 }, { x: 0, y: 0, z: 0 });
}

toggleStyleChanges.addEventListener('change', () => {
    if (mode == 0) {
        mode = setNewMode();
    } else {
        mode = 0;
    }
    main.newMolecule(main.data, mode, false, { x: 0, y: 0, z: 0 }, { x: 0, y: 0, z: 0 });
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
roughnessSelector.addEventListener('input', () => {
    main.molecule.material.roughness = roughnessSelector.value;
    render();
});
metalnessSelector.addEventListener('input', () => {
    main.molecule.material.metalness = metalnessSelector.value;
    render();
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

editMoleculeButton.addEventListener('click', () => {
    editMoleculePanel.classList.toggle('on');
    editingMolecule = !editingMolecule;
    console.log(editingMolecule);
})
renderer.domElement.addEventListener('pointerdown', onPointerDown, false);

function onPointerDown(event) {
    if (editingMolecule) {
        // Convert mouse to normalized device coordinates
        const rect = renderer.domElement.getBoundingClientRect();
        mouse.x = ((event.clientX - rect.left) / rect.width) * 2 - 1;
        mouse.y = -((event.clientY - rect.top) / rect.height) * 2 + 1;

        raycaster.setFromCamera(mouse, camera);

        // Intersect with the instanced mesh of atoms
        const intersects = raycaster.intersectObject(main.molecule.instancedMesh);

        if (intersects.length > 0) {
            const instanceId = intersects[0].instanceId;
            if (instanceId !== undefined) {
                selectAtom(instanceId);
                // Create buttons for editing the molecule
                editMoleculeContent.innerHTML = `
                    <h2>Element: ${main.molecule.atoms[instanceId].type}</h2><br>
                    <span>Hold shift and drag to move the molecule</span>
                    <button id="changeMoleculeBtn" style="background-color:rgb(162, 0, 255); margin:10px;" class="fancy-button">Change Molecule</button>
                    <button id="removeMoleculeBtn" style="background-color:rgb(0, 128, 255); margin:10px;" class="fancy-button">Remove Molecule</button>
                `;


                document.getElementById('changeMoleculeBtn').addEventListener('click', () => { /* ... */ });
                document.getElementById('removeMoleculeBtn').addEventListener('click', () => { /* ... */ });

                if (shiftDown) {
                    unselectAtom(instanceId);
                    dragging = true;
                    draggedAtomIndex = instanceId;

                    // Set up a plane perpendicular to the camera through the atom
                    const atom = main.molecule.atoms[instanceId];
                    dragPlane.setFromNormalAndCoplanarPoint(
                        camera.getWorldDirection(new THREE.Vector3()),
                        atom.position
                    );

                    // Calculate offset between mouse and atom position
                    const intersectPoint = intersects[0].point;
                    dragOffset.copy(intersectPoint).sub(atom.position);

                    // Listen for move and up
                    window.addEventListener('pointermove', onPointerMove, false);
                    window.addEventListener('pointerup', onPointerUp, false);
                }
            }
        } else {
            unselectAtom();
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

    // Update atom position
    const atom = main.molecule.atoms[draggedAtomIndex];
    atom.position.copy(intersection.sub(dragOffset));
    atom.x = atom.position.x;
    atom.y = atom.position.y;
    atom.z = atom.position.z;

    // Update instanced mesh matrix for this atom
    const matrix = new THREE.Matrix4();
    let radius = main.molecule.atomSettings[atom.type]?.realRadius * 1.5 || 1;
    matrix.makeScale(radius, radius, radius);
    matrix.setPosition(atom.position);
    main.molecule.instancedMesh.setMatrixAt(draggedAtomIndex, matrix);
    main.molecule.instancedMesh.instanceMatrix.needsUpdate = true;

    // Update bonds
    main.molecule.updateBonds(mode);

    render();
}

function onPointerUp(event) {
    dragging = false;
    draggedAtomIndex = null;
    window.removeEventListener('pointermove', onPointerMove, false);
    window.removeEventListener('pointerup', onPointerUp, false);
}

function selectAtom(index) {
    // Get the color attribute
    const colorAttr = main.molecule.instancedMesh.geometry.getAttribute('color');
    // Optionally: reset all colors first
    for (let i = 0; i < colorAttr.count; i++) {
        const atom = main.molecule.atoms[i];
        const color = new THREE.Color(main.molecule.atomSettings[atom.type].color);
        colorAttr.setXYZ(i, color.r, color.g, color.b);
    }
    // Highlight selected atom (e.g., yellow)
    colorAttr.setXYZ(index, 1, 1, 0);
    colorAttr.needsUpdate = true;

    // Optionally: show info
    const atom = main.molecule.atoms[index];

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