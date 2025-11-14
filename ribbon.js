import * as THREE from 'three';

export function createRibbon(ribbonData, scene, stretch = 4, offset = { x: 0, y: 0, z: 0 }) {
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

    // Create ribbon for each chain
    Object.keys(chains).forEach(chainId => {
        const chain = chains[chainId].sort((a, b) => a.resSeq - b.resSeq);

        if (chain.length < 2) return;

        // Create spline through CA atoms (apply stretch AND offset like bonds do)
        const points = chain.map(atom =>
            new THREE.Vector3(
                atom.x * stretch - offset.x,
                atom.y * stretch - offset.y,
                atom.z * stretch - offset.z
            )
        );
        const curve = new THREE.CatmullRomCurve3(points);

        // Determine secondary structure type
        const getStructureType = (resSeq) => {
            if (ribbonData.helices.some(h =>
                h.chain === chainId && resSeq >= h.start && resSeq <= h.end)) {
                return 'helix';
            }
            if (ribbonData.sheets.some(s =>
                s.chain === chainId && resSeq >= s.start && resSeq <= s.end)) {
                return 'sheet';
            }
            return 'loop';
        };

        // Create tube geometry
        const segments = Math.max(chain.length * 3, 50);
        const tubeGeometry = new THREE.TubeGeometry(curve, segments, 0.3 * stretch, 8, false);

        // Color vertices by secondary structure
        const positionCount = tubeGeometry.attributes.position.count;
        const colors = new Float32Array(positionCount * 3);

        const colorHelix = new THREE.Color(0xff6b9d);  // Pink
        const colorSheet = new THREE.Color(0xffd700);  // Gold
        const colorLoop = new THREE.Color(0x00ff88);   // Green

        // Map each vertex to its nearest residue
        for (let i = 0; i < positionCount; i++) {
            const t = i / positionCount;
            const chainIndex = Math.floor(t * chain.length);
            const residueIndex = Math.min(chainIndex, chain.length - 1);

            const structType = getStructureType(chain[residueIndex].resSeq);
            const color = structType === 'helix' ? colorHelix :
                structType === 'sheet' ? colorSheet : colorLoop;

            colors[i * 3] = color.r;
            colors[i * 3 + 1] = color.g;
            colors[i * 3 + 2] = color.b;
        }

        tubeGeometry.setAttribute('color', new THREE.BufferAttribute(colors, 3));

        const material = new THREE.MeshPhongMaterial({
            vertexColors: true,
            shininess: 30,
            side: THREE.DoubleSide
        });

        const ribbon = new THREE.Mesh(tubeGeometry, material);
        ribbonGroup.add(ribbon);
    });

    scene.add(ribbonGroup);
    return ribbonGroup;
}

export function removeRibbon(ribbonGroup, scene) {
    if (!ribbonGroup) return;

    ribbonGroup.traverse(obj => {
        if (obj.geometry) obj.geometry.dispose();
        if (obj.material) obj.material.dispose();
    });

    scene.remove(ribbonGroup);
}