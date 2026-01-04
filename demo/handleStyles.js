// const main = window.main;

let antialiasToggled = false;

export async function saveStylePreferences(userId) {
    if (!window.firebaseDB || !userId) {
        console.error('Firebase DB not initialized or no user ID');
        return false;
    }

    try {
        const stylePrefs = {
            roughness: parseFloat(document.getElementById('style1').value),
            metalness: parseFloat(document.getElementById('style2').value),
            opacity: parseFloat(document.getElementById('style3').value),
            bondThickness: parseFloat(document.getElementById('style4').value),
            atomSize: parseFloat(document.getElementById('style5').value),
            resolution: parseInt(document.getElementById('style6').value),
            antialias: document.getElementById('style7').checked,
            backgroundColor: document.getElementById('style8').value,
            toggleStyleChanges: document.getElementById('toggleStyleChanges').checked,
            labelsToggled: document.getElementById('toggleLabels').checked,
            toggleLabels: document.getElementById('toggleLabels').checked,
            sillyMode: document.getElementById('toggleSilly').checked,
            lastUpdated: new Date().toISOString()
        };


        console.log('Saving preferences:', stylePrefs);

        const { doc, setDoc } = await import('https://www.gstatic.com/firebasejs/12.0.0/firebase-firestore.js');
        await setDoc(doc(window.firebaseDB, 'userPreferences', userId), {
            stylePreferences: stylePrefs
        }, { merge: true });

        // Show success feedback
        showNotification('Style preferences saved as default!', 'success');
        return true;
    } catch (error) {
        console.error('Error saving style preferences:', error);
        showNotification('Failed to save preferences', 'error');
        return false;
    }
}

export async function loadStylePreferences(userId, renderer) {
    console.log('Loading style preferences for user:', userId);

    if (!window.firebaseDB || !userId) {
        console.error('Firebase DB not initialized or no user ID');
        return null;
    }

    try {
        const { doc, getDoc } = await import('https://www.gstatic.com/firebasejs/12.0.0/firebase-firestore.js');
        const docRef = doc(window.firebaseDB, 'userPreferences', userId);
        const docSnap = await getDoc(docRef);

        if (docSnap.exists()) {
            const data = docSnap.data();
            if (data.stylePreferences) {
                console.log('Loading preferences:', data.stylePreferences);

                // Apply styles with proper renderer reference
                applyStylePreferences(data.stylePreferences, renderer || window.renderer);

                showNotification('Custom styles loaded!', 'info');
                return data.stylePreferences;
            }
        }
        console.log('No saved preferences found for user');
        return null;
    } catch (error) {
        console.error('Error loading style preferences:', error);
        return null;
    }
}

export function applyStylePreferences(prefs, renderer) {
    // Store if we have an existing molecule and its data
    const hasMolecule = window.main && window.main.molecule && window.main.data && window.main.data.numAtoms > 0;
    const currentSelection = hasMolecule ? [...(window.atomsSelected || [])] : [];

    // Apply all style values
    if (prefs.roughness !== undefined) {
        document.getElementById('style1').value = prefs.roughness;
        main.roughness = prefs.roughness;
    }

    if (prefs.metalness !== undefined) {
        document.getElementById('style2').value = prefs.metalness;
        main.metalness = prefs.metalness;
    }

    if (prefs.opacity !== undefined) {
        document.getElementById('style3').value = prefs.opacity;
        main.opacity = prefs.opacity;
    }

    if (prefs.bondThickness !== undefined) {
        console.log('Bond thickness:', prefs.bondThickness);
        document.getElementById('style4').value = prefs.bondThickness;
        main.bondThickness = prefs.bondThickness;
    }

    if (prefs.atomSize !== undefined) {
        document.getElementById('style5').value = prefs.atomSize;
        main.atomSize = prefs.atomSize;
    }

    if (prefs.resolution !== undefined) {
        document.getElementById('style6').value = prefs.resolution;
        main.resolution = prefs.resolution;
    }

    if (prefs.labelsToggled !== undefined) {
        document.getElementById('toggleLabels').checked = prefs.labelsToggled;
        main.labelsToggled = prefs.labelsToggled;
        main.toggleLabels(main.labelsToggled);
    }

    // Apply antialias
    if (prefs.antialias !== undefined) {
        document.getElementById('style7').checked = prefs.antialias;
        antialiasToggled = prefs.antialias;

        // If antialias setting changed, recreate renderer
        if (renderer && renderer.antialias !== prefs.antialias) {
            window.recreateRenderer(prefs.antialias);
        }
    }

    if (prefs.sillyMode !== undefined) {
        console.log('Silly mode:', prefs.sillyMode);
        document.getElementById('toggleSilly').checked = prefs.sillyMode;
        window.sillyMode = prefs.sillyMode;
    }

    // Apply background color
    if (prefs.backgroundColor !== undefined) {
        document.getElementById('style8').value = prefs.backgroundColor;
        const color = prefs.backgroundColor;
        window.setSceneColor(color);
        document.body.style.backgroundColor = color;
    }

    // Apply toggle style changes - this needs special handling
    if (prefs.toggleStyleChanges !== undefined) {
        document.getElementById('toggleStyleChanges').checked = prefs.toggleStyleChanges;

        // If we have a molecule loaded, update it with the new style settings
        if (hasMolecule) {
            const currentMode = window.mode || 0;
            const targetMode = prefs.toggleStyleChanges ? 1 : 0;

            // Check if we need to change rendering mode
            if ((targetMode === 1 && currentMode === 0) || (targetMode === 0 && currentMode !== 0)) {
                // Update the mode
                if (prefs.toggleStyleChanges) {
                    window.mode = main.setNewMode(true);
                } else {
                    window.mode = main.setNewMode();
                }

                // Recreate the molecule with new mode
                main.newMolecule(main.data, window.mode, false,
                    { x: 0, y: 0, z: 0 },
                    { x: 0, y: 0, z: 0 },
                    true, true);

                // Restore selection after recreation
                if (currentSelection.length > 0) {
                    window.atomsSelected = currentSelection;
                    currentSelection.forEach(idx => {
                        if (window.selectAtom) {
                            window.selectAtom(idx, false);
                        }
                    });

                    // Update UI if atoms were selected
                    if (window.updateEditingContent && window.attachButtonEventListeners) {
                        const element = main.molecule.atoms[currentSelection[0]].type;
                        window.updateEditingContent(element, main.molecule.atomSettings[element].color);
                        window.attachButtonEventListeners();
                    }
                }
            } else if (targetMode !== 0) {
                // If we're already in the correct mode, just update material properties
                if (window.updateStyles) {
                    window.updateStyles();
                }
            }
        }
    }

    // Update labels if needed
    if (prefs.labelsToggled && hasMolecule && main.molecule) {
        main.molecule.toggleLabels(true);
    }

    // Ensure render is called to show changes
    if (window.render) {
        window.render();
    }
}



