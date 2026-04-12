const undoManager = new UndoManager();
window.undoManager = undoManager;

undoManager.setLimit(30); // Keep last 30 actions

// Track the last stable state so we always have a reliable "before" snapshot.
// When saveUndoState() is called AFTER a mutation, _lastStableState holds the
// pre-mutation state and the current getMoleculeState() holds the post-mutation state.
let _lastStableState = null;

// Helper to get current state
function getMoleculeState() {
    // Make sure main exists and has data
    if (!window.main || !window.main.data) {
        return null;
    }

    // Save bond/angle labels state
    let labelsState = [];
    if (window.labels && window.labels.length > 0) {
        labelsState = window.labels.map(label => ({
            atom1Index: label[0],
            atom2Index: label[1],
            atom3Index: label[2] || null,
            atom4Index: label[3] || null,
            isAngle: label.isAngle || false
        }));
    }

    // Only save the essential data
    return {
        moleculeData: JSON.parse(JSON.stringify(window.main.data)),
        selectedAtoms: [...(window.atomsSelected || [])],
        labels: labelsState
    };
}

// Helper to restore state
function restoreMoleculeState(state) {
    if (!state || !window.main) return;

    try {
        // Restore the molecule
        window.main.data = JSON.parse(JSON.stringify(state.moleculeData));

        // Recreate the molecule visualization
        window.main.newMolecule(
            window.main.data,
            window.main.data.atomData.length <= 2000 ? 1 : 0,
            false,    // center — don't re-center camera
            false,    // soft — full reset (clear axis/fragments/labels)
            false,    // useRibbonMode — normal atom rendering
            false     // animate — instant restore, no silly-mode animation
        );

        // Restore atom selection - filter out invalid indices
        window.atomsSelected = state.selectedAtoms.filter(idx =>
            idx >= 0 && idx < window.main.molecule.atoms.length
        );

        // Re-select atoms visually if there's a selection
        if (window.atomsSelected.length > 0 && typeof window.selectAtom === 'function') {
            window.atomsSelected.forEach(idx => {
                window.selectAtom(idx, false);
            });
        }

        // Restore bond/angle labels
        if (state.labels && state.labels.length > 0) {
            // Clear existing labels first
            if (typeof window.clearAllBondLengthLabels === 'function') {
                window.clearAllBondLengthLabels();
            }

            // Recreate each label
            state.labels.forEach(labelData => {
                if (typeof window.createInfoLabel === 'function') {
                    if (labelData.isAngle) {
                        window.createInfoLabel(labelData.atom1Index, labelData.atom2Index, labelData.atom3Index || null, labelData.atom4Index || null);
                    }
                }
            });
        }

        // Call render if it exists
        if (typeof window.render === 'function') {
            window.render();
        }
        if (window.main.molecule && window.main.molecule.labels && window.main.molecule.labels.length > 0) {
            window.main.molecule.updateLabels();
            window.render()
        }
    } catch (error) {
        console.error('Error restoring state:', error);
    }
}

// Initialize the undo baseline — call after molecule loads so the first
// mutation has a valid "before" state to undo to.
window.initUndoState = function () {
    _lastStableState = getMoleculeState();
};

// Main function to save an undo entry.
// Call AFTER the mutation completes. The function uses the previously
// saved _lastStableState as "before" and the current state as "after".
// No setTimeout — captures state synchronously and reliably.
window.saveUndoState = function (actionName = "Action") {
    // Don't save during undo/redo
    if (window._isUndoing) return;

    const currentState = getMoleculeState();
    if (!currentState) return;

    // First call or after molecule load — just establish baseline
    if (!_lastStableState) {
        _lastStableState = currentState;
        updateUndoButtons();
        return;
    }

    const before = _lastStableState;
    const after = currentState;

    // Add to undo manager
    undoManager.add({
        undo: function () {
            window._isUndoing = true;
            restoreMoleculeState(before);
            _lastStableState = before;
            window._isUndoing = false;
            updateUndoButtons();
        },
        redo: function () {
            window._isUndoing = true;
            restoreMoleculeState(after);
            _lastStableState = after;
            window._isUndoing = false;
            updateUndoButtons();
        }
    });

    _lastStableState = after;
    console.log(`Undo saved: ${actionName}`);
    updateUndoButtons();
};

