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

const STORAGE_LIMITS = {
    free: 0.5,      // 50MB for free users  
    premium: 70  // 5GB for premium users
};

// Feature limits
const FEATURE_LIMITS = {
    free: {
        maxMolecules: Infinity,  // No limit for signed-in users
        maxAtoms: Infinity,      // No limit for signed-in users
        canExport: true,         // Allow for signed-in users
        canEdit: true,           // Allow for signed-in users
        canMeasure: true,        // Allow for signed-in users
        aiGenerations: Infinity,  // No limit for signed-in users
        maxStorage: STORAGE_LIMITS.free  // This is the ONLY limitation
    },
    premium: {
        maxMolecules: Infinity,
        maxAtoms: Infinity,
        canExport: true,
        canEdit: true,
        canMeasure: true,
        aiGenerations: Infinity,
        maxStorage: STORAGE_LIMITS.premium
    }
};

// Initialize premium status - connected to Firebase Auth
async function initializePremium() {
    // Hide button initially
    const premiumBtn = document.getElementById('premiumUpgradeBtn');
    if (premiumBtn) {
        premiumBtn.style.display = 'none';
    }

    // Wait for Firebase auth to be ready
    if (typeof window.onAuthStateChanged === 'function') {
        // Auth listener in index.html will handle everything
        console.log('Premium system initialized');
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

                // Check if user has an active trial
                if (userData.trialStartDate && userData.trialEndDate) {
                    const trialEnd = userData.trialEndDate.toDate ? userData.trialEndDate.toDate() : new Date(userData.trialEndDate);
                    const now = new Date();

                    // Check if trial is still active
                    if (now <= trialEnd) {
                        // Trial is still active
                        premiumState.isActive = true;
                        premiumState.isTrial = true;
                        premiumState.trialEndDate = trialEnd;

                        // Calculate days remaining
                        const daysRemaining = Math.ceil((trialEnd - now) / (1000 * 60 * 60 * 24));

                        activatePremium();
                        // showTrialStatus(daysRemaining);
                        return;
                    } else {
                        // Trial has expired
                        if (!userData.premium) {
                            premiumState.isActive = false;
                            premiumState.isTrial = false;
                            showLimitNotification('Your free trial has expired. Upgrade to continue using premium features!');
                            setTimeout(() => showPremiumModal(), 2000);
                        }
                    }
                }

                // Check regular premium subscription
                if (userData.premium === true) {
                    premiumState.isActive = true;
                    premiumState.isTrial = false;
                    activatePremium();
                } else if (!userData.trialStartDate) {
                    // New user without trial - start free trial
                    await startFreeTrial(userId);
                } else {
                    // No active subscription
                    premiumState.isActive = false;
                    updatePremiumUI();
                }
            } else {
                // New user - start free trial
                await startFreeTrial(userId);
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

function showTrialStatus(daysRemaining) {
    let message = '';
    const notification = document.getElementById('limitNotification');

    if (daysRemaining > 30) {
        const monthsRemaining = Math.floor(daysRemaining / 30);
        message = `Free trial: ${monthsRemaining} month${monthsRemaining > 1 ? 's' : ''} remaining`;
    } else if (daysRemaining > 7) {
        message = `Free trial: ${daysRemaining} days remaining`;
    } else {
        message = `⚠️ Free trial ending soon: ${daysRemaining} days remaining`;
        if (notification) {
            notification.style.background = 'linear-gradient(135deg, #F59E0B, #D97706)';
        }
    }

    // Update button text to show trial status
    const btn = document.getElementById('premiumUpgradeBtn');
    if (btn) {
        document.getElementById('premiumBtnText').textContent = 'Trial';
        btn.title = message;
        btn.classList.add('trial-active');
        btn.classList.remove('premium-active');
    }

    // Show notification briefly on login
    if (notification && message) {
        document.getElementById('limitMessage').textContent = message;
        notification.style.display = 'block';
        notification.classList.add('show');

        setTimeout(() => {
            notification.classList.remove('show');
            setTimeout(() => {
                notification.style.display = 'none';
            }, 300);
        }, 3000);
    }
}
// Function to start a 6-month free trial for new users
async function startFreeTrial(userId) {
    try {
        const db = window.db;
        if (db) {
            const now = new Date();
            const trialEndDate = new Date();
            trialEndDate.setMonth(trialEndDate.getMonth() + 6); // Add 6 months

            await window.setDoc(window.doc(db, 'users', userId), {
                premium: false,
                trialStartDate: now,
                trialEndDate: trialEndDate,
                isTrialUser: true,
                firstSignIn: window.serverTimestamp()
            }, { merge: true });

            // Activate trial
            premiumState.isActive = true;
            premiumState.isTrial = true;
            premiumState.trialEndDate = trialEndDate;

            activatePremium();
            showLimitNotification('🎉 Welcome! Your 6-month free premium trial has been activated!');

            console.log('Free trial started for user:', userId);
        }
    } catch (error) {
        console.error('Error starting free trial:', error);
    }
}

function showTrialNotification(daysRemaining) {
    const notification = document.getElementById('limitNotification') || createNotificationElement();
    notification.classList.add('trial-notification');

    let message = '';
    if (daysRemaining > 30) {
        const monthsRemaining = Math.floor(daysRemaining / 30);
        message = `Free trial: ${monthsRemaining} month${monthsRemaining > 1 ? 's' : ''} remaining`;
    } else if (daysRemaining > 7) {
        message = `Free trial: ${daysRemaining} days remaining`;
    } else if (daysRemaining > 1) {
        message = `⚠️ Free trial ending soon: ${daysRemaining} days remaining`;
        notification.classList.add('warning');
    } else if (daysRemaining === 1) {
        message = `⚠️ Free trial ends tomorrow!`;
        notification.classList.add('warning');
    } else {
        message = `⚠️ Free trial ends today!`;
        notification.classList.add('warning');
    }

    document.getElementById('limitMessage').textContent = message;
    notification.classList.add('show');
    notification.style.display = 'block';

    // Update the premium button to show trial status
    const btn = document.getElementById('premiumUpgradeBtn');
    if (btn) {
        document.getElementById('premiumBtnText').textContent = 'Trial';
        btn.title = `Free trial: ${daysRemaining} days remaining`;
    }

    setTimeout(() => {
        notification.classList.remove('show');
    }, 5000);
}

function showWelcomeTrialNotification() {
    const notification = document.getElementById('limitNotification') || createNotificationElement();
    notification.classList.add('success', 'welcome-trial');
    document.getElementById('limitMessage').textContent = '🎉 Welcome! Your 6-month free premium trial has been activated!';
    notification.classList.add('show');
    notification.style.display = 'block';

    setTimeout(() => {
        notification.classList.remove('show');
        notification.classList.remove('success', 'welcome-trial');
    }, 7000);
}

function showTrialExpiredNotification() {
    const notification = document.getElementById('limitNotification') || createNotificationElement();
    notification.classList.add('expired-trial');
    document.getElementById('limitMessage').textContent = 'Your free trial has expired. Upgrade to continue using premium features!';
    notification.classList.add('show');
    notification.style.display = 'block';

    // Show premium modal after 2 seconds
    setTimeout(() => {
        showPremiumModal();
    }, 2000);

    setTimeout(() => {
        notification.classList.remove('show');
        notification.classList.remove('expired-trial');
    }, 5000);
}

function createNotificationElement() {
    const notification = document.createElement('div');
    notification.id = 'limitNotification';
    notification.className = 'limit-notification';
    notification.innerHTML = `
        <i class="fas fa-info-circle"></i>
        <span id="limitMessage"></span>
    `;
    document.body.appendChild(notification);
    return notification;
}

function activatePremium() {
    premiumState.isActive = true;
    window.dispatchEvent(new CustomEvent('authStateChanged', {
        detail: { user: window.currentUser, isSignedIn: true, premiumState: premiumState }
    }));

    // Update button
    const btn = document.getElementById('premiumUpgradeBtn');
    if (btn) {
        // Show the button when premium/trial is active
        btn.style.display = 'flex';

        if (premiumState.isTrial) {
            btn.classList.add('trial-active');
            btn.classList.remove('premium-active');
            document.getElementById('premiumBtnText').textContent = 'Trial';

            // Show remaining days on hover
            if (premiumState.trialEndDate) {
                const now = new Date();
                const daysRemaining = Math.ceil((premiumState.trialEndDate - now) / (1000 * 60 * 60 * 24));
                btn.title = `Free trial: ${daysRemaining} days remaining. Click to upgrade.`;
            }
        } else {
            btn.classList.add('premium-active');
            btn.classList.remove('trial-active');
            document.getElementById('premiumBtnText').textContent = 'Premium';
        }

        // Update onclick handler
        // btn.onclick = function () {
        //     if (premiumState.isActive && !premiumState.isTrial) {
        //         // Show management options for paid premium users
        //         if (confirm('Manage your Premium subscription?')) {
        //             cancelPremium();
        //         }
        //     } else {
        //         // Show upgrade modal for trial users
        //         showPremiumModal();
        //     }
        // };
    }

    // Enable all premium features
    enablePremiumFeatures();
}


function showPremiumModalWithTrialInfo() {
    showPremiumModal();

    // Add trial info to the modal if user is on trial
    if (premiumState.isTrial && premiumState.trialEndDate) {
        const now = new Date();
        const daysRemaining = Math.ceil((premiumState.trialEndDate - now) / (1000 * 60 * 60 * 24));

        const modalContent = document.querySelector('.premium-modal-content');
        const trialInfo = document.createElement('div');
        trialInfo.className = 'trial-info-banner';
        trialInfo.innerHTML = `
            <i class="fas fa-gift"></i>
            <p>You have <strong>${daysRemaining} days</strong> remaining in your free trial</p>
            <p class="small">Upgrade now to ensure uninterrupted access to premium features</p>
        `;

        // Insert after header
        const header = modalContent.querySelector('.premium-header');
        if (header && !modalContent.querySelector('.trial-info-banner')) {
            header.after(trialInfo);
        }
    }
}

// Subscribe to premium - include user ID
async function subscribeToPremium() {
    // Check if user is signed in first
    if (!window.currentUser) {
        // User not signed in - prompt to sign in
        showLimitNotification('Please sign in to upgrade to Premium');

        // Close the premium modal if it's open
        closePremiumModal();

        // Trigger sign in after a short delay
        setTimeout(() => {
            document.getElementById('signInButton')?.click();
        }, 500);

        return;
    }

    const btn = document.getElementById('subscribePremiumBtn');
    btn.classList.add('loading');
    btn.disabled = true;

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
            clientReferenceId: userId
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
    window.dispatchEvent(new CustomEvent('authStateChanged', {
        detail: { user: window.currentUser, isSignedIn: true, premiumState: premiumState }
    }));
    // Update button
    const btn = document.getElementById('premiumUpgradeBtn');
    if (btn) {
        btn.classList.add('premium-active');
        // document.getElementById('premiumBtnText').textContent = 'Premium';

        // Add click handler to manage subscription
        // btn.onclick = function () {
        //     if (premiumState.isActive) {
        //         // Show management options
        //         if (confirm('Manage your Premium subscription?')) {
        //             // You can add a management modal here
        //             // For now, just option to cancel
        //             cancelPremium();
        //         }
        //     } else {
        //         showPremiumModal();
        //     }
        // };
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
    // Always allow if signed in - no molecule count restrictions
    if (window.auth?.currentUser) {
        return true;
    }

    // Only restrict if not signed in
    showLimitNotification('Please sign in to add molecules');
    return false;
}

// Replace the canUsePremiumFeature function with this:
function canUsePremiumFeature(feature) {
    // If not signed in, restrict everything
    if (!window.auth?.currentUser) {
        showLimitNotification('Please sign in to use this feature');
        return false;
    }

    // All features available for signed-in users
    return true;
}

// Show/hide premium modal
function showPremiumModal() {
    window.location.href = 'premium.html';
}

document.addEventListener('DOMContentLoaded', function () {
    // Set initial button state (hidden)
    const premiumBtn = document.getElementById('premiumUpgradeBtn');
    if (premiumBtn) {
        premiumBtn.style.display = 'none';
    }

    // Initialize premium system (will show button if user is signed in)
    setTimeout(initializePremium, 1000);
});

window.addEventListener('userSignedIn', function (event) {
    const premiumBtn = document.getElementById('premiumUpgradeBtn');
    if (premiumBtn && event.detail.user) {
        // Show button with animation
        premiumBtn.style.display = 'flex';
        premiumBtn.style.animation = 'fadeInUp 0.5s ease';
    }
});

// Add this to your sign-in success handler in index.html
signInButton.addEventListener('click', () => {
    signInWithPopup(auth, provider)
        .then((result) => {
            const user = result.user;
            console.log('Signed in as', user.displayName);

            // Dispatch custom event for sign-in success
            window.dispatchEvent(new CustomEvent('userSignedIn', {
                detail: { user: user }
            }));
        })
        .catch((error) => {
            console.error('Sign-in error:', error);
        });
});

function closePremiumModal() {
    document.getElementById('premiumModal').classList.remove('active');
}

// Show limit notification
function showLimitNotification(message) {
    const notification = document.getElementById('limitNotification');
    document.getElementById('limitMessage').textContent = message;
    notification.classList.add('show');
    notification.style.display = 'block';

    setTimeout(() => {
        notification.classList.remove('show');
    }, 4000);
}

function closeLimitNotification() {
    const notification = document.getElementById('limitNotification');
    notification.classList.remove('show');
}

// Show success notification
function showSuccessNotification(message) {
    const notification = document.getElementById('limitNotification');
    notification.classList.add('success');
    document.getElementById('limitMessage').textContent = message;
    // notification.classList.add('show');

    setTimeout(() => {
        notification.classList.remove('show');
        notification.classList.remove('success');
    }, 2000);
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
document.addEventListener('DOMContentLoaded', function () {
    setTimeout(() => {
        const premiumBtn = document.getElementById('premiumUpgradeBtn');
        if (premiumBtn) {
            premiumBtn.onclick = function () {
                // Check premium status
                if (premiumState.isActive && !premiumState.isTrial) {
                    // Already premium - go to management
                    window.location.href = 'premium.html?manage=true';
                } else {
                    // Not premium - go to upgrade page
                    window.location.href = 'premium.html';
                }
            };
        }
    }, 2000); // Wait 2 seconds for everything to load
});