export function showNotification(message, type) {
    // Remove existing notification if any
    const existingNotif = document.getElementById('styleNotification');
    if (existingNotif) {
        existingNotif.remove();
    }

    const notification = document.createElement('div');
    notification.id = 'styleNotification';
    notification.textContent = message;
    notification.style.cssText = `
        position: absolute;
        top: 90px;
        left: 50%;
        transform: translate(-50%, -50%);
        padding: 15px 25px;
        border-radius: 16px;
        color: white;
        font-weight: 600;
        z-index: 10000;
        animation: slideIn 0.3s ease-out;
        box-shadow: 0 4px 10px rgba(0, 0, 0, 0.513), inset 2px 2px 3px rgba(255, 255, 255, 0.396), inset -8px -8px 16px rgba(255, 255, 255, 0.285);
        backdrop-filter: blur(10px);
        ${type === 'success' ? 'background: linear-gradient(135deg, #00c851 0%, #00ff00 100%);' : ''}
        ${type === 'error' ? 'background: linear-gradient(135deg, #ff4444 0%, #cc0000 100%);' : ''}
        ${type === 'info' ? 'background-color:rgba(0, 13, 43, 0);' : ''}
    `;

    document.body.appendChild(notification);

    // Auto remove after 3 seconds
    setTimeout(() => {
        notification.style.opacity = '0';
        setTimeout(() => notification.remove(), 300);
    }, 3000);
}

// Add this after other event listeners in main.js




export function resetToDefaults() {
    // Store if we have an existing molecule
    const hasMolecule = window.main && window.main.molecule && window.main.data && window.main.data.numAtoms > 0;
    const currentSelection = hasMolecule ? [...(window.atomsSelected || [])] : [];

    // Reset sliders to default values
    document.getElementById('style1').value = 0.46; // Roughness
    document.getElementById('style2').value = 0.37;  // Metalness
    document.getElementById('style3').value = 1;    // Opacity
    document.getElementById('style4').value = 1;    // Bonds
    document.getElementById('style5').value = 0.83;    // Atom Size
    document.getElementById('style6').value = 17;   // Resolution
    document.getElementById('style7').checked = true; // Antialias
    document.getElementById('style8').value = '#01101f'; // Background (dark blue)
    document.getElementById('toggleSilly').checked = false; // Silly
    document.getElementById('toggleStyleChanges').checked = false;
    document.getElementById('toggleLabels').checked = false;

    // Reset main object values
    main.roughness = 0.17;
    main.metalness = 0.3;
    main.opacity = 1;
    main.atomSize = 1;
    main.resolution = 16;
    main.labelsToggled = false;

    // Reset background
    window.scene.background = new THREE.Color('#01101f');
    document.body.style.backgroundColor = '#01101f';

    // Reset other states
    antialiasToggled = false;
    window.labelMode = false;

    // If we have a molecule and need to switch back to basic mode
    if (hasMolecule && window.mode !== 0) {
        window.mode = main.setNewMode(); // Set to basic mode (0)

        // Recreate the molecule with basic mode
        main.newMolecule(main.data, window.mode, false,
            { x: 0, y: 0, z: 0 },
            { x: 0, y: 0, z: 0 },
            true, true);

        // Restore selection
        if (currentSelection.length > 0) {
            window.atomsSelected = currentSelection;
            currentSelection.forEach(idx => {
                if (window.selectAtom) {
                    window.selectAtom(idx, false);
                }
            });

            if (window.updateEditingContent && window.attachButtonEventListeners) {
                const element = main.molecule.atoms[currentSelection[0]].type;
                window.updateEditingContent(element, main.molecule.atomSettings[element].color);
                window.attachButtonEventListeners();
            }
        }
    }

    // Clear any labels
    if (hasMolecule && main.molecule && main.molecule.labels) {
        main.molecule.clearLabels();
    }

    window.render();
    showNotification('Styles reset to defaults', 'info');
}

window.loadStylePreferences = loadStylePreferences;
window.resetToDefaults = resetToDefaults;

