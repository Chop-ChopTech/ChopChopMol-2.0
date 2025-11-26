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
        this.labelInstancedMesh = null;
        this.labelAtlas = null;
        this.atomTypeMap = {};
        this.stretch = 4;
        this.overlay = overlay;
        this.bondGroup = new THREE.Group();
    }

    init(data, mode, rotation, translation, center, ribbonMode = false) {
        this.reset();
        console.log(data);

        if (ribbonMode) {
            // RIBBON MODE: Skip all atom/bond creation
            // Just store offset for centering (calculate from ribbon data)
            if (data.ribbonData && data.ribbonData.backbone.length > 0) {
                const backbone = data.ribbonData.backbone;
                let sumX = 0, sumY = 0, sumZ = 0;
                backbone.forEach(atom => {
                    sumX += atom.x * this.stretch;
                    sumY += atom.y * this.stretch;
                    sumZ += atom.z * this.stretch;
                });
                this.offset = new THREE.Vector3(
                    sumX / backbone.length,
                    sumY / backbone.length,
                    sumZ / backbone.length
                );
            } else {
                this.offset = new THREE.Vector3(0, 0, 0);
            }
            return; // Exit early, don't create atoms
        }

        // NORMAL MODE: Create atoms and bonds
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

    createAtoms(data, rotation, translation, mode) {
        const resolution = mode.resolution || 8;
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
                opacity: mode.opacity,
                transparent: mode.opacity < 1,
                roughness: mode.roughness,
                metalness: mode.metalness,
                side: THREE.DoubleSide,
            });
        }

        this.instancedMesh = new THREE.InstancedMesh(atomGeometry, material, data.numAtoms);
        const colorAttribute = new THREE.InstancedBufferAttribute(new Float32Array(data.numAtoms * 3), 3);
        this.instancedMesh.geometry.setAttribute('color', colorAttribute);

        const matrix = new THREE.Matrix4();
        const atomSize = mode.atomSize || 1;
        const stretch = this.stretch;

        for (let i = 0; i < data.numAtoms; i++) {
            const atomData = data.atomData[i];
            const element = atomData.element;
            const x = atomData.x * stretch;
            const y = atomData.y * stretch;
            const z = atomData.z * stretch;

            // CHANGED: Pass originalIndex if available in atomData
            const originalIndex = atomData.originalIndex !== undefined ? atomData.originalIndex : i;
            const atom = new Atom(this.main, element, new THREE.Vector3(x, y, z), i, originalIndex);
            this.atoms.push(atom);

            let radius = (this.atomSettings[element]?.realRadius || 0.67) * 1.5 * atomSize;

            matrix.makeScale(radius, radius, radius);
            matrix.setPosition(x, y, z);
            this.instancedMesh.setMatrixAt(i, matrix);

            const color = this.atomSettings[element]?.color || 0xffffff;
            const c = new THREE.Color(color);
            colorAttribute.setXYZ(i, c.r, c.g, c.b);
        }

        this.instancedMesh.instanceMatrix.needsUpdate = true;
        colorAttribute.needsUpdate = true;

        // Apply transformations if provided
        if (rotation && (rotation.x || rotation.y || rotation.z)) {
            this.instancedMesh.rotation.set(rotation.x || 0, rotation.y || 0, rotation.z || 0);
        }
        if (translation && (translation.x || translation.y || translation.z)) {
            this.instancedMesh.position.set(translation.x || 0, translation.y || 0, translation.z || 0);
        }

        this.main.scene.add(this.instancedMesh);
    }

    createBonds(atoms, threshold) {
        this.bonds = [];
        const n = atoms.length;
        if (n === 0) return this.bonds;

        // Preallocate and cache everything
        const positions = new Float32Array(n * 3);
        const radii = new Float32Array(n);
        let minX = Infinity, minY = Infinity, minZ = Infinity;
        let maxBondDist = 0;

        for (let i = 0; i < n; i++) {
            const pos = atoms[i].position;
            const idx = i * 3;
            positions[idx] = pos.x;
            positions[idx + 1] = pos.y;
            positions[idx + 2] = pos.z;
            minX = Math.min(minX, pos.x);
            minY = Math.min(minY, pos.y);
            minZ = Math.min(minZ, pos.z);

            const r = atoms[i].realRadius;
            radii[i] = r;
            maxBondDist = Math.max(maxBondDist, this.stretch * r * 2 + threshold);
        }

        const invCellSize = 1 / maxBondDist;
        const grid = new Map();
        const stretchSq = this.stretch * this.stretch;
        const thresholdSq = threshold * threshold;

        // Populate grid
        for (let i = 0; i < n; i++) {
            const idx = i * 3;
            const x = Math.floor((positions[idx] - minX) * invCellSize);
            const y = Math.floor((positions[idx + 1] - minY) * invCellSize);
            const z = Math.floor((positions[idx + 2] - minZ) * invCellSize);
            const key = (x * 73856093) ^ (y * 19349663) ^ (z * 83492791);

            if (!grid.has(key)) grid.set(key, []);
            grid.get(key).push({ i, x, y, z });
        }

        // Check pairs - fully optimized inner loop
        for (let [key, cellAtoms] of grid) {
            const len1 = cellAtoms.length;
            for (let a = 0; a < len1; a++) {
                const { i: i1, x: cx, y: cy, z: cz } = cellAtoms[a];
                const idx1 = i1 * 3;
                const x1 = positions[idx1];
                const y1 = positions[idx1 + 1];
                const z1 = positions[idx1 + 2];
                const r1 = radii[i1];

                for (let dx = -1; dx <= 1; dx++) {
                    const nx = (cx + dx) * 73856093;
                    for (let dy = -1; dy <= 1; dy++) {
                        const nxy = nx ^ ((cy + dy) * 19349663);
                        for (let dz = -1; dz <= 1; dz++) {
                            const neighborKey = nxy ^ ((cz + dz) * 83492791);
                            const neighbors = grid.get(neighborKey);
                            if (!neighbors) continue;

                            const len2 = neighbors.length;
                            for (let b = 0; b < len2; b++) {
                                const i2 = neighbors[b].i;
                                if (i1 >= i2) continue;

                                const idx2 = i2 * 3;
                                const dx = x1 - positions[idx2];
                                const dy = y1 - positions[idx2 + 1];
                                const dz = z1 - positions[idx2 + 2];
                                const distSq = dx * dx + dy * dy + dz * dz;

                                const sumR = r1 + radii[i2];
                                const maxDistSq = sumR * sumR * stretchSq + 2 * this.stretch * sumR * threshold + thresholdSq;

                                if (distSq <= maxDistSq) {
                                    this.bonds.push(new Bond(this, atoms[i1], atoms[i2], Math.sqrt(distSq)));
                                }
                            }
                        }
                    }
                }
            }
        }

        return this.bonds;
    }

    getAtomCoordinates() {
        const coordinates = [];
        const matrix = new THREE.Matrix4();
        const position = new THREE.Vector3();
        const worldMatrix = this.instancedMesh.matrixWorld;

        for (let i = 0; i < this.instancedMesh.count; i++) {
            this.instancedMesh.getMatrixAt(i, matrix);
            position.setFromMatrixPosition(matrix);
            position.applyMatrix4(worldMatrix);
            coordinates.push(position.clone()); // Only clone for storage
        }

        return coordinates;
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

        // PRESERVE ribbonData if it exists in the old data
        if (this.main.data && this.main.data.ribbonData) {
            data.ribbonData = this.main.data.ribbonData;
        }

        console.log(data)
        this.main.data = data
    }

    visualizeBondsFast(bonds, rotation, translation) {
        const positions = new Float32Array(bonds.length * 6);
        const ox = this.offset.x, oy = this.offset.y, oz = this.offset.z;

        let i = 0;
        for (const bond of bonds) {
            const a1 = bond.atom1.position;
            const a2 = bond.atom2.position;

            positions[i++] = a1.x - ox;
            positions[i++] = a1.y - oy;
            positions[i++] = a1.z - oz;
            positions[i++] = a2.x - ox;
            positions[i++] = a2.y - oy;
            positions[i++] = a2.z - oz;
        }

        const geometry = new THREE.BufferGeometry();
        geometry.setAttribute('position', new THREE.BufferAttribute(positions, 3));

        const material = new THREE.LineBasicMaterial({
            color: 0x00ff00,
            opacity: this.overlay ? 0.5 : 1,
            transparent: this.overlay
        });

        const lines = new THREE.LineSegments(geometry, material);
        lines.rotation.set(rotation.x, rotation.y, rotation.z);
        lines.position.set(translation.x, translation.y, translation.z);

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

        if (this.instancedMesh) {
            this.main.scene.remove(this.instancedMesh);
            if (this.instancedMesh.geometry) {
                this.instancedMesh.geometry.dispose();
            }
            if (this.instancedMesh.material) {
                if (Array.isArray(this.instancedMesh.material)) {
                    this.instancedMesh.material.forEach(mat => mat.dispose());
                } else {
                    this.instancedMesh.material.dispose();
                }
            }
            this.instancedMesh = null;
        }

        if (this.bondGroup) {
            while (this.bondGroup.children.length > 0) {
                const child = this.bondGroup.children[0];
                this.bondGroup.remove(child);
                if (child.geometry) child.geometry.dispose();
                if (child.material) {
                    if (Array.isArray(child.material)) {
                        child.material.forEach(mat => mat.dispose());
                    } else {
                        child.material.dispose();
                    }
                }
            }
            this.main.scene.remove(this.bondGroup);
            this.bondGroup = new THREE.Group();
        }

        // Clear labels properly
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

    createLabelAtlas(useIndices = false) {
        if (useIndices) {
            // Index mode
            const numAtoms = this.atoms.length;
            const size = 64;
            const cols = Math.ceil(Math.sqrt(numAtoms));
            const rows = Math.ceil(numAtoms / cols);

            const canvas = document.createElement('canvas');
            canvas.width = size * cols;
            canvas.height = size * rows;
            const ctx = canvas.getContext('2d');

            ctx.clearRect(0, 0, canvas.width, canvas.height);
            ctx.fillStyle = 'white';
            ctx.font = 'bold 32px Arial';
            ctx.textAlign = 'center';
            ctx.textBaseline = 'middle';

            this.atomTypeMap = {};

            for (let i = 0; i < numAtoms; i++) {
                const col = i % cols;
                const row = Math.floor(i / cols);
                const x = col * size + size / 2;
                const y = row * size + size / 2;

                // CHANGED: Use originalIndex instead of i+1
                const displayIndex = this.atoms[i].originalIndex + 1;
                ctx.fillText(displayIndex.toString(), x, y);

                this.atomTypeMap[i] = {
                    uMin: col / cols,
                    vMin: 1.0 - (row + 1) / rows,
                    uMax: (col + 1) / cols,
                    vMax: 1.0 - row / rows
                };
            }

            this.labelAtlas = new THREE.CanvasTexture(canvas);
            this.labelAtlas.needsUpdate = true;
        } else {
            // Element mode - keep original code
            const types = Object.keys(this.atomSettings).sort();
            const size = 64;
            const cols = Math.ceil(Math.sqrt(types.length));
            const rows = Math.ceil(types.length / cols);

            const canvas = document.createElement('canvas');
            canvas.width = size * cols;
            canvas.height = size * rows;
            const ctx = canvas.getContext('2d');

            ctx.clearRect(0, 0, canvas.width, canvas.height);

            ctx.fillStyle = 'white';
            ctx.font = 'bold 40px Arial';
            ctx.textAlign = 'center';
            ctx.textBaseline = 'middle';

            this.atomTypeMap = {};

            types.forEach((type, i) => {
                const col = i % cols;
                const row = Math.floor(i / cols);
                const x = col * size + size / 2;
                const y = row * size + size / 2;

                ctx.fillText(type, x, y);

                this.atomTypeMap[type] = {
                    uMin: col / cols,
                    vMin: 1.0 - (row + 1) / rows,
                    uMax: (col + 1) / cols,
                    vMax: 1.0 - row / rows
                };
            });

            this.labelAtlas = new THREE.CanvasTexture(canvas);
            this.labelAtlas.needsUpdate = true;
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

    toggleLabels(show, useIndices = false) {
        if (!show) {
            if (this.labelInstancedMesh) this.labelInstancedMesh.visible = false;
            return;
        }

        if (!this.atoms || this.atoms.length === 0) {
            console.warn('Cannot create labels: no atoms loaded yet');
            return;
        }

        // Recreate atlas if mode changed
        if (this.labelAtlas) {
            this.labelAtlas.dispose();
            this.labelAtlas = null;
        }
        this.createLabelAtlas(useIndices);

        if (!this.labelInstancedMesh) {
            const geometry = new THREE.PlaneGeometry(1, 1);

            const material = new THREE.ShaderMaterial({
                uniforms: {
                    map: { value: this.labelAtlas }
                },
                vertexShader: `
                    attribute vec4 uvBounds;
                    varying vec2 vUv;
                    
                    void main() {
                        vUv = mix(uvBounds.xy, uvBounds.zw, uv);
                        
                        // Extract position and scale from instance matrix
                        vec3 instancePos = vec3(instanceMatrix[3][0], instanceMatrix[3][1], instanceMatrix[3][2]);
                        float scaleX = length(vec3(instanceMatrix[0][0], instanceMatrix[0][1], instanceMatrix[0][2]));
                        float scaleY = length(vec3(instanceMatrix[1][0], instanceMatrix[1][1], instanceMatrix[1][2]));
                        
                        // Transform instance position to view space
                        vec4 mvPosition = modelViewMatrix * vec4(instancePos, 1.0);
                        
                        // Add the billboard offset in view space (always facing camera)
                        mvPosition.xy += position.xy * vec2(scaleX, scaleY);
                        
                        gl_Position = projectionMatrix * mvPosition;
                    }
                `,
                fragmentShader: `
                    uniform sampler2D map;
                    varying vec2 vUv;
                    
                    void main() {
                        vec4 texColor = texture2D(map, vUv);
                        if (texColor.a < 0.1) discard;
                        gl_FragColor = texColor;
                    }
                `,
                transparent: true,
                depthTest: false,
                depthWrite: false,
                side: THREE.DoubleSide
            });

            this.labelInstancedMesh = new THREE.InstancedMesh(geometry, material, this.atoms.length);
            this.labelInstancedMesh.renderOrder = 999;
            this.labelInstancedMesh.frustumCulled = false;

            const uvBounds = new Float32Array(this.atoms.length * 4);

            this.atoms.forEach((atom, i) => {
                const bounds = useIndices ? this.atomTypeMap[i] : this.atomTypeMap[atom.type];
                if (!bounds) {
                    console.warn(`No bounds found for ${useIndices ? 'index' : 'atom type'}: ${useIndices ? i : atom.type}`);
                    return;
                }
                const idx = i * 4;
                uvBounds[idx] = bounds.uMin;
                uvBounds[idx + 1] = bounds.vMin;
                uvBounds[idx + 2] = bounds.uMax;
                uvBounds[idx + 3] = bounds.vMax;
            });

            geometry.setAttribute('uvBounds', new THREE.InstancedBufferAttribute(uvBounds, 4));

            this.main.scene.add(this.labelInstancedMesh);
            console.log(`Created labels for ${this.atoms.length} atoms`);
        } else {
            // Update existing mesh
            this.labelInstancedMesh.material.uniforms.map.value = this.labelAtlas;

            const uvBounds = new Float32Array(this.atoms.length * 4);
            this.atoms.forEach((atom, i) => {
                const bounds = useIndices ? this.atomTypeMap[i] : this.atomTypeMap[atom.type];
                if (!bounds) return;
                const idx = i * 4;
                uvBounds[idx] = bounds.uMin;
                uvBounds[idx + 1] = bounds.vMin;
                uvBounds[idx + 2] = bounds.uMax;
                uvBounds[idx + 3] = bounds.vMax;
            });

            this.labelInstancedMesh.geometry.attributes.uvBounds.array = uvBounds;
            this.labelInstancedMesh.geometry.attributes.uvBounds.needsUpdate = true;
            this.labelInstancedMesh.visible = true;
        }

        this.updateLabels();
    }

    updateLabels() {
        if (!this.labelInstancedMesh || !this.labelInstancedMesh.visible) return;

        const matrix = new THREE.Matrix4();
        const tempMatrix = new THREE.Matrix4();
        const position = new THREE.Vector3();
        const scale = new THREE.Vector3();
        const rotation = new THREE.Quaternion();

        this.atoms.forEach((atom, i) => {
            this.instancedMesh.getMatrixAt(i, tempMatrix);
            tempMatrix.decompose(position, rotation, scale);

            const worldPos = position.clone().applyMatrix4(this.instancedMesh.matrixWorld);
            const labelScale = scale.x * 2.0;

            matrix.makeScale(labelScale, labelScale, 1);
            matrix.setPosition(worldPos);
            this.labelInstancedMesh.setMatrixAt(i, matrix);
        });

        this.labelInstancedMesh.instanceMatrix.needsUpdate = true;
    }

    clearLabels() {
        if (this.labelInstancedMesh) {
            this.main.scene.remove(this.labelInstancedMesh);
            if (this.labelInstancedMesh.geometry) {
                this.labelInstancedMesh.geometry.dispose();
            }
            if (this.labelInstancedMesh.material) {
                if (this.labelInstancedMesh.material.uniforms && this.labelInstancedMesh.material.uniforms.map) {
                    // Don't dispose the atlas texture here, we'll reuse it
                }
                this.labelInstancedMesh.material.dispose();
            }
            this.labelInstancedMesh = null;
        }

        if (this.labels) {
            this.labels.forEach(label => {
                this.main.scene.remove(label);
                if (label.material) label.material.dispose();
                if (label.material && label.material.map) label.material.map.dispose();
            });
            this.labels = [];
        }

        if (this.labelAtlas) {
            this.labelAtlas.dispose();
            this.labelAtlas = null;
        }

        // Clear the atom type map so it gets regenerated
        this.atomTypeMap = {};
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