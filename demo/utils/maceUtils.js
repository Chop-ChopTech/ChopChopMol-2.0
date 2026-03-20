// MACE backend API utilities and extxyz file generation
import { postJson } from './apiUtils.js';

/**
 * Configuration for MACE API
 */
export const MACE_CONFIG = {
    lattice: 'Lattice="100.0 0.0 0.0 0.0 100.0 0.0 0.0 0.0 100.0"',
    pbc: 'pbc="T T T"'
};

/**
 * Generates a timestamp string for file naming
 * @returns {string} Timestamp in ISO format with safe characters
 */
export function generateTimestamp() {
    return new Date().toISOString().replace(/[:.]/g, '-').slice(0, 19);
}

/**
 * Generates extxyz property string based on whether forces are included
 * @param {boolean} hasForces - Whether force data is included
 * @returns {string} Properties string for extxyz format
 */
export function getExtxyzProperties(hasForces) {
    return hasForces
        ? 'Properties=species:S:1:pos:R:3:forces:R:3'
        : 'Properties=species:S:1:pos:R:3';
}

/**
 * Formats a single atom line for extxyz format
 * @param {Object} atom - Atom data {element, x, y, z}
 * @param {Array|null} force - Force vector [fx, fy, fz] or null
 * @returns {string} Formatted atom line
 */
export function formatAtomLine(atom, force = null) {
    let line = `${atom.element.padEnd(4)} ${atom.x.toFixed(8).padStart(14)} ${atom.y.toFixed(8).padStart(14)} ${atom.z.toFixed(8).padStart(14)}`;

    if (force) {
        line += ` ${force[0].toFixed(8).padStart(14)} ${force[1].toFixed(8).padStart(14)} ${force[2].toFixed(8).padStart(14)}`;
    }

    return line;
}

/**
 * Generates extxyz content for a single frame
 * @param {Array} atoms - Array of atom data
 * @param {number} energy - Energy in eV
 * @param {Array|null} forces - Array of force vectors or null
 * @param {Object} extraProps - Additional properties for comment line
 * @returns {string} Extxyz file content
 */
export function generateSingleFrameExtxyz(atoms, energy, forces = null, extraProps = {}) {
    const hasForces = forces && forces.length > 0;
    const props = getExtxyzProperties(hasForces);

    const extraPropsStr = Object.entries(extraProps)
        .map(([key, val]) => `${key}=${val}`)
        .join(' ');

    const comment = `${MACE_CONFIG.lattice} ${props} energy=${energy} ${MACE_CONFIG.pbc}${extraPropsStr ? ' ' + extraPropsStr : ''}`;

    let extxyz = `${atoms.length}\n${comment}\n`;

    atoms.forEach((atom, i) => {
        const force = hasForces ? forces[i] : null;
        extxyz += formatAtomLine(atom, force) + '\n';
    });

    return extxyz;
}

/**
 * Generates extxyz content for multiple frames
 * @param {Array} frames - Array of frame data, each with {atoms, energy, forces?, ...}
 * @returns {string} Multi-frame extxyz file content
 */
export function generateMultiFrameExtxyz(frames) {
    const hasForces = frames.some(f => f.forces && f.forces.length > 0);
    const props = getExtxyzProperties(hasForces);

    let extxyz = '';

    frames.forEach((frame, frameIndex) => {
        const extraProps = { ...frame.extraProps, frame: frameIndex };
        const extraPropsStr = Object.entries(extraProps)
            .map(([key, val]) => `${key}=${val}`)
            .join(' ');

        const comment = `${MACE_CONFIG.lattice} ${props} energy=${frame.energy} ${MACE_CONFIG.pbc} ${extraPropsStr}`;

        extxyz += `${frame.atoms.length}\n${comment}\n`;

        frame.atoms.forEach((atom, atomIndex) => {
            const force = hasForces && frame.forces && frame.forces[atomIndex]
                ? frame.forces[atomIndex]
                : null;
            extxyz += formatAtomLine(atom, force) + '\n';
        });
    });

    return extxyz;
}

/**
 * Calls MACE energy endpoint
 * @param {string} backendUrl - Backend URL
 * @param {Array} atoms - Array of atom data
 * @param {string} model - Model name
 * @param {boolean} includeForces - Whether to include forces
 * @returns {Promise<Object>} API response
 */
export async function callMaceEnergy(backendUrl, atoms, model, includeForces = false) {
    return postJson(`${backendUrl}/ai/mace/energy`, { atoms, model, includeForces }, {}, 120000);
}

/**
 * Calls MACE energy-batch endpoint
 * @param {string} backendUrl - Backend URL
 * @param {Array} frames - Array of frame atom data
 * @param {string} model - Model name
 * @param {boolean} includeForces - Whether to include forces
 * @returns {Promise<Object>} API response
 */
export async function callMaceEnergyBatch(backendUrl, frames, model, includeForces = false) {
    return postJson(`${backendUrl}/ai/mace/energy-batch`, { frames, model, includeForces }, {}, 120000);
}

/**
 * Calls MACE optimize endpoint
 * @param {string} backendUrl - Backend URL
 * @param {Array} atoms - Array of atom data
 * @param {string} model - Model name
 * @param {Object} options - Optimization options {fmax, maxSteps, includeForces}
 * @returns {Promise<Object>} API response
 */
