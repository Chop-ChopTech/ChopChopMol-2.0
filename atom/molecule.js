import * as THREE from 'three';
import { mergeGeometries } from 'jsm/utils/BufferGeometryUtils.js'
import Atom from './atom.js';
import Bond from './bond.js';

export default class Molecule {
    constructor(main, atomSettings, overlay) {
        this.main = main;
        this.atoms = [];
        this.bonds = [];
        this.instancedMesh = null;
        this.atomSettings = atomSettings;
        this.labels = [];
        this.stretch = 4;
        this.overlay = overlay
        this.bondGroup = new THREE.Group();
    }

    init(data, mode, rotation, translation, center) {
        this.reset();
        console.log(data);

        const bondThreshold = 1;

        this.createAtoms(data, rotation, translation, mode);
        this.centerMolecule(!center);


        this.main.scene.add(this.instancedMesh);

        this.createBonds(this.atoms, bondThreshold);
        if (mode == 0) {
            this.visualizeBondsFast(this.bonds, rotation, translation);
        } else {
            this.visualizeBondsStyle(this.bonds, rotation, translation);
        }
    }

    // createAtoms(data) {
    //     const resolution = 16;
    //     const atomGeometry = new THREE.SphereGeometry(1, resolution, resolution);
    //     const material = new THREE.MeshLambertMaterial({ vertexColors: true });

    //     this.instancedMesh = new THREE.InstancedMesh(atomGeometry, material, data.numAtoms);

    //     const colorAttribute = new THREE.InstancedBufferAttribute(new Float32Array(data.numAtoms * 3), 3);
    //     this.instancedMesh.geometry.setAttribute('color', colorAttribute);

    //     for (let i = 0; i < data.numAtoms; i++) {

    //         const x = data.atomData[i].x * this.stretch;
    //         const y = data.atomData[i].y * this.stretch;
    //         const z = data.atomData[i].z * this.stretch;
    //         const element = data.atomData[i].element;
    //         const coordinates = new THREE.Vector3(x, y, z);
    //         const id = getRandomArbitrary(0, 1000);

    //         const atom = new Atom(this.main, element, coordinates, id);
    //         this.atoms.push(atom);

    //         const radius = this.atomSettings[element]?.realRadius * 1.5 || 1;

    //         const matrix = new THREE.Matrix4();
    //         matrix.setPosition(atom.position);
    //         matrix.scale(new THREE.Vector3(radius, radius, radius));

    //         this.instancedMesh.setMatrixAt(i, matrix);

    //         const color = new THREE.Color(this.atomSettings[element].color);
    //         colorAttribute.setXYZ(i, color.r, color.g, color.b);
    //     }

