// Molecular scan utilities (rotational, angle, translation scans)

import { generateTransformFrames, loadFrames } from './frameUtils.js';

/**
 * Generates frames for a rotational scan around an axis
 * @param {Object} params - Scan parameters
 * @param {Array} params.allAtoms - All atoms
 * @param {number} params.axisAtom1 - First axis atom index
 * @param {number} params.axisAtom2 - Second axis atom index
 * @param {Array} params.atomsToMove - Indices of atoms to rotate
 * @param {number} params.startAngle - Starting angle in degrees
 * @param {number} params.endAngle - Ending angle in degrees
 * @param {number} params.increment - Angle increment in degrees
 * @param {Object} params.offset - Molecule offset {x, y, z}
 * @param {number} params.stretch - Stretch factor
 * @returns {Object} Result with success status and message
 */
export function generateRotationalScan({
    allAtoms,
    axisAtom1,
    axisAtom2,
    atomsToMove,
    startAngle,
    endAngle,
    increment,
    offset,
    stretch
}) {
    const atom1 = allAtoms[axisAtom1];
    const atom2 = allAtoms[axisAtom2];

    if (!atom1 || !atom2) {
        return { success: false, message: "Invalid axis atoms" };
    }

    if (!atomsToMove || atomsToMove.length === 0) {
        return { success: false, message: "No atoms to rotate" };
    }

    if (!increment || increment <= 0) {
        return { success: false, message: "Increment must be positive" };
    }

    const range = endAngle - startAngle;
    const steps = Math.floor(Math.abs(range) / increment) + 1;
    const direction = range >= 0 ? 1 : -1;

    // Calculate axis
    const pos1 = atom1.position.clone();
    const pos2 = atom2.position.clone();
    const axisDirection = new window.THREE.Vector3().subVectors(pos2, pos1).normalize();
    const axisPoint = pos1.clone();

    // Store original positions
    const originalPositions = {};
    atomsToMove.forEach(idx => {
        const atom = allAtoms[idx];
        if (atom) originalPositions[idx] = atom.position.clone();
    });

    const atomsToMoveSet = new Set(atomsToMove);

    // Generate frames
    const frames = generateTransformFrames({
        allAtoms,
        atomsToMove,
        offset,
        stretch,
        steps,
        transformFunc: (atomPos, step) => {
            const angle = startAngle + step * increment * direction;
            const angleRadians = angle * Math.PI / 180;
            const rotMatrix = new window.THREE.Matrix4().makeRotationAxis(axisDirection, angleRadians);

            const atomIdx = allAtoms.findIndex(a => a.position === atomPos);
            if (atomsToMoveSet.has(atomIdx)) {
                const basePos = originalPositions[atomIdx].clone();
                basePos.sub(axisPoint);
                basePos.applyMatrix4(rotMatrix);
                basePos.add(axisPoint);
                return basePos;
            }
            return atomPos;
        },
        commentFunc: (step) => {
            const angle = startAngle + step * increment * direction;
            return `angle=${angle}`;
        }
    });

    loadFrames(frames, 0);

    return {
        success: true,
        message: `Generated ${steps} frames (${startAngle}° to ${startAngle + (steps - 1) * increment * direction}° in ${increment}° steps). Rotating ${atomsToMove.length} atoms. Use frame slider to play.`
    };
}

/**
 * Generates frames for an angle scan
 * @param {Object} params - Scan parameters
 * @param {Array} params.allAtoms - All atoms
 * @param {Array} params.bonds - All bonds
 * @param {number} params.atom1 - First atom index
 * @param {number} params.atom2 - Vertex atom index
 * @param {number} params.atom3 - Third atom index
 * @param {number} params.startAngle - Starting angle in degrees
 * @param {number} params.endAngle - Ending angle in degrees
 * @param {number} params.increment - Angle increment in degrees
 * @param {Array} params.atomsToMove - Atoms to move (optional, will auto-detect)
 * @param {Object} params.offset - Molecule offset {x, y, z}
 * @param {number} params.stretch - Stretch factor
 * @returns {Object} Result with success status and message
 */
