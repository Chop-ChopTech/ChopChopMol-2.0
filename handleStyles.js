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
            bonds: parseFloat(document.getElementById('style4').value) || 1, // Default if no value
            atomSize: parseFloat(document.getElementById('style5').value),
            resolution: parseInt(document.getElementById('style6').value),
            antialias: document.getElementById('style7').checked,
            backgroundColor: document.getElementById('style8').value,
            toggleStyleChanges: document.getElementById('toggleStyleChanges').checked,
            labelsToggled: document.getElementById('toggleLabels').checked,
            toggleLabels: document.getElementById('toggleLabels').checked,
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
    console.log(renderer)
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
                applyStylePreferences(data.stylePreferences, renderer);
                showNotification('Default styles loaded!', 'info');
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
    // Apply roughness
    if (prefs.roughness !== undefined) {
        document.getElementById('style1').value = prefs.roughness;
        main.roughness = prefs.roughness;
    }

    // Apply metalness
    if (prefs.metalness !== undefined) {
        document.getElementById('style2').value = prefs.metalness;
        main.metalness = prefs.metalness;
    }

    // Apply opacity
    if (prefs.opacity !== undefined) {
        document.getElementById('style3').value = prefs.opacity;
        main.opacity = prefs.opacity;
    }

    // Apply bonds
    if (prefs.bonds !== undefined) {
        document.getElementById('style4').value = prefs.bonds;
        // Note: You may need to add main.bonds or similar variable
    }

    // Apply atom size
    if (prefs.atomSize !== undefined) {
        document.getElementById('style5').value = prefs.atomSize;
        main.atomSize = prefs.atomSize;
    }

    // Apply resolution
    if (prefs.resolution !== undefined) {
        document.getElementById('style6').value = prefs.resolution;
        main.resolution = prefs.resolution;
    }

    if (prefs.labelsToggled !== undefined) {
        document.getElementById('toggleLabels').value = prefs.labelsToggled;
        main.labelsToggled = prefs.labelsToggled;
    }

    // Apply antialias
    if (prefs.antialias !== undefined) {
        document.getElementById('style7').checked = prefs.antialias;
        antialiasToggled = prefs.antialias;

        // If antialias setting changed, recreate renderer
        if (renderer.antialias !== prefs.antialias) {
            window.recreateRenderer(prefs.antialias);
        }
    }

    // Apply background color
    if (prefs.backgroundColor !== undefined && prefs.backgroundColor !== '#ff0000') {
        document.getElementById('style8').value = prefs.backgroundColor;
        const color = prefs.backgroundColor;
        window.setSceneColor(color);
        document.body.style.backgroundColor = color;
    }

    // Apply toggle style changes
    if (prefs.toggleStyleChanges !== undefined) {
        document.getElementById('toggleStyleChanges').checked = prefs.toggleStyleChanges;
        // Trigger the toggle event if needed
        if (prefs.toggleStyleChanges && window.mode === 0) {
            document.getElementById('toggleStyleChanges').dispatchEvent(new Event('change'));
        }
    }

    // Apply toggle labels
    if (prefs.toggleLabels !== undefined) {
        document.getElementById('toggleLabels').checked = prefs.toggleLabels;
        window.labelMode = prefs.toggleLabels;
        if (main && main.molecule) {
            main.molecule.toggleLabels(window.labelMode);
        }
    }

    // Update the visualization if a molecule is loaded
    if (main && main.molecule && window.mode !== 0) {
        updateStyles();
    }

    window.render();
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
        position: fixed;
        bottom: 20px;
        right: 20px;
        padding: 15px 25px;
        border-radius: 8px;
        color: white;
        font-weight: 600;
        z-index: 10000;
        animation: slideIn 0.3s ease-out;
        ${type === 'success' ? 'background: linear-gradient(135deg, #00c851 0%, #00ff00 100%);' : ''}
        ${type === 'error' ? 'background: linear-gradient(135deg, #ff4444 0%, #cc0000 100%);' : ''}
        ${type === 'info' ? 'background: linear-gradient(135deg, #33b5e5 0%, #0099cc 100%);' : ''}
    `;

    document.body.appendChild(notification);

    // Auto remove after 3 seconds
    setTimeout(() => {
        notification.style.animation = 'slideOut 0.3s ease-out';
        setTimeout(() => notification.remove(), 300);
    }, 3000);
}

// Add this after other event listeners in main.js




export function resetToDefaults() {
    // Reset sliders to default values
    document.getElementById('style1').value = 0.17; // Roughness
    document.getElementById('style2').value = 0.3;  // Metalness
    document.getElementById('style3').value = 1;    // Opacity
    document.getElementById('style4').value = 1;    // Bonds
    document.getElementById('style5').value = 1;    // Atom Size
    document.getElementById('style6').value = 16;   // Resolution
    document.getElementById('style7').checked = false; // Antialias
    document.getElementById('style8').value = '#01101f'; // Background (black, not red)
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
    scene.background = new THREE.Color('#01101f');
    document.body.style.backgroundColor = '#01101f';

    // Reset other states
    antialiasToggled = false;
    window.labelMode = false;

    window.render();
}