    //     this.instancedMesh.instanceMatrix.needsUpdate = true;
    //     colorAttribute.needsUpdate = true;
    // }
    createAtoms(data, rotation, translation, mode) {
        const resolution = mode.resolution ? mode.resolution : 8;
        const atomGeometry = new THREE.SphereGeometry(1, resolution, resolution);
        let material;
        if (mode == 0) {
            material = new THREE.MeshBasicMaterial({
                vertexColors: true,
                opacity: this.overlay ? 0.5 : 1,
                transparent: this.overlay
            });
        } else {
            material = new THREE.MeshStandardMaterial({
                vertexColors: true,
                opacity: this.overlay ? 0.5 : 1,
                transparent: mode.opacity < 1,
                roughness: mode.roughness,
                metalness: mode.metalness,
                opacity: mode.opacity,
                side: THREE.DoubleSide,
            });
        }

        this.instancedMesh = new THREE.InstancedMesh(atomGeometry, material, data.numAtoms);
        const colorAttribute = new THREE.InstancedBufferAttribute(new Float32Array(data.numAtoms * 3), 3);
        this.instancedMesh.geometry.setAttribute('color', colorAttribute);

        for (let i = 0; i < data.numAtoms; i++) {
            const x = data.atomData[i].x * this.stretch;
            const y = data.atomData[i].y * this.stretch;
            const z = data.atomData[i].z * this.stretch;
            const element = data.atomData[i].element;
            const coordinates = new THREE.Vector3(x, y, z);
            const id = getRandomArbitrary(0, 1000);

            const atom = new Atom(this.main, element, coordinates, id);
            this.atoms.push(atom);

            let radius = this.atomSettings[element]?.realRadius * 1.5 || 1;
            radius *= mode.atomSize ? mode.atomSize : 1;

            const matrix = new THREE.Matrix4();
            matrix.makeScale(radius, radius, radius);
            matrix.setPosition(coordinates);

            this.instancedMesh.setMatrixAt(i, matrix);

            const color = new THREE.Color(this.atomSettings[element].color);
            colorAttribute.setXYZ(i, color.r, color.g, color.b);
        }

        this.instancedMesh.instanceMatrix.needsUpdate = true;
        colorAttribute.needsUpdate = true;

        // Apply rotation and translation to the entire molecule
        if (rotation) {
            // If rotation is a Vector3 with Euler angles
            if (rotation.isVector3) {
                this.instancedMesh.rotation.set(rotation.x, rotation.y, rotation.z);
            }
            // If rotation is a Quaternion
            else if (rotation.isQuaternion) {
                this.instancedMesh.quaternion.copy(rotation);
            }
            // If rotation is a Matrix4
            else if (rotation.isMatrix4) {
                this.instancedMesh.applyMatrix4(rotation);
            }
            // If rotation is an object with x, y, z properties (Euler angles)
            else if (rotation.x !== undefined || rotation.y !== undefined || rotation.z !== undefined) {
                this.instancedMesh.rotation.set(
                    rotation.x || 0,
                    rotation.y || 0,
                    rotation.z || 0
                );
            }
        }

        if (translation) {
            // If translation is a Vector3
            if (translation.isVector3) {
                this.instancedMesh.position.copy(translation);
            }
            // If translation is an object with x, y, z properties
            else if (translation.x !== undefined || translation.y !== undefined || translation.z !== undefined) {
                this.instancedMesh.position.set(
                    translation.x || 0,
                    translation.y || 0,
                    translation.z || 0
                );
            }
            // If translation is an array [x, y, z]
            else if (Array.isArray(translation) && translation.length >= 3) {
                this.instancedMesh.position.set(translation[0], translation[1], translation[2]);
            }
        }

        this.main.scene.add(this.instancedMesh);
    }

    createBonds(atoms, threshold) {
        this.bonds = [];

        // Check all unique pairs of atoms
        for (let i = 0; i < atoms.length; i++) {
            for (let j = i + 1; j < atoms.length; j++) {
                const atom1 = atoms[i];
                const atom2 = atoms[j];

                const dist = atom1.position.distanceTo(atom2.position);
                const maxBondDistance = this.stretch * (atom1.realRadius + atom2.realRadius) + threshold;

                if (dist <= maxBondDistance) {
                    const bond = new Bond(this, atom1, atom2, dist);
                    this.bonds.push(bond);
                }
            }
        }

        return this.bonds;
    }

    getAtomCoordinates() {
        const coordinates = [];
        const matrix = new THREE.Matrix4();
        const position = new THREE.Vector3();

        // Loop through each instance (atom)
        for (let i = 0; i < this.instancedMesh.count; i++) {
            // Get the instance's local transformation matrix
            this.instancedMesh.getMatrixAt(i, matrix);

            // Extract the position from the matrix (local to the instancedMesh)
            position.setFromMatrixPosition(matrix);

            // Apply the instancedMesh's world transformation
            position.applyMatrix4(this.instancedMesh.matrixWorld);

            // Store the world position
            coordinates.push(position.clone());
        }

        return coordinates;
    }
    // createBonds(atoms, threshold) {
    //     this.bonds = [];

    //     for (let i = 0; i < atoms.length; i++) {
    //         const atom1 = atoms[i];
    //         const pos1 = atom1.position;
    //         const radius1 = atom1.realRadius;

    //         for (let j = i + 1; j < atoms.length; j++) {
    //             const atom2 = atoms[j];
    //             const pos2 = atom2.position;

    //             // Quick AABB check before expensive distance calculation
    //             const dx = Math.abs(pos1.x - pos2.x);
    //             const dy = Math.abs(pos1.y - pos2.y);
    //             const dz = Math.abs(pos1.z - pos2.z);
    //             const maxDist = radius1 + atom2.realRadius + threshold;

    //             if (dx > maxDist || dy > maxDist || dz > maxDist) continue;

    //             const dist = pos1.distanceTo(pos2);
    //             if (dist <= maxDist) {
    //                 this.bonds.push(new Bond(this, atom1, atom2, dist));
    //             }
    //         }
    //     }

    //     return this.bonds;
    // }


