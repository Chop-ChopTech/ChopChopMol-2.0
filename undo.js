const undoManager = new UndoManager();
undoManager.setLimit(30); // Keep last 30 actions

// Helper to get current state
function getMoleculeState() {
    // Make sure main exists and has data
    if (!window.main || !window.main.data) {
        return null;
    }

    // Only save the essential data
    return {
        moleculeData: JSON.parse(JSON.stringify(window.main.data)),
        selectedAtoms: [...(window.atomsSelected || [])]
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
            window.main.data.atomData.length <= 700 ? 1 : 0,
            false,
            { x: 0, y: 0, z: 0 },
            { x: 0, y: 0, z: 0 },
            false
        );

        // Restore atom selection
        window.atomsSelected = [...state.selectedAtoms];

        // Re-select atoms visually if there's a selection
        if (window.atomsSelected.length > 0 && typeof window.selectAtom === 'function') {
            window.atomsSelected.forEach(idx => {
                if (idx < window.main.molecule.atoms.length) {
                    window.selectAtom(idx, false);
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

// Main function to save an action
window.saveUndoState = function (actionName = "Action") {
    // Don't save during undo/redo
    if (window._isUndoing) return;

    const previousState = getMoleculeState();
    if (!previousState) return;

    // Wait for action to complete
    setTimeout(() => {
        const currentState = getMoleculeState();
        if (!currentState) return;

        // Add to undo manager
        undoManager.add({
            undo: function () {
                window._isUndoing = true;
                restoreMoleculeState(previousState);
                window._isUndoing = false;
                updateUndoButtons();
            },
            redo: function () {
                window._isUndoing = true;
                restoreMoleculeState(currentState);
                window._isUndoing = false;
                updateUndoButtons();
            }
        });

        console.log(`Saved: ${actionName}`);
        updateUndoButtons();
    }, 50);
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

// Simple notification
function showNotification(text) {
    const notification = document.createElement('div');
    notification.textContent = text;
    notification.style.cssText = `
        position: fixed;
        top: 20px;
        left: 50%;
        transform: translateX(-50%);
        background: rgba(0, 0, 0, 0.8);
        color: white;
        padding: 8px 16px;
        border-radius: 4px;
        z-index: 10000;
        font-family: 'Rubik', sans-serif;
    `;
    document.body.appendChild(notification);

    setTimeout(() => notification.remove(), 1500);
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
    updateUndoButtons();
};