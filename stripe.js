// ChopChopMol Stripe Integration
// Initialize Stripe
const stripe = Stripe('pk_live_51Rot4oJFioirLp8GF7O6F8kr0PLQwRRrRXCjoQCgj0LIqtGnm9mh0Km7zoRFtKHiIiiXS4dhVwTQQLmLhihDwoiR00W0pdTUAa'); // REPLACE THIS!
const PREMIUM_PRICE_ID = 'price_1RvRIeJFioirLp8GzChWVboO'; // REPLACE THIS!

// Premium state management
let premiumState = {
    isActive: false,
    customerId: null,
    subscriptionId: null,
    userId: null
};

// Feature limits
const FEATURE_LIMITS = {
    free: {
        maxMolecules: 3,
        maxAtoms: 500,
        canExport: false,
        canEdit: false,
        canMeasure: false,
        aiGenerations: 3
    },
    premium: {
        maxMolecules: Infinity,
        maxAtoms: Infinity,
        canExport: true,
        canEdit: true,
        canMeasure: true,
        aiGenerations: Infinity
    }
};

// Initialize premium status - connected to Firebase Auth
async function initializePremium() {
    // Wait for Firebase auth to be ready
    if (typeof window.onAuthStateChanged === 'function') {
        window.onAuthStateChanged(window.auth, async (user) => {
            if (user) {
                // User is signed in
                premiumState.userId = user.uid;

                // Check if just subscribed
                const urlParams = new URLSearchParams(window.location.search);
                const sessionId = urlParams.get('session_id');

                if (sessionId) {
                    // Just subscribed - save to Firebase
                    await savePremiumToFirebase(user.uid, sessionId);
                    window.history.replaceState({}, document.title, window.location.pathname);
                    activatePremium();
                    showSuccessNotification('Premium activated! Enjoy unlimited features.');
                } else {
                    // Check existing subscription from Firebase
                    await checkFirebasePremium(user.uid);
                }
            } else {
                // User is signed out - reset to free
                premiumState.isActive = false;
                premiumState.userId = null;
                updatePremiumUI();
            }
        });
    } else {
        // Firebase not loaded yet, retry
        setTimeout(initializePremium, 500);
    }
}

// Save premium status to Firebase
async function savePremiumToFirebase(userId, sessionId) {
    try {
        const db = window.db; // Your Firebase Firestore instance
        if (db) {
            await window.setDoc(window.doc(db, 'users', userId), {
                premium: true,
                stripeSessionId: sessionId,
                premiumActivated: window.serverTimestamp(),
                premiumExpiry: null // Set this when you implement webhook
            }, { merge: true });

            console.log('Premium status saved to Firebase');
        }
    } catch (error) {
        console.error('Error saving premium to Firebase:', error);
        // Fallback to localStorage
        localStorage.setItem(`premium_${userId}`, 'true');
    }
}

// Check premium status from Firebase
async function checkFirebasePremium(userId) {
    try {
        const db = window.db;
        if (db) {
            const userDoc = await window.getDoc(window.doc(db, 'users', userId));

            if (userDoc.exists()) {
                const userData = userDoc.data();
                if (userData.premium === true) {
                    premiumState.isActive = true;
                    activatePremium();
                } else {
                    premiumState.isActive = false;
                    updatePremiumUI();
                }
            } else {
                // No user doc, check localStorage as fallback
                const localPremium = localStorage.getItem(`premium_${userId}`) === 'true';
                if (localPremium) {
                    premiumState.isActive = true;
                    activatePremium();
                }
            }
        }
    } catch (error) {
        console.error('Error checking Firebase premium:', error);
        // Fallback to localStorage
        const localPremium = localStorage.getItem(`premium_${userId}`) === 'true';
        premiumState.isActive = localPremium;
        if (localPremium) activatePremium();
    }
}

