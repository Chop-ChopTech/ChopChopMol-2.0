import { getBackendUrl, getBackendUrlSync, onBackendUrlOverride } from './apiUtils.js';

let BACKEND_URL = getBackendUrlSync();
getBackendUrl().then(url => { BACKEND_URL = url; });
onBackendUrlOverride(url => { BACKEND_URL = url; });

// ============================================================================
// Binary Decoders
// ============================================================================

/**
 * Decode base64-encoded Float32Array data from backend (uncompressed).
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
 * Decode base64-encoded zlib-compressed Float32Array data from backend.
 * Uses the native DecompressionStream API (supported in all modern browsers).
 */
async function decodeBase64Float32Zlib(base64String) {
    const binaryString = atob(base64String);
    const compressed = new Uint8Array(binaryString.length);
    for (let i = 0; i < binaryString.length; i++) {
        compressed[i] = binaryString.charCodeAt(i);
    }

    // Use native DecompressionStream (zlib format = 'deflate')
    const ds = new DecompressionStream('deflate');
    const writer = ds.writable.getWriter();
    writer.write(compressed);
    writer.close();

    const reader = ds.readable.getReader();
    const chunks = [];
    let totalLength = 0;
    while (true) {
        const { done, value } = await reader.read();
        if (done) break;
        chunks.push(value);
        totalLength += value.length;
    }

    const decompressed = new Uint8Array(totalLength);
    let offset = 0;
    for (const chunk of chunks) {
        decompressed.set(chunk, offset);
        offset += chunk.length;
    }

    return new Float32Array(decompressed.buffer);
}

/**
 * Decode volume data based on the format returned by the backend.
 */
async function decodeVolumeData(data, dataFormat) {
    if (dataFormat === 'base64_float32_zlib') {
        return await decodeBase64Float32Zlib(data);
    } else if (dataFormat === 'base64_float32') {
        return decodeBase64Float32(data);
    } else {
        return new Float32Array(data);
    }
}

/**
 * Decode mesh data (pre-computed vertices + normals) from the backend.
 * The backend sends zlib-compressed base64 Float32Arrays.
 * @param {Object} meshData - { positive: {vertices, normals, ...}, negative: {vertices, normals, ...} }
 * @returns {Object} Decoded mesh with Float32Arrays ready for Three.js
 */
async function decodeMeshData(meshData) {
    const result = { positive: null, negative: null };

    for (const phase of ['positive', 'negative']) {
        const phaseData = meshData[phase];
        if (!phaseData) continue;

        const [vertices, normals] = await Promise.all([
            decodeBase64Float32Zlib(phaseData.vertices),
            decodeBase64Float32Zlib(phaseData.normals),
        ]);

        result[phase] = {
            vertices,
            normals,
            numVertices: phaseData.numVertices,
            numTriangles: phaseData.numTriangles,
        };
    }

    return result;
}

// ============================================================================
// Orbital Cache
// ============================================================================

// Cache: keyed by "${orbitalIndex}_${gridSize}_${padding}"
window.orbitalCache = {};

// Preload state tracking
window.orbitalPreloadState = {
    active: false,
    abortController: null,
    gridSize: null,
    padding: null,
    contentHash: null,
    loaded: 0,
    total: 0
};

/**
 * Get a cached orbital if available.
 * @returns {Object|null} Cached orbital data or null
 */
export function getCachedOrbital(orbitalIndex, gridSize, padding) {
    const cacheKey = `${orbitalIndex}_${gridSize}_${padding}`;
    return window.orbitalCache[cacheKey] || null;
}

/**
 * Clear the orbital cache and abort any active preload.
 */
export function clearOrbitalCache() {
    window.orbitalCache = {};
    const state = window.orbitalPreloadState;
    state.contentHash = null;
    state.loaded = 0;
    state.total = 0;
    if (state.abortController) {
        state.abortController.abort();
        state.abortController = null;
    }
    state.active = false;
}

/**
 * Compute a simple hash of content for cache invalidation.
 */
async function computeContentHash(content) {
    const data = new TextEncoder().encode(content);
    const hashBuffer = await crypto.subtle.digest('SHA-256', data);
    const hashArray = Array.from(new Uint8Array(hashBuffer));
    return hashArray.map(b => b.toString(16).padStart(2, '0')).join('').slice(0, 16);
}

