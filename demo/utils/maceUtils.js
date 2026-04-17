// MACE backend API utilities and extxyz file generation
import { postJson, streamSSE } from './apiUtils.js';

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

    if (Array.isArray(force)) {
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
export async function callMaceEnergyBatch(backendUrl, frames, model, includeForces = false, jobId = null) {
    const body = { frames, model, includeForces };
    if (jobId) body.jobId = jobId;
    return postJson(`${backendUrl}/ai/mace/energy-batch`, body, {}, 120000);
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
    const { fmax = 0.05, maxSteps = 100, includeForces = false, jobId = null } = options;
    const body = { atoms, model, fmax, maxSteps, includeForces };
    if (jobId) body.jobId = jobId;
    return postJson(`${backendUrl}/ai/mace/optimize`, body, {}, 120000);
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
        includeForces = false,
        jobId = null
    } = options;
    const body = { atoms, model, temperature_K, timestep_fs, steps, includeForces };
    if (jobId) body.jobId = jobId;
    return postJson(`${backendUrl}/ai/mace/md`, body, {}, 120000);
}

/**
 * Stream SSE endpoint — calls onFrame for each frame, returns final summary.
 * @param {string} url - Full endpoint URL
 * @param {Object} body - POST body
 * @param {Function} onFrame - Callback for each frame event: (frameData) => void
 * @returns {Promise<Object>} Final summary from 'done' event
 */
export async function streamMaceSSE(url, body, onFrame) {
    return streamSSE(url, body, {
        onEvent: (event) => {
            if (event.type === 'frame' && onFrame) onFrame(event);
        },
    });
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
 * Streaming MACE batch energy. onProgress(event) called with each
 * {frame, total, energy_eV, max_force_eV_A, elapsed_ms} progress event.
 * Resolves with the final summary payload (same shape as blocking endpoint).
 */
export async function callMaceEnergyBatchStream(backendUrl, frames, model, includeForces, onProgress) {
    return streamSSE(`${backendUrl}/ai/mace/energy-batch/stream`, { frames, model, includeForces }, {
        onEvent: (ev) => {
            if (ev.type === 'progress' && onProgress) onProgress(ev);
        },
    });
}

/**
 * Streaming DFT batch energy. onProgress(event) fires per frame with SCF cycle
 * count + elapsed time. Resolves with final summary payload.
 */
export async function callDftEnergyBatchStream(backendUrl, frames, options = {}, onProgress) {
    const { basis = 'def2-tzvppd', xc = 'wb97m-d3bj', charge = 0, spin = 0, includeForces = true, conv_tol } = options;
    const body = { frames, basis, xc, charge, spin, includeForces };
    if (conv_tol !== undefined) body.conv_tol = conv_tol;
    return streamSSE(`${backendUrl}/ai/dft/energy-batch/stream`, body, {
        onEvent: (ev) => {
            if (ev.type === 'progress' && onProgress) onProgress(ev);
        },
    });
}

/**
 * Streaming single-point DFT energy. onScf(event) fires per SCF iteration.
 * Resolves with final summary (energy_eV, forces?, converged).
 */
export async function callDftEnergyStream(backendUrl, atoms, options = {}, onScf) {
    const { basis = 'def2-tzvppd', xc = 'wb97m-d3bj', charge = 0, spin = 0, includeForces = true, conv_tol } = options;
    const body = { atoms, basis, xc, charge, spin, includeForces };
    if (conv_tol !== undefined) body.conv_tol = conv_tol;
    return streamSSE(`${backendUrl}/ai/dft/energy/stream`, body, {
        onEvent: (ev) => {
            if (ev.type === 'scf' && onScf) onScf(ev);
        },
    });
}

/**
 * Streaming MD via /ai/mace/md/stream. onFrame(event) is called per frame as
 * the simulation produces it. onStatus(event) for status/heartbeat events.
 * Resolves with summary from the `done` event.
 */
export async function callMaceMDStream(backendUrl, body, { onFrame, onStatus } = {}) {
    return streamSSE(`${backendUrl}/ai/mace/md/stream`, body, {
        onEvent: (ev) => {
            if (ev.type === 'frame' && onFrame) onFrame(ev);
            else if ((ev.type === 'status' || ev.type === 'heartbeat') && onStatus) onStatus(ev);
        },
    });
}

/**
 * Streaming geometry optimize via /ai/mace/optimize/stream. onFrame fires per
 * BFGS step. Resolves with summary.
 */
export async function callMaceOptimizeStream(backendUrl, body, { onFrame, onStatus } = {}) {
    return streamSSE(`${backendUrl}/ai/mace/optimize/stream`, body, {
        onEvent: (ev) => {
            if (ev.type === 'frame' && onFrame) onFrame(ev);
            else if ((ev.type === 'status' || ev.type === 'heartbeat') && onStatus) onStatus(ev);
        },
    });
}

/**
 * Streaming Python execution. Fires stdoutLine(line) / stderrLine(line) per
 * line as the user's code prints. Resolves with final summary (figures,
 * figureCount, elapsed_ms, success).
 */
export async function streamPythonExecute(backendUrl, body, { onStdout, onStderr, onEvent } = {}) {
    return streamSSE(`${backendUrl}/ai/python/execute/stream`, body, {
        onEvent: (ev) => {
            if (ev.type === 'stdout' && onStdout) onStdout(ev.line);
            else if (ev.type === 'stderr' && onStderr) onStderr(ev.line);
            if (onEvent) onEvent(ev);
        },
    });
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
                if (Array.isArray(force)) {
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