// Subscribe to premium - include user ID
async function subscribeToPremium() {
    const btn = document.getElementById('subscribePremiumBtn');
    btn.classList.add('loading');
    btn.disabled = true;

    // Check if user is signed in
    if (!window.currentUser) {
        showLimitNotification('Please sign in first to upgrade to Premium');
        btn.classList.remove('loading');
        btn.disabled = false;

        // Trigger sign in
        document.getElementById('signInButton')?.click();
        return;
    }

    try {
        const userEmail = window.currentUser.email;
        const userId = window.currentUser.uid;

        // Add metadata to track user
        const { error } = await stripe.redirectToCheckout({
            lineItems: [{
                price: PREMIUM_PRICE_ID,
                quantity: 1
            }],
            mode: 'subscription',
            successUrl: window.location.origin + window.location.pathname + '?session_id={CHECKOUT_SESSION_ID}&uid=' + userId,
            cancelUrl: window.location.origin + window.location.pathname,
            customerEmail: userEmail,
            clientReferenceId: userId // Track Firebase user ID
        });

        if (error) {
            console.error('Stripe error:', error);
            showLimitNotification('Error: ' + error.message);
            btn.classList.remove('loading');
            btn.disabled = false;
        }
    } catch (err) {
        console.error('Subscription error:', err);
        showLimitNotification('Failed to start subscription. Please try again.');
        btn.classList.remove('loading');
        btn.disabled = false;
    }
}

// Cancel premium subscription
async function cancelPremium() {
    if (confirm('Are you sure you want to cancel your premium subscription?')) {
        try {
            const userId = window.currentUser?.uid;
            if (userId) {
                const db = window.db;
                await window.setDoc(window.doc(db, 'users', userId), {
                    premium: false,
                    premiumCancelled: window.serverTimestamp()
                }, { merge: true });

                premiumState.isActive = false;
                localStorage.removeItem(`premium_${userId}`);
                updatePremiumUI();
                showLimitNotification('Premium subscription cancelled');
            }
        } catch (error) {
            console.error('Error cancelling premium:', error);
        }
    }
}

// Activate premium features
function activatePremium() {
    premiumState.isActive = true;

    // Update button
    const btn = document.getElementById('premiumUpgradeBtn');
    if (btn) {
        btn.classList.add('premium-active');
        document.getElementById('premiumBtnText').textContent = 'Premium ✓';

        // Add click handler to manage subscription
        btn.onclick = function () {
            if (premiumState.isActive) {
                // Show management options
                if (confirm('Manage your Premium subscription?')) {
                    // You can add a management modal here
                    // For now, just option to cancel
                    cancelPremium();
                }
            } else {
                showPremiumModal();
            }
        };
    }

    // Enable all premium features
    enablePremiumFeatures();
}


// Enable premium features in the app
function enablePremiumFeatures() {
    // Remove locked state from tools
    document.querySelectorAll('.tool-locked').forEach(tool => {
        tool.classList.remove('tool-locked');
        tool.removeAttribute('disabled');
    });

    // Update export options
    const exportButtons = document.querySelectorAll('[data-export-format]');
    exportButtons.forEach(btn => btn.disabled = false);
}

// Subscribe to premium
async function subscribeToPremium() {
    const btn = document.getElementById('subscribePremiumBtn');
    btn.classList.add('loading');
    btn.disabled = true;

    try {
        // Get user email from Firebase auth if available
        const userEmail = window.currentUserEmail || '';

        const { error } = await stripe.redirectToCheckout({
            lineItems: [{
                price: PREMIUM_PRICE_ID,
                quantity: 1
            }],
            mode: 'subscription',
            successUrl: window.location.origin + window.location.pathname + '?session_id={CHECKOUT_SESSION_ID}',
            cancelUrl: window.location.origin + window.location.pathname,
            customerEmail: userEmail
        });

        if (error) {
            console.error('Stripe error:', error);
            showLimitNotification('Error: ' + error.message);
            btn.classList.remove('loading');
            btn.disabled = false;
        }
    } catch (err) {
        console.error('Subscription error:', err);
        showLimitNotification('Failed to start subscription. Please try again.');
        btn.classList.remove('loading');
        btn.disabled = false;
    }
}

