import * as THREE from 'three';
import { reattachButtonHandler, togglePanel } from './utils/domUtils.js';

export let isUserSignedIn = false;
export let originalEventHandlers = {};

const mouse = new THREE.Vector2()
const raycaster = new THREE.Raycaster();
const camera = window.camera

// Listen for auth state changes from Firebase (sent from HTML)


// Function to update feature access based on authentication
export function updateFeatureAccess(user, signedIn, isPremium) {
    isUserSignedIn = true;
    // restrictFeatures();

    if (isUserSignedIn) {
        if (isPremium) {
            enableAllFeatures();
        } else {
            enableFreeFeatures();
        }
        hideRestrictionMessage();
    } else {
        showRestrictionMessage();

    }
}

// Function to restrict features for non-signed-in users
export function restrictFeatures() {
    console.log('Restricting features for non-signed-in user');

    // Store original event handlers before removing them
    storeOriginalHandlers();

    // Disable editing functionality
    // disableAtomInteraction(window.renderer);

    // Disable specific buttons with visual feedback
    const restrictedButtons = [
        'aiGenerate',
        'import-smiles',
        'import-json',
        'compareButton',
        'analyze-molecule',
        'clear-canvas',
    ];

    restrictedButtons.forEach(buttonId => {
        const button = document.getElementById(buttonId);
        if (button) {
            // Visual changes
            button.style.opacity = '0.5';
            button.style.cursor = 'not-allowed';
            button.title = 'Sign in to use this feature';
            button.classList.add('feature-tooltip');

            // Remove existing event listeners by cloning
            const newButton = button.cloneNode(true);
            button.parentNode.replaceChild(newButton, button);

            // Add restricted click handler - DON'T disable the button
            newButton.addEventListener('click', (e) => {
                e.preventDefault();
                e.stopPropagation();
                console.log('Restricted button clicked:', buttonId);
                showSignInPrompt();
            });
        }
    });

    // Hide editing panel
    const editPanel = document.getElementById('editMoleculePanel');
    if (editPanel) {
        editPanel.classList.add('restricted');
    }

    // Disable style controls
    const styleSelector = document.getElementById('styleSelector');
    if (styleSelector) {
        styleSelector.classList.add('restricted');
    }

    // Hide input panels
    const panels = ['chatContainer', 'smilesContainer', 'jsonContainer'];
    panels.forEach(panelId => {
        const panel = document.getElementById(panelId);
        if (panel) {
            panel.classList.remove('on');
            panel.classList.add('restricted');
        }
    });
}

// Function to store original event handlers
export function storeOriginalHandlers(renderer) {
    // Store original pointer down handler
    if (renderer && renderer.domElement && renderer.domElement.onpointerdown) {
        originalEventHandlers.pointerdown = renderer.domElement.onpointerdown;
    }

    // Store other important handlers as needed
    originalEventHandlers.keydownHandlers = [];
}

// Function to disable atom interaction
export function disableAtomInteraction(renderer) {
    // Override pointer events for atom selection
    if (renderer && renderer.domElement) {
        originalEventHandlers.pointerdown = renderer.domElement.onpointerdown;

        renderer.domElement.onpointerdown = function (event) {
            // Only show prompt if user actually clicked on an atom, not empty space
            if (!isUserSignedIn) {
                // Check if click hit an atom by using raycaster
                mouse.x = (event.clientX / window.innerWidth) * 2 - 1;
                mouse.y = -(event.clientY / window.innerHeight) * 2 + 1;

                raycaster.setFromCamera(mouse, window.camera);

                // Only show prompt if we actually hit something interactive
                if (window.main && window.main.molecule && window.main.molecule.instancedMesh) {
                    const intersects = raycaster.intersectObject(window.main.molecule.instancedMesh);
                    if (intersects.length > 0) {
                        // User clicked on an atom, show the sign-in prompt
                        console.log('User clicked on an atom');
                        showSignInPrompt();
                    }
                    // If no intersects, just allow normal camera controls (no prompt)
                }
                return;
            }

            // Call original if signed in
            if (originalEventHandlers.pointerdown) {
                originalEventHandlers.pointerdown.call(this, event);
            }
        };
    }

    // Override keyboard events for editing
    const restrictedKeyHandler = function (event) {
        // Skip if typing in input fields
        if (event.target.tagName === 'INPUT' || event.target.tagName === 'TEXTAREA' || event.target.isContentEditable) {
            return;
        }

        if (!isUserSignedIn) {
            // Block editing keys silently - no prompts
            if (event.key === 'Shift' || event.key === 'Meta' || event.key === 'Control' ||
                event.key === 'j' || (event.key === 'l' && event.type === 'keydown')) {
                event.preventDefault();
                event.stopPropagation();
                return false;
            }
        }
    };

    document.addEventListener('keydown', restrictedKeyHandler, true);
    document.addEventListener('keyup', restrictedKeyHandler, true);
    originalEventHandlers.restrictedKeyHandler = restrictedKeyHandler;

    // Clear any existing atom selections
    if (typeof atomsSelected !== 'undefined') {
        atomsSelected = [];
    }

    // Disable editing mode
    if (typeof editingMolecule !== 'undefined') {
        editingMolecule = false;
    }
}

