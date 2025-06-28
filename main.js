import * as THREE from 'three';
import { OrbitControls } from 'jsm/controls/OrbitControls.js';
import Molecule from './atom/molecule.js';
import FileHandler from './utils/fileHandler.js';
// WE WILL NOW TRY TO MAKE THIS AMAZING WEBSITE AN APP. IT MAY GO AMAZINGLY OR IT MAY GO HORRIBLY.
// Setup scene
const scene = new THREE.Scene();
const camera = new THREE.PerspectiveCamera(75, window.innerWidth / window.innerHeight, 0.1, 1000);

const renderer = new THREE.WebGLRenderer({ antialias: true });
renderer.setSize(window.innerWidth, window.innerHeight);
renderer.setPixelRatio(window.devicePixelRatio);
document.body.appendChild(renderer.domElement);

const controls = new OrbitControls(camera, renderer.domElement);
controls.enableDamping = false;
controls.dampingFactor = 0.05;

const light = new THREE.DirectionalLight(0xffffff, 3);
const ambientLight = new THREE.AmbientLight(0xffffff, 2);

scene.add(light);
scene.add(ambientLight);
// testing 123
camera.position.z = 15;
let mode = 0;
let labelMode = false; // Track label mode

const switchModeButton = document.getElementById('switchMode');
const toggleLabelsButton = document.getElementById('toggleLabels');

export default class Main {
    constructor() {
        this.scene = scene;
        this.atomData = [];
        this.data = [];
        this.atomSettings = [];
        this.loader = new FileHandler(this);
        this.loader.parseJSON().then(settings => {
            this.atomSettings = settings || {};
            this.molecule = new Molecule(this, this.atomSettings);
        });
    }
    init(data, mode) {
        this.molecule.init(data, mode);
        console.log(this.data);
    }
    reset() {
        clearScene(this.scene);
    }
    newMolecule(data, mode) {
        this.reset();
        this.molecule.init(data, mode);
        if (labelMode) {
            this.molecule.toggleLabels(true); // Show labels if in label mode
        }
    }
    toggleLabels() {
        labelMode = !labelMode;
        this.molecule.toggleLabels(labelMode);
    }
    createNewMoleculeFromJSON(json) {
        const data = JSON.parse(json);
        this.newMolecule(data, 0);
        this.data = data;
    }
}

const main = new Main();

// File input event listener
document.getElementById("fileInput").addEventListener("change", (e) => {
    main.loader.handleFile(e);
}, false);
let isLPressed = false;

window.addEventListener('keydown', function (e) {
    if (e.key === 'l') {
        isLPressed = true;
    }
});

window.addEventListener('keyup', function (e) {
    if (e.key === 'l') {
        isLPressed = false;
    }
});

window.addEventListener('keydown', function (e) {
    if (isLPressed && e.key === 'Enter') {
        const newData = window.prompt("Enter the JSON data:");
        if (newData) {
            main.createNewMoleculeFromJSON(newData);
        }
    }
});
window.addEventListener('keydown', function (e) {
    if (e.key == "j") {
        console.log(JSON.stringify(main.data));
    }
})
window.addEventListener('resize', () => {
    camera.aspect = window.innerWidth / window.innerHeight;
    camera.updateProjectionMatrix();
    renderer.setSize(window.innerWidth, window.innerHeight);
});

switchModeButton.addEventListener('click', () => {
    mode = 1 - mode;
    main.newMolecule(main.data, mode);
    console.log(mode);
});

toggleLabelsButton.addEventListener('click', () => {
    main.toggleLabels();
});

window.addEventListener('replyUpdated', (event) => {
    const newReply = event.detail;
    console.log(newReply);
    main.createNewMoleculeFromJSON(JSON.stringify(newReply));

});

function saveImage() {
    renderer.render(scene, camera);
    let imgData = renderer.domElement.toDataURL("image/png", 1.0);
    const link = document.createElement('a');
    link.setAttribute('href', imgData);
    link.setAttribute('target', '_blank');
    link.setAttribute('download', 'molecule.png');
    link.click();
}
// Animation loop
function animate() {
    requestAnimationFrame(animate);
    controls.update();
    renderer.render(scene, camera);
}

animate();