// ============================================================================
// Batch Preload
// ============================================================================

/**
 * Preload ALL orbitals from a molden file via the streaming batch endpoint.
 * Results are cached as they arrive; the onProgress callback is called per orbital.
 *
 * @param {string} moldenContent - Raw molden file content
 * @param {number} gridSize - Grid resolution per axis
 * @param {number} padding - Padding in Bohr
 * @param {Function} onProgress - Called with (loaded, total) as orbitals arrive
 */
export async function preloadAllOrbitals(moldenContent, gridSize = 50, padding = 4.0, onProgress, options = {}) {
    if (!moldenContent) return;

    const state = window.orbitalPreloadState;
    const meshMode = options.meshMode !== undefined ? options.meshMode : true;
    const isoValue = options.isoValue || 0.02;

    // Abort any previous preload
    if (state.abortController) {
        state.abortController.abort();
    }

    // Check if cache is already valid for this content + settings
    const contentHash = await computeContentHash(moldenContent);
    if (state.contentHash === contentHash && state.gridSize === gridSize && state.padding === padding
        && state.loaded > 0 && state.loaded >= state.total) {
        onProgress?.(state.total, state.total);
        return;
    }

    // Clear old cache
    window.orbitalCache = {};
    state.active = true;
    state.abortController = new AbortController();
    state.gridSize = gridSize;
    state.padding = padding;
    state.contentHash = contentHash;
    state.loaded = 0;
    state.total = 0;

    try {
        const mode = meshMode ? 'mesh' : 'volume';
        console.log(`[OrbitalPreload] Starting batch preload (grid=${gridSize}, mode=${mode})...`);
        const t0 = performance.now();

        const requestBody = { moldenContent, gridSize, padding };
        if (meshMode) {
            requestBody.meshMode = true;
            requestBody.isoValue = isoValue;
        }

        const response = await fetch(`${BACKEND_URL}/ai/molden/orbital-batch`, {
            method: 'POST',
            headers: { 'Content-Type': 'application/json' },
            body: JSON.stringify(requestBody),
            signal: state.abortController.signal
        });

        if (!response.ok) {
            throw new Error(`Batch request failed: HTTP ${response.status}`);
        }

        const reader = response.body.getReader();
        const decoder = new TextDecoder();
        let buffer = '';
        let gridInfo = null;
        let serverMeshMode = false;

        while (true) {
            const { done, value } = await reader.read();
            if (done) break;

            buffer += decoder.decode(value, { stream: true });
            const lines = buffer.split('\n');
            buffer = lines.pop(); // Keep incomplete last line in buffer

            for (const line of lines) {
                if (!line.trim()) continue;

                let obj;
                try {
                    obj = JSON.parse(line);
                } catch (e) {
                    console.warn('[OrbitalPreload] Failed to parse NDJSON line:', e);
                    continue;
                }

                if (obj.type === 'meta') {
                    state.total = obj.totalRequested;
                    gridInfo = obj.gridInfo;
                    serverMeshMode = obj.meshMode || false;
                    onProgress?.(0, state.total);
                } else if (obj.type === 'orbital') {
                    const cacheKey = `${obj.orbitalIndex}_${gridSize}_${padding}`;

                    if (obj.dataFormat === 'mesh' && obj.mesh) {
                        // Mesh mode: decode pre-computed mesh data
                        const meshGeometry = await decodeMeshData(obj.mesh);
                        window.orbitalCache[cacheKey] = {
                            meshData: meshGeometry,
                            gridInfo,
                            minValue: obj.minValue,
                            maxValue: obj.maxValue,
                            orbitalType: obj.orbitalType,
                            energy: obj.energy,
                            occupation: obj.occupation,
                            orbitalIndex: obj.orbitalIndex,
                            homoIndex: null,
                            lumoIndex: null,
                            numOrbitals: state.total,
                            fileType: 'molden-generated',
                            isMesh: true,
                        };
                    } else {
                        // Volume mode: decode volumetric data (legacy path)
                        const volumeData = await decodeVolumeData(obj.volumeData, obj.dataFormat);
                        window.orbitalCache[cacheKey] = {
                            volumeData,
                            gridInfo,
                            minValue: obj.minValue,
                            maxValue: obj.maxValue,
                            orbitalType: obj.orbitalType,
                            energy: obj.energy,
                            occupation: obj.occupation,
                            orbitalIndex: obj.orbitalIndex,
                            homoIndex: null,
                            lumoIndex: null,
                            numOrbitals: state.total,
                            fileType: 'molden-generated',
                            isMesh: false,
                        };
                    }
                    state.loaded++;
                    onProgress?.(state.loaded, state.total);
                } else if (obj.type === 'error') {
                    console.warn(`[OrbitalPreload] Error for orbital ${obj.orbitalIndex}:`, obj.error);
                }
            }
        }

        const elapsed = performance.now() - t0;
        console.log(`[OrbitalPreload] Completed: ${state.loaded}/${state.total} orbitals in ${elapsed.toFixed(0)}ms (${mode} mode)`);

    } catch (err) {
        if (err.name === 'AbortError') {
            console.log('[OrbitalPreload] Aborted');
        } else {
            console.error('[OrbitalPreload] Error:', err);
            throw err;
        }
    } finally {
        state.active = false;
    }
}