// Keyboard shortcuts
document.addEventListener('keydown', function (e) {
    // Skip if typing in input
    if (e.target.tagName === 'INPUT' || e.target.tagName === 'TEXTAREA') return;

    // Undo: Cmd/Ctrl + Z
    if ((e.metaKey || e.ctrlKey) && e.key === 'z' && !e.shiftKey) {
        e.preventDefault();
        if (undoManager.hasUndo()) {
            undoManager.undo();
            showNotification('Undo');
        }
    }

    // Redo: Cmd/Ctrl + Shift + Z
    if ((e.metaKey || e.ctrlKey) && e.key === 'z' && e.shiftKey) {
        e.preventDefault();
        if (undoManager.hasRedo()) {
            undoManager.redo();
            showNotification('Redo');
        }
    }
});


// Consolidated: delegates to unified toast system
function showNotification(text) {
    window.toastInfo?.(text, 1500);
}
// Create UI buttons
function createUndoButtons() {
    if (document.getElementById('undoContainer')) return;

    const container = document.createElement('div');
    container.id = 'undoContainer';
    container.style.cssText = `
        position: fixed;
        top: 70px;
        right: 20px;
        z-index: 1000;
        display: flex;
        gap: 10px;
    `;

    // Undo button
    const undoBtn = document.createElement('button');
    undoBtn.id = 'undoBtn';
    undoBtn.innerHTML = '↶';
    undoBtn.title = 'Undo (Cmd/Ctrl + Z)';
    undoBtn.style.cssText = `
        width: 36px;
        height: 36px;
        border-radius: 50%;
        background: linear-gradient(135deg, #667eea, #764ba2);
        color: white;
        border: none;
        cursor: pointer;
        font-size: 18px;
        transition: all 0.3s;
    `;
    undoBtn.onclick = () => {
        if (undoManager.hasUndo()) {
            undoManager.undo();
            showNotification('Undo');
        }
    };

    // Redo button
    const redoBtn = document.createElement('button');
    redoBtn.id = 'redoBtn';
    redoBtn.innerHTML = '↷';
    redoBtn.title = 'Redo (Cmd/Ctrl + Shift + Z)';
    redoBtn.style.cssText = `
        width: 36px;
        height: 36px;
        border-radius: 50%;
        background: linear-gradient(135deg, #667eea, #764ba2);
        color: white;
        border: none;
        cursor: pointer;
        font-size: 18px;
        transition: all 0.3s;
    `;
    redoBtn.onclick = () => {
        if (undoManager.hasRedo()) {
            undoManager.redo();
            showNotification('Redo');
        }
    };

    container.appendChild(undoBtn);
    container.appendChild(redoBtn);
    document.body.appendChild(container);

    // Add hover effects
    const style = document.createElement('style');
    style.textContent = `
        #undoBtn:hover, #redoBtn:hover {
            transform: scale(1.1);
            box-shadow: 0 4px 12px rgba(0,0,0,0.3);
        }
        #undoBtn:disabled, #redoBtn:disabled {
            opacity: 0.4;
            cursor: not-allowed;
        }
    `;
    document.head.appendChild(style);
}

// Update button states
function updateUndoButtons() {
    const undoBtn = document.getElementById('undoBtn');
    const redoBtn = document.getElementById('redoBtn');

    if (undoBtn) {
        undoBtn.disabled = !undoManager.hasUndo();
    }
    if (redoBtn) {
        redoBtn.disabled = !undoManager.hasRedo();
    }
}



// Initialize when ready
document.addEventListener('DOMContentLoaded', function () {
    setTimeout(() => {
        // createUndoButtons();
        console.log('Undo system ready');
    }, 1000);
});

// Clear history helper
window.clearUndoHistory = function () {
    undoManager.clear();
    _lastStableState = null;
    updateUndoButtons();
};