    getCellKey(position, gridSize) {
        const x = Math.floor(position.x / gridSize);
        const y = Math.floor(position.y / gridSize);
        const z = Math.floor(position.z / gridSize);
        return `${x},${y},${z}`;
    }

    getNeighborKey(cellKey, direction) {
        const [x, y, z] = cellKey.split(',').map(Number);
        return `${x + direction[0]},${y + direction[1]},${z + direction[2]}`;
    }

    centerMolecule(overlay) {
        const boundingBox = new THREE.Box3().setFromObject(this.instancedMesh);
        const center = new THREE.Vector3();
        boundingBox.getCenter(center);
        if (!overlay) {
            this.instancedMesh.position.sub(center);
            this.offset = center.clone();
            this.updateMainCoordinates()
        } else {

            this.offset = new THREE.Vector3();

        }

    }
    updateMainCoordinates() {
        const coordinates = this.getAtomCoordinates()

        const elements = []
        this.atoms.forEach(atom => {
            elements.push(atom.type)
        })
        const data = {
            atomData: [],
            numAtoms: this.atoms.length,
        }
        coordinates.forEach((pos, index) => {
            data.atomData.push({
                element: elements[index],
                x: pos.x / this.stretch,
                y: pos.y / this.stretch,
                z: pos.z / this.stretch,
            });
        });
        console.log(data)
        this.main.data = data
    }

    visualizeBondsFast(bonds, rotation, translation) {
        const positions = new Float32Array(bonds.length * 2 * 3);

        const material = new THREE.LineBasicMaterial({ color: 0x00ff00, opacity: this.overlay ? 0.5 : 1, transparent: this.overlay });
        let index = 0;

        bonds.forEach(bond => {
            const atom1Pos = bond.atom1.position.clone().sub(this.offset);
            const atom2Pos = bond.atom2.position.clone().sub(this.offset);

            positions.set(atom1Pos.toArray(), index);
            positions.set(atom2Pos.toArray(), index + 3);
            index += 6;
        });

        const geometry = new THREE.BufferGeometry();
        geometry.setAttribute('position', new THREE.BufferAttribute(positions, 3));

        const lines = new THREE.LineSegments(geometry, material);
        lines.rotation.set(rotation.x, rotation.y, rotation.z)
        lines.position.set(translation.x, translation.y, translation.z)
        this.bondGroup.add(lines);

        this.main.scene.add(this.bondGroup);
    }

    visualizeBondsStyle(bonds, rotation, translation) {
        const radius = 0.15;
        const radialSegments = 8;

        const tempVec1 = new THREE.Vector3();
        const tempVec2 = new THREE.Vector3();
        const tempVec3 = new THREE.Vector3();

        const cylinderGeometry = (length) =>
            new THREE.CylinderGeometry(radius, radius, length, radialSegments);

        bonds.forEach(bond => {
            const start = tempVec1.copy(bond.atom1.position).sub(this.offset);
            const end = tempVec2.copy(bond.atom2.position).sub(this.offset);

            const midpoint = tempVec3.addVectors(start, end).multiplyScalar(0.5);

            const color1 = bond.atom1.color;
            const color2 = bond.atom2.color;

            const length1 = start.distanceTo(midpoint);
            const length2 = end.distanceTo(midpoint);

            const bondGeom1 = cylinderGeometry(length1);
            const bondGeom2 = cylinderGeometry(length2);

            const material1 = new THREE.MeshStandardMaterial({ color: color1 });
            const material2 = new THREE.MeshStandardMaterial({ color: color2 });

            const bondMesh1 = new THREE.Mesh(bondGeom1, material1);
            const bondMesh2 = new THREE.Mesh(bondGeom2, material2);

            bondMesh1.position.copy(start).lerp(midpoint, 0.5);
            bondMesh1.lookAt(midpoint);
            bondMesh1.rotateX(Math.PI / 2);

            bondMesh2.position.copy(midpoint).lerp(end, 0.5);
            bondMesh2.lookAt(end);
            bondMesh2.rotateX(Math.PI / 2);


            this.bondGroup.add(bondMesh1);
            this.bondGroup.add(bondMesh2);
        });

        this.main.scene.add(this.bondGroup);
    }

    reset() {
        this.atoms = [];
        this.bonds = [];
        this.bondGroup = new THREE.Group();
        this.instancedMesh = null;
        this.labels = [];
        this.stretch = 4;
        this.bondGroup = new THREE.Group();
        this.clearLabels();
    }

