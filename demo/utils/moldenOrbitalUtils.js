/**
 * Molden Orbital Evaluation Utilities
 * Evaluates Gaussian basis functions to generate volumetric orbital data
 * from molden files for visualization.
 */

/**
 * Double factorial: n!! = n * (n-2) * (n-4) * ... * 1
 * Special cases: (-1)!! = 0!! = 1
 * @param {number} n - Input value
 * @returns {number} Double factorial of n
 */
function doubleFactorial(n) {
    if (n <= 1) return 1;
    let result = 1;
    for (let i = n; i > 1; i -= 2) {
        result *= i;
    }
    return result;
}

/**
 * Calculate Gaussian primitive normalization factor.
 * For a Cartesian Gaussian: N = (2α/π)^(3/4) * (4α)^(L/2) / sqrt((2lx-1)!! * (2ly-1)!! * (2lz-1)!!)
 * where L = lx + ly + lz is the total angular momentum.
 *
 * @param {number} alpha - Gaussian exponent
 * @param {number} lx - Angular momentum in x
 * @param {number} ly - Angular momentum in y
 * @param {number} lz - Angular momentum in z
 * @returns {number} Normalization factor
 */
function gaussianNormalization(alpha, lx, ly, lz) {
    const L = lx + ly + lz;

    // (2α/π)^(3/4)
    const prefactor = Math.pow(2 * alpha / Math.PI, 0.75);

    // (4α)^(L/2) = (2^L * α^L)^(1/2) = 2^(L/2) * α^(L/2)
    const angularFactor = Math.pow(4 * alpha, L / 2);

    // sqrt((2lx-1)!! * (2ly-1)!! * (2lz-1)!!)
    const dfX = doubleFactorial(2 * lx - 1);
    const dfY = doubleFactorial(2 * ly - 1);
    const dfZ = doubleFactorial(2 * lz - 1);
    const denominator = Math.sqrt(dfX * dfY * dfZ);

    return prefactor * angularFactor / denominator;
}

/**
 * Evaluate a Gaussian primitive at a given position WITH normalization.
 * Normalized primitive: N * exp(-alpha * r^2) * (x-Ax)^lx * (y-Ay)^ly * (z-Az)^lz
 *
 * @param {number} alpha - Gaussian exponent
 * @param {Array} center - Atom center [x, y, z]
 * @param {Array} point - Evaluation point [x, y, z]
 * @param {number} lx - Angular momentum x
 * @param {number} ly - Angular momentum y
 * @param {number} lz - Angular momentum z
 * @returns {number} Normalized primitive value at point
 */
function evaluateGaussianPrimitive(alpha, center, point, lx, ly, lz) {
    const dx = point[0] - center[0];
    const dy = point[1] - center[1];
    const dz = point[2] - center[2];

    const r2 = dx * dx + dy * dy + dz * dz;
    const gaussian = Math.exp(-alpha * r2);

    // Angular momentum factors
    const angularX = Math.pow(dx, lx);
    const angularY = Math.pow(dy, ly);
    const angularZ = Math.pow(dz, lz);

    // Apply normalization factor
    const norm = gaussianNormalization(alpha, lx, ly, lz);

    return norm * gaussian * angularX * angularY * angularZ;
}

/**
 * Get angular momentum quantum numbers for a shell type.
 * @param {string} shellType - Shell type: 's', 'p', 'd', 'f', 'sp'
 * @returns {Array} Array of [lx, ly, lz] for each component
 */
function getAngularMomentum(shellType) {
    const type = shellType.toLowerCase();

    // Shell ordering follows standard Gaussian/molden conventions
    switch (type) {
        case 's':
            return [[0, 0, 0]];
        case 'p':
            // px, py, pz
            return [[1, 0, 0], [0, 1, 0], [0, 0, 1]];
        case 'sp':
            // Special SP shell: s, px, py, pz
            return [[0, 0, 0], [1, 0, 0], [0, 1, 0], [0, 0, 1]];
        case 'd':
            // Cartesian d: d_xx, d_yy, d_zz, d_xy, d_xz, d_yz
            // Standard molden order: d_xx, d_yy, d_zz, d_xy, d_xz, d_yz
            return [
                [2, 0, 0], // d_xx
                [0, 2, 0], // d_yy
                [0, 0, 2], // d_zz
                [1, 1, 0], // d_xy
                [1, 0, 1], // d_xz
                [0, 1, 1]  // d_yz
            ];
        case 'f':
            // Cartesian f: f_xxx, f_yyy, f_zzz, f_xxy, f_xxz, f_xyy, f_yyz, f_xzz, f_yzz, f_xyz
            return [
                [3, 0, 0], // f_xxx
                [0, 3, 0], // f_yyy
                [0, 0, 3], // f_zzz
                [2, 1, 0], // f_xxy
                [2, 0, 1], // f_xxz
                [1, 2, 0], // f_xyy
                [0, 2, 1], // f_yyz
                [1, 0, 2], // f_xzz
                [0, 1, 2], // f_yzz
                [1, 1, 1]  // f_xyz
            ];
        default:
            console.warn(`Unknown shell type: ${shellType}`);
            return [[0, 0, 0]];
    }
}

