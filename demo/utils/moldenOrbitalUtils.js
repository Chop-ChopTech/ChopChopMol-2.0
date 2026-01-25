/**
 * Molden Orbital Visualization Utilities
 *
 * This module provides functions to generate volumetric orbital data from Molden files
 * by calling the PySCF-based backend for accurate Gaussian basis function evaluation.
 *
 * The backend handles all the complexity of:
 * - Spherical vs Cartesian basis sets (5D/7F/9G detection)
 * - Different normalization conventions (ORCA, PySCF, Gaussian, etc.)
 * - All angular momentum types (s, p, d, f, g)
 *
 * OPTIMIZATIONS (v2.0):
 * - Binary data transfer (base64-encoded Float32) - 3-5x faster than JSON
 * - Backend caching of mol objects and AO grids - instant orbital switching
 * - Performance timing for debugging
 *
 * The frontend just needs to send the molden file content and receive the volumetric grid.
 */

// Backend URL - use local or production
const BACKEND_URL = window.location.hostname === 'localhost' || window.location.hostname === '127.0.0.1'
    ? 'http://127.0.0.1:10000'
    : 'https://chopchopmol-ai-backend.onrender.com';

/**
 * Decode base64-encoded Float32Array data from backend.
 * @param {string} base64String - Base64 encoded binary data
 * @returns {Float32Array} Decoded float array
 */
function decodeBase64Float32(base64String) {
    const binaryString = atob(base64String);
    const bytes = new Uint8Array(binaryString.length);
    for (let i = 0; i < binaryString.length; i++) {
        bytes[i] = binaryString.charCodeAt(i);
    }
    return new Float32Array(bytes.buffer);
}

/**
 * Generate volumetric grid data from a Molden file using the PySCF backend.
 *
 * @param {string} moldenContent - Raw content of the molden file
 * @param {number} orbitalIndex - MO index to visualize (0-based)
 * @param {number} gridSize - Grid resolution per axis (default: 50)
 * @param {number} padding - Padding around the molecule in Bohr (default: 4.0)
 * @returns {Promise<Object|null>} Orbital data compatible with marching cubes visualization
 */
export async function generateMoldenOrbitalGridFromBackend(moldenContent, orbitalIndex = 0, gridSize = 50, padding = 4.0) {
    if (!moldenContent) {
        console.error('[MoldenOrbitals] No molden content provided');
        return null;
    }

    try {
        const t0 = performance.now();
        console.log(`[MoldenOrbitals] Requesting orbital ${orbitalIndex} (grid=${gridSize})...`);

        const response = await fetch(`${BACKEND_URL}/ai/molden/orbital`, {
            method: 'POST',
            headers: {
                'Content-Type': 'application/json'
            },
            body: JSON.stringify({
                moldenContent,
                orbitalIndex,
                gridSize,
                padding,
                binary: true  // Request binary format for speed
            })
        });

        const t1 = performance.now();

        if (!response.ok) {
            const errorData = await response.json().catch(() => ({}));
            throw new Error(errorData.error || `HTTP error ${response.status}`);
        }

        const result = await response.json();
        const t2 = performance.now();

        if (!result.success) {
            throw new Error(result.error || 'Unknown error from backend');
        }

        // Decode volume data based on format
        let volumeData;
        const t3 = performance.now();

        if (result.dataFormat === 'base64_float32') {
            // Fast path: decode binary data
            volumeData = decodeBase64Float32(result.volumeData);
        } else {
            // Legacy path: convert JSON array
            volumeData = new Float32Array(result.volumeData);
        }

        const t4 = performance.now();

        // Log performance
        const networkTime = t1 - t0;
        const parseTime = t2 - t1;
        const decodeTime = t4 - t3;
        const totalTime = t4 - t0;

        console.log(`[MoldenOrbitals] Orbital ${orbitalIndex} loaded in ${totalTime.toFixed(0)}ms ` +
            `(network=${networkTime.toFixed(0)}ms, parse=${parseTime.toFixed(0)}ms, decode=${decodeTime.toFixed(0)}ms)`);

        if (result.timings) {
            console.log(`[MoldenOrbitals] Backend timings:`, result.timings);
        }

        console.log(`[MoldenOrbitals] Grid data:`, {
            dimensions: result.gridInfo.dimensions,
            valueRange: [result.minValue, result.maxValue],
            orbitalType: result.orbitalType,
            dataFormat: result.dataFormat
        });

        return {
            volumeData,
            gridInfo: result.gridInfo,
            minValue: result.minValue,
            maxValue: result.maxValue,
            comment: result.comment,
            fileType: 'molden-generated',
            orbitalIndex: result.orbitalIndex,
            orbitalType: result.orbitalType,
            energy: result.energy,
            occupation: result.occupation,
            homoIndex: result.homoIndex,
            lumoIndex: result.lumoIndex,
            numOrbitals: result.numOrbitals,
            timings: {
                frontend: { network: networkTime, parse: parseTime, decode: decodeTime, total: totalTime },
                backend: result.timings
            }
        };

    } catch (error) {
        console.error('[MoldenOrbitals] Error generating orbital grid:', error);
        throw error;
    }
}