// Function to enable all features for signed-in users
export function enableAllFeatures() {
    console.log('Enabling all features for signed-in user');

    // Remove restrictions from buttons
    const allButtons = document.querySelectorAll('.fancy-button');
    allButtons.forEach(button => {
        button.disabled = false;
        button.style.opacity = '1';
        button.style.cursor = 'pointer';
        button.title = '';
        button.classList.remove('feature-tooltip');
    });

    // Show editing panel
    const editPanel = document.getElementById('editMoleculePanel');
    if (editPanel) {
        editPanel.classList.remove('restricted');
        editPanel.style.display = 'block';
    }

    // Enable style controls
    const styleSelector = document.getElementById('styleSelector');
    if (styleSelector) {
        styleSelector.classList.remove('restricted');
    }

    // Enable input panels
    const panels = ['chatContainer', 'smilesContainer', 'jsonContainer'];
    panels.forEach(panelId => {
        const panel = document.getElementById(panelId);
        if (panel) {
            panel.classList.remove('restricted');
        }
    });

    // Restore atom interaction
    enableAtomInteraction();

    // Re-attach original event listeners
    restoreOriginalHandlers();
}

export function enableFreeFeatures() {
    storeOriginalHandlers();

    // Disable specific buttons with visual feedback
    const enabledButtons = [

    ];

    enabledButtons.forEach(buttonId => {
        const button = document.getElementById(buttonId);
        if (button) {
            button.disabled = false;
            button.style.opacity = '1';
            button.style.cursor = 'pointer';
            button.title = '';
            button.classList.remove('feature-tooltip');
        }
    });

    // Hide editing panel
    const editPanel = document.getElementById('editMoleculePanel');
    if (editPanel) {
        editPanel.classList.add('restricted');
    }

    // Disable style controls
    const styleSelector = document.getElementById('styleSelector');
    if (styleSelector) {
        styleSelector.classList.add('restricted');
    }

    // Hide input panels
    const panels = ['chatContainer', 'smilesContainer', 'jsonContainer'];
    panels.forEach(panelId => {
        const panel = document.getElementById(panelId);
        if (panel) {
            panel.classList.remove('on');
            panel.classList.add('restricted');
        }
    });

}

// Function to restore atom interaction
export function enableAtomInteraction(renderer) {
    // Restore original pointer events
    if (renderer && renderer.domElement && originalEventHandlers.pointerdown) {
        renderer.domElement.onpointerdown = originalEventHandlers.pointerdown;
    }

    // Remove restricted key handlers
    if (originalEventHandlers.restrictedKeyHandler) {
        document.removeEventListener('keydown', originalEventHandlers.restrictedKeyHandler, true);
        document.removeEventListener('keyup', originalEventHandlers.restrictedKeyHandler, true);
    }

    // Re-enable editing mode
    if (typeof editingMolecule !== 'undefined') {
        editingMolecule = true;
    }
}

// Function to restore original event handlers
export function restoreOriginalHandlers() {
    // Re-attach AI Generate button
    reattachButtonHandler('aiGenerate', () => {
        togglePanel('chatContainer', ['smilesContainer', 'jsonContainer']);
    });

    // Re-attach SMILES button
    reattachButtonHandler('import-smiles', () => {
        togglePanel('smilesContainer', ['chatContainer', 'jsonContainer']);
    });

    // Re-attach JSON button
    reattachButtonHandler('import-json', () => {
        togglePanel('jsonContainer', ['smilesContainer', 'chatContainer']);
    });

    // Re-attach analyze molecule button
    reattachButtonHandler('analyze-molecule', () => {
        const images = [];
        const numImages = 3;
        for (let i = 0; i < numImages; i++) {
            if (typeof getScreenUrl === 'function') {
                const imgData = getScreenUrl();
                images.push(imgData);
            }
            if (typeof rotateCamera === 'function' && typeof window.camera !== 'undefined' && typeof controls !== 'undefined') {
                rotateCamera(Math.PI / (numImages / 2), window.camera, controls);
            }
        }
        if (typeof window.main !== 'undefined' && window.main.data) {
            window.imgToAnalyze = { images: JSON.stringify(images), coordinates: window.main.data };
        }
    });

    // Re-attach clear canvas button
    reattachButtonHandler('clear-canvas', () => {
        if (typeof window.main !== 'undefined' && typeof window.main.reset === 'function') {
            window.main.reset();
        }
    });

    // Re-attach switch mode button
    reattachButtonHandler('switchMode', () => {
        togglePanel('styleSelector');
    });
}

