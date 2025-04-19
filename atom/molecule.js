import * as THREE from 'three';
import Atom from './atom.js';
import Bond from './bond.js';

export default class Molecule {
    constructor(main, atomSettings) {
        this.main = main;
        this.atoms = [];
        this.bonds = [];
        this.instancedMesh = null;
        this.atomSettings = atomSettings;
        this.labels = [];
    }

    init(data, mode) {
        this.reset();
        console.log(data);

        const bondThreshold = 5;

        this.createAtoms(data);
        this.main.scene.add(this.instancedMesh);
        this.centerMolecule();
        
        this.createBonds(this.atoms, bondThreshold);
        if (mode == 0) {
            this.visualizeBondsFast(this.bonds);
        } else {
            this.visualizeBondsStyle(this.bonds);
        }
    }

    createAtoms(data) {
        const resolution = 16;
        const atomGeometry = new THREE.SphereGeometry(1, resolution, resolution);
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

            const radius = this.atomSettings[element]?.radius || 1;

            const matrix = new THREE.Matrix4();
            matrix.setPosition(atom.position);
            matrix.scale(new THREE.Vector3(radius, radius, radius));

            this.instancedMesh.setMatrixAt(i, matrix);

            const color = new THREE.Color(this.atomSettings[element].color);
            colorAttribute.setXYZ(i, color.r, color.g, color.b);
        }

        this.instancedMesh.instanceMatrix.needsUpdate = true;
        colorAttribute.needsUpdate = true;
    }

    createBonds(atoms, threshold) {
        const gridSize = threshold * 2;
        const grid = new Map();
        this.bonds = [];

        for (const atom of atoms) {
            const cellKey = this.getCellKey(atom.position, gridSize);
            if (!grid.has(cellKey)) {
                grid.set(cellKey, []);
            }
            grid.get(cellKey).push(atom);
        }

        const directions = [
            [0, 0, 0], [1, 0, 0], [-1, 0, 0], [0, 1, 0], [0, -1, 0],
            [0, 0, 1], [0, 0, -1], [1, 1, 0], [-1, -1, 0], [1, -1, 0],
            [-1, 1, 0], [1, 0, 1], [-1, 0, -1], [0, 1, 1], [0, -1, -1],
            [0, 1, -1], [0, -1, 1], [1, 1, 1], [-1, -1, -1]
        ];

        for (const atom1 of atoms) {
            const cellKey = this.getCellKey(atom1.position, gridSize);

            for (const dir of directions) {
                const neighborKey = this.getNeighborKey(cellKey, dir);
                const neighbors = grid.get(neighborKey);
                if (!neighbors) continue;

                for (const atom2 of neighbors) {
                    if (atom1 === atom2) continue;

                    if (atom1.id > atom2.id) continue;

                    const dist = atom1.position.distanceTo(atom2.position);
                    const maxBondDistance = atom1.radius + atom2.radius + threshold;

                    if (dist <= maxBondDistance) {
                        const bond = new Bond(this, atom1, atom2, dist);
                        this.bonds.push(bond);
                    }
                }
            }
        }

        return this.bonds;
    }

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

    centerMolecule() {
        const boundingBox = new THREE.Box3().setFromObject(this.instancedMesh);
        const center = new THREE.Vector3();
        boundingBox.getCenter(center);
        this.instancedMesh.position.sub(center);
        this.offset = center.clone();
    }

    visualizeBondsFast(bonds) {
        const positions = new Float32Array(bonds.length * 2 * 3);

        const material = new THREE.LineBasicMaterial({ color: 0x00ff00 });
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
        this.main.scene.add(lines);
    }

    visualizeBondsStyle(bonds) {
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

            this.main.scene.add(bondMesh1);
            this.main.scene.add(bondMesh2);
        });
    }

    reset() {
        this.atoms = [];
        this.bonds = [];
        this.instancedMesh = null;
        this.clearLabels();
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
        ctx.font = 'bold 40px Comfortaa';
        ctx.textAlign = 'center';
        ctx.textBaseline = 'middle';
        ctx.fillText(text, canvas.width / 2, canvas.height / 2);

        const texture = new THREE.CanvasTexture(canvas);
        return texture;
    }

    toggleLabels(show) {
        if (show) {
            this.instancedMesh.visible = false; // Hide atom spheres
            this.atoms.forEach(atom => {
                const spriteMaterial = new THREE.SpriteMaterial({
                    map: this.createLabelTexture(atom.type, this.atomSettings[atom.type].color),
                    transparent: true
                });
                const sprite = new THREE.Sprite(spriteMaterial);
                sprite.position.copy(atom.position).sub(this.offset);
                sprite.scale.set(1.5, 1.5, 1.5); // Adjust size for visibility
                this.main.scene.add(sprite);
                this.labels.push(sprite);
            });
        } else {
            this.instancedMesh.visible = true; // Show atom spheres
            this.clearLabels();
        }
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
}