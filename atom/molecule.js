import * as THREE from 'three';
import Atom from './atom.js';
import Bond from './bond.js';

export default class Molecule {
    constructor(main, atomSettings) {
        this.main = main;
        this.atoms = [];
        this.bonds = [];
        this.atomSettings = atomSettings;
        this.instancedMesh = null;  // We will store the instanced mesh here
        console.log(this.atomSettings);
    }

    init(data) {
        console.log(data);
        // Data format:
        // Example:
        // 0: {element: 'O', x: 104.008, y: 103.223, z: 106.729}
        // 


        const bondThreshold = 5;

        this.createAtoms(data);
        // Add the instanced mesh to the scene
        this.main.scene.add(this.instancedMesh);
        this.centerMolecule();
        
        this.createBonds(this.atoms, bondThreshold)
        this.visualizeBonds(this.bonds);

    }
    createAtoms(data){
        const resolution = 32;
        const atomGeometry = new THREE.SphereGeometry(1, resolution, resolution);
        const material = new THREE.MeshStandardMaterial({ vertexColors: true, roughness: 0.4 });

        this.instancedMesh = new THREE.InstancedMesh(atomGeometry, material, data.numAtoms);

        const colorAttribute = new THREE.InstancedBufferAttribute(new Float32Array(data.numAtoms * 3), 3);
        this.instancedMesh.geometry.setAttribute('color', colorAttribute);

        for (let i = 0; i < data.numAtoms; i++) {
            const x = data.atomData[i].x * 4;
            const y = data.atomData[i].y * 4;
            const z = data.atomData[i].z * 4;
            const element = data.atomData[i].element;
            const coordinates = new THREE.Vector3(x, y, z);
            const id = getRandomArbitrary(0, 1000);

            const atom = new Atom(this.main, element, coordinates, id);
            this.atoms.push(atom);

            const radius = this.atomSettings[element]?.radius || 1; // Default to 1 if no radius

            const matrix = new THREE.Matrix4();
            matrix.setPosition(atom.position);

            matrix.scale(new THREE.Vector3(radius, radius, radius));

            this.instancedMesh.setMatrixAt(i, matrix);

            const color = new THREE.Color(this.atomSettings[element].color);
            colorAttribute.setXYZ(i, color.r, color.g, color.b);
        }

        // Update after all atoms are added
        this.instancedMesh.instanceMatrix.needsUpdate = true;
        colorAttribute.needsUpdate = true;
    }
    createBonds(atoms, threshold) {

        const gridSize = threshold * 2; // Grid cell size should be at least twice the threshold
        const grid = new Map();
    
        // Place atoms into grid cells
        for (let i = 0; i < atoms.length; i++) {
            const atom = atoms[i];
            const cellKey = this.getCellKey(atom.position, gridSize);
            if (!grid.has(cellKey)) {
                grid.set(cellKey, []);
            }
            grid.get(cellKey).push(atom);
        }
    
        // Check nearby cells for possible bonds
        const directions = [
            [0, 0, 0], [1, 0, 0], [-1, 0, 0], [0, 1, 0], [0, -1, 0],
            [0, 0, 1], [0, 0, -1], [1, 1, 0], [-1, -1, 0], [1, -1, 0],
            [-1, 1, 0], [1, 0, 1], [-1, 0, -1], [0, 1, 1], [0, -1, -1],
            [0, 1, -1], [0, -1, 1], [1, 1, 1], [-1, -1, -1]
        ];
    
        for (let i = 0; i < atoms.length; i++) {
            const atom1 = atoms[i];
            const cellKey = this.getCellKey(atom1.position, gridSize);
    
            // Check all neighboring cells
            for (const dir of directions) {
                const neighborKey = this.getNeighborKey(cellKey, dir);
                if (!grid.has(neighborKey)) continue;
    
                const neighbors = grid.get(neighborKey);
                for (const atom2 of neighbors) {
                    if (atom1 === atom2) continue;
                    console.log(atom1.radius, atom2.radius);
                    const distSq = atom1.position.distanceTo(atom2.position);
                    const thresholdSq = threshold;
                    if (distSq <= (atom1.radius+atom2.radius)+thresholdSq) {
                        const bond = new Bond(this, atom1, atom2,distSq); // Only get distance here if needed
                        this.bonds.push(bond);
                    }
                    
                }
            }
        }
    
        return this.bonds;
    }
    
    // Generate a grid cell key from a position
    getCellKey(position, gridSize) {
        const x = Math.floor(position.x / gridSize);
        const y = Math.floor(position.y / gridSize);
        const z = Math.floor(position.z / gridSize);
        return `${x},${y},${z}`;
    }
    
    // Get neighboring cell key based on direction
    getNeighborKey(cellKey, direction) {
        const [x, y, z] = cellKey.split(',').map(Number);
        return `${x + direction[0]},${y + direction[1]},${z + direction[2]}`;
    }
    
    
    centerMolecule() {
        const boundingBox = new THREE.Box3().setFromObject(this.instancedMesh);
    
        // Get the center of the bounding box
        const center = new THREE.Vector3();
        boundingBox.getCenter(center);
    
        // Move the molecule to the center
        this.instancedMesh.position.sub(center);
    
        // Store the offset for centering bonds later
        this.offset = center.clone(); // Save offset to use for bonds
    }
    
    visualizeBonds(bonds) {
        const radius = 0.1; // Bond thickness
        const radialSegments = 8; // Smoother cylinder
        const material = new THREE.MeshStandardMaterial({ color: 0xffffff });
    
        bonds.forEach(bond => {
            const start = bond.atom1.position.clone().sub(this.offset);
            const end = bond.atom2.position.clone().sub(this.offset);
            const direction = new THREE.Vector3().subVectors(end, start);
            const length = direction.length();
    
            const bondGeometry = new THREE.CylinderGeometry(radius, radius, length, radialSegments);
            const bondMesh = new THREE.Mesh(bondGeometry, material);
    
            // Move bond to midpoint
            const midpoint = new THREE.Vector3().addVectors(start, end).multiplyScalar(0.5);
            bondMesh.position.copy(midpoint);
    
            // Align the cylinder with the bond direction
            bondMesh.lookAt(end);
            bondMesh.rotateX(Math.PI / 2); // Rotate so it's aligned properly
    
            this.main.scene.add(bondMesh);
        });
    }
    
    
    
    drawMolecule() {
        // Optionally update instanced mesh properties each frame
    }
}
