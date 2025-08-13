// ChopChopMol Stripe Integration
// Initialize Stripe
const stripe = Stripe('pk_live_51Rot4oJFioirLp8GF7O6F8kr0PLQwRRrRXCjoQCgj0LIqtGnm9mh0Km7zoRFtKHiIiiXS4dhVwTQQLmLhihDwoiR00W0pdTUAa'); // REPLACE THIS!
const PREMIUM_PRICE_ID = 'price_1RvRIeJFioirLp8GzChWVboO';
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

// Rest of the functions remain the same...
// (Keep all the other functions from the previous code)

// Initialize on page load
document.addEventListener('DOMContentLoaded', () => {
    initializePremium();

    // Re-check premium when window regains focus (in case user subscribed in another tab)
    window.addEventListener('focus', () => {
        if (window.currentUser) {
            checkFirebasePremium(window.currentUser.uid);
        }
    });
});