    updateBonds(mode) {
        this.bonds = [];
        this.main.scene.remove(this.bondGroup);
        this.bondGroup = new THREE.Group();
        this.createBonds(this.atoms, 1);
        if (mode == 0) {
            this.visualizeBondsFast(this.bonds, { x: 0, y: 0, z: 0 }, { x: 0, y: 0, z: 0 });
        } else {
            this.visualizeBondsStyle(this.bonds, { x: 0, y: 0, z: 0 }, { x: 0, y: 0, z: 0 });
        }
    }

    createLabelTexture(text, color) {
        const canvas = document.createElement('canvas');
        canvas.width = 64;
        canvas.height = 64;
        const ctx = canvas.getContext('2d');

        // Set transparent background
        ctx.clearRect(0, 0, canvas.width, canvas.height);

        // Draw text only
        ctx.fillStyle = color; // Use atom color for text
        ctx.font = 'bold 40px arial';
        ctx.textAlign = 'center';
        ctx.textBaseline = 'middle';
        ctx.fillText(text, canvas.width / 2, canvas.height / 2);

        const texture = new THREE.CanvasTexture(canvas);
        return texture;
    }

    toggleLabels(show) {
        this.labels.forEach(label => this.main.scene.remove(label));
        this.labels = [];
        if (show) {
            // Keep atoms visible - remove this line if you want to hide atoms
            // this.instancedMesh.visible = true;

            // Create a helper matrix and position vector for extracting world positions
            const matrix = new THREE.Matrix4();
            const position = new THREE.Vector3();
            const scale = new THREE.Vector3();
            const rotation = new THREE.Quaternion();

            this.atoms.forEach((atom, index) => {
                // Get the instance's transformation matrix
                this.instancedMesh.getMatrixAt(index, matrix);

                // Decompose the matrix to get position and scale
                matrix.decompose(position, rotation, scale);

                // Apply the instancedMesh's world transformation to get final world position
                const worldPosition = position.clone();
                worldPosition.applyMatrix4(this.instancedMesh.matrixWorld);

                // Create the label sprite
                const spriteMaterial = new THREE.SpriteMaterial({
                    map: this.createLabelTexture(atom.type, "white"),
                    transparent: true,
                    depthTest: false,  // Ensure label renders on top
                    depthWrite: false  // Ensure label renders on top
                });
                const sprite = new THREE.Sprite(spriteMaterial);

                // Position the sprite at the exact world position of the atom
                sprite.position.copy(worldPosition);

                // Scale the sprite to match or slightly exceed the atom size
                // The scale.x represents the radius of the atom sphere
                const labelScale = scale.x * 2.0; // Adjust multiplier as needed (2.0 covers the full atom)
                sprite.scale.set(labelScale, labelScale, labelScale);

                // Optionally set render order to ensure labels appear on top
                sprite.renderOrder = 999;

                this.main.scene.add(sprite);
                this.labels.push(sprite);
            });
        } else {
            this.instancedMesh.visible = true; // Ensure atoms are visible
            this.clearLabels();
        }
    }

    updateLabels() {
        this.toggleLabels(true);
        if (this.labels.length === 0) return;

        const matrix = new THREE.Matrix4();
        const position = new THREE.Vector3();
        const scale = new THREE.Vector3();
        const rotation = new THREE.Quaternion();

        this.labels.forEach((label, index) => {
            // Get the updated position of the atom
            this.instancedMesh.getMatrixAt(index, matrix);
            matrix.decompose(position, rotation, scale);

            // Apply world transformation
            const worldPosition = position.clone();
            worldPosition.applyMatrix4(this.instancedMesh.matrixWorld);

            // Update label position
            label.position.copy(worldPosition);

            // Update label scale if needed
            const labelScale = scale.x * 2.0;
            label.scale.set(labelScale, labelScale, labelScale);
        });
    }

    clearLabels() {
        this.labels.forEach(label => {
            this.main.scene.remove(label);
            if (label.material.map) label.material.map.dispose();
            label.material.dispose();
        });
        this.labels = [];
    }

    drawMolecule() {
        // Optionally update instanced mesh properties each frame
    }

    // Returns the bounding box of the molecule's instanced mesh
    getBoundingBox() {
        if (!this.instancedMesh) return null;
        return new THREE.Box3().setFromObject(this.instancedMesh);
    }
}