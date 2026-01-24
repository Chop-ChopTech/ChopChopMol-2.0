/**
 * Molden Orbital Evaluation Utilities
 * Evaluates Gaussian basis functions to generate volumetric orbital data
 * from molden files for visualization.
 *
 * Reference: https://www.theochem.ru.nl/molden/molden_format.html
 */

// Conversion factor: 1 Bohr = 0.529177249 Angstrom
const BOHR_TO_ANG = 0.529177249;
const ANG_TO_BOHR = 1.0 / BOHR_TO_ANG;

// Spherical harmonics support flags (set from moldenData)
let useSphericalD = false;
let useSphericalF = false;
let useSphericalG = false;

// Source program (affects normalization conventions)
// ORCA: coefficients already include normalization, AND f-orbitals have flipped signs
// Gaussian/others: coefficients are raw, need normalization
let sourceProgram = 'unknown';

// Track which shell types need sign correction for ORCA
// ORCA flips signs for f-orbitals and higher angular momentum
function needsOrcaSignFlip(shellType) {
    if (sourceProgram !== 'orca') return false;
    const type = shellType.toLowerCase();
    return type === 'f' || type === 'g' || type === 'h' || type === 'i';
}

// Normalization mode: 'auto', 'always', 'never'
// 'auto' skips normalization for ORCA files
// 'always' always applies normalization
// 'never' never applies normalization
let normalizationMode = 'auto';

// Unit mode: 'auto', 'angstrom', 'bohr'
// Controls whether to convert coordinates in evaluation
// 'auto' converts Angstrom to Bohr (standard)
// 'angstrom' assumes exponents are in Angstrom^-2 (no conversion)
// 'bohr' forces Bohr conversion
let unitMode = 'auto';

// Sign convention mode: 'standard' or 'condon-shortley'
// 'standard': all positive angular factors (most common in visualization)
// 'condon-shortley': includes (-1)^m phase for positive m (quantum chemistry convention)
let signConvention = 'standard';

/**
 * Check if we should skip primitive normalization.
 *
 * Different programs have different conventions for contraction coefficients:
 * - ORCA: Coefficients are PRE-MULTIPLIED by primitive normalization (skip)
 * - PySCF: Coefficients are STANDARD (not pre-multiplied) - need normalization
 * - Standard Molden: Coefficients are standard - need normalization
 *
 * Evidence: Comparing the same basis set between ORCA and PySCF Molden files:
 *   ORCA s-coeff for α=2266: -1.26  (pre-normalized)
 *   PySCF s-coeff for α=2266: -0.0054 (standard)
 *   Ratio ≈ 234 = (2α/π)^0.75 = primitive normalization factor
 *
 * @returns {boolean} True if normalization should be skipped
 */
function skipPrimitiveNormalization() {
    if (normalizationMode === 'always') return false;
    if (normalizationMode === 'never') return true;

    // Auto mode: only skip for ORCA (which pre-normalizes)
    // All other programs (including PySCF) use standard coefficients
    return sourceProgram === 'orca';
}

/**
 * Set the normalization mode for orbital evaluation.
 * @param {string} mode - 'auto', 'always', or 'never'
 */
function setNormalizationMode(mode) {
    if (['auto', 'always', 'never'].includes(mode)) {
        normalizationMode = mode;
        console.log(`[MoldenGrid] Normalization mode set to: ${mode}`);
    }
}

// Export for debugging
window.setMoldenNormalizationMode = setNormalizationMode;

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
 * Evaluate a Gaussian primitive at a given position.
 * Normalized primitive: N * exp(-alpha * r^2) * (x-Ax)^lx * (y-Ay)^ly * (z-Az)^lz
 *
 * IMPORTANT: Gaussian exponents (alpha) are always in Bohr^-2 in Molden files.
 * Coordinates are converted to Bohr for evaluation since we store positions in Angstrom.
 *
 * Note: For ORCA Molden files, contraction coefficients already include normalization,
 * so we skip the normalization step. For other programs (Gaussian, etc.), we apply
 * the standard Gaussian normalization.
 *
 * @param {number} alpha - Gaussian exponent (in Bohr^-2)
 * @param {Array} center - Atom center [x, y, z] in Angstrom
 * @param {Array} point - Evaluation point [x, y, z] in Angstrom
 * @param {number} lx - Angular momentum x
 * @param {number} ly - Angular momentum y
 * @param {number} lz - Angular momentum z
 * @returns {number} Primitive value at point (normalized or raw depending on source)
 */