export function generateAngleScan({
    allAtoms,
    bonds,
    atom1,
    atom2,
    atom3,
    startAngle,
    endAngle,
    increment,
    atomsToMove,
    offset,
    stretch
}) {
    const a1 = allAtoms[atom1];
    const a2 = allAtoms[atom2];
    const a3 = allAtoms[atom3];

    if (!a1 || !a2 || !a3) {
        return { success: false, message: "Invalid atom indices" };
    }

    if (increment <= 0) {
        return { success: false, message: "Increment must be positive" };
    }

    const range = endAngle - startAngle;
    const steps = Math.floor(Math.abs(range) / increment) + 1;
    const direction = range >= 0 ? 1 : -1;

    // Calculate rotation axis (perpendicular to plane ABC)
    const vecBA = new window.THREE.Vector3().subVectors(a1.position, a2.position);
    const vecBC = new window.THREE.Vector3().subVectors(a3.position, a2.position);
    const rotationAxis = new window.THREE.Vector3().crossVectors(vecBA, vecBC).normalize();

    if (rotationAxis.lengthSq() < 0.0001) {
        return { success: false, message: "Atoms are collinear" };
    }

    if (!atomsToMove || atomsToMove.length === 0) {
        return { success: false, message: "No atoms to move" };
    }

    const pivot = a2.position.clone();

    // Store original positions
    const originalPositions = {};
    atomsToMove.forEach(idx => {
        const atom = allAtoms[idx];
        if (atom) originalPositions[idx] = atom.position.clone();
    });

    const atomsToMoveSet = new Set(atomsToMove);

    const frames = generateTransformFrames({
        allAtoms,
        atomsToMove,
        offset,
        stretch,
        steps,
        transformFunc: (atomPos, step) => {
            const angle = startAngle + step * increment * direction;
            const angleRadians = angle * Math.PI / 180;
            const rotMatrix = new window.THREE.Matrix4().makeRotationAxis(rotationAxis, -angleRadians);

            const atomIdx = allAtoms.findIndex(a => a.position === atomPos);
            if (atomsToMoveSet.has(atomIdx)) {
                const basePos = originalPositions[atomIdx].clone();
                basePos.sub(pivot);
                basePos.applyMatrix4(rotMatrix);
                basePos.add(pivot);
                return basePos;
            }
            return atomPos;
        },
        commentFunc: (step) => {
            const angle = startAngle + step * increment * direction;
            return `angle=${angle}`;
        }
    });

    loadFrames(frames, 0);

    return {
        success: true,
        message: `Generated ${steps} frames (${startAngle}° to ${startAngle + (steps - 1) * increment * direction}° in ${increment}° steps). Rotating ${atomsToMove.length} atoms. Use frame slider to play.`
    };
}

/**
 * Generates frames for a translation scan
 * @param {Object} params - Scan parameters
 * @param {Array} params.allAtoms - All atoms
 * @param {number} params.axisAtom1 - First axis atom index
 * @param {number} params.axisAtom2 - Second axis atom index
 * @param {Array} params.atomsToMove - Indices of atoms to translate
 * @param {number} params.startDistance - Starting distance in Angstroms
 * @param {number} params.endDistance - Ending distance in Angstroms
 * @param {number} params.increment - Distance increment in Angstroms
 * @param {Object} params.offset - Molecule offset {x, y, z}
 * @param {number} params.stretch - Stretch factor
 * @returns {Object} Result with success status and message
 */
export function generateTranslationScan({
    allAtoms,
    axisAtom1,
    axisAtom2,
    atomsToMove,
    startDistance,
    endDistance,
    increment,
    offset,
    stretch
}) {
    const atom1 = allAtoms[axisAtom1];
    const atom2 = allAtoms[axisAtom2];

    if (!atom1 || !atom2) {
        return { success: false, message: "Invalid axis atoms" };
    }

    if (!atomsToMove || atomsToMove.length === 0) {
        return { success: false, message: "No atoms to translate" };
    }

    if (!increment || increment <= 0) {
        return { success: false, message: "Increment must be positive" };
    }

    const range = endDistance - startDistance;
    const steps = Math.floor(Math.abs(range) / increment) + 1;
    const direction = range >= 0 ? 1 : -1;

    // Calculate axis
    const pos1 = atom1.position.clone();
    const pos2 = atom2.position.clone();
    const axisDirection = new window.THREE.Vector3().subVectors(pos2, pos1).normalize();

    const atomsToMoveSet = new Set(atomsToMove);

    const frames = generateTransformFrames({
        allAtoms,
        atomsToMove,
        offset,
        stretch,
        steps,
        transformFunc: (atomPos, step) => {
            const dist = startDistance + step * increment * direction;
            const translation = axisDirection.clone().multiplyScalar(dist * stretch);

            const atomIdx = allAtoms.findIndex(a => a.position === atomPos);
            if (atomsToMoveSet.has(atomIdx)) {
                return atomPos.clone().add(translation);
            }
            return atomPos;
        },
        commentFunc: (step) => {
            const dist = startDistance + step * increment * direction;
            return `dist=${dist.toFixed(2)}`;
        }
    });

    loadFrames(frames, 0);

    return {
        success: true,
        message: `Generated ${steps} frames (${startDistance}Å to ${startDistance + (steps - 1) * increment * direction}Å in ${increment}Å steps). Use frame slider to play.`
    };
}
