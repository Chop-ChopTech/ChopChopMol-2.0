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
let mode=0

const switchModeButton = document.getElementById('switchMode');


export default class Main {
    constructor() {
        this.scene = scene;
        this.atomData = [];

        this.data = []; // Stores parsed molecule data
        this.atomSettings = [];
        this.loader = new FileHandler(this); // Pass `this` to FileHandler
        this.loader.parseJSON().then(settings => {
            this.atomSettings = settings || {}; // Ensure it's assigned even if null
            this.molecule = new Molecule(this, this.atomSettings);
        });
        
    }
    init(mode){
        this.molecule.init(this.data,mode);
        console.log(this.data)
    }
    reset(){
        clearScene(this.scene);
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
window.addEventListener('keydown', (event) => {
    if (event.key === ' ') {
        const json=prompt('Enter test JSON');
        main.reset();
        main.molecule.init(JSON.parse(json),mode);
    }
})

switchModeButton.addEventListener('click', () => {
    mode=1-mode
    main.reset();
    main.molecule.init(main.data,mode);
    console.log(mode)
});

// Animation loop
function animate() {
    requestAnimationFrame(animate);
    controls.update();
    renderer.render(scene, camera);
}

animate();
