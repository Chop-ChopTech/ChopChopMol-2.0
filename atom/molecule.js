import * as THREE from 'three';
import Atom from './atom.js';

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
        console.log(data.numAtoms);

        // Create the geometry and material for all atoms
        const geometry = new THREE.SphereGeometry(1, 8, 8);  // Using a default radius of 1
        const material = new THREE.MeshStandardMaterial({ vertexColors: true });

        // Create an InstancedMesh with a placeholder for the number of instances
        this.instancedMesh = new THREE.InstancedMesh(geometry, material, data.numAtoms);

        // Create an InstancedBufferAttribute to store the colors for each atom
        const colorAttribute = new THREE.InstancedBufferAttribute(new Float32Array(data.numAtoms * 3), 3);
        this.instancedMesh.geometry.setAttribute('color', colorAttribute);

        // Loop through the atom data and create each atom
        // Loop through the atom data and create each atom
        for (let i = 0; i < data.numAtoms; i++) {
            const x = data.atomData[i].x * 4;
            const y = data.atomData[i].y * 4;
            const z = data.atomData[i].z * 4;
            const element = data.atomData[i].element;
            const coordinates = new THREE.Vector3(x, y, z);
            const id = getRandomArbitrary(0, 1000);

            // Create each atom and update its position and color
            const atom = new Atom(this.main, element, coordinates, id);
            this.atoms.push(atom);

            // Set the radius for this atom
            const radius = this.atomSettings[element]?.radius || 1; // Default to 1 if no radius

            // Set the instance matrix (position + scale) for this atom
            const matrix = new THREE.Matrix4();
            matrix.setPosition(atom.position);

            // Apply scaling based on radius
            matrix.scale(new THREE.Vector3(radius, radius, radius));

            this.instancedMesh.setMatrixAt(i, matrix);

            // Set the color for the atom based on the element type
            const color = new THREE.Color(this.atomSettings[element].color);
            colorAttribute.setXYZ(i, color.r, color.g, color.b);
        }

        // Update after all atoms are added
        this.instancedMesh.instanceMatrix.needsUpdate = true;
        colorAttribute.needsUpdate = true;


        // Add the instanced mesh to the scene
        this.main.scene.add(this.instancedMesh);
        this.centerMolecule();
    }
    centerMolecule() {
        const boundingBox = new THREE.Box3().setFromObject(this.instancedMesh);
    
        // Get the center of the bounding box
        const center = new THREE.Vector3();
        boundingBox.getCenter(center);
    
        // Move the molecule to the center
        this.instancedMesh.position.sub(center);
    
        // Update the controls target to rotate around the center
        this.main.controls.target.copy(center);
    
        // Update controls
        this.main.controls.update();
    }
    
    drawMolecule() {
        // Optionally update instanced mesh properties each frame
    }
}