function evaluateGaussianPrimitive(alpha, center, point, lx, ly, lz) {
    // Unit conversion based on mode
    // Standard Molden: exponents in Bohr^-2, coordinates converted to Bohr
    // Some programs may use different conventions
    const unitFactor = (unitMode === 'angstrom') ? 1.0 : ANG_TO_BOHR;

    const dx = (point[0] - center[0]) * unitFactor;
    const dy = (point[1] - center[1]) * unitFactor;
    const dz = (point[2] - center[2]) * unitFactor;

    const r2 = dx * dx + dy * dy + dz * dz;
    const gaussian = Math.exp(-alpha * r2);

    // Angular momentum factors (in Bohr)
    const angularX = Math.pow(dx, lx);
    const angularY = Math.pow(dy, ly);
    const angularZ = Math.pow(dz, lz);

    // Apply normalization factor only if source program doesn't include it in coefficients
    // ORCA includes normalization in contraction coefficients, others don't
    let norm = 1.0;
    if (!skipPrimitiveNormalization()) {
        norm = gaussianNormalization(alpha, lx, ly, lz);
    }

    return norm * gaussian * angularX * angularY * angularZ;
}

/**
 * Get the number of AOs for a shell type, considering spherical vs Cartesian.
 * @param {string} shellType - Shell type: 's', 'p', 'd', 'f', 'g', 'sp'
 * @returns {number} Number of AO functions in this shell
 */
function getNumAOsForShell(shellType) {
    const type = shellType.toLowerCase();
    switch (type) {
        case 's': return 1;
        case 'p': return 3;
        case 'sp': return 4;
        case 'd': return useSphericalD ? 5 : 6;
        case 'f': return useSphericalF ? 7 : 10;
        case 'g': return useSphericalG ? 9 : 15;
        default: return 1;
    }
}

/**
 * Get Condon-Shortley phase factor (-1)^m for positive m.
 * @param {number} m - magnetic quantum number (positive)
 * @returns {number} 1 or -1
 */
function condonShortleyPhase(m) {
    if (signConvention !== 'condon-shortley' || m <= 0) return 1;
    return (m % 2 === 0) ? 1 : -1;
}

/**
 * Evaluate spherical harmonic D-function at a point.
 * Real solid harmonics for L=2 (order: d0, d+1, d-1, d+2, d-2)
 * Molden order for 5D: D 0, D+1, D-1, D+2, D-2
 *
 * @param {number} m - Spherical harmonic index (0-4 for 5D)
 * @param {number} dx - x displacement in Bohr
 * @param {number} dy - y displacement in Bohr
 * @param {number} dz - z displacement in Bohr
 * @param {number} r2 - r^2 in Bohr^2
 * @returns {number} Angular part of spherical harmonic
 */
function sphericalD(m, dx, dy, dz, r2) {
    // Real solid harmonics for D-orbitals
    // With optional Condon-Shortley phase for positive m values
    switch (m) {
        case 0: // D 0 (m=0): d_z2 = (2z^2 - x^2 - y^2) / 2
            return (2 * dz * dz - dx * dx - dy * dy) / 2;
        case 1: // D+1 (m=+1): d_xz
            return condonShortleyPhase(1) * Math.sqrt(3) * dx * dz;
        case 2: // D-1 (m=-1): d_yz
            return Math.sqrt(3) * dy * dz;
        case 3: // D+2 (m=+2): d_x2-y2
            return condonShortleyPhase(2) * Math.sqrt(3) / 2 * (dx * dx - dy * dy);
        case 4: // D-2 (m=-2): d_xy
            return Math.sqrt(3) * dx * dy;
        default:
            return 0;
    }
}

/**
 * Evaluate spherical harmonic F-function at a point.
 * Real solid harmonics for L=3 (order: f0, f+1, f-1, f+2, f-2, f+3, f-3)
 *
 * @param {number} m - Spherical harmonic index (0-6 for 7F)
 * @param {number} dx - x displacement in Bohr
 * @param {number} dy - y displacement in Bohr
 * @param {number} dz - z displacement in Bohr
 * @param {number} r2 - r^2 in Bohr^2
 * @returns {number} Angular part of spherical harmonic
 */
function sphericalF(m, dx, dy, dz, r2) {
    const sqrt15 = Math.sqrt(15);

    // Molden order: F 0, F+1, F-1, F+2, F-2, F+3, F-3
    // With optional Condon-Shortley phase for positive m values
    switch (m) {
        case 0: // F 0 (m=0): f_z3 = z(5z^2 - 3r^2)/2
            return dz * (5 * dz * dz - 3 * r2) / 2;
        case 1: // F+1 (m=+1): f_xz2 = x(5z^2 - r^2) * sqrt(3/8)
            return condonShortleyPhase(1) * Math.sqrt(1.5) * dx * (5 * dz * dz - r2) / 2;
        case 2: // F-1 (m=-1): f_yz2 = y(5z^2 - r^2) * sqrt(3/8)
            return Math.sqrt(1.5) * dy * (5 * dz * dz - r2) / 2;
        case 3: // F+2 (m=+2): f_z(x2-y2) = z(x^2 - y^2) * sqrt(15/4)
            return condonShortleyPhase(2) * Math.sqrt(7.5) * dz * (dx * dx - dy * dy) / 2;
        case 4: // F-2 (m=-2): f_xyz = xyz * sqrt(15)
            return sqrt15 * dx * dy * dz;
        case 5: // F+3 (m=+3): f_x(x2-3y2) = x(x^2 - 3y^2) * sqrt(5/8)
            return condonShortleyPhase(3) * Math.sqrt(2.5) * dx * (dx * dx - 3 * dy * dy) / 2;
        case 6: // F-3 (m=-3): f_y(3x2-y2) = y(3x^2 - y^2) * sqrt(5/8)
            return Math.sqrt(2.5) * dy * (3 * dx * dx - dy * dy) / 2;
        default:
            return 0;
    }
}

