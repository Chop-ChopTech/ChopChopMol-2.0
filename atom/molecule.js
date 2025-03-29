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

        const atomGeometry = new THREE.SphereGeometry(1, 8, 8);
        const material = new THREE.MeshStandardMaterial({ vertexColors: true });

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


        // Add the instanced mesh to the scene
        this.main.scene.add(this.instancedMesh);
        this.centerMolecule();
        // this.createBonds(this.atoms, 30);
        console.log(this.createBonds(this.atoms, 8));
        console.log(this.atoms);
        this.visualizeBonds(this.bonds);

    }
    createBonds(atoms, threshold) {
    
        for (let i = 0; i < atoms.length; i++) {
            for (let j = i + 1; j < atoms.length; j++) {
                const atom1 = atoms[i];
                const atom2 = atoms[j];
                const atom1Position = atom1.position;
                const atom2Position = atom2.position;
                const distance = atom1Position.distanceTo(atom2Position);
                console.log(distance);
    
                if (distance <= threshold) {
                    // Create a bond between the two atoms
                    const bond = new Bond(this, atom1, atom2, distance);
                    this.bonds.push(bond);
                }
            }
        }
    
        return this.bonds;
    }
    
    centerMolecule() {
        const boundingBox = new THREE.Box3().setFromObject(this.instancedMesh);
    
        // Get the center of the bounding box
        const center = new THREE.Vector3();
        boundingBox.getCenter(center);
    
        // Move the molecule to the center
        this.instancedMesh.position.sub(center);
    
        // Update the controls target to rotate around the center
    
    }
    visualizeBonds(bonds) {
        bonds.forEach(bond => {
            const material = new THREE.LineBasicMaterial({ color: 0x00ff00 });
            const geometry = new THREE.BufferGeometry();
            const positions = new Float32Array(6); // Two points, each with x, y, z coordinates
            positions.set([...bond.atom1.position.toArray(), ...bond.atom2.position.toArray()]);
    
            geometry.setAttribute('position', new THREE.BufferAttribute(positions, 3));
            const line = new THREE.Line(geometry, material);
            this.main.scene.add(line);
        });
    }
    
    drawMolecule() {
        // Optionally update instanced mesh properties each frame
    }
}