// ============================================================================
// Single Orbital Request (fallback when cache miss during preload)
// ============================================================================

/**
 * Generate volumetric grid data from a Molden file using the PySCF backend.
 * Now supports zlib-compressed binary transfer.
 */
export async function generateMoldenOrbitalGridFromBackend(moldenContent, orbitalIndex = 0, gridSize = 50, padding = 4.0) {
    if (!moldenContent) {
        console.error('[MoldenOrbitals] No molden content provided');
        return null;
    }

    // Check cache first
    const cached = getCachedOrbital(orbitalIndex, gridSize, padding);
    if (cached) {
        console.log(`[MoldenOrbitals] Cache hit for orbital ${orbitalIndex}`);
        return cached;
    }

    try {
        const t0 = performance.now();
        console.log(`[MoldenOrbitals] Requesting orbital ${orbitalIndex} (grid=${gridSize})...`);

        const response = await fetch(`${BACKEND_URL}/ai/molden/orbital`, {
            method: 'POST',
            headers: { 'Content-Type': 'application/json' },
            body: JSON.stringify({
                moldenContent,
                orbitalIndex,
                gridSize,
                padding,
                binary: true
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

        const t3 = performance.now();
        const volumeData = await decodeVolumeData(result.volumeData, result.dataFormat);
        const t4 = performance.now();

        console.log(`[MoldenOrbitals] Orbital ${orbitalIndex} loaded in ${(t4 - t0).toFixed(0)}ms ` +
            `(network=${(t1 - t0).toFixed(0)}ms, parse=${(t2 - t1).toFixed(0)}ms, decode=${(t4 - t3).toFixed(0)}ms)`);

        const orbitalData = {
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
        };

        // Store in cache for future use
        const cacheKey = `${orbitalIndex}_${gridSize}_${padding}`;
        window.orbitalCache[cacheKey] = orbitalData;

        return orbitalData;

    } catch (error) {
        console.error('[MoldenOrbitals] Error generating orbital grid:', error);
        throw error;
    }
}

/**
 * Get information about orbitals in a molden file without computing the full grid.
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
            headers: { 'Content-Type': 'application/json' },
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
 * @deprecated Use generateMoldenOrbitalGridFromBackend instead
 */
export function generateMoldenOrbitalGrid(moldenData, atoms, orbitalIndex = -1, gridSize = 50, padding = 5.0) {
    console.warn('[MoldenOrbitals] generateMoldenOrbitalGrid is deprecated. Use generateMoldenOrbitalGridFromBackend instead.');
    return null;
}

// Export functions to window for use in non-module scripts
window.generateMoldenOrbitalGridFromBackend = generateMoldenOrbitalGridFromBackend;
window.getMoldenOrbitalInfo = getMoldenOrbitalInfo;
window.generateMoldenOrbitalGrid = generateMoldenOrbitalGrid;
window.preloadAllOrbitals = preloadAllOrbitals;
window.getCachedOrbital = getCachedOrbital;
window.clearOrbitalCache = clearOrbitalCache;

export default {
    generateMoldenOrbitalGridFromBackend,
    getMoldenOrbitalInfo,
    generateMoldenOrbitalGrid,
    preloadAllOrbitals,
    getCachedOrbital,
    clearOrbitalCache
};