/**
 * Evaluate a contracted Gaussian basis function at a point.
 * @param {Object} shell - Shell object with primitives and angular momentum
 * @param {Array} atomCenter - Atom position [x, y, z]
 * @param {Array} point - Evaluation point [x, y, z]
 * @param {Array} angularMomentum - [lx, ly, lz]
 * @param {number} coeffIndex - Coefficient index (0 for normal, 1 for SP)
 * @returns {number} Basis function value at point
 */
function evaluateBasisFunction(shell, atomCenter, point, angularMomentum, coeffIndex = 0) {
    let value = 0;

    const [lx, ly, lz] = angularMomentum;

    for (const primitive of shell.primitives) {
        const alpha = primitive.exponent;
        const coeff = coeffIndex === 0 ? primitive.coefficient : primitive.coefficient2;

        if (coeff !== null && !isNaN(coeff)) {
            const primValue = evaluateGaussianPrimitive(alpha, atomCenter, point, lx, ly, lz);
            value += coeff * primValue;
        }
    }

    return value;
}

/**
 * Build a mapping from AO index to basis function info.
 * @param {Array} basisFunctions - Array of shell objects
 * @param {Array} atoms - Array of atom objects with positions
 * @returns {Array} Array of {shell, atomCenter, angularMomentum, coeffIndex}
 */
function buildAOBasisMap(basisFunctions, atoms) {
    const aoMap = [];

    for (const shell of basisFunctions) {
        const atomIndex = shell.atomNumber - 1; // molden uses 1-based indexing

        if (atomIndex < 0 || atomIndex >= atoms.length) {
            console.warn(`Invalid atom number in basis function: ${shell.atomNumber}`);
            continue;
        }

        const atomCenter = [atoms[atomIndex].x, atoms[atomIndex].y, atoms[atomIndex].z];
        const angularMomenta = getAngularMomentum(shell.type);

        if (shell.type.toLowerCase() === 'sp') {
            // SP shell: first is s with coefficient, rest are p with coefficient2
            aoMap.push({
                shell: shell,
                atomCenter: atomCenter,
                angularMomentum: angularMomenta[0], // s
                coeffIndex: 0
            });

            for (let i = 1; i < angularMomenta.length; i++) {
                aoMap.push({
                    shell: shell,
                    atomCenter: atomCenter,
                    angularMomentum: angularMomenta[i], // px, py, pz
                    coeffIndex: 1
                });
            }
        } else {
            // Normal shell
            for (const am of angularMomenta) {
                aoMap.push({
                    shell: shell,
                    atomCenter: atomCenter,
                    angularMomentum: am,
                    coeffIndex: 0
                });
            }
        }
    }

    return aoMap;
}

/**
 * Evaluate a molecular orbital at a point.
 * @param {Object} mo - Molecular orbital with coefficients array
 * @param {Array} aoMap - AO basis function map
 * @param {Array} point - Evaluation point [x, y, z]
 * @returns {number} MO value at point
 */
function evaluateMOAtPoint(mo, aoMap, point) {
    let value = 0;

    for (let i = 0; i < mo.coefficients.length; i++) {
        const moCoeff = mo.coefficients[i];
        const aoIndex = moCoeff.aoIndex - 1; // molden uses 1-based
        const coefficient = moCoeff.coefficient;

        if (aoIndex < 0 || aoIndex >= aoMap.length) {
            continue;
        }

        const ao = aoMap[aoIndex];
        const basisValue = evaluateBasisFunction(
            ao.shell,
            ao.atomCenter,
            point,
            ao.angularMomentum,
            ao.coeffIndex
        );

        value += coefficient * basisValue;
    }

    return value;
}

/**
 * Generate volumetric grid data from molden orbital.
 * @param {Object} moldenData - Molden data with orbitals, basisFunctions
 * @param {Array} atoms - Array of atom objects
 * @param {number} orbitalIndex - Index of orbital to visualize
 * @param {number} gridSize - Number of grid points per dimension (default 64)
 * @param {number} padding - Padding around molecule in Angstroms (default 5.0)
 * @returns {Object} Orbital data compatible with cube format
 */