/**
 * Get information about orbitals in a molden file without computing the full grid.
 * Useful for populating the orbital selection table before the user selects one.
 *
 * @param {string} moldenContent - Raw content of the molden file
 * @returns {Promise<Object|null>} Orbital information including energies, occupations, HOMO/LUMO indices
 */
export async function getMoldenOrbitalInfo(moldenContent) {
    if (!moldenContent) {
        console.error('[MoldenOrbitals] No molden content provided');
        return null;
    }

    try {
        console.log('[MoldenOrbitals] Requesting orbital info from backend...');

        const response = await fetch(`${BACKEND_URL}/ai/molden/info`, {
            method: 'POST',
            headers: {
                'Content-Type': 'application/json'
            },
            body: JSON.stringify({ moldenContent })
        });

        if (!response.ok) {
            const errorData = await response.json().catch(() => ({}));
            throw new Error(errorData.error || `HTTP error ${response.status}`);
        }

        const result = await response.json();

        if (!result.success) {
            throw new Error(result.error || 'Unknown error from backend');
        }

        console.log('[MoldenOrbitals] Received orbital info:', {
            numOrbitals: result.numOrbitals,
            numOccupied: result.numOccupied,
            homoIndex: result.homoIndex,
            lumoIndex: result.lumoIndex,
            homoLumoGap: result.homoLumoGap
        });

        return result;

    } catch (error) {
        console.error('[MoldenOrbitals] Error getting orbital info:', error);
        throw error;
    }
}

/**
 * Legacy function for backward compatibility.
 * This is kept for code that still calls the old synchronous API.
 * It logs a warning and returns null - callers should use the async version.
 *
 * @deprecated Use generateMoldenOrbitalGridFromBackend instead
 */
export function generateMoldenOrbitalGrid(moldenData, atoms, orbitalIndex = -1, gridSize = 50, padding = 5.0) {
    console.warn('[MoldenOrbitals] generateMoldenOrbitalGrid is deprecated. Use generateMoldenOrbitalGridFromBackend instead.');
    console.warn('[MoldenOrbitals] This function returns null. Update your code to use the async backend-based version.');
    return null;
}

// Export functions to window for use in non-module scripts
window.generateMoldenOrbitalGridFromBackend = generateMoldenOrbitalGridFromBackend;
window.getMoldenOrbitalInfo = getMoldenOrbitalInfo;
window.generateMoldenOrbitalGrid = generateMoldenOrbitalGrid; // Deprecated compatibility

export default {
    generateMoldenOrbitalGridFromBackend,
    getMoldenOrbitalInfo,
    generateMoldenOrbitalGrid
};
