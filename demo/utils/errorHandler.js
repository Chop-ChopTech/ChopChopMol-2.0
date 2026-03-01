/**
 * Global error boundary for ChopChopMol 2.0
 * Catches unhandled errors and promise rejections, surfaces them via toast.
 */

// Catch unhandled JS errors
window.onerror = function (message, source, lineno, colno, error) {
    console.error('Unhandled error:', { message, source, lineno, colno, error });

    // Filter known noise
    if (typeof message === 'string' && (
        message.includes('ResizeObserver') ||
        message.includes('Script error') ||
        message.includes('ASSERTION FAILED') ||
        message.includes('Cross-Origin')
    )) {
        return false;
    }

    window.toastError?.('An unexpected error occurred. Check the console for details.');
    return false;
};

// Catch unhandled promise rejections
window.addEventListener('unhandledrejection', (event) => {
    const reason = event.reason;
    console.error('Unhandled promise rejection:', reason);

    const msg = reason?.message || String(reason || '');

    // Filter noise from auth refresh, analytics, ad scripts, popup COOP issues
    if (msg.includes('auth') || msg.includes('Firebase') || msg.includes('adsbygoogle') ||
        msg.includes('ASSERTION FAILED') || msg.includes('Cross-Origin')) {
        return;
    }

    window.toastError?.('An async operation failed unexpectedly.');
});
