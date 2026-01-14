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
// Helper function to parse mmCIF data lines (handles quotes and whitespace)
function parseCifLine(line) {
    const values = [];
    let current = '';
    let inQuotes = false;
    let quoteChar = null;

    for (let i = 0; i < line.length; i++) {
        const char = line[i];

        if ((char === '"' || char === "'") && !inQuotes) {
            inQuotes = true;
            quoteChar = char;
        } else if (char === quoteChar && inQuotes) {
            inQuotes = false;
            quoteChar = null;
        } else if (char === ' ' && !inQuotes) {
            if (current) {
                values.push(current);
                current = '';
            }
        } else {
            current += char;
        }
    }

    if (current) {
        values.push(current);
    }

    return values;
}
function findFileType(file) {
    const name = file.name.toLowerCase();
    if (name.endsWith('.mol') || name.endsWith('.sdf')) return 'mol';
    if (name.endsWith('.pdb')) return 'pdb';
    if (name.endsWith('.extxyz')) return 'extxyz';
    if (name.endsWith('.xyz')) return 'xyz';
    if (name.endsWith('.cif') || name.endsWith('.mmcif')) return 'cif';
    if (name.endsWith('.mol2')) return 'mol2';
    if (name.endsWith('.pqr')) return 'pqr';
    if (name.endsWith('.gro')) return 'gro';
    if (name.endsWith('.cml')) return 'cml';
    if (name.endsWith('.out')) return 'out';
    return 'mol';
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

    // Convert rotation matrix to Euler angles (XYZ order)
    function matrixToEulerAngles(rotationMatrix) {
        const R = rotationMatrix;

        // Clamp values to avoid numerical issues
        const clamp = (val, min = -1, max = 1) => Math.max(min, Math.min(max, val));

        let x, y, z;

        // Extract Euler angles in XYZ order
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
        const R = rotationMatrix;
        return {
            x: R[0][0] * point.x + R[0][1] * point.y + R[0][2] * point.z,
            y: R[1][0] * point.x + R[1][1] * point.y + R[1][2] * point.z,
            z: R[2][0] * point.x + R[2][1] * point.y + R[2][2] * point.z
        };
    }

    // Calculate RMSD (Root Mean Square Deviation) between two sets of points
    function calculateRMSD(movingAtoms, fixedAtoms, rotationMatrix, translation) {
        const transformedMoving = movingAtoms.map(atom => {
            const rotated = rotatePoint(atom, rotationMatrix);
            return {
                x: rotated.x + translation.x,
                y: rotated.y + translation.y,
                z: rotated.z + translation.z
            };
        });

        let totalSquaredDistance = 0;
        let pairCount = 0;

        // For each transformed moving atom, find closest fixed atom
        for (const movingAtom of transformedMoving) {
            let minDistance = Infinity;
            let bestMatch = null;

            for (const fixedAtom of fixedAtoms) {
                const dist = distance(movingAtom, fixedAtom);
                if (dist < minDistance) {
                    minDistance = dist;
                    bestMatch = fixedAtom;
                }
            }

            if (bestMatch) {
                // Give bonus for matching elements (reduce effective distance)
                const elementBonus = movingAtom.element === bestMatch.element ? 0.5 : 1.0;
                const effectiveDistance = minDistance * elementBonus;
                totalSquaredDistance += effectiveDistance * effectiveDistance;
                pairCount++;
            }
        }

        return pairCount > 0 ? Math.sqrt(totalSquaredDistance / pairCount) : Infinity;
    }

    // Create rotation matrix from axis-angle representation
    function axisAngleToMatrix(axis, angle) {
        const [x, y, z] = axis;
        const c = Math.cos(angle);
        const s = Math.sin(angle);
        const t = 1 - c;

        return [
            [t * x * x + c, t * x * y - z * s, t * x * z + y * s],
            [t * x * y + z * s, t * y * y + c, t * y * z - x * s],
            [t * x * z - y * s, t * y * z + x * s, t * z * z + c]
        ];
    }

    // Normalize a vector
    function normalize(vector) {
        const mag = Math.sqrt(vector[0] * vector[0] + vector[1] * vector[1] + vector[2] * vector[2]);
        return mag > 1e-10 ? vector.map(v => v / mag) : [1, 0, 0];
    }

    // Find best alignment using multiple strategies
    function findBestAlignment(movingAtoms, fixedAtoms) {
        let bestRMSD = Infinity;
        let bestTransformation = {
            rotation: [[1, 0, 0], [0, 1, 0], [0, 0, 1]],
            translation: { x: 0, y: 0, z: 0 }
        };

        const movingCentroid = calculateCentroid(movingAtoms);
        const fixedCentroid = calculateCentroid(fixedAtoms);

        // Strategy 1: Simple centroid alignment (no rotation)
        const simpleTranslation = {
            x: fixedCentroid.x - movingCentroid.x,
            y: fixedCentroid.y - movingCentroid.y,
            z: fixedCentroid.z - movingCentroid.z
        };

        const identityMatrix = [[1, 0, 0], [0, 1, 0], [0, 0, 1]];
        const simpleRMSD = calculateRMSD(movingAtoms, fixedAtoms, identityMatrix, simpleTranslation);

        console.log('Simple alignment RMSD:', simpleRMSD);
        console.log('Simple translation:', simpleTranslation);

        if (simpleRMSD < bestRMSD) {
            bestRMSD = simpleRMSD;
            bestTransformation = {
                rotation: identityMatrix,
                translation: simpleTranslation
            };
        }

        // Strategy 2: Try rotations around major axes
        const axes = [
            [1, 0, 0], // X-axis
            [0, 1, 0], // Y-axis
            [0, 0, 1], // Z-axis
            normalize([1, 1, 0]), // XY diagonal
            normalize([1, 0, 1]), // XZ diagonal
            normalize([0, 1, 1]), // YZ diagonal
            normalize([1, 1, 1])  // XYZ diagonal
        ];

        const angles = [0, Math.PI / 6, Math.PI / 4, Math.PI / 3, Math.PI / 2, 2 * Math.PI / 3, 3 * Math.PI / 4, Math.PI, 4 * Math.PI / 3, 3 * Math.PI / 2, 5 * Math.PI / 3];

        for (const axis of axes) {
            for (const angle of angles) {
                if (angle === 0) continue; // Skip identity (already tested)

                const rotationMatrix = axisAngleToMatrix(axis, angle);

                // Calculate translation after rotation
                const rotatedCentroid = rotatePoint(movingCentroid, rotationMatrix);
                const translation = {
                    x: fixedCentroid.x - rotatedCentroid.x,
                    y: fixedCentroid.y - rotatedCentroid.y,
                    z: fixedCentroid.z - rotatedCentroid.z
                };

                const rmsd = calculateRMSD(movingAtoms, fixedAtoms, rotationMatrix, translation);

                if (rmsd < bestRMSD) {
                    bestRMSD = rmsd;
                    bestTransformation = {
                        rotation: rotationMatrix,
                        translation: translation
                    };
                    console.log('Better alignment found! RMSD:', rmsd, 'Axis:', axis, 'Angle:', angle * 180 / Math.PI, 'degrees');
                }
            }
        }

        // Strategy 3: Try to align principal vectors (if molecules have enough atoms)
        if (movingAtoms.length >= 3 && fixedAtoms.length >= 3) {
            // Find atoms farthest from centroid in each molecule
            let maxDistMoving = 0, farthestMoving = null;
            let maxDistFixed = 0, farthestFixed = null;

            for (const atom of movingAtoms) {
                const dist = distance(atom, movingCentroid);
                if (dist > maxDistMoving) {
                    maxDistMoving = dist;
                    farthestMoving = atom;
                }
            }

            for (const atom of fixedAtoms) {
                const dist = distance(atom, fixedCentroid);
                if (dist > maxDistFixed) {
                    maxDistFixed = dist;
                    farthestFixed = atom;
                }
            }

            if (farthestMoving && farthestFixed) {
                // Create vectors from centroids to farthest atoms
                const movingVec = normalize([
                    farthestMoving.x - movingCentroid.x,
                    farthestMoving.y - movingCentroid.y,
                    farthestMoving.z - movingCentroid.z
                ]);

                const fixedVec = normalize([
                    farthestFixed.x - fixedCentroid.x,
                    farthestFixed.y - fixedCentroid.y,
                    farthestFixed.z - fixedCentroid.z
                ]);

                // Calculate rotation to align these vectors
                const cross = [
                    movingVec[1] * fixedVec[2] - movingVec[2] * fixedVec[1],
                    movingVec[2] * fixedVec[0] - movingVec[0] * fixedVec[2],
                    movingVec[0] * fixedVec[1] - movingVec[1] * fixedVec[0]
                ];

                const crossMag = Math.sqrt(cross[0] * cross[0] + cross[1] * cross[1] + cross[2] * cross[2]);
                const dot = movingVec[0] * fixedVec[0] + movingVec[1] * fixedVec[1] + movingVec[2] * fixedVec[2];

                if (crossMag > 1e-6) { // Vectors are not parallel
                    const angle = Math.atan2(crossMag, dot);
                    const axis = normalize(cross);

                    const rotationMatrix = axisAngleToMatrix(axis, angle);
                    const rotatedCentroid = rotatePoint(movingCentroid, rotationMatrix);
                    const translation = {
                        x: fixedCentroid.x - rotatedCentroid.x,
                        y: fixedCentroid.y - rotatedCentroid.y,
                        z: fixedCentroid.z - rotatedCentroid.z
                    };

                    const rmsd = calculateRMSD(movingAtoms, fixedAtoms, rotationMatrix, translation);

                    if (rmsd < bestRMSD) {
                        bestRMSD = rmsd;
                        bestTransformation = {
                            rotation: rotationMatrix,
                            translation: translation
                        };
                        console.log('Vector alignment found! RMSD:', rmsd);
                    }
                }
            }
        }

        console.log('Final best RMSD:', bestRMSD);
        return bestTransformation;
    }

    // Main alignment logic
    const movingAtoms = movingMolecule.atomData;
    const fixedAtoms = fixedMolecule.atomData;

    if (!movingAtoms || !fixedAtoms || movingAtoms.length === 0 || fixedAtoms.length === 0) {
        return {
            rotation: { x: 0, y: 0, z: 0 },
            translation: { x: 0, y: 0, z: 0 }
        };
    }

    // Find the best transformation
    const { rotation, translation } = findBestAlignment(movingAtoms, fixedAtoms);

    // Convert rotation matrix to Euler angles
    const rotationAngles = matrixToEulerAngles(rotation);

    // Return transformation parameters for Three.js
    const transformations = {
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
    console.log("Final transformations: ", transformations.rotation, transformations.translation);
    return transformations;
}

function addToList(itemText, list) {
    const listItem = document.createElement('li');
    listItem.textContent = `Fragment: [${itemText.join(', ')}]`;
    listItem.style.cursor = 'pointer';
    listItem.style.padding = '5px';
    listItem.style.margin = '2px';
    listItem.style.borderRadius = '5px';
    listItem.style.transition = 'background-color 0.3s';

    // Add hover effect
    listItem.addEventListener('mouseenter', () => {
        listItem.style.backgroundColor = 'rgba(255, 255, 255, 0.2)';
    });

    listItem.addEventListener('mouseleave', () => {
        if (!listItem.classList.contains('selected')) {
            listItem.style.backgroundColor = 'transparent';
        }
    });

    list.appendChild(listItem);
}



// Example usage with debug output:
/*
const molecule1 = {
    numAtoms: 3,
    atomData: [
        { element: "O", x: 0.0, y: 0.0, z: 0.0 },
        { element: "H", x: 1.0, y: 0.0, z: 0.0 },
        { element: "H", x: 0.0, y: 1.0, z: 0.0 }
    ]
};

const molecule2 = {
    numAtoms: 4,
    atomData: [
        { element: "O", x: 5.0, y: 5.0, z: 0.0 },
        { element: "H", x: 6.0, y: 5.0, z: 0.0 },
        { element: "H", x: 5.0, y: 6.0, z: 0.0 },
        { element: "C", x: 4.0, y: 4.0, z: 0.0 }
    ]
};

const alignment = alignMolecules(molecule1, molecule2);
console.log('Final result:');
console.log('Rotation (radians):', alignment.rotation);
console.log('Rotation (degrees):', {
    x: alignment.rotation.x * 180 / Math.PI,
    y: alignment.rotation.y * 180 / Math.PI,
    z: alignment.rotation.z * 180 / Math.PI
});
console.log('Translation:', alignment.translation);
*/