export async function callMaceOptimize(backendUrl, atoms, model, options = {}) {
    const { fmax = 0.05, maxSteps = 100, includeForces = false } = options;
    return postJson(`${backendUrl}/ai/mace/optimize`, { atoms, model, fmax, maxSteps, includeForces }, {}, 120000);
}

/**
 * Calls MACE MD endpoint
 * @param {string} backendUrl - Backend URL
 * @param {Array} atoms - Array of atom data
 * @param {string} model - Model name
 * @param {Object} options - MD options {temperature_K, timestep_fs, steps, includeForces}
 * @returns {Promise<Object>} API response
 */
export async function callMaceMD(backendUrl, atoms, model, options = {}) {
    const {
        temperature_K = 300,
        timestep_fs = 1.0,
        steps = 100,
        includeForces = false
    } = options;
    return postJson(`${backendUrl}/ai/mace/md`, { atoms, model, temperature_K, timestep_fs, steps, includeForces }, {}, 120000);
}

/**
 * Stream SSE endpoint — calls onFrame for each frame, returns final summary.
 * @param {string} url - Full endpoint URL
 * @param {Object} body - POST body
 * @param {Function} onFrame - Callback for each frame event: (frameData) => void
 * @returns {Promise<Object>} Final summary from 'done' event
 */
export async function streamMaceSSE(url, body, onFrame) {
    const res = await fetch(url, {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify(body),
    });
    if (!res.ok) {
        const err = await res.json().catch(() => ({ error: res.statusText }));
        throw new Error(err.error || `HTTP ${res.status}`);
    }
    const reader = res.body.getReader();
    const decoder = new TextDecoder();
    let buffer = '';
    let summary = null;

    while (true) {
        const { done, value } = await reader.read();
        if (done) break;
        buffer += decoder.decode(value, { stream: true });

        let newlineIdx;
        while ((newlineIdx = buffer.indexOf('\n')) !== -1) {
            const line = buffer.slice(0, newlineIdx).trim();
            buffer = buffer.slice(newlineIdx + 1);
            if (!line.startsWith('data: ')) continue;
            const json = line.slice(6);
            try {
                const event = JSON.parse(json);
                if (event.type === 'frame') {
                    onFrame(event);
                } else if (event.type === 'done') {
                    summary = event.summary;
                } else if (event.type === 'error') {
                    throw new Error(event.error);
                }
            } catch (e) {
                if (e.message && !e.message.includes('JSON')) throw e;
            }
        }
    }
    return summary || { success: true };
}

/**
 * Saves extxyz file to file explorer if available
 * @param {string} filename - File name
 * @param {string} content - File content
 * @returns {Promise<boolean>} Success status
 */
export async function saveExtxyzFile(filename, content) {
    if (!window.fileExplorer?.directoryHandle) {
        return false;
    }

    try {
        await window.fileExplorer.createFile(filename, content);
        return true;
    } catch (error) {
        console.error('Error saving extxyz file:', error);
        return false;
    }
}

/**
 * Calls DFT energy endpoint (PySCF)
 * @param {string} backendUrl - Backend URL
 * @param {Array} atoms - Array of atom data {element, x, y, z}
 * @param {Object} options - DFT options {basis, xc, charge, spin, includeForces}
 * @returns {Promise<Object>} API response
 */
export async function callDftEnergy(backendUrl, atoms, options = {}) {
    const { basis = 'def2-tzvppd', xc = 'wb97m-d3bj', charge = 0, spin = 0, includeForces = true } = options;
    return postJson(`${backendUrl}/ai/dft/energy`, { atoms, basis, xc, charge, spin, includeForces }, {}, 300000);
}

/**
 * Calls DFT energy-batch endpoint (PySCF)
 * @param {string} backendUrl - Backend URL
 * @param {Array} frames - Array of frame atom data
 * @param {Object} options - DFT options {basis, xc, charge, spin, includeForces}
 * @returns {Promise<Object>} API response
 */
export async function callDftEnergyBatch(backendUrl, frames, options = {}) {
    const { basis = 'def2-tzvppd', xc = 'wb97m-d3bj', charge = 0, spin = 0, includeForces = true } = options;
    return postJson(`${backendUrl}/ai/dft/energy-batch`, { frames, basis, xc, charge, spin, includeForces }, {}, 1800000);
}

/**
 * Merges force data into window.xyzFrames
 * @param {Array} energyResults - Array of energy results with forces
 * @param {boolean} includeForces - Whether forces should be merged
 */
export function mergeForcesIntoFrames(energyResults, includeForces) {
    if (!includeForces || !window.xyzFrames) return;

    energyResults.forEach((energyResult, frameIdx) => {
        if (energyResult.forces && window.xyzFrames[frameIdx]) {
            window.xyzFrames[frameIdx].atomData.forEach((atom, atomIdx) => {
                const force = energyResult.forces[atomIdx];
                if (force) {
                    atom.fx = force[0];
                    atom.fy = force[1];
                    atom.fz = force[2];
                }
            });
        }
    });
}

/**
 * Updates current molecule with force data from current frame
 */
export function updateCurrentFrameForces() {
    const currentFrameIdx = parseInt(document.getElementById('frameSlider')?.value || 0);

    if (window.xyzFrames && window.xyzFrames[currentFrameIdx]) {
        const molecule = window.main?.molecule;
        if (molecule) {
            molecule.setForcesFromFrame(window.xyzFrames[currentFrameIdx]);
            if (window.updateForceArrowControls) {
                window.updateForceArrowControls();
            }
        }
    }
}
