function getRandomArbitrary(min, max) {
    return Math.random() * (max - min) + min;
}

function clearScene(scene) {
    // Create an array to store objects to remove
    const objectsToRemove = [];

    // Iterate through all scene children
    scene.traverse((object) => {
        // Skip cameras and lights
        if (!(object.isCamera || object.isLight)) {
            objectsToRemove.push(object);
        }
    });

    // Remove collected objects
    objectsToRemove.forEach((object) => {
        // Dispose of geometries and materials if they exist
        if (object.geometry) {
            object.geometry.dispose();
        }
        if (object.material) {
            if (Array.isArray(object.material)) {
                object.material.forEach(mat => mat.dispose());
            } else {
                object.material.dispose();
            }
        }
        // Remove object from scene
        scene.remove(object);
    });
}

function findFileType(file) {
    const fileName = file.name;
    const fileType = fileName.split('.').pop().toLowerCase()

    return fileType
}
function alignMolecules(movingMolecule, fixedMolecule) {
    // Helper function to calculate distance between two atoms
    function distance(atom1, atom2) {
        const dx = atom1.x - atom2.x;
        const dy = atom1.y - atom2.y;
        const dz = atom1.z - atom2.z;
        return Math.sqrt(dx * dx + dy * dy + dz * dz);
    }

    // Helper function to calculate centroid of atoms
    function calculateCentroid(atoms) {
        let sumX = 0, sumY = 0, sumZ = 0;
        for (const atom of atoms) {
            sumX += atom.x;
            sumY += atom.y;
            sumZ += atom.z;
        }
        const n = atoms.length;
        return { x: sumX / n, y: sumY / n, z: sumZ / n };
    }

    // Convert rotation matrix to Euler angles (X, Y, Z order)
    function matrixToEulerAngles(rotationMatrix) {
        const R = rotationMatrix;

        // Extract Euler angles in XYZ order (Tait-Bryan angles)
        let x, y, z;

        // Check for gimbal lock
        const sy = Math.sqrt(R[0][0] * R[0][0] + R[1][0] * R[1][0]);
        const singular = sy < 1e-6;

        if (!singular) {
            x = Math.atan2(R[2][1], R[2][2]);
            y = Math.atan2(-R[2][0], sy);
            z = Math.atan2(R[1][0], R[0][0]);
        } else {
            x = Math.atan2(-R[1][2], R[1][1]);
            y = Math.atan2(-R[2][0], sy);
            z = 0;
        }

        return { x, y, z };
    }

    // Apply rotation matrix to a point
    function rotatePoint(point, rotationMatrix) {
        const x = rotationMatrix[0][0] * point.x + rotationMatrix[0][1] * point.y + rotationMatrix[0][2] * point.z;
        const y = rotationMatrix[1][0] * point.x + rotationMatrix[1][1] * point.y + rotationMatrix[1][2] * point.z;
        const z = rotationMatrix[2][0] * point.x + rotationMatrix[2][1] * point.y + rotationMatrix[2][2] * point.z;
        return { x, y, z };
    }

    // Apply transformation to atoms for scoring purposes
    function transformAtoms(atoms, rotationMatrix, translation) {
        return atoms.map(atom => {
            const rotated = rotatePoint(atom, rotationMatrix);
            return {
                ...atom,
                x: rotated.x + translation.x,
                y: rotated.y + translation.y,
                z: rotated.z + translation.z
            };
        });
    }

    // Calculate overlap score for a given transformation
    function calculateOverlapScore(movingAtoms, fixedAtoms, rotationMatrix, translation) {
        const transformedMoving = transformAtoms(movingAtoms, rotationMatrix, translation);
        let totalScore = 0;
        let matchCount = 0;

        for (const movingAtom of transformedMoving) {
            let bestDistance = Infinity;
            let bestMatch = null;

            for (const fixedAtom of fixedAtoms) {
                const dist = distance(movingAtom, fixedAtom);
                if (dist < bestDistance) {
                    bestDistance = dist;
                    bestMatch = fixedAtom;
                }
            }

            if (bestMatch) {
                const elementBonus = movingAtom.element === bestMatch.element ? 2.0 : 1.0;
                const distanceScore = Math.exp(-bestDistance) * elementBonus;
                totalScore += distanceScore;
                matchCount++;
            }
        }

        return matchCount > 0 ? totalScore / matchCount : 0;
    }

    // Calculate optimal rotation using Kabsch algorithm
    function calculateOptimalRotation(movingPoints, fixedPoints) {
        if (movingPoints.length === 0) {
            return [[1, 0, 0], [0, 1, 0], [0, 0, 1]];
        }

        const movingCentroid = calculateCentroid(movingPoints);
        const fixedCentroid = calculateCentroid(fixedPoints);

        const centeredMoving = movingPoints.map(p => ({
            x: p.x - movingCentroid.x,
            y: p.y - movingCentroid.y,
            z: p.z - movingCentroid.z
        }));

        const centeredFixed = fixedPoints.map(p => ({
            x: p.x - fixedCentroid.x,
            y: p.y - fixedCentroid.y,
            z: p.z - fixedCentroid.z
        }));

        // Calculate cross-covariance matrix H
        const H = [[0, 0, 0], [0, 0, 0], [0, 0, 0]];
        for (let i = 0; i < centeredMoving.length; i++) {
            const m = centeredMoving[i];
            const f = centeredFixed[i];

            H[0][0] += m.x * f.x; H[0][1] += m.x * f.y; H[0][2] += m.x * f.z;
            H[1][0] += m.y * f.x; H[1][1] += m.y * f.y; H[1][2] += m.y * f.z;
            H[2][0] += m.z * f.x; H[2][1] += m.z * f.y; H[2][2] += m.z * f.z;
        }

        const trace = H[0][0] + H[1][1] + H[2][2];

        if (Math.abs(trace) < 1e-6) {
            return [[1, 0, 0], [0, 1, 0], [0, 0, 1]];
        }

        const norm = Math.sqrt(
            H[0][0] * H[0][0] + H[0][1] * H[0][1] + H[0][2] * H[0][2] +
            H[1][0] * H[1][0] + H[1][1] * H[1][1] + H[1][2] * H[1][2] +
            H[2][0] * H[2][0] + H[2][1] * H[2][1] + H[2][2] * H[2][2]
        );

        if (norm < 1e-6) {
            return [[1, 0, 0], [0, 1, 0], [0, 0, 1]];
        }

        const R = H.map(row => row.map(val => val / norm * 3));

        // Orthogonalize using Gram-Schmidt
        const u0 = R[0];
        const u0_norm = Math.sqrt(u0[0] * u0[0] + u0[1] * u0[1] + u0[2] * u0[2]);
        const e0 = u0_norm > 1e-6 ? u0.map(x => x / u0_norm) : [1, 0, 0];

        const u1 = R[1];
        const dot01 = e0[0] * u1[0] + e0[1] * u1[1] + e0[2] * u1[2];
        const v1 = [u1[0] - dot01 * e0[0], u1[1] - dot01 * e0[1], u1[2] - dot01 * e0[2]];
        const v1_norm = Math.sqrt(v1[0] * v1[0] + v1[1] * v1[1] + v1[2] * v1[2]);
        const e1 = v1_norm > 1e-6 ? v1.map(x => x / v1_norm) : [0, 1, 0];

        const e2 = [
            e0[1] * e1[2] - e0[2] * e1[1],
            e0[2] * e1[0] - e0[0] * e1[2],
            e0[0] * e1[1] - e0[1] * e1[0]
        ];

        return [e0, e1, e2];
    }

    // Find the best alignment strategy
    function findBestAlignment(movingAtoms, fixedAtoms) {
        let bestScore = -Infinity;
        let bestTransformation = {
            rotation: [[1, 0, 0], [0, 1, 0], [0, 0, 1]],
            translation: { x: 0, y: 0, z: 0 }
        };

        const movingCentroid = calculateCentroid(movingAtoms);
        const fixedCentroid = calculateCentroid(fixedAtoms);
        const centroidTranslation = {
            x: fixedCentroid.x - movingCentroid.x,
            y: fixedCentroid.y - movingCentroid.y,
            z: fixedCentroid.z - movingCentroid.z
        };

        // Strategy 1: Simple centroid alignment
        const centroidScore = calculateOverlapScore(
            movingAtoms, fixedAtoms,
            [[1, 0, 0], [0, 1, 0], [0, 0, 1]],
            centroidTranslation
        );

        if (centroidScore > bestScore) {
            bestScore = centroidScore;
            bestTransformation = {
                rotation: [[1, 0, 0], [0, 1, 0], [0, 0, 1]],
                translation: centroidTranslation
            };
        }

        // Strategy 2: Kabsch alignment with matching elements
        const sameElementPairs = [];
        for (const movingAtom of movingAtoms) {
            const matchingFixed = fixedAtoms.filter(atom => atom.element === movingAtom.element);
            if (matchingFixed.length > 0) {
                let closest = matchingFixed[0];
                let minDist = distance(movingAtom, closest);
                for (const candidate of matchingFixed) {
                    const d = distance(movingAtom, candidate);
                    if (d < minDist) {
                        minDist = d;
                        closest = candidate;
                    }
                }
                sameElementPairs.push([movingAtom, closest]);
            }
        }

        if (sameElementPairs.length >= 2) {
            const movingPoints = sameElementPairs.map(pair => pair[0]);
            const fixedPoints = sameElementPairs.map(pair => pair[1]);

            const rotation = calculateOptimalRotation(movingPoints, fixedPoints);
            const rotatedCentroid = rotatePoint(movingCentroid, rotation);
            const translation = {
                x: fixedCentroid.x - rotatedCentroid.x,
                y: fixedCentroid.y - rotatedCentroid.y,
                z: fixedCentroid.z - rotatedCentroid.z
            };

            const kabschScore = calculateOverlapScore(movingAtoms, fixedAtoms, rotation, translation);

            if (kabschScore > bestScore) {
                bestScore = kabschScore;
                bestTransformation = { rotation, translation };
            }
        }

        // Strategy 3: Try systematic rotations
        for (let attempt = 0; attempt < 12; attempt++) {
            const angle = (attempt * Math.PI) / 6; // 30-degree increments
            const axis = attempt < 4 ? 2 : (attempt < 8 ? 1 : 0); // z, y, x axes

            const cos = Math.cos(angle);
            const sin = Math.sin(angle);
            let rotation;

            if (axis === 2) { // Z-axis
                rotation = [[cos, -sin, 0], [sin, cos, 0], [0, 0, 1]];
            } else if (axis === 1) { // Y-axis
                rotation = [[cos, 0, sin], [0, 1, 0], [-sin, 0, cos]];
            } else { // X-axis
                rotation = [[1, 0, 0], [0, cos, -sin], [0, sin, cos]];
            }

            const rotatedCentroid = rotatePoint(movingCentroid, rotation);
            const translation = {
                x: fixedCentroid.x - rotatedCentroid.x,
                y: fixedCentroid.y - rotatedCentroid.y,
                z: fixedCentroid.z - rotatedCentroid.z
            };

            const score = calculateOverlapScore(movingAtoms, fixedAtoms, rotation, translation);

            if (score > bestScore) {
                bestScore = score;
                bestTransformation = { rotation, translation };
            }
        }

        return bestTransformation;
    }

    // Main alignment logic
    const movingAtoms = movingMolecule.atomData;
    const fixedAtoms = fixedMolecule.atomData;

    // Find the best transformation
    const { rotation, translation } = findBestAlignment(movingAtoms, fixedAtoms);

    // Convert rotation matrix to Euler angles
    const rotationAngles = matrixToEulerAngles(rotation);

    // Return transformation parameters for Three.js
    return {
        rotation: {
            x: rotationAngles.x, // Rotation around X-axis in radians
            y: rotationAngles.y, // Rotation around Y-axis in radians
            z: rotationAngles.z  // Rotation around Z-axis in radians
        },
        translation: {
            x: translation.x, // Translation along X-axis
            y: translation.y, // Translation along Y-axis
            z: translation.z  // Translation along Z-axis
        }
    };
}