export function generateMoldenOrbitalGrid(moldenData, atoms, orbitalIndex = -1, gridSize = 64, padding = 5.0) {
    console.log('[MoldenGrid] Starting grid generation...');
    console.log('[MoldenGrid] Atoms:', atoms.length);
    console.log('[MoldenGrid] Orbitals:', moldenData.orbitals.length);
    console.log('[MoldenGrid] Basis functions:', moldenData.basisFunctions.length);
    console.log('[MoldenGrid] Orbital index:', orbitalIndex);

    // Select orbital (default to LUMO if available, otherwise HOMO)
    let selectedOrbital;
    if (orbitalIndex >= 0 && orbitalIndex < moldenData.orbitals.length) {
        selectedOrbital = moldenData.orbitals[orbitalIndex];
    } else if (moldenData.lumoIndex >= 0) {
        selectedOrbital = moldenData.orbitals[moldenData.lumoIndex];
        console.log('[MoldenGrid] Using LUMO');
    } else if (moldenData.homoIndex >= 0) {
        selectedOrbital = moldenData.orbitals[moldenData.homoIndex];
        console.log('[MoldenGrid] Using HOMO');
    } else {
        console.error('[MoldenGrid] No valid orbital found');
        return null;
    }

    console.log('[MoldenGrid] Selected MO:', {
        symmetry: selectedOrbital.symmetry,
        energy: selectedOrbital.energy,
        occupation: selectedOrbital.occupation,
        numCoeffs: selectedOrbital.coefficients.length
    });

    // Build AO basis map
    const aoMap = buildAOBasisMap(moldenData.basisFunctions, atoms);
    console.log('[MoldenGrid] Built AO map with', aoMap.length, 'basis functions');

    // Calculate bounding box
    let minX = Infinity, minY = Infinity, minZ = Infinity;
    let maxX = -Infinity, maxY = -Infinity, maxZ = -Infinity;

    for (const atom of atoms) {
        if (atom.x < minX) minX = atom.x;
        if (atom.y < minY) minY = atom.y;
        if (atom.z < minZ) minZ = atom.z;
        if (atom.x > maxX) maxX = atom.x;
        if (atom.y > maxY) maxY = atom.y;
        if (atom.z > maxZ) maxZ = atom.z;
    }

    // Add padding
    minX -= padding;
    minY -= padding;
    minZ -= padding;
    maxX += padding;
    maxY += padding;
    maxZ += padding;

    const origin = { x: minX, y: minY, z: minZ };
    const sizeX = maxX - minX;
    const sizeY = maxY - minY;
    const sizeZ = maxZ - minZ;

    const spacingX = sizeX / (gridSize - 1);
    const spacingY = sizeY / (gridSize - 1);
    const spacingZ = sizeZ / (gridSize - 1);

    console.log('[MoldenGrid] Grid setup:', {
        origin: origin,
        size: [sizeX, sizeY, sizeZ],
        spacing: [spacingX, spacingY, spacingZ],
        points: gridSize * gridSize * gridSize
    });

    // Generate volumetric data
    const totalPoints = gridSize * gridSize * gridSize;
    const volumeData = new Float32Array(totalPoints);

    let minValue = Infinity;
    let maxValue = -Infinity;
    let pointsEvaluated = 0;

    for (let ix = 0; ix < gridSize; ix++) {
        const x = minX + ix * spacingX;

        // Progress indicator every 10%
        if (ix % Math.ceil(gridSize / 10) === 0) {
            console.log(`[MoldenGrid] Progress: ${Math.round(100 * ix / gridSize)}%`);
        }

        for (let iy = 0; iy < gridSize; iy++) {
            const y = minY + iy * spacingY;

            for (let iz = 0; iz < gridSize; iz++) {
                const z = minZ + iz * spacingZ;

                const point = [x, y, z];
                const value = evaluateMOAtPoint(selectedOrbital, aoMap, point);

                // Cube file order: Z varies fastest, then Y, then X
                const index = ix * gridSize * gridSize + iy * gridSize + iz;
                volumeData[index] = value;

                if (value < minValue) minValue = value;
                if (value > maxValue) maxValue = value;

                pointsEvaluated++;
            }
        }
    }

    console.log('[MoldenGrid] Grid generation complete!');
    console.log('[MoldenGrid] Points evaluated:', pointsEvaluated);
    console.log('[MoldenGrid] Value range:', [minValue, maxValue]);

    // Create orbital data in same format as cube files
    return {
        volumeData: volumeData,
        gridInfo: {
            origin: origin,
            dimensions: [gridSize, gridSize, gridSize],
            spacing: [spacingX, spacingY, spacingZ],
            vectors: {
                x: [spacingX, 0, 0],
                y: [0, spacingY, 0],
                z: [0, 0, spacingZ]
            },
            numOrbitals: 1,
            orbitalIndices: [orbitalIndex]
        },
        minValue: minValue,
        maxValue: maxValue,
        comment: `Molden MO ${orbitalIndex + 1} (${selectedOrbital.symmetry})`,
        fileType: 'molden-generated'
    };
}

// Export to window for global access
window.generateMoldenOrbitalGrid = generateMoldenOrbitalGrid;

export default {
    generateMoldenOrbitalGrid,
    evaluateMOAtPoint,
    buildAOBasisMap
};
