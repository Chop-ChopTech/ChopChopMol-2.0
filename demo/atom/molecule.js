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
        this.forceArrowGroup = new THREE.Group();
        this.forceData = null;
    }

    init(data, mode, center, ribbonMode = false) {
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

        // Store force data for later visualization
        this.forceData = data.atomData.some(a => a.fx !== undefined) ? data.atomData : null;

        this.createAtoms(data, mode);
        this.centerMolecule(!center);

        this.main.scene.add(this.instancedMesh);

        this.createBonds(this.atoms, bondThreshold);
        if (mode == 0) {
            this.visualizeBondsFast(this.bonds);
        } else {
            this.visualizeBondsStyle(this.bonds, mode);
        }
    }

    createAtoms(data, mode) {
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

        // Populate grid - OPTIMIZED: Store only index to save memory/GC
        for (let i = 0; i < n; i++) {
            const idx = i * 3;
            const x = Math.floor((positions[idx] - minX) * invCellSize);
            const y = Math.floor((positions[idx + 1] - minY) * invCellSize);
            const z = Math.floor((positions[idx + 2] - minZ) * invCellSize);
            const key = (x * 73856093) ^ (y * 19349663) ^ (z * 83492791);

            if (!grid.has(key)) grid.set(key, []);
            grid.get(key).push(i); // Store just the index
        }

        // Check pairs - fully optimized inner loop
        for (let [key, cellIndices] of grid) {
            const len1 = cellIndices.length;

            // We need to re-derive x,y,z for the cell logic, or just iterate offsets 
            // Since we stored indices, we look up position of the first atom to determine neighbor keys
            // Actually, we can just iterate neighbors based on the grid key logic, 
            // but since we need 'cx, cy, cz' for the neighbor loop:

            // Re-calculate cell coords from the first atom in the bucket (all share same cell)
            if (len1 === 0) continue;
            const firstIdx = cellIndices[0] * 3;
            const cx = Math.floor((positions[firstIdx] - minX) * invCellSize);
            const cy = Math.floor((positions[firstIdx + 1] - minY) * invCellSize);
            const cz = Math.floor((positions[firstIdx + 2] - minZ) * invCellSize);

            for (let a = 0; a < len1; a++) {
                const i1 = cellIndices[a];
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
                                const i2 = neighbors[b];
                                if (i1 >= i2) continue; // Unique pairs

                                const idx2 = i2 * 3;
                                const diffX = x1 - positions[idx2];
                                const diffY = y1 - positions[idx2 + 1];
                                const diffZ = z1 - positions[idx2 + 2];
                                const distSq = diffX * diffX + diffY * diffY + diffZ * diffZ;

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

    visualizeBondsFast(bonds) {
        if (!bonds || bonds.length === 0) return;

        // 1. Reuse Material (create once)
        if (!this.fastBondMaterial) {
            this.fastBondMaterial = new THREE.LineBasicMaterial({
                color: 0x00ff00,
                opacity: this.overlay ? 0.5 : 1,
                transparent: this.overlay,
                depthTest: !this.overlay // Disable depth test if overlaying
            });
        }

        const vertexCount = bonds.length * 2;
        const ox = this.offset.x, oy = this.offset.y, oz = this.offset.z;
        let positions;
        let lineSegments = this.bondGroup.children[0];

        // 2. Reuse Geometry if possible (faster updates)
        if (lineSegments && lineSegments.isLineSegments && lineSegments.geometry.attributes.position.count === vertexCount) {
            positions = lineSegments.geometry.attributes.position.array;
        } else {
            // Clear old if size changed or missing
            if (this.bondGroup.children.length > 0) {
                this.bondGroup.children[0].geometry.dispose();
                this.bondGroup.clear();
            }

            positions = new Float32Array(vertexCount * 3);
            const geometry = new THREE.BufferGeometry();
            geometry.setAttribute('position', new THREE.BufferAttribute(positions, 3));

            lineSegments = new THREE.LineSegments(geometry, this.fastBondMaterial);
            // Disable culling for speed if molecule is always in view
            lineSegments.frustumCulled = false;

            this.bondGroup.add(lineSegments);
            this.main.scene.add(this.bondGroup);
        }

        // 3. Fast Loop (write directly to buffer)
        for (let i = 0; i < bonds.length; i++) {
            const bond = bonds[i];
            const p1 = bond.atom1.position;
            const p2 = bond.atom2.position;

            const idx = i * 6; // 2 vertices * 3 coords

            positions[idx] = p1.x - ox;
            positions[idx + 1] = p1.y - oy;
            positions[idx + 2] = p1.z - oz;

            positions[idx + 3] = p2.x - ox;
            positions[idx + 4] = p2.y - oy;
            positions[idx + 5] = p2.z - oz;
        }

        lineSegments.geometry.attributes.position.needsUpdate = true;
    }

    visualizeBondsStyle(bonds, mode) {
        if (bonds.length === 0) return;

        const radius = mode.bondThickness || 0.15;
        // Limit resolution to prevent massive geometry overhead on large molecules
        const radialSegments = mode.resolution || 8;

        const baseGeometry = new THREE.CylinderGeometry(radius, radius, 1, radialSegments);

        // Translate geometry so pivot is at bottom (0,0,0) makes scaling easier conceptually,
        // but center pivot (default) is fine if we position at segment centers.
        // Default Cylinder centers at (0,0,0) with height 1.

        const material = new THREE.MeshStandardMaterial({
            vertexColors: true,
            metalness: mode.metalness || 0,
            roughness: mode.roughness || 0.5
        });

        const totalInstances = bonds.length * 2;
        const mesh = new THREE.InstancedMesh(baseGeometry, material, totalInstances);

        const colorAttribute = new THREE.InstancedBufferAttribute(new Float32Array(totalInstances * 3), 3);
        mesh.geometry.setAttribute('color', colorAttribute);

        // Pre-allocate temporaries
        const mat = new THREE.Matrix4();
        const vStart = new THREE.Vector3();
        const vEnd = new THREE.Vector3();
        const vDir = new THREE.Vector3();
        const vPos = new THREE.Vector3();
        const vScale = new THREE.Vector3();
        const qRot = new THREE.Quaternion();
        const up = new THREE.Vector3(0, 1, 0);
        const col1 = new THREE.Color();
        const col2 = new THREE.Color();

        for (let i = 0; i < bonds.length; i++) {
            const bond = bonds[i];

            // Local coordinates relative to offset
            vStart.copy(bond.atom1.position).sub(this.offset);
            vEnd.copy(bond.atom2.position).sub(this.offset);

            // 1. Calculate orientation ONE TIME for the whole bond
            vDir.subVectors(vEnd, vStart);
            const fullLen = vDir.length();
            if (fullLen < 0.0001) continue; // Prevent zero-length errors

            vDir.normalize();
            qRot.setFromUnitVectors(up, vDir);

            // Half length for each segment
            const halfLen = fullLen * 0.5;
            vScale.set(1, halfLen, 1);

            // 2. First Half (Atom 1 -> Midpoint)
            // Center is at Start + (Dir * (Length / 4))
            vPos.copy(vStart).addScaledVector(vDir, fullLen * 0.25);
            mat.compose(vPos, qRot, vScale);

            const idx1 = i * 2;
            mesh.setMatrixAt(idx1, mat);

            col1.set(bond.atom1.color);
            colorAttribute.setXYZ(idx1, col1.r, col1.g, col1.b);

            // 3. Second Half (Midpoint -> Atom 2)
            // Center is at Start + (Dir * (Length * 0.75))
            vPos.copy(vStart).addScaledVector(vDir, fullLen * 0.75);
            mat.compose(vPos, qRot, vScale); // Reuse qRot and vScale

            const idx2 = i * 2 + 1;
            mesh.setMatrixAt(idx2, mat);

            col2.set(bond.atom2.color);
            colorAttribute.setXYZ(idx2, col2.r, col2.g, col2.b);
        }

        this.bondGroup.add(mesh);
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

        // Clear force arrows
        if (this.forceArrowGroup) {
            while (this.forceArrowGroup.children.length > 0) {
                const child = this.forceArrowGroup.children[0];
                this.forceArrowGroup.remove(child);
                if (child.geometry) child.geometry.dispose();
                if (child.material) child.material.dispose();
            }
            this.main.scene.remove(this.forceArrowGroup);
            this.forceArrowGroup = new THREE.Group();
        }
        this.forceData = null;

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
            this.visualizeBondsStyle(this.bonds, mode);
        }
    }

    createLabelAtlas(showElements = true, showIndices = false) {
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
        ctx.font = 'bold 24px Arial';
        ctx.textAlign = 'center';
        ctx.textBaseline = 'middle';

        this.atomTypeMap = {};

        for (let i = 0; i < numAtoms; i++) {
            const col = i % cols;
            const row = Math.floor(i / cols);
            const x = col * size + size / 2;
            const y = row * size + size / 2;

            const atom = this.atoms[i];
            const displayIndex = atom.originalIndex !== undefined ? atom.originalIndex + 1 : i + 1;

            let labelText = '';
            if (showElements && showIndices) {
                labelText = `${atom.type}${displayIndex}`;
            } else if (showElements) {
                labelText = atom.type;
            } else if (showIndices) {
                labelText = `${displayIndex}`;
            }

            ctx.fillText(labelText, x, y);

            this.atomTypeMap[i] = {
                uMin: col / cols,
                vMin: 1.0 - (row + 1) / rows,
                uMax: (col + 1) / cols,
                vMax: 1.0 - row / rows
            };
        }

        this.labelAtlas = new THREE.CanvasTexture(canvas);
        this.labelAtlas.needsUpdate = true;
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

    toggleLabels(show, showElements = true, showIndices = false) {
        if (!show) {
            if (this.labelInstancedMesh) this.labelInstancedMesh.visible = false;
            return;
        }

        if (!this.atoms || this.atoms.length === 0) {
            console.warn('Cannot create labels: no atoms loaded yet');
            return;
        }

        // Recreate atlas if content changed
        if (this.labelAtlas) {
            this.labelAtlas.dispose();
            this.labelAtlas = null;
        }
        this.createLabelAtlas(showElements, showIndices);

        if (!this.labelInstancedMesh) {
            const geometry = new THREE.PlaneGeometry(1, 1); // Centered plane (-0.5 to +0.5)

            const material = new THREE.ShaderMaterial({
                uniforms: {
                    map: { value: this.labelAtlas }
                },
                vertexShader: `
                attribute vec4 uvBounds;
                varying vec2 vUv;
                
                void main() {
                    vUv = mix(uvBounds.xy, uvBounds.zw, uv);
                    
                    // Instance translation only (from instanceMatrix column 3)
                    vec3 instancePos = instanceMatrix[3].xyz;
                    
                    // Uniform scale from instance matrix (assuming uniform scaling)
                    float scale = length(vec3(instanceMatrix[0]));
                    
                    // World position = object modelMatrix * instance translation
                    vec4 worldPos = modelMatrix * vec4(instancePos, 1.0);
                    
                    // Camera right/up vectors in world space (transposed view matrix rows via columns)
                    vec3 cameraRight = vec3(viewMatrix[0][0], viewMatrix[1][0], viewMatrix[2][0]);
                    vec3 cameraUp = vec3(viewMatrix[0][1], viewMatrix[1][1], viewMatrix[2][1]);
                    
                    // Add billboard offset in world space: plane vertices -0.5..0.5, full size = scale
                    worldPos.xyz += cameraRight * position.x * scale + cameraUp * position.y * scale;
                    
                    // Transform to view and project
                    vec4 viewPos = viewMatrix * worldPos;
                    gl_Position = projectionMatrix * viewPos;
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
                depthTest: false,     // Always visible on top
                depthWrite: false,
                side: THREE.DoubleSide
            });

            this.labelInstancedMesh = new THREE.InstancedMesh(geometry, material, this.atoms.length);
            this.labelInstancedMesh.renderOrder = 999;
            this.labelInstancedMesh.frustumCulled = false;

            // UV bounds for atlas
            const uvBounds = new Float32Array(this.atoms.length * 4);
            this.atoms.forEach((atom, i) => {
                const bounds = this.atomTypeMap[i];
                const idx = i * 4;
                uvBounds[idx] = bounds.uMin;
                uvBounds[idx + 1] = bounds.vMin;
                uvBounds[idx + 2] = bounds.uMax;
                uvBounds[idx + 3] = bounds.vMax;
            });
            geometry.setAttribute('uvBounds', new THREE.InstancedBufferAttribute(uvBounds, 4));

            // One-time setup: position + scale each instance (no rotation!)
            const matrix = new THREE.Matrix4();
            const tempMatrix = new THREE.Matrix4();
            const position = new THREE.Vector3();
            const scaleVec = new THREE.Vector3();
            const dummyQuat = new THREE.Quaternion();

            this.atoms.forEach((atom, i) => {
                this.instancedMesh.getMatrixAt(i, tempMatrix);
                // Decompose local instance matrix
                tempMatrix.decompose(position, dummyQuat, scaleVec);
                // Apply instancedMesh's world matrix to get true world position
                position.applyMatrix4(this.instancedMesh.matrixWorld);

                const labelScale = scaleVec.x * 2.0; // Tweak multiplier for label size

                matrix.makeScale(labelScale, labelScale, labelScale);
                matrix.setPosition(position);

                this.labelInstancedMesh.setMatrixAt(i, matrix);
            });

            this.labelInstancedMesh.instanceMatrix.needsUpdate = true;

            this.main.scene.add(this.labelInstancedMesh);
            console.log(`Created labels for ${this.atoms.length} atoms`);
        } else {
            // Update atlas + UVs only
            this.labelInstancedMesh.material.uniforms.map.value = this.labelAtlas;

            const uvBounds = new Float32Array(this.atoms.length * 4);
            this.atoms.forEach((atom, i) => {
                const bounds = this.atomTypeMap[i];
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

    // Create force arrows from force data
    createForceArrows(scale = 1.0, colorPositive = 0xff4444, colorNegative = 0x4444ff) {
        if (!this.forceData || !this.atoms.length) return;

        // Clear existing arrows
        while (this.forceArrowGroup.children.length > 0) {
            const child = this.forceArrowGroup.children[0];
            this.forceArrowGroup.remove(child);
            if (child.geometry) child.geometry.dispose();
            if (child.material) child.material.dispose();
        }

        const stretch = this.stretch;

        // First pass: calculate min/max magnitudes for adaptive coloring
        let minMag = Infinity, maxMag = 0;
        const forceInfos = [];
        for (let i = 0; i < this.atoms.length && i < this.forceData.length; i++) {
            const atom = this.atoms[i];
            const forceAtom = this.forceData[i];
            if (forceAtom.fx === undefined) continue;

            const fx = forceAtom.fx * scale * stretch;
            const fy = forceAtom.fy * scale * stretch;
            const fz = forceAtom.fz * scale * stretch;
            const forceMag = Math.sqrt(fx * fx + fy * fy + fz * fz);
            if (forceMag < 0.001) continue;

            minMag = Math.min(minMag, forceMag);
            maxMag = Math.max(maxMag, forceMag);
            forceInfos.push({ atom, fx, fy, fz, forceMag });
        }

        const magRange = maxMag - minMag || 1;

        // Second pass: create arrows with adaptive colors
        for (const { atom, fx, fy, fz, forceMag } of forceInfos) {
            const dir = new THREE.Vector3(fx, fy, fz).normalize();
            const origin = atom.position.clone().sub(this.offset);

            // Adaptive color: blue (low) -> green (mid) -> red (high)
            const t = (forceMag - minMag) / magRange;
            const color = new THREE.Color();
            if (t < 0.5) {
                color.setRGB(0, t * 2, 1 - t * 2); // blue to green
            } else {
                color.setRGB((t - 0.5) * 2, 1 - (t - 0.5) * 2, 0); // green to red
            }

            const arrow = new THREE.ArrowHelper(
                dir,
                origin,
                forceMag,
                color,
                forceMag * 0.1, // headLength
                forceMag * 0.07  // headWidth
            );

            this.forceArrowGroup.add(arrow);
        }

        this.main.scene.add(this.forceArrowGroup);
        this.forceArrowGroup.visible = true;
    }

    // Toggle force arrows visibility
    toggleForceArrows(show, scale = 1.0) {
        if (show) {
            if (this.forceArrowGroup.children.length === 0 && this.forceData) {
                this.createForceArrows(scale);
            }
            this.forceArrowGroup.visible = true;
        } else {
            this.forceArrowGroup.visible = false;
        }
    }

    // Check if force data is available
    hasForceData() {
        return this.forceData !== null && this.forceData.length > 0 && this.forceData.some(a => a.fx !== undefined);
    }

    // Update force arrows with new scale
    updateForceArrows(scale) {
        if (this.forceArrowGroup.visible) {
            this.createForceArrows(scale);
        }
    }

    // Set force data from external calculation (e.g., MACE backend)
    // forces: array of [fx, fy, fz] arrays, one per atom
    setForcesFromCalculation(forces) {
        if (!forces || !Array.isArray(forces) || forces.length === 0) {
            this.forceData = null;
            return false;
        }

        // Store forces matched to current atoms
        this.forceData = this.atoms.map((atom, i) => {
            const f = forces[i] || [0, 0, 0];
            return {
                element: atom.type,
                x: atom.position.x / this.stretch,
                y: atom.position.y / this.stretch,
                z: atom.position.z / this.stretch,
                fx: f[0],
                fy: f[1],
                fz: f[2]
            };
        });

        return true;
    }

    // Get current forces for a specific frame (from stored frame data)
    setForcesFromFrame(frameData) {
        if (!frameData || !frameData.atomData) {
            this.forceData = null;
            return false;
        }

        const hasForces = frameData.atomData.some(a => a.fx !== undefined);
        if (!hasForces) {
            this.forceData = null;
            return false;
        }

        this.forceData = frameData.atomData;
        return true;
    }

    /**
     * Animate atom positions to target frame data with smooth interpolation.
     * @param {Object} frameData - { atomData: [{element, x, y, z}, ...], numAtoms }
     * @param {number} duration - Animation duration in milliseconds
     * @param {string} easing - Easing function: 'linear', 'easeInOut', 'easeOut'
     * @returns {Promise} Resolves when animation completes
     */
    animateToFrame(frameData, duration = 300, easing = 'easeInOut') {
        return new Promise((resolve) => {
            if (!this.instancedMesh || !this.atoms.length || !frameData?.atomData) {
                resolve(false);
                return;
            }

            // Verify atom count matches
            if (frameData.numAtoms !== this.atoms.length) {
                resolve(false);
                return;
            }

            // Cancel any ongoing animation
            if (this._animationId) {
                cancelAnimationFrame(this._animationId);
                this._animationId = null;
            }

            const stretch = this.stretch;
            const startPositions = this.atoms.map(atom => atom.position.clone());
            const targetPositions = frameData.atomData.map(a =>
                new THREE.Vector3(a.x * stretch, a.y * stretch, a.z * stretch)
            );

            // Store force data for interpolation
            const startForces = this.forceData ? this.forceData.map(f => ({
                fx: f.fx || 0,
                fy: f.fy || 0,
                fz: f.fz || 0
            })) : null;
            const targetForces = frameData.atomData.some(a => a.fx !== undefined) ? frameData.atomData.map(a => ({
                fx: a.fx || 0,
                fy: a.fy || 0,
                fz: a.fz || 0
            })) : null;
            const shouldAnimateForces = startForces && targetForces && this.forceArrowGroup?.visible;

            const startTime = performance.now();
            const matrix = new THREE.Matrix4();
            const atomSize = this.main.mode?.atomSize || 1;

            // Easing functions
            const easingFns = {
                linear: t => t,
                easeInOut: t => t < 0.5 ? 2 * t * t : 1 - Math.pow(-2 * t + 2, 2) / 2,
                easeOut: t => 1 - Math.pow(1 - t, 3),
                easeIn: t => t * t * t
            };
            const easeFn = easingFns[easing] || easingFns.easeInOut;

            const animate = (currentTime) => {
                const elapsed = currentTime - startTime;
                const rawProgress = Math.min(elapsed / duration, 1);
                const progress = easeFn(rawProgress);

                // Interpolate positions
                for (let i = 0; i < this.atoms.length; i++) {
                    const atom = this.atoms[i];
                    const start = startPositions[i];
                    const target = targetPositions[i];

                    // Lerp position
                    atom.position.lerpVectors(start, target, progress);
                    atom.x = atom.position.x;
                    atom.y = atom.position.y;
                    atom.z = atom.position.z;

                    // Update matrix
                    const settings = this.atomSettings[atom.type];
                    const radius = (settings?.realRadius || 0.67) * 1.5 * atomSize;
                    matrix.makeScale(radius, radius, radius);
                    matrix.setPosition(atom.position);
                    this.instancedMesh.setMatrixAt(i, matrix);
                }

                this.instancedMesh.instanceMatrix.needsUpdate = true;

                // Update bonds during animation
                this.updateBonds(this.main.mode);

                // Update labels if visible
                if (this.labelInstancedMesh && this.labelInstancedMesh.visible) {
                    this.updateLabels();
                }

                // Interpolate and update force arrows if needed
                if (shouldAnimateForces) {
                    const interpolatedForces = [];
                    for (let i = 0; i < this.atoms.length; i++) {
                        const start = startForces[i];
                        const target = targetForces[i];
                        interpolatedForces.push({
                            fx: start.fx + (target.fx - start.fx) * progress,
                            fy: start.fy + (target.fy - start.fy) * progress,
                            fz: start.fz + (target.fz - start.fz) * progress
                        });
                    }
                    this.forceData = interpolatedForces;
                    this.createForceArrows(window.forceArrowScale || 1.0);
                }

                // Render
                if (this.main.render) {
                    this.main.render();
                } else if (window.render) {
                    window.render();
                }

                if (rawProgress < 1) {
                    this._animationId = requestAnimationFrame(animate);
                } else {
                    this._animationId = null;
                    // Sync main.data at the end
                    this.main.data.atomData = frameData.atomData.map(a => ({
                        element: a.element,
                        x: a.x,
                        y: a.y,
                        z: a.z,
                        fx: a.fx,
                        fy: a.fy,
                        fz: a.fz
                    }));
                    resolve(true);
                }
            };

            this._animationId = requestAnimationFrame(animate);
        });
    }

    /**
     * Check if an animation is currently running
     * @returns {boolean}
     */
    isAnimating() {
        return this._animationId !== null;
    }

    /**
     * Cancel any ongoing animation
     */
    cancelAnimation() {
        if (this._animationId) {
            cancelAnimationFrame(this._animationId);
            this._animationId = null;
        }
    }

    /**
     * Update atom positions from frame data without rebuilding the mesh.
     * Ideal for animation playback where atoms are the same but positions differ.
     * @param {Object} frameData - { atomData: [{element, x, y, z}, ...], numAtoms }
     * @returns {boolean} True if update succeeded
     */
    updateFromFrame(frameData) {
        if (!this.instancedMesh || !this.atoms.length || !frameData?.atomData) return false;

        // Verify atom count matches
        if (frameData.numAtoms !== this.atoms.length) {
            return false; // Atom count changed, need rebuild
        }

        const stretch = this.stretch;
        const matrix = new THREE.Matrix4();
        const atomSize = this.main.mode?.atomSize || 1;

        for (let i = 0; i < this.atoms.length; i++) {
            const atomData = frameData.atomData[i];
            const atom = this.atoms[i];

            // Update position
            const x = atomData.x * stretch;
            const y = atomData.y * stretch;
            const z = atomData.z * stretch;

            atom.position.set(x, y, z);
            atom.x = atom.position.x;
            atom.y = atom.position.y;
            atom.z = atom.position.z;

            // Update matrix
            const settings = this.atomSettings[atom.type];
            const radius = (settings?.realRadius || 0.67) * 1.5 * atomSize;
            matrix.makeScale(radius, radius, radius);
            matrix.setPosition(atom.position);
            this.instancedMesh.setMatrixAt(i, matrix);
        }

        this.instancedMesh.instanceMatrix.needsUpdate = true;

        // Update bonds
        this.updateBonds(this.main.mode);

        // Update labels if visible
        if (this.labelInstancedMesh && this.labelInstancedMesh.visible) {
            this.updateLabels();
        }

        // Sync main.data
        this.main.data.atomData = frameData.atomData.map(a => ({
            element: a.element,
            x: a.x,
            y: a.y,
            z: a.z,
            fx: a.fx,
            fy: a.fy,
            fz: a.fz
        }));

        return true;
    }

    /**
     * Update material properties in place without rebuilding the mesh.
     * This can update roughness, metalness, opacity, and atom size.
     * Note: Cannot switch between MeshBasicMaterial (mode 0) and MeshStandardMaterial.
     * @param {Object} mode - The new mode settings
     * @returns {boolean} True if update succeeded, false if rebuild is needed
     */
    updateMaterialProperties(mode) {
        if (!this.instancedMesh || !this.instancedMesh.material) return false;

        const material = this.instancedMesh.material;
        const isBasicMaterial = material.type === 'MeshBasicMaterial';
        const newModeIsBasic = mode === 0 || mode == 0;

        // If switching between basic and standard material types, we need a full rebuild
        if (isBasicMaterial !== newModeIsBasic) {
            return false; // Signal that rebuild is needed
        }

        // Update standard material properties if applicable
        if (!isBasicMaterial && mode && typeof mode === 'object') {
            if (mode.roughness !== undefined) material.roughness = mode.roughness;
            if (mode.metalness !== undefined) material.metalness = mode.metalness;
            if (mode.opacity !== undefined) {
                material.opacity = mode.opacity;
                material.transparent = mode.opacity < 1;
            }
            material.needsUpdate = true;
        }

        // Update atom sizes if atomSize changed
        if (mode && mode.atomSize !== undefined) {
            const matrix = new THREE.Matrix4();
            const atomSize = mode.atomSize;

            this.atoms.forEach((atom, idx) => {
                const settings = this.atomSettings[atom.type];
                const radius = (settings?.realRadius || 0.67) * 1.5 * atomSize;
                matrix.makeScale(radius, radius, radius);
                matrix.setPosition(atom.position);
                this.instancedMesh.setMatrixAt(idx, matrix);
            });
            this.instancedMesh.instanceMatrix.needsUpdate = true;
        }

        return true;
    }

    /**
     * Update an atom's element type in place without rebuilding the entire molecule.
     * This changes the color and radius of the specified atom(s).
     * @param {number|number[]} atomIndices - Single index or array of indices to update
     * @param {string} newElement - The new element symbol (e.g., 'C', 'O', 'N')
     */
    updateAtomElement(atomIndices, newElement) {
        if (!this.instancedMesh || !this.atoms.length) return false;

        const indices = Array.isArray(atomIndices) ? atomIndices : [atomIndices];
        const settings = this.atomSettings[newElement];
        if (!settings) return false;

        const colorAttribute = this.instancedMesh.geometry.getAttribute('color');
        const newColor = new THREE.Color(settings.color);
        const newRadius = (settings.realRadius || 0.67) * 1.5;
        const atomSize = this.main.mode?.atomSize || 1;
        const scaledRadius = newRadius * atomSize;
        const matrix = new THREE.Matrix4();

        indices.forEach(idx => {
            if (idx < 0 || idx >= this.atoms.length) return;

            const atom = this.atoms[idx];

            // Update atom object
            atom.type = newElement;
            atom.color = new THREE.Color(settings.color);
            atom.displayColor = atom.color.clone();
            atom.realRadius = settings.realRadius || 0.67;

            // Update color in instanced mesh
            colorAttribute.setXYZ(idx, newColor.r, newColor.g, newColor.b);

            // Update radius/scale in matrix
            matrix.makeScale(scaledRadius, scaledRadius, scaledRadius);
            matrix.setPosition(atom.position);
            this.instancedMesh.setMatrixAt(idx, matrix);
        });

        colorAttribute.needsUpdate = true;
        this.instancedMesh.instanceMatrix.needsUpdate = true;

        // Sync data with main.data
        this.updateMainCoordinates();

        return true;
    }

    /**
     * Rebuild the molecule mesh efficiently after atoms have been added or removed.
     * This recreates just the instanced mesh and bonds, preserving camera state.
     * @param {Object} data - The molecule data with atomData array
     * @param {Object} mode - The rendering mode settings
     */
    rebuildMesh(data, mode) {
        if (!data || !data.atomData) return false;

        // Store current offset if exists
        const currentOffset = this.offset ? this.offset.clone() : null;

        // Clear old mesh but don't reset everything
        if (this.instancedMesh) {
            this.main.scene.remove(this.instancedMesh);
            if (this.instancedMesh.geometry) this.instancedMesh.geometry.dispose();
            if (this.instancedMesh.material) {
                if (Array.isArray(this.instancedMesh.material)) {
                    this.instancedMesh.material.forEach(mat => mat.dispose());
                } else {
                    this.instancedMesh.material.dispose();
                }
            }
            this.instancedMesh = null;
        }

        // Clear atoms array
        this.atoms = [];

        // Recreate atoms with the new data
        this.createAtoms(data, mode);

        // Restore offset if we had one (don't re-center)
        if (currentOffset) {
            this.offset = currentOffset;
            this.instancedMesh.position.sub(currentOffset);
        }

        // Recreate bonds
        this.updateBonds(mode);

        // Update labels if they were visible
        if (this.labelInstancedMesh && this.labelInstancedMesh.visible) {
            this.clearLabels();
            // Labels will be recreated when toggleLabels is called
        }

        // Sync main.data
        this.main.data = data;

        return true;
    }

    /**
     * Add an atom to the molecule and rebuild the mesh.
     * @param {Object} atomData - { element, x, y, z }
     * @param {Object} mode - The rendering mode
     * @returns {number} The index of the new atom, or -1 on failure
     */
    addAtom(atomData, mode) {
        if (!this.main.data || !this.main.data.atomData) return -1;

        // Add to data array
        this.main.data.atomData.push({
            element: atomData.element.toUpperCase(),
            x: atomData.x,
            y: atomData.y,
            z: atomData.z
        });
        this.main.data.numAtoms = this.main.data.atomData.length;

        // Rebuild mesh
        this.rebuildMesh(this.main.data, mode);

        return this.atoms.length - 1;
    }

    /**
     * Remove atoms from the molecule and rebuild the mesh.
     * @param {number[]} indices - Array of atom indices to remove (will be sorted descending)
     * @param {Object} mode - The rendering mode
     * @returns {number} Number of atoms removed
     */
    removeAtoms(indices, mode) {
        if (!this.main.data || !this.main.data.atomData || !indices.length) return 0;

        // Sort indices descending to avoid index shifting issues
        const sortedIndices = [...indices].sort((a, b) => b - a);

        // Remove atoms from data array
        sortedIndices.forEach(idx => {
            if (idx >= 0 && idx < this.main.data.atomData.length) {
                this.main.data.atomData.splice(idx, 1);
            }
        });
        this.main.data.numAtoms = this.main.data.atomData.length;

        // Rebuild mesh
        this.rebuildMesh(this.main.data, mode);

        return sortedIndices.length;
    }
}