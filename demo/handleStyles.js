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
            transmission: parseFloat(document.getElementById('styleTransmission')?.value) || 0,
            ior: parseFloat(document.getElementById('styleIOR')?.value) || 1.5,
            thickness: parseFloat(document.getElementById('styleThickness')?.value) || 0.5,
            clearcoat: parseFloat(document.getElementById('styleClearcoat')?.value) || 0,
            sheen: parseFloat(document.getElementById('styleSheen')?.value) || 0,
            iridescence: parseFloat(document.getElementById('styleIridescence')?.value) || 0,
            antialias: document.getElementById('style7').checked,
            backgroundColor: document.getElementById('style8').value,
            toggleStyleChanges: document.getElementById('toggleStyleChanges').checked,
            sillyMode: document.getElementById('toggleSilly').checked,
            showElements: document.getElementById('showElements').checked,
            showIndices: document.getElementById('showIndices').checked,
            transitionsEnabled: document.getElementById('toggleTransitions')?.checked || false,
            transitionDuration: parseInt(document.getElementById('transitionDuration')?.value) || 300,
            envMapEnabled: document.getElementById('toggleEnvMap')?.checked || false,
            envMapPreset: document.getElementById('envMapPreset')?.value || 'studio_small_09',
            envMapResolution: document.getElementById('envMapResolution')?.value || '1k',
            envMapIntensity: parseFloat(document.getElementById('envMapIntensity')?.value) || 1,
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

    // Apply physical material properties
    if (prefs.transmission !== undefined) {
        const el = document.getElementById('styleTransmission');
        if (el) el.value = prefs.transmission;
        main.transmission = prefs.transmission;
    }
    if (prefs.ior !== undefined) {
        const el = document.getElementById('styleIOR');
        if (el) el.value = prefs.ior;
        main.ior = prefs.ior;
    }
    if (prefs.thickness !== undefined) {
        const el = document.getElementById('styleThickness');
        if (el) el.value = prefs.thickness;
        main.thickness = prefs.thickness;
    }
    if (prefs.clearcoat !== undefined) {
        const el = document.getElementById('styleClearcoat');
        if (el) el.value = prefs.clearcoat;
        main.clearcoat = prefs.clearcoat;
    }
    if (prefs.sheen !== undefined) {
        const el = document.getElementById('styleSheen');
        if (el) el.value = prefs.sheen;
        main.sheen = prefs.sheen;
    }
    if (prefs.iridescence !== undefined) {
        const el = document.getElementById('styleIridescence');
        if (el) el.value = prefs.iridescence;
        main.iridescence = prefs.iridescence;
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

    if (prefs.showElements !== undefined) {
        document.getElementById('showElements').checked = prefs.showElements;
        window.showElements = prefs.showElements;
    }

    if (prefs.showIndices !== undefined) {
        document.getElementById('showIndices').checked = prefs.showIndices;
        window.showIndices = prefs.showIndices;
    }

    // Apply transition settings
    if (prefs.transitionsEnabled !== undefined) {
        const toggleTransitions = document.getElementById('toggleTransitions');
        if (toggleTransitions) {
            toggleTransitions.checked = prefs.transitionsEnabled;
        }
        if (window.transitionSettings) {
            window.transitionSettings.enabled = prefs.transitionsEnabled;
        }
        const transitionDurationRow = document.getElementById('transitionDurationRow');
        if (transitionDurationRow) {
            transitionDurationRow.style.opacity = prefs.transitionsEnabled ? '1' : '0.5';
        }
    }

    if (prefs.transitionDuration !== undefined) {
        const transitionDuration = document.getElementById('transitionDuration');
        const transitionDurationValue = document.getElementById('transitionDurationValue');
        if (transitionDuration) {
            transitionDuration.value = prefs.transitionDuration;
        }
        if (transitionDurationValue) {
            transitionDurationValue.textContent = prefs.transitionDuration + 'ms';
        }
        if (window.transitionSettings) {
            window.transitionSettings.duration = prefs.transitionDuration;
        }
    }

    // Apply environment map settings
    if (prefs.envMapPreset !== undefined) {
        const envMapPreset = document.getElementById('envMapPreset');
        if (envMapPreset) envMapPreset.value = prefs.envMapPreset;
        window.envMapPreset = prefs.envMapPreset;
    }
    if (prefs.envMapResolution !== undefined) {
        const envMapResolution = document.getElementById('envMapResolution');
        if (envMapResolution) envMapResolution.value = prefs.envMapResolution;
        window.envMapResolution = prefs.envMapResolution;
    }
    if (prefs.envMapIntensity !== undefined) {
        const envMapIntensity = document.getElementById('envMapIntensity');
        if (envMapIntensity) envMapIntensity.value = prefs.envMapIntensity;
        window.envMapIntensity = prefs.envMapIntensity;
    }
    if (prefs.envMapEnabled !== undefined) {
        const toggleEnvMap = document.getElementById('toggleEnvMap');
        if (toggleEnvMap) toggleEnvMap.checked = prefs.envMapEnabled;
        const envMapPresetRow = document.getElementById('envMapPresetRow');
        const envMapIntensityRow = document.getElementById('envMapIntensityRow');
        const envMapResolutionRow = document.getElementById('envMapResolutionRow');
        if (envMapPresetRow) envMapPresetRow.style.opacity = prefs.envMapEnabled ? '1' : '0.5';
        if (envMapIntensityRow) envMapIntensityRow.style.opacity = prefs.envMapEnabled ? '1' : '0.5';
        if (envMapResolutionRow) envMapResolutionRow.style.opacity = prefs.envMapEnabled ? '1' : '0.5';
        if (window.applyEnvMap) {
            window.applyEnvMap(prefs.envMapEnabled, prefs.envMapPreset || 'studio_small_09');
        }
    }

    // Actually update labels display
    const shouldShowLabels = window.showElements || window.showIndices;
    window.labelMode = shouldShowLabels;
    if (hasMolecule && window.main.molecule) {
        window.main.molecule.toggleLabels(shouldShowLabels, window.showElements, window.showIndices);
        if (window.render) window.render();
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
                // If we're already in the correct mode, try to update material properties in-place
                const updated = main.molecule.updateMaterialProperties(window.mode);
                if (updated) {
                    // Material updated in-place, update bonds too
                    main.molecule.updateBonds(window.mode);
                } else if (window.updateStyles) {
                    // Fallback to full update if needed
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
    // Consolidated: delegates to unified toast system
    const toastFn = type === 'success' ? window.toastSuccess
        : type === 'error' ? window.toastError
        : window.toastInfo;
    toastFn?.(message);
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
    document.getElementById('showElements').checked = true;
    document.getElementById('showIndices').checked = false;
    window.showElements = true;
    window.showIndices = false;
    window.labelMode = false;

    // Reset env map
    const toggleEnvMap = document.getElementById('toggleEnvMap');
    if (toggleEnvMap) toggleEnvMap.checked = false;
    const envMapPreset = document.getElementById('envMapPreset');
    if (envMapPreset) envMapPreset.value = 'studio_small_09';
    const envMapResolution = document.getElementById('envMapResolution');
    if (envMapResolution) envMapResolution.value = '1k';
    const envMapIntensity = document.getElementById('envMapIntensity');
    if (envMapIntensity) envMapIntensity.value = 1;
    const envMapPresetRow = document.getElementById('envMapPresetRow');
    if (envMapPresetRow) envMapPresetRow.style.opacity = '0.5';
    const envMapIntensityRow = document.getElementById('envMapIntensityRow');
    if (envMapIntensityRow) envMapIntensityRow.style.opacity = '0.5';
    const envMapResolutionRow = document.getElementById('envMapResolutionRow');
    if (envMapResolutionRow) envMapResolutionRow.style.opacity = '0.5';
    window.envMapEnabled = false;
    window.envMapPreset = 'studio_small_09';
    window.envMapResolution = '1k';
    window.envMapIntensity = 1;
    if (window.applyEnvMap) window.applyEnvMap(false);

    // Reset physical material sliders
    const resetSliders = {
        styleTransmission: 0, styleIOR: 1.5, styleThickness: 0.5,
        styleClearcoat: 0, styleSheen: 0, styleIridescence: 0,
    };
    for (const [id, val] of Object.entries(resetSliders)) {
        const el = document.getElementById(id);
        if (el) el.value = val;
    }

    // Reset main object values
    main.roughness = 0.17;
    main.metalness = 0.3;
    main.opacity = 1;
    main.atomSize = 1;
    main.resolution = 16;
    main.labelsToggled = false;
    main.transmission = 0;
    main.ior = 1.5;
    main.thickness = 0.5;
    main.clearcoat = 0;
    main.sheen = 0;
    main.iridescence = 0;

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

