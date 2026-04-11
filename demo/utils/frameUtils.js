// Frame management utilities for multi-frame animations

/**
 * Sets up the frame slider UI for multi-frame molecules
 * @param {Array} frames - Array of frame data
 * @param {number} initialFrame - Initial frame index to display (default: 0)
 */
export function setupFrameSlider(frames, initialFrame = 0) {
    const frameSliderContainer = document.getElementById('frameSliderContainer');
    if (!frameSliderContainer) return;

    frameSliderContainer.style.display = 'flex';
    const slider = document.getElementById('frameSlider');
    const label = document.getElementById('frameLabel');

    if (slider) {
        slider.max = frames.length - 1;
        slider.value = initialFrame;
    }

    if (label) {
        label.textContent = `Frame ${initialFrame + 1} / ${frames.length}`;
    }
}

/**
 * Hides the frame slider UI
 */
export function hideFrameSlider() {
    const frameSliderContainer = document.getElementById('frameSliderContainer');
    if (frameSliderContainer) {
        frameSliderContainer.style.display = 'none';
    }

    const slider = document.getElementById('frameSlider');
    if (slider) {
        slider.value = 0;
    }
}

/**
 * Gets the current frame index from the slider
 * @returns {number} Current frame index
 */
export function getCurrentFrameIndex() {
    const slider = document.getElementById('frameSlider');
    return slider ? parseInt(slider.value || 0) : 0;
}

/**
 * Creates a frame data object
 * @param {Array} atomData - Array of atom data objects
 * @param {string} comment - Comment/label for the frame
 * @returns {Object} Frame data object
 */
export function createFrame(atomData, comment = '') {
    return {
        atomData,
        numAtoms: atomData.length,
        comment
    };
}

/**
 * Generates frames for a scan by rotating/translating atoms
 * @param {Object} params - Parameters
 * @param {Array} params.allAtoms - All atoms in molecule
 * @param {Array} params.atomsToMove - Indices of atoms to transform
 * @param {Object} params.offset - Molecule offset {x, y, z}
 * @param {number} params.stretch - Stretch factor (usually 4)
 * @param {Function} params.transformFunc - Function(atomPosition, step) that returns transformed position
 * @param {number} params.steps - Number of steps
 * @param {Function} params.commentFunc - Function(step) that returns comment string
 * @returns {Array} Array of frame data objects
 */
export function generateTransformFrames({
    allAtoms,
    atomsToMove,
    offset,
    stretch,
    transformFunc,
    steps,
    commentFunc
}) {
    const parsedFrames = [];
    const atomsToMoveSet = new Set(atomsToMove);

    for (let step = 0; step < steps; step++) {
        const atomData = [];

        allAtoms.forEach((atom, idx) => {
            let x, y, z;

            if (atomsToMoveSet.has(idx)) {
                const transformed = transformFunc(atom.position, step);
                x = (transformed.x + offset.x) / stretch;
                y = (transformed.y + offset.y) / stretch;
                z = (transformed.z + offset.z) / stretch;
            } else {
                x = (atom.position.x + offset.x) / stretch;
                y = (atom.position.y + offset.y) / stretch;
                z = (atom.position.z + offset.z) / stretch;
            }

            atomData.push({ element: atom.type, x, y, z });
        });

        parsedFrames.push(createFrame(atomData, commentFunc(step)));
    }

    return parsedFrames;
}

/**
 * Stores frames globally and sets up slider
 * @param {Array} frames - Array of frame data
 * @param {number} initialFrame - Initial frame to display
 */
export function loadFrames(frames, initialFrame = 0) {
    window.xyzFrames = frames;
    // Auto-sync: clear stale energy/MACE caches when frames change
    window.frameEnergies = [];
    window.lastMaceResults = null;
    setupFrameSlider(frames, initialFrame);
}