// Check if user can add molecule
function canAddMolecule() {
    const limits = premiumState.isActive ? FEATURE_LIMITS.premium : FEATURE_LIMITS.free;

    // Count current molecules in scene
    const moleculeCount = window.main?.molecule?.getMoleculeCount() || 0;

    if (moleculeCount >= limits.maxMolecules) {
        showLimitNotification(`Free tier limited to ${limits.maxMolecules} molecules`);
        showPremiumModal();
        return false;
    }

    return true;
}

// Check if user can use feature
function canUsePremiumFeature(feature) {
    const limits = premiumState.isActive ? FEATURE_LIMITS.premium : FEATURE_LIMITS.free;

    switch (feature) {
        case 'export':
            if (!limits.canExport) {
                showLimitNotification('Export requires Premium subscription');
                showPremiumModal();
                return false;
            }
            return true;

        case 'edit':
            if (!limits.canEdit) {
                showLimitNotification('Editing tools require Premium');
                showPremiumModal();
                return false;
            }
            return true;

        case 'measure':
            if (!limits.canMeasure) {
                showLimitNotification('Measurement tools require Premium');
                showPremiumModal();
                return false;
            }
            return true;

        case 'ai':
            // Check AI generation limit
            const aiUsage = parseInt(localStorage.getItem('ai_usage_today') || '0');
            if (!premiumState.isActive && aiUsage >= limits.aiGenerations) {
                showLimitNotification(`Free tier limited to ${limits.aiGenerations} AI generations per day`);
                showPremiumModal();
                return false;
            }
            return true;

        default:
            return true;
    }
}

// Show/hide premium modal
function showPremiumModal() {
    document.getElementById('premiumModal').classList.add('active');
}

function closePremiumModal() {
    document.getElementById('premiumModal').classList.remove('active');
}

// Show limit notification
function showLimitNotification(message) {
    const notification = document.getElementById('limitNotification');
    document.getElementById('limitMessage').textContent = message;
    notification.classList.add('show');

    setTimeout(() => {
        notification.classList.remove('show');
    }, 4000);
}

// Show success notification
function showSuccessNotification(message) {
    const notification = document.getElementById('limitNotification');
    notification.classList.add('success');
    document.getElementById('limitMessage').textContent = message;
    notification.classList.add('show');

    setTimeout(() => {
        notification.classList.remove('show');
        notification.classList.remove('success');
    }, 4000);
}

// Update UI based on premium status
function updatePremiumUI() {
    if (premiumState.isActive) {
        document.getElementById('premiumUpgradeBtn')?.classList.add('premium-active');
        enablePremiumFeatures();
    }
}

// Override file handler to check limits
if (window.main && window.main.loader) {
    const originalHandleFile = window.main.loader.handleFile;
    window.main.loader.handleFile = function (event, append) {
        if (!append && !canAddMolecule()) {
            return false;
        }
        return originalHandleFile.apply(this, arguments);
    };
}

// Override export functions
document.addEventListener('DOMContentLoaded', () => {
    // Initialize premium
    initializePremium();

    // Override save buttons
    const savePDBBtn = document.getElementById('savePDB');
    if (savePDBBtn) {
        const originalClick = savePDBBtn.onclick;
        savePDBBtn.onclick = function () {
            if (canUsePremiumFeature('export')) {
                originalClick?.call(this);
            }
        };
    }

    const saveXYZBtn = document.getElementById('saveXYZ');
    if (saveXYZBtn) {
        const originalClick = saveXYZBtn.onclick;
        saveXYZBtn.onclick = function () {
            if (canUsePremiumFeature('export')) {
                originalClick?.call(this);
            }
        };
    }

    // Override edit molecule button
    const editBtn = document.getElementById('editMolecule');
    if (editBtn) {
        const originalClick = editBtn.onclick;
        editBtn.onclick = function () {
            if (canUsePremiumFeature('edit')) {
                originalClick?.call(this);
            }
        };
    }

    // Close modal on escape
    document.addEventListener('keydown', (e) => {
        if (e.key === 'Escape') {
            closePremiumModal();
        }
    });

    // Close modal on overlay click
    document.getElementById('premiumModal')?.addEventListener('click', (e) => {
        if (e.target.id === 'premiumModal') {
            closePremiumModal();
        }
    });
});