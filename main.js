import * as THREE from 'three';
import { OrbitControls } from 'jsm/controls/OrbitControls.js';
import Molecule from './atom/molecule.js';
import FileHandler from './utils/fileHandler.js';

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
}

const main = new Main();

// File input event listener
document.getElementById("fileInput").addEventListener("change", (e) => {
    main.loader.handleFile(e);
}, false);

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
    const data = JSON.parse(newReply);
    main.newMolecule(data, 0);
    main.data = data;
    console.log('Reply updated:', newReply);
});

// Animation loop
function animate() {
    requestAnimationFrame(animate);
    controls.update();
    renderer.render(scene, camera);
}

animate();