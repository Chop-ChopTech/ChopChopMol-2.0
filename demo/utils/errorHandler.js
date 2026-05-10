/**
 * Global error boundary for ChopChopMol 2.0
 *
 * Two responsibilities:
 *   1. Catch unhandled JS errors + promise rejections, surface them via toast.
 *   2. Append every error to `window.__errors` (capped) so dev/QA can dump the
 *      recent error log via the console: `JSON.stringify(window.__errors)`.
 *      This is intentionally keyed to a global so support tools can poke at it
 *      without the page needing a debug build.
 */

const MAX_ERRORS = 100;
window.__errors = window.__errors || [];

/** Push an entry onto the rolling error log. Keeps the last N. */
function recordError(kind, info) {
    try {
        window.__errors.push({
            kind,
            timestamp: new Date().toISOString(),
            url: typeof location !== 'undefined' ? location.href : '',
            userAgent: typeof navigator !== 'undefined' ? navigator.userAgent : '',
            ...info,
        });
        if (window.__errors.length > MAX_ERRORS) {
            window.__errors.splice(0, window.__errors.length - MAX_ERRORS);
        }
    } catch {
        // Last-resort safety: never let the error logger throw.
    }
}

// Public API: callers can record their own caught errors so SSE failures, tool
// invocation failures, etc. show up in the same place as truly unhandled ones.
window.recordError = recordError;

// Filter rules — strings or substrings to silence (no toast). Console still logs.
const NOISE_PATTERNS = [
    'ResizeObserver',
    'Script error',
    'ASSERTION FAILED',
    'Cross-Origin',
];

function isNoise(msg) {
    if (typeof msg !== 'string') return false;
    return NOISE_PATTERNS.some(p => msg.includes(p));
}

// Catch unhandled JS errors
window.onerror = function (message, source, lineno, colno, error) {
    console.error('Unhandled error:', { message, source, lineno, colno, error });
    recordError('error', {
        message: String(message || ''),
        source,
        lineno,
        colno,
        stack: error && error.stack ? String(error.stack).slice(0, 4000) : null,
    });

    if (isNoise(message)) return false;

    window.toastError?.('An unexpected error occurred. Check the console for details.');
    return false;
};

// Catch unhandled promise rejections
window.addEventListener('unhandledrejection', (event) => {
    const reason = event.reason;
    console.error('Unhandled promise rejection:', reason);

    const msg = reason?.message || String(reason || '');
    recordError('unhandledrejection', {
        message: msg,
        stack: reason && reason.stack ? String(reason.stack).slice(0, 4000) : null,
    });

    // Filter noise from auth refresh, analytics, ad scripts, popup COOP issues
    if (msg.includes('auth') || msg.includes('Firebase') || msg.includes('adsbygoogle') ||
        isNoise(msg)) {
        return;
    }

    window.toastError?.('An async operation failed unexpectedly.');
});
