import * as THREE from 'three';

export function createRibbon(ribbonData, scene, stretch = 4, offset = { x: 0, y: 0, z: 0 }, colorMode = 'structure') {
    if (!ribbonData || !ribbonData.backbone || ribbonData.backbone.length < 2) {
        console.warn('No backbone data for ribbon');
        return null;
    }

    const ribbonGroup = new THREE.Group();

    // Group by chain
    const chains = {};
    ribbonData.backbone.forEach(atom => {
        if (!chains[atom.chain]) chains[atom.chain] = [];
        chains[atom.chain].push(atom);
    });

    // Standard ribbon parameters
    const HELIX_WIDTH = 1.3 * stretch;
    const HELIX_THICKNESS = 0.6 * stretch;
    const SHEET_WIDTH = 1.8 * stretch;
    const SHEET_THICKNESS = 0.25 * stretch;
    const LOOP_WIDTH = 0.5 * stretch;
    const LOOP_THICKNESS = 0.5 * stretch;

    // Create ribbon for each chain
    Object.keys(chains).forEach(chainId => {
        const chain = chains[chainId].sort((a, b) => a.resSeq - b.resSeq);

        if (chain.length < 4) return;

        // Create smooth curve through CA atoms
        const caPoints = chain.map(atom =>
            new THREE.Vector3(
                atom.x * stretch - offset.x,
                atom.y * stretch - offset.y,
                atom.z * stretch - offset.z
            )
        );

        // High-quality smooth curve with many interpolated points
        const curve = new THREE.CatmullRomCurve3(caPoints, false, 'catmullrom', 0.9);
        const numPoints = chain.length * 5;
        const smoothPoints = curve.getPoints(numPoints);

        // Determine secondary structure for each smooth point
        const structureData = smoothPoints.map((point, i) => {
            const t = i / numPoints;
            const caIndex = Math.min(Math.floor(t * chain.length), chain.length - 1);
            const resSeq = chain[caIndex].resSeq;

            const helix = ribbonData.helices.find(h =>
                h.chain === chainId && resSeq >= h.start && resSeq <= h.end);
            if (helix) return 'helix';

            const sheet = ribbonData.sheets.find(s =>
                s.chain === chainId && resSeq >= s.start && resSeq <= s.end);
            if (sheet) return 'sheet';

            return 'loop';
        });

        // Create ONE continuous ribbon for the entire chain
        const geometry = createContinuousRibbon(
            smoothPoints,
            structureData,
            HELIX_WIDTH, HELIX_THICKNESS,
            SHEET_WIDTH, SHEET_THICKNESS,
            LOOP_WIDTH, LOOP_THICKNESS,
            colorMode,
            numPoints
        );

        const material = new THREE.MeshPhongMaterial({
            vertexColors: true,
            shininess: 80,
            side: THREE.DoubleSide,
            flatShading: false
        });

        const mesh = new THREE.Mesh(geometry, material);
        ribbonGroup.add(mesh);
    });

    scene.add(ribbonGroup);
    return ribbonGroup;
}

