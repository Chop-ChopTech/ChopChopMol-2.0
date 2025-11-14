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
        const curve = new THREE.CatmullRomCurve3(caPoints, false, 'catmullrom', 0.5);
        const numPoints = chain.length * 10; // High resolution
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
    const vertices = [];
    const indices = [];
    const colors = [];

    // Compute smooth frame (rotation-minimizing)
    const frame = computeRMF(points);

    // Color map
    const helixColor = new THREE.Color(0xd946d9); // Magenta
    const sheetColor = new THREE.Color(0xffd700); // Yellow
    const loopColor = new THREE.Color(0x4df0a6);  // Cyan-green

    const radialSegments = 12; // Smooth cross-section

    // Create ribbon with smooth transitions
    for (let i = 0; i < points.length; i++) {
        const point = points[i];
        const normal = frame.normals[i];
        const binormal = frame.binormals[i];
        const structType = structureTypes[i];

        // Smoothly interpolate dimensions at transitions
        let width, thickness;
        let color;

        // Get dimensions for current structure with smooth transitions
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

        // Smooth transition at boundaries
        if (i > 0 && structureTypes[i] !== structureTypes[i - 1]) {
            // We're at a transition - blend dimensions
            const transitionWindow = 5;
            if (i < transitionWindow) {
                const t = i / transitionWindow;
                const prevWidth = getWidth(structureTypes[0], helixW, sheetW, loopW);
                const prevThickness = getThickness(structureTypes[0], helixT, sheetT, loopT);
                width = prevWidth + (width - prevWidth) * t;
                thickness = prevThickness + (thickness - prevThickness) * t;
            }
        }

        if (i < points.length - 1 && structureTypes[i] !== structureTypes[i + 1]) {
            const transitionWindow = 5;
            const remaining = points.length - i - 1;
            if (remaining < transitionWindow) {
                const t = remaining / transitionWindow;
                const nextWidth = getWidth(structureTypes[i + 1], helixW, sheetW, loopW);
                const nextThickness = getThickness(structureTypes[i + 1], helixT, sheetT, loopT);
                width = width + (nextWidth - width) * (1 - t);
                thickness = thickness + (nextThickness - thickness) * (1 - t);
            }
        }

        // Rainbow coloring option
        if (colorMode === 'rainbow') {
            const t = i / points.length;
            const hue = (1.0 - t) * 0.7;
            color = new THREE.Color().setHSL(hue, 1.0, 0.5);
        }

        // Create elliptical cross-section
        for (let j = 0; j <= radialSegments; j++) {
            const angle = (j / radialSegments) * Math.PI * 2;
            const x = Math.cos(angle) * width / 2;
            const y = Math.sin(angle) * thickness / 2;

            const offset = normal.clone().multiplyScalar(x)
                .add(binormal.clone().multiplyScalar(y));
            const vertex = point.clone().add(offset);

            vertices.push(vertex.x, vertex.y, vertex.z);
            colors.push(color.r, color.g, color.b);
        }
    }

    // Create faces connecting cross-sections
    for (let i = 0; i < points.length - 1; i++) {
        for (let j = 0; j < radialSegments; j++) {
            const base = i * (radialSegments + 1);
            const a = base + j;
            const b = base + j + 1;
            const c = base + j + radialSegments + 1;
            const d = base + j + radialSegments + 2;

            indices.push(a, c, b);
            indices.push(b, c, d);
        }
    }

    geometry.setAttribute('position', new THREE.Float32BufferAttribute(vertices, 3));
    geometry.setAttribute('color', new THREE.Float32BufferAttribute(colors, 3));
    geometry.setIndex(indices);
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