// Function to show sign-in prompt
export function showSignInPrompt() {
    const message = '';

    // Create a nicer modal instead of alert
    let modal = document.getElementById('signInModal');
    if (!modal) {
        modal = document.createElement('div');
        modal.id = 'signInModal';
        modal.style.cssText = `
            position: fixed;
            top: 0;
            left: 0;
            width: 100%;
            height: 100%;
            background: rgba(0, 0, 0, 0.7);
            display: flex;
            justify-content: center;
            align-items: center;
            z-index: 20000;
            backdrop-filter: blur(5px);
        `;

        const modalContent = document.createElement('div');
        modalContent.style.cssText = `
            background: white;
            padding: 30px;
            border-radius: 15px;
            text-align: center;
            max-width: 400px;
            box-shadow: 0 20px 40px rgba(0,0,0,0.3);
        `;

        modalContent.innerHTML = `
            <h3 style="color: #333; margin-bottom: 15px;"><span style="font-size: 35px;">🔒</span><br> Sign in with Google to unlock this feature!</h3>
            <p style="color: #666; margin-bottom: 25px;">${message}</p>
            <button id="modalSignIn" style="
                background: linear-gradient(135deg,rgb(102, 130, 255) 0%,rgb(124, 39, 208) 100%);

                color: white;
                border: none;
                padding: 12px 24px;
                border-radius: 8px;
                cursor: pointer;
                margin-right: 10px;
                font-weight: 600;
            ">Sign In with Google</button>
            <button id="modalCancel" class="shake-button" style="
                background: #f0f0f0;
                color:rgb(255, 141, 141);
                border: none;
                padding: 12px 24px;
                border-radius: 8px;
                cursor: pointer;
                font-weight: 600;
            ">Maybe Later</button>
        `;


        modal.appendChild(modalContent);
        document.body.appendChild(modal);

        // Handle modal buttons
        document.getElementById('modalSignIn').addEventListener('click', () => {
            const signInButton = document.getElementById('signInButton');
            if (signInButton) {
                signInButton.click();
            }
            modal.remove();
        });

        document.getElementById('modalCancel').addEventListener('click', () => {
            modal.remove();
        });

        // Close on background click
        modal.addEventListener('click', (e) => {
            if (e.target === modal) {
                modal.remove();
            }
        });
    }
}

// Function to show restriction message
export function showRestrictionMessage() {
    let restrictionMessage = document.getElementById('restrictionMessage');
    if (!restrictionMessage) {
        restrictionMessage = document.createElement('div');
        restrictionMessage.id = 'restrictionMessage';
        restrictionMessage.style.cssText = `
            position: fixed;
            top: 20px;
            left: 50%;
            transform: translateX(-50%);
            background: linear-gradient(135deg, #667eea 0%, #764ba2 100%);
            color: white;
            padding: 12px 20px;
            border-radius: 10px;
            z-index: 10000;
            font-family: 'Rubik', sans-serif;
            font-size: 14px;
            box-shadow: 0 4px 15px rgba(0,0,0,0.2);
            text-align: center;
            animation: slideInFromTop 0.5s ease-out;
            display: flex;
            align-items: center;
            gap: 15px;
        `;
        document.body.appendChild(restrictionMessage);
    }

    restrictionMessage.innerHTML = `
        <div style="display: flex; align-items: center; gap: 8px;">
            <i class="fas fa-eye"></i>
            <span><strong>View Mode:</strong> Sign in to unlock editing, AI generation, and analysis features</span>
        </div>
        <button id="dismissBanner" class="dismiss" title="Dismiss">×</button>
    `;
    restrictionMessage.style.display = 'flex';

    // Add dismiss functionality
    const dismissButton = document.getElementById('dismissBanner');
    if (dismissButton) {
        dismissButton.addEventListener('click', () => {
            restrictionMessage.style.animation = 'slideOutToTop 0.3s ease-in forwards';
            setTimeout(() => {
                if (restrictionMessage.parentNode) {
                    restrictionMessage.remove();
                }
            }, 300);
        });

        // Hover effect for dismiss button
        dismissButton.addEventListener('mouseenter', () => {
            dismissButton.style.background = 'rgba(255, 255, 255, 0.3)';
        });

        dismissButton.addEventListener('mouseleave', () => {
            dismissButton.style.background = 'rgba(255, 255, 255, 0.2)';
        });
    }

    // Auto-dismiss after 8 seconds
    setTimeout(() => {
        if (restrictionMessage && restrictionMessage.parentNode && !isUserSignedIn) {
            restrictionMessage.style.animation = 'slideOutToTop 0.3s ease-in forwards';
            setTimeout(() => {
                if (restrictionMessage.parentNode) {
                    restrictionMessage.remove();
                }
            }, 300);
        }
    }, 8000);

    // Enhance sign-in button
    const signInButton = document.getElementById('signInButton');
    if (signInButton) {
        signInButton.classList.add('featured');
    }
}

// Function to hide restriction message
export function hideRestrictionMessage() {
    const restrictionMessage = document.getElementById('restrictionMessage');
    if (restrictionMessage) {
        restrictionMessage.style.display = 'none';
    }

    // Remove enhancement from sign-in button
    const signInButton = document.getElementById('signInButton');
    if (signInButton) {
        signInButton.classList.remove('featured');
    }
}



