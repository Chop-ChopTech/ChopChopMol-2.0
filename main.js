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
controls.enableDamping = true;
controls.dampingFactor = 0.05;

const light = new THREE.DirectionalLight(0xffffff, 1);
light.position.set(0, 1, 0);
scene.add(light);

camera.position.z = 5;

export default class Main {
    constructor() {
        this.scene = scene;
        this.atomData = [];
        this.data = []; // Stores parsed molecule data
        this.loader = new FileHandler(this); // Pass `this` to FileHandler
        this.molecule = new Molecule(this);
    }
    init(){
        this.molecule.init(this.data);
        console.log(this.data);
    }
}

const main = new Main();

// File input event listener
document.getElementById("fileInput").addEventListener("change", (e) => {
    main.loader.handleFile(e);
}, false);

// Animation loop
function animate() {
    requestAnimationFrame(animate);
    controls.update();
    renderer.render(scene, camera);
}

animate();