function createContinuousRibbon(points, structureTypes, helixW, helixT, sheetW, sheetT, loopW, loopT, colorMode, totalPoints) {
    const geometry = new THREE.BufferGeometry();

    // PRE-ALLOCATE with exact sizes
    const radialSegments = 12;
    const vertexCount = points.length * (radialSegments + 1);
    const vertices = new Float32Array(vertexCount * 3);
    const colors = new Float32Array(vertexCount * 3);
    const indices = new Uint32Array((points.length - 1) * radialSegments * 6);

    let vertexIndex = 0;
    let colorIndex = 0;
    let indexIndex = 0;

    // Compute frame once
    const frame = computeRMF(points);

    // Color constants
    const helixColor = new THREE.Color(0xd946d9);
    const sheetColor = new THREE.Color(0xffd700);
    const loopColor = new THREE.Color(0x4df0a6);

    // REUSABLE VECTORS (critical optimization!)
    const tempNormal = new THREE.Vector3();
    const tempBinormal = new THREE.Vector3();
    const tempOffset = new THREE.Vector3();
    const tempVertex = new THREE.Vector3();

    // Pre-compute transition regions (avoid checking every point)
    const transitionRegions = new Set();
    for (let i = 1; i < points.length; i++) {
        if (structureTypes[i] !== structureTypes[i - 1]) {
            for (let j = Math.max(0, i - 5); j < Math.min(points.length, i + 5); j++) {
                transitionRegions.add(j);
            }
        }
    }

    // Create vertices
    for (let i = 0; i < points.length; i++) {
        const point = points[i];
        const normal = frame.normals[i];
        const binormal = frame.binormals[i];
        const structType = structureTypes[i];

        // Get base dimensions
        let width, thickness, color;

        if (structType === 'helix') {
            width = helixW;
            thickness = helixT;
            color = helixColor;
        } else if (structType === 'sheet') {
            width = sheetW;
            thickness = sheetT;
            color = sheetColor;
        } else {
            width = loopW;
            thickness = loopT;
            color = loopColor;
        }

        // Only compute transitions for points in transition regions
        if (transitionRegions.has(i)) {
            // Simplified transition logic
            if (i > 0 && structureTypes[i] !== structureTypes[i - 1]) {
                const transitionWindow = 5;
                const distFromTransition = i % transitionWindow;
                if (distFromTransition < transitionWindow) {
                    const t = distFromTransition / transitionWindow;
                    const prevWidth = getWidth(structureTypes[i - 1], helixW, sheetW, loopW);
                    const prevThickness = getThickness(structureTypes[i - 1], helixT, sheetT, loopT);
                    width = prevWidth + (width - prevWidth) * t;
                    thickness = prevThickness + (thickness - prevThickness) * t;
                }
            }
        }

        // Rainbow mode
        if (colorMode === 'rainbow') {
            const t = i / points.length;
            const hue = (1.0 - t) * 0.7;
            color.setHSL(hue, 1.0, 0.5);
        }

        // Create cross-section using reusable vectors
        const halfWidth = width * 0.5;
        const halfThickness = thickness * 0.5;
        const angleStep = (Math.PI * 2) / radialSegments;

        for (let j = 0; j <= radialSegments; j++) {
            const angle = j * angleStep;
            const cosAngle = Math.cos(angle);
            const sinAngle = Math.sin(angle);

            // Reuse vectors instead of creating new ones
            tempNormal.copy(normal).multiplyScalar(cosAngle * halfWidth);
            tempBinormal.copy(binormal).multiplyScalar(sinAngle * halfThickness);
            tempOffset.addVectors(tempNormal, tempBinormal);
            tempVertex.addVectors(point, tempOffset);

            // Direct assignment to typed array
            vertices[vertexIndex++] = tempVertex.x;
            vertices[vertexIndex++] = tempVertex.y;
            vertices[vertexIndex++] = tempVertex.z;

            colors[colorIndex++] = color.r;
            colors[colorIndex++] = color.g;
            colors[colorIndex++] = color.b;
        }
    }

    // Create indices (triangles)
    const vertsPerSlice = radialSegments + 1;
    for (let i = 0; i < points.length - 1; i++) {
        const base = i * vertsPerSlice;
        for (let j = 0; j < radialSegments; j++) {
            const a = base + j;
            const b = base + j + 1;
            const c = base + j + vertsPerSlice;
            const d = base + j + vertsPerSlice + 1;

            indices[indexIndex++] = a;
            indices[indexIndex++] = c;
            indices[indexIndex++] = b;

            indices[indexIndex++] = b;
            indices[indexIndex++] = c;
            indices[indexIndex++] = d;
        }
    }

    geometry.setAttribute('position', new THREE.BufferAttribute(vertices, 3));
    geometry.setAttribute('color', new THREE.BufferAttribute(colors, 3));
    geometry.setIndex(new THREE.BufferAttribute(indices, 1));
    geometry.computeVertexNormals();

    return geometry;
}

function getWidth(structType, helixW, sheetW, loopW) {
    if (structType === 'helix') return helixW;
    if (structType === 'sheet') return sheetW;
    return loopW;
}

function getThickness(structType, helixT, sheetT, loopT) {
    if (structType === 'helix') return helixT;
    if (structType === 'sheet') return sheetT;
    return loopT;
}

// Compute rotation-minimizing frame (smooth, no twist)
function computeRMF(points) {
    const tangents = [];
    const normals = [];
    const binormals = [];

    // Compute smooth tangents
    for (let i = 0; i < points.length; i++) {
        let tangent;
        if (i === 0) {
            tangent = new THREE.Vector3().subVectors(points[1], points[0]).normalize();
        } else if (i === points.length - 1) {
            tangent = new THREE.Vector3().subVectors(points[i], points[i - 1]).normalize();
        } else {
            // Use central difference for smoother tangent
            tangent = new THREE.Vector3().subVectors(points[i + 1], points[i - 1]).normalize();
        }
        tangents.push(tangent);
    }

    // Compute rotation-minimizing normals (parallel transport)
    for (let i = 0; i < points.length; i++) {
        let normal;

        if (i === 0) {
            // Initialize first normal perpendicular to tangent
            const up = Math.abs(tangents[0].y) < 0.99
                ? new THREE.Vector3(0, 1, 0)
                : new THREE.Vector3(1, 0, 0);
            normal = new THREE.Vector3().crossVectors(tangents[0], up).normalize();
        } else {
            // Parallel transport from previous normal
            const v1 = new THREE.Vector3().subVectors(points[i], points[i - 1]);
            const c1 = v1.lengthSq();

            if (c1 < 0.000001) {
                normal = normals[i - 1].clone();
            } else {
                const rL = normals[i - 1].clone().sub(
                    v1.clone().multiplyScalar(2 / c1 * v1.dot(normals[i - 1]))
                );
                const tL = tangents[i - 1].clone().sub(
                    v1.clone().multiplyScalar(2 / c1 * v1.dot(tangents[i - 1]))
                );
                const v2 = new THREE.Vector3().subVectors(tangents[i], tL);
                const c2 = v2.lengthSq();

                if (c2 < 0.000001) {
                    normal = rL;
                } else {
                    normal = rL.sub(v2.clone().multiplyScalar(2 / c2 * v2.dot(rL)));
                }
                normal.normalize();
            }
        }
        normals.push(normal);

        const binormal = new THREE.Vector3().crossVectors(tangents[i], normals[i]).normalize();
        binormals.push(binormal);
    }

    return { tangents, normals, binormals };
}

export function removeRibbon(ribbonGroup, scene) {
    if (!ribbonGroup) return;

    ribbonGroup.traverse(obj => {
        if (obj.geometry) obj.geometry.dispose();
        if (obj.material) obj.material.dispose();
    });

    scene.remove(ribbonGroup);
}