/**
 * Get angular momentum quantum numbers for a shell type.
 * Ordering follows the official Molden format specification:
 * https://www.theochem.ru.nl/molden/molden_format.html
 *
 * For spherical harmonics, returns placeholder [L, m, 0] where L is total angular momentum
 * and m is the spherical harmonic index.
 *
 * @param {string} shellType - Shell type: 's', 'p', 'd', 'f', 'g', 'sp'
 * @returns {Array} Array of [lx, ly, lz] for Cartesian or [L, m, -1] for spherical
 */
function getAngularMomentum(shellType) {
    const type = shellType.toLowerCase();

    // Shell ordering follows official Molden format specification
    switch (type) {
        case 's':
            return [[0, 0, 0]];
        case 'p':
            // Molden order: x, y, z
            return [[1, 0, 0], [0, 1, 0], [0, 0, 1]];
        case 'sp':
            // Special SP shell: s, px, py, pz
            return [[0, 0, 0], [1, 0, 0], [0, 1, 0], [0, 0, 1]];
        case 'd':
            if (useSphericalD) {
                // Spherical 5D: d0, d+1, d-1, d+2, d-2
                // Mark with -1 in third position to indicate spherical
                return [
                    [2, 0, -1], // d_z2
                    [2, 1, -1], // d_xz
                    [2, 2, -1], // d_yz
                    [2, 3, -1], // d_x2-y2
                    [2, 4, -1]  // d_xy
                ];
            }
            // Molden Cartesian d order: xx, yy, zz, xy, xz, yz
            return [
                [2, 0, 0], // d_xx
                [0, 2, 0], // d_yy
                [0, 0, 2], // d_zz
                [1, 1, 0], // d_xy
                [1, 0, 1], // d_xz
                [0, 1, 1]  // d_yz
            ];
        case 'f':
            if (useSphericalF) {
                // Spherical 7F: f0, f+1, f-1, f+2, f-2, f+3, f-3
                return [
                    [3, 0, -1], [3, 1, -1], [3, 2, -1], [3, 3, -1],
                    [3, 4, -1], [3, 5, -1], [3, 6, -1]
                ];
            }
            // Molden Cartesian f order: xxx, yyy, zzz, xyy, xxy, xxz, xzz, yzz, yyz, xyz
            return [
                [3, 0, 0], // f_xxx
                [0, 3, 0], // f_yyy
                [0, 0, 3], // f_zzz
                [1, 2, 0], // f_xyy
                [2, 1, 0], // f_xxy
                [2, 0, 1], // f_xxz
                [1, 0, 2], // f_xzz
                [0, 1, 2], // f_yzz
                [0, 2, 1], // f_yyz
                [1, 1, 1]  // f_xyz
            ];
        case 'g':
            if (useSphericalG) {
                // Spherical 9G
                return [
                    [4, 0, -1], [4, 1, -1], [4, 2, -1], [4, 3, -1], [4, 4, -1],
                    [4, 5, -1], [4, 6, -1], [4, 7, -1], [4, 8, -1]
                ];
            }
            // Molden Cartesian g order: xxxx, yyyy, zzzz, xxxy, xxxz, yyyx, yyyz, zzzx, zzzy,
            //                           xxyy, xxzz, yyzz, xxyz, yyxz, zzxy
            return [
                [4, 0, 0], // g_xxxx
                [0, 4, 0], // g_yyyy
                [0, 0, 4], // g_zzzz
                [3, 1, 0], // g_xxxy
                [3, 0, 1], // g_xxxz
                [1, 3, 0], // g_xyyy (yyyx)
                [0, 3, 1], // g_yyyz
                [1, 0, 3], // g_xzzz (zzzx)
                [0, 1, 3], // g_yzzz (zzzy)
                [2, 2, 0], // g_xxyy
                [2, 0, 2], // g_xxzz
                [0, 2, 2], // g_yyzz
                [2, 1, 1], // g_xxyz
                [1, 2, 1], // g_xyyz (yyxz)
                [1, 1, 2]  // g_xyzz (zzxy)
            ];
        default:
            console.warn(`Unknown shell type: ${shellType}`);
            return [[0, 0, 0]];
    }
}

/**
 * Evaluate a contracted Gaussian basis function at a point.
 * Handles both Cartesian and spherical harmonics basis functions.
 *
 * @param {Object} shell - Shell object with primitives and angular momentum
 * @param {Array} atomCenter - Atom position [x, y, z] in Angstrom
 * @param {Array} point - Evaluation point [x, y, z] in Angstrom
 * @param {Array} angularMomentum - [lx, ly, lz] for Cartesian or [L, m, -1] for spherical
 * @param {number} coeffIndex - Coefficient index (0 for normal, 1 for SP)
 * @returns {number} Basis function value at point
 */
function evaluateBasisFunction(shell, atomCenter, point, angularMomentum, coeffIndex = 0) {
    let value = 0;

    const [lx, ly, lz] = angularMomentum;

    // Check if this is a spherical harmonic (indicated by lz === -1)
    const isSpherical = lz === -1;
    const L = isSpherical ? lx : (lx + ly + lz); // Total angular momentum
    const m = isSpherical ? ly : 0; // Spherical harmonic index

    // Pre-calculate displacement in Bohr for spherical harmonics
    const dx_bohr = (point[0] - atomCenter[0]) * ANG_TO_BOHR;
    const dy_bohr = (point[1] - atomCenter[1]) * ANG_TO_BOHR;
    const dz_bohr = (point[2] - atomCenter[2]) * ANG_TO_BOHR;
    const r2_bohr = dx_bohr * dx_bohr + dy_bohr * dy_bohr + dz_bohr * dz_bohr;

    for (const primitive of shell.primitives) {
        const alpha = primitive.exponent;
        const coeff = coeffIndex === 0 ? primitive.coefficient : primitive.coefficient2;

        if (coeff !== null && !isNaN(coeff)) {
            if (isSpherical) {
                // Evaluate spherical harmonic basis function
                const gaussian = Math.exp(-alpha * r2_bohr);

                // Normalization for spherical harmonics (skip if ORCA - already normalized)
                // Formula: N(α,ℓ) = sqrt[(2α/π)^(3/2) * (4α)^ℓ / (2ℓ-1)!!]
                //        = (2α/π)^(3/4) * (4α)^(ℓ/2) / sqrt((2ℓ-1)!!)
                let norm = 1.0;
                if (!skipPrimitiveNormalization()) {
                    const prefactor = Math.pow(2 * alpha / Math.PI, 0.75);
                    const angularFactor = Math.pow(4 * alpha, L / 2);
                    const sphericalDenom = Math.sqrt(doubleFactorial(2 * L - 1));
                    norm = prefactor * angularFactor / sphericalDenom;
                }

                // Get spherical harmonic angular part
                let angular = 0;
                if (L === 2) {
                    angular = sphericalD(m, dx_bohr, dy_bohr, dz_bohr, r2_bohr);
                } else if (L === 3) {
                    angular = sphericalF(m, dx_bohr, dy_bohr, dz_bohr, r2_bohr);
                } else if (L === 4) {
                    // G functions - simplified, may need refinement
                    console.warn('Spherical G functions not fully implemented');
                    angular = 0;
                }

                value += coeff * norm * gaussian * angular;
            } else {
                // Evaluate Cartesian basis function
                const primValue = evaluateGaussianPrimitive(alpha, atomCenter, point, lx, ly, lz);
                value += coeff * primValue;
            }
        }
    }

    return value;
}

/**
 * Build a mapping from AO index to basis function info.
 * @param {Array} basisFunctions - Array of shell objects
 * @param {Array} atoms - Array of atom objects with positions
 * @returns {Array} Array of {shell, atomCenter, angularMomentum, coeffIndex, shellType, needsSignFlip}
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
        const shellType = shell.type.toLowerCase();
        // ORCA sign flip for f-orbitals and higher
        const signFlip = needsOrcaSignFlip(shellType);

        if (shellType === 'sp') {
            // SP shell: first is s with coefficient, rest are p with coefficient2
            aoMap.push({
                shell: shell,
                atomCenter: atomCenter,
                angularMomentum: angularMomenta[0], // s
                coeffIndex: 0,
                shellType: 's',
                needsSignFlip: false
            });

            for (let i = 1; i < angularMomenta.length; i++) {
                aoMap.push({
                    shell: shell,
                    atomCenter: atomCenter,
                    angularMomentum: angularMomenta[i], // px, py, pz
                    coeffIndex: 1,
                    shellType: 'p',
                    needsSignFlip: false
                });
            }
        } else {
            // Normal shell
            for (const am of angularMomenta) {
                aoMap.push({
                    shell: shell,
                    atomCenter: atomCenter,
                    angularMomentum: am,
                    coeffIndex: 0,
                    shellType: shellType,
                    needsSignFlip: signFlip
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
// Debug flag for detailed logging
let debugMOEvaluation = false;
let debugLoggedOnce = false;

function evaluateMOAtPoint(mo, aoMap, point) {
    let value = 0;
    let skippedCount = 0;

    for (let i = 0; i < mo.coefficients.length; i++) {
        const moCoeff = mo.coefficients[i];
        const aoIndex = moCoeff.aoIndex - 1; // molden uses 1-based
        let coefficient = moCoeff.coefficient;

        if (aoIndex < 0 || aoIndex >= aoMap.length) {
            skippedCount++;
            continue;
        }

        const ao = aoMap[aoIndex];

        // Apply ORCA sign flip for f-orbitals and higher
        // ORCA Molden files have flipped signs for f-shell MO coefficients
        if (ao.needsSignFlip) {
            coefficient = -coefficient;
        }

        const basisValue = evaluateBasisFunction(
            ao.shell,
            ao.atomCenter,
            point,
            ao.angularMomentum,
            ao.coeffIndex
        );

        // Debug logging for first evaluation
        if (debugMOEvaluation && !debugLoggedOnce && Math.abs(basisValue) > 1e-10) {
            console.log(`[MO Debug] AO ${aoIndex + 1}: shell=${ao.shell.type}, ` +
                `ang=[${ao.angularMomentum}], coeff=${coefficient.toFixed(6)}, ` +
                `basis=${basisValue.toFixed(6)}${ao.needsSignFlip ? ' (sign-flipped)' : ''}`);
        }

        value += coefficient * basisValue;
    }

    if (debugMOEvaluation && !debugLoggedOnce) {
        debugLoggedOnce = true;
        if (skippedCount > 0) {
            console.warn(`[MO Debug] Skipped ${skippedCount} AO indices out of bounds`);
        }
        console.log(`[MO Debug] Total MO value at point: ${value.toFixed(6)}`);
    }

    return value;
}

// Enable debug mode
window.enableMoldenDebug = function() {
    debugMOEvaluation = true;
    debugLoggedOnce = false;
    console.log('[MoldenGrid] Debug mode enabled - will log next MO evaluation');
};

// Dump basis set information for debugging
window.dumpMoldenBasis = function() {
    if (!window.moldenData) {
        console.log('No molden data loaded');
        return;
    }

    const md = window.moldenData;
    console.log('=== Molden Basis Set Dump ===');
    console.log('Source program:', md.sourceProgram || 'unknown');
    console.log('Spherical harmonics:', {
        D: md.useSphericalD ? '5D' : '6D',
        F: md.useSphericalF ? '7F' : '10F',
        G: md.useSphericalG ? '9G' : '15G'
    });
    console.log('Number of orbitals:', md.orbitals.length);
    console.log('HOMO index:', md.homoIndex, 'LUMO index:', md.lumoIndex);
    console.log('Number of shells:', md.basisFunctions.length);

    // Count AOs
    let totalAOs = 0;
    const shellsByAtom = {};
    for (const shell of md.basisFunctions) {
        const atomNum = shell.atomNumber;
        if (!shellsByAtom[atomNum]) shellsByAtom[atomNum] = [];
        shellsByAtom[atomNum].push(shell);

        const type = shell.type.toLowerCase();
        let numAOs;
        switch (type) {
            case 's': numAOs = 1; break;
            case 'p': numAOs = 3; break;
            case 'sp': numAOs = 4; break;
            case 'd': numAOs = md.useSphericalD ? 5 : 6; break;
            case 'f': numAOs = md.useSphericalF ? 7 : 10; break;
            case 'g': numAOs = md.useSphericalG ? 9 : 15; break;
            default: numAOs = 1;
        }
        totalAOs += numAOs;
    }

    console.log('Total AOs (calculated):', totalAOs);

    // Check first MO for max AO index
    if (md.orbitals.length > 0) {
        const maxAO = Math.max(...md.orbitals[0].coefficients.map(c => c.aoIndex));
        console.log('Max AO index in first MO:', maxAO);
        if (maxAO !== totalAOs) {
            console.warn('MISMATCH: Calculated AOs != Max AO index in MO!');
        }
    }

    // Show shells per atom
    console.log('Shells by atom:');
    for (const atomNum of Object.keys(shellsByAtom).sort((a, b) => a - b)) {
        const shells = shellsByAtom[atomNum];
        const types = shells.map(s => `${s.type}(${s.primitives.length}prim)`).join(', ');
        console.log(`  Atom ${atomNum}: ${types}`);
    }
};

// Try different normalization modes
window.tryMoldenNormalization = function(mode) {
    if (!['auto', 'always', 'never'].includes(mode)) {
        console.log('Valid modes: auto, always, never');
        return;
    }
    normalizationMode = mode;
    console.log(`Set normalization mode to: ${mode}`);
    console.log('Re-select the orbital to see the effect');
};

// Show detailed AO mapping
window.showAOMapping = function() {
    if (!window.moldenData || !window.molecule) {
        console.log('No molden data or molecule loaded');
        return;
    }

    const md = window.moldenData;
    const atoms = window.molecule.atoms;

    // Temporarily set flags
    const savedD = useSphericalD;
    const savedF = useSphericalF;
    const savedG = useSphericalG;
    useSphericalD = md.useSphericalD || false;
    useSphericalF = md.useSphericalF || false;
    useSphericalG = md.useSphericalG || false;

    const aoMap = buildAOBasisMap(md.basisFunctions, atoms);

    console.log('=== AO Mapping (1-indexed) ===');
    for (let i = 0; i < aoMap.length; i++) {
        const ao = aoMap[i];
        const amStr = ao.angularMomentum.join(',');
        console.log(`AO ${i + 1}: Atom ${ao.shell.atomNumber}, Shell ${ao.shell.type}, Angular=[${amStr}]`);
    }
    console.log(`Total AOs: ${aoMap.length}`);

    // Restore flags
    useSphericalD = savedD;
    useSphericalF = savedF;
    useSphericalG = savedG;
};

// Compare specific orbital with expected
window.inspectOrbital = function(orbIndex) {
    if (!window.moldenData || !window.molecule) {
        console.log('No molden data or molecule loaded');
        return;
    }

    const md = window.moldenData;
    if (orbIndex < 0 || orbIndex >= md.orbitals.length) {
        console.log(`Invalid orbital index. Valid range: 0 to ${md.orbitals.length - 1}`);
        return;
    }

    // Build AO map to get shell types
    const savedD = useSphericalD;
    const savedF = useSphericalF;
    const savedG = useSphericalG;
    useSphericalD = md.useSphericalD || false;
    useSphericalF = md.useSphericalF || false;
    useSphericalG = md.useSphericalG || false;
    const aoMap = buildAOBasisMap(md.basisFunctions, window.molecule.atoms);
    useSphericalD = savedD;
    useSphericalF = savedF;
    useSphericalG = savedG;

    const orb = md.orbitals[orbIndex];
    console.log(`=== Orbital ${orbIndex + 1} (${orbIndex === md.homoIndex ? 'HOMO' : orbIndex === md.lumoIndex ? 'LUMO' : ''}) ===`);
    console.log('Symmetry:', orb.symmetry);
    console.log('Energy:', orb.energy);
    console.log('Occupation:', orb.occupation);
    console.log('Number of coefficients:', orb.coefficients.length);

    // Analyze shell type contributions
    const shellContrib = { s: 0, p: 0, d: 0, f: 0, g: 0 };
    for (const c of orb.coefficients) {
        const aoIdx = c.aoIndex - 1;
        if (aoIdx >= 0 && aoIdx < aoMap.length) {
            const shellType = aoMap[aoIdx].shellType;
            shellContrib[shellType] = (shellContrib[shellType] || 0) + c.coefficient * c.coefficient;
        }
    }
    const totalContrib = Object.values(shellContrib).reduce((a, b) => a + b, 0);
    console.log('Shell type contributions (squared coefficients):');
    for (const [type, contrib] of Object.entries(shellContrib)) {
        if (contrib > 0.001) {
            const pct = (100 * contrib / totalContrib).toFixed(1);
            const needsFlip = needsOrcaSignFlip(type) ? ' (ORCA sign-flipped)' : '';
            console.log(`  ${type}: ${pct}%${needsFlip}`);
        }
    }

    // Show largest coefficients with shell info
    const sorted = [...orb.coefficients].sort((a, b) => Math.abs(b.coefficient) - Math.abs(a.coefficient));
    console.log('Top 10 coefficients:');
    for (let i = 0; i < Math.min(10, sorted.length); i++) {
        const c = sorted[i];
        const aoIdx = c.aoIndex - 1;
        let shellInfo = '';
        if (aoIdx >= 0 && aoIdx < aoMap.length) {
            const ao = aoMap[aoIdx];
            shellInfo = ` (${ao.shellType}, atom ${ao.shell.atomNumber})`;
        }
        console.log(`  AO ${c.aoIndex}: ${c.coefficient.toFixed(6)}${shellInfo}`);
    }
};

// Check source program and current settings
window.checkMoldenSettings = function() {
    if (!window.moldenData) {
        console.log('No molden data loaded');
        return;
    }
    const md = window.moldenData;
    console.log('=== Molden Settings ===');
    console.log('Source program:', md.sourceProgram);
    console.log('Spherical harmonics from file:', {
        D: md.useSphericalD ? '5D' : '6D',
        F: md.useSphericalF ? '7F' : '10F',
        G: md.useSphericalG ? '9G' : '15G'
    });
    console.log('Current evaluation settings:', {
        sourceProgram: sourceProgram,
        normalizationMode: normalizationMode,
        skipNormalization: skipPrimitiveNormalization(),
        signConvention: signConvention,
        useSphericalD: useSphericalD,
        useSphericalF: useSphericalF,
        useSphericalG: useSphericalG
    });

    // Program-specific info
    if (md.sourceProgram === 'orca') {
        console.log('ORCA: Pre-normalized coefficients, forced 5D/7F/9G, sign flip for f/g');
    } else if (md.sourceProgram === 'pyscf') {
        console.log('PySCF: Standard coefficients, uses file-specified spherical/cartesian');
    } else {
        console.log('Unknown/other: Standard coefficients, uses file-specified spherical/cartesian');
    }
};

// Check if current file is ORCA
window.isMoldenFromOrca = function() {
    if (!window.moldenData) {
        console.log('No molden data loaded');
        return false;
    }
    console.log('Source program:', window.moldenData.sourceProgram);
    return window.moldenData.sourceProgram === 'orca';
};

// Toggle ORCA sign flip for testing
window.toggleOrcaSignFlip = function(enable) {
    if (enable === undefined) {
        console.log('Current source program:', sourceProgram);
        console.log('To test sign flip: window.toggleOrcaSignFlip(true/false)');
        return;
    }
    if (enable) {
        sourceProgram = 'orca';
        console.log('Set source to ORCA - f/g orbitals will have sign flipped');
    } else {
        sourceProgram = 'unknown';
        console.log('Set source to unknown - no sign flipping');
    }
    console.log('Re-select the orbital to see the effect');
};

// Set source program for testing
window.setMoldenSource = function(source) {
    const valid = ['orca', 'pyscf', 'gaussian', 'psi4', 'unknown'];
    if (!valid.includes(source)) {
        console.log('Valid sources:', valid.join(', '));
        return;
    }
    sourceProgram = source;
    console.log('Set source program to:', source);
    console.log('Normalization will be ' + (skipPrimitiveNormalization() ? 'SKIPPED' : 'APPLIED'));
    console.log('Re-select the orbital to see the effect');
};

// Test orbital evaluation at specific points for debugging
window.testOrbitalPoint = function(orbIndex, x, y, z) {
    if (!window.moldenData || !window.molecule) {
        console.log('No molden data or molecule loaded');
        return;
    }

    const md = window.moldenData;
    if (orbIndex < 0 || orbIndex >= md.orbitals.length) {
        console.log(`Invalid orbital index. Valid range: 0 to ${md.orbitals.length - 1}`);
        return;
    }

    // Set up evaluation parameters
    const savedD = useSphericalD;
    const savedF = useSphericalF;
    const savedG = useSphericalG;
    const savedProg = sourceProgram;

    useSphericalD = md.useSphericalD || false;
    useSphericalF = md.useSphericalF || false;
    useSphericalG = md.useSphericalG || false;
    sourceProgram = md.sourceProgram || 'unknown';

    if (sourceProgram === 'orca') {
        useSphericalD = useSphericalF = useSphericalG = true;
    }

    const aoMap = buildAOBasisMap(md.basisFunctions, window.molecule.atoms);
    const orb = md.orbitals[orbIndex];
    const point = [x, y, z];
    const value = evaluateMOAtPoint(orb, aoMap, point);

    console.log(`Orbital ${orbIndex + 1} at (${x}, ${y}, ${z}): ${value.toFixed(8)}`);
    console.log('Settings:', {
        sourceProgram,
        skipNorm: skipPrimitiveNormalization(),
        spherical: { D: useSphericalD, F: useSphericalF, G: useSphericalG }
    });

    // Restore
    useSphericalD = savedD;
    useSphericalF = savedF;
    useSphericalG = savedG;
    sourceProgram = savedProg;

    return value;
};

// Compare orbital with different normalization modes
window.compareNormModes = function(orbIndex, x, y, z) {
    if (!window.moldenData || !window.molecule) {
        console.log('No molden data or molecule loaded');
        return;
    }

    const modes = ['auto', 'always', 'never'];
    const results = {};

    for (const mode of modes) {
        normalizationMode = mode;
        results[mode] = window.testOrbitalPoint(orbIndex, x, y, z);
    }

    normalizationMode = 'auto'; // Reset
    console.log('Comparison results at (' + x + ',' + y + ',' + z + '):');
    console.log('  auto:', results.auto?.toFixed(8));
    console.log('  always:', results.always?.toFixed(8));
    console.log('  never:', results.never?.toFixed(8));
};

// Toggle sign convention for spherical harmonics
window.setSignConvention = function(convention) {
    const valid = ['standard', 'condon-shortley'];
    if (!valid.includes(convention)) {
        console.log('Valid conventions:', valid.join(', '));
        console.log('Current convention:', signConvention);
        console.log('standard: all positive angular factors (default)');
        console.log('condon-shortley: includes (-1)^m phase for positive m (PySCF internal)');
        return;
    }
    signConvention = convention;
    console.log('Sign convention set to:', convention);
    console.log('Re-select the orbital to see the effect');
};

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

    // Set source program (affects normalization conventions)
    sourceProgram = moldenData.sourceProgram || 'unknown';
    signConvention = (sourceProgram === 'pyscf') ? 'condon-shortley' : 'standard';

    // Set spherical harmonics flags from moldenData
    // IMPORTANT: ORCA always uses spherical harmonics (5D, 7F, 9G) even if keywords
    // aren't present in the file - it's the only way ORCA stores basis functions
    if (sourceProgram === 'orca') {
        useSphericalD = true;
        useSphericalF = true;
        useSphericalG = true;
        console.log('[MoldenGrid] ORCA detected - forcing spherical harmonics (5D, 7F, 9G)');
    } else {
        useSphericalD = moldenData.useSphericalD || false;
        useSphericalF = moldenData.useSphericalF || false;
        useSphericalG = moldenData.useSphericalG || false;
    }

    // Select orbital FIRST (default to LUMO if available, otherwise HOMO)
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

    // Count expected AOs based on basis functions
    let expectedAOs = 0;
    const shellCounts = { s: 0, p: 0, sp: 0, d: 0, f: 0, g: 0 };
    for (const shell of moldenData.basisFunctions) {
        const type = shell.type.toLowerCase();
        shellCounts[type] = (shellCounts[type] || 0) + 1;
        switch (type) {
            case 's': expectedAOs += 1; break;
            case 'p': expectedAOs += 3; break;
            case 'sp': expectedAOs += 4; break;
            case 'd': expectedAOs += useSphericalD ? 5 : 6; break;
            case 'f': expectedAOs += useSphericalF ? 7 : 10; break;
            case 'g': expectedAOs += useSphericalG ? 9 : 15; break;
        }
    }

    // Get max AO index from MO coefficients to verify
    const maxAoIndex = Math.max(...selectedOrbital.coefficients.map(c => c.aoIndex));

    console.log('[MoldenGrid] Basis set analysis:', {
        shells: shellCounts,
        expectedAOs: expectedAOs,
        maxAoIndexInMO: maxAoIndex,
        spherical: { D: useSphericalD, F: useSphericalF, G: useSphericalG },
        sourceProgram: sourceProgram
    });

    // Auto-detect spherical vs Cartesian based on AO count mismatch
    if (maxAoIndex !== expectedAOs) {
        console.warn(`[MoldenGrid] AO count mismatch: expected ${expectedAOs}, MO uses ${maxAoIndex}`);

        // Try to fix by toggling spherical/Cartesian for D shells
        if (shellCounts.d > 0) {
            const dDiff = shellCounts.d; // Each d-shell differs by 1 AO between 5D and 6D
            if (expectedAOs - maxAoIndex === dDiff && useSphericalD) {
                // We have more AOs than MO uses - try Cartesian D
                console.log('[MoldenGrid] Auto-switching to Cartesian D (6D)');
                useSphericalD = false;
            } else if (maxAoIndex - expectedAOs === dDiff && !useSphericalD) {
                // MO uses more AOs than we have - try Spherical D
                console.log('[MoldenGrid] Auto-switching to Spherical D (5D)');
                useSphericalD = true;
            }
        }
    }

    // Log configuration
    if (sourceProgram === 'orca') {
        console.log('[MoldenGrid] ORCA detected - using pre-normalized coefficients');
        if (shellCounts.f > 0 || shellCounts.g > 0) {
            console.log('[MoldenGrid] ORCA sign flip will be applied to f/g shell contributions');
        }
    } else if (sourceProgram === 'pyscf') {
        console.log('[MoldenGrid] PySCF detected - ' +
            (skipPrimitiveNormalization() ? 'skipping normalization' : 'applying normalization') +
            `, sign convention: ${signConvention}`);
    } else {
        console.log('[MoldenGrid] Standard Molden - applying normalization');
    }
    if (useSphericalD || useSphericalF || useSphericalG) {
        console.log('[MoldenGrid] Using spherical harmonics:', {
            D: useSphericalD ? '5D' : '6D',
            F: useSphericalF ? '7F' : '10F',
            G: useSphericalG ? '9G' : '15G'
        });
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

    // Final verification
    if (aoMap.length < maxAoIndex) {
        console.error(`[MoldenGrid] CRITICAL: AO map has ${aoMap.length} entries but MO references AO index ${maxAoIndex}`);
        console.error('[MoldenGrid] Orbitals will likely be incorrect. Check spherical/Cartesian settings.');
    }

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
