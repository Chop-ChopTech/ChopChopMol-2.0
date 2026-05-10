/**
 * API utility functions for safe HTTP requests with error handling
 */

/**
 * Default timeout for fetch requests (30 seconds)
 */
const DEFAULT_TIMEOUT_MS = 30000;

const RUNPOD_URL = 'https://l01l6g1um1puzn-10000.proxy.runpod.net';
const RENDER_URL = 'https://chopchopmol-ai-backend.onrender.com';
const DEV_URL = 'https://chopchopmol-dev-backend.onrender.com';
const LOCAL_URL = 'http://127.0.0.1:10000';

// Map of stable keys → URLs. Keep names lowercase for the localStorage value.
const BACKEND_URLS = { runpod: RUNPOD_URL, render: RENDER_URL, dev: DEV_URL, local: LOCAL_URL };
const BACKEND_OVERRIDE_KEY = 'chopchop_backend_override';

/** Read sticky override saved by the settings UI. Returns null if unset/invalid. */
function _readSavedOverride() {
    try {
        const k = (localStorage.getItem(BACKEND_OVERRIDE_KEY) || '').trim().toLowerCase();
        return BACKEND_URLS[k] ? k : null;
    } catch { return null; }
}

let _resolvedBackendUrl = null;
let _resolvePromise = null;
const _overrideListeners = [];
// Honor a saved override before any auto-detect runs so all callers see the same URL.
{
    const saved = _readSavedOverride();
    if (saved) {
        _resolvedBackendUrl = BACKEND_URLS[saved];
        console.log(`Backend: ${saved} (saved override)`);
    }
}

/**
 * Returns the backend URL. Local dev uses localhost, production tries RunPod first then Render.
 * The result is cached after the first resolution.
 * @returns {Promise<string>} The backend URL
 */
export async function getBackendUrl() {
    if (_resolvedBackendUrl) return _resolvedBackendUrl;
    if (_resolvePromise) return _resolvePromise;

    const isLocal = window.location.hostname === 'localhost' || window.location.hostname === '127.0.0.1';
    if (isLocal) {
        _resolvedBackendUrl = LOCAL_URL;
        console.log('Backend: Local');
        return _resolvedBackendUrl;
    }

    // Dev environment — bound to its own backend, no fallback to prod.
    // chopchopmoldev.web.app and chopchopmoldev.firebaseapp.com are both Firebase
    // Hosting URLs for the dev project.
    if (window.location.hostname === 'chopchopmoldev.web.app' ||
        window.location.hostname === 'chopchopmoldev.firebaseapp.com' ||
        window.location.hostname === 'dev.chopchopmol.com') {
        _resolvedBackendUrl = DEV_URL;
        console.log('Backend: Dev');
        return _resolvedBackendUrl;
    }

    _resolvePromise = (async () => {
        try {
            const res = await fetch(`${RUNPOD_URL}/health`, { signal: AbortSignal.timeout(3000) });
            if (res.ok) {
                const data = await res.json();
                if (data.status === 'ok') {
                    _resolvedBackendUrl = RUNPOD_URL;
                    console.log('Backend: RunPod');
                    return _resolvedBackendUrl;
                }
            }
        } catch (e) {
            console.log('RunPod health check failed:', e.message);
        }
        _resolvedBackendUrl = RENDER_URL;
        console.log('Backend: Render');
        return _resolvedBackendUrl;
    })();

    return _resolvePromise;
}

/**
 * Always returns the Render backend URL. Use this for non-AI-chat traffic —
 * admin pages, access form, /access/* gate checks. Render holds the source of
 * truth for users/access requests, so even local dev should hit Render here
 * (otherwise approvals would go to a localhost backend with empty Firestore).
 * @returns {Promise<string>}
 */
export async function getRenderBackendUrl() {
    return RENDER_URL;
}

/**
 * Returns the stable key ('runpod' | 'render' | 'local') of the active backend,
 * or 'auto' if no override is set and detection is in progress.
 */
export function getBackendKey() {
    const url = _resolvedBackendUrl;
    if (!url) return 'auto';
    for (const [k, v] of Object.entries(BACKEND_URLS)) if (v === url) return k;
    return 'auto';
}

/** Returns the saved override key, or null if none. */
export function getSavedBackendOverride() {
    return _readSavedOverride();
}

/**
 * Switch the active backend. Persists the choice in localStorage so it survives
 * reload, updates the in-memory cache, and notifies all listeners.
 * @param {'runpod'|'render'|'local'|'auto'} key
 */
export function setBackendOverride(key) {
    const k = (key || '').toLowerCase();
    if (k === 'auto') {
        try { localStorage.removeItem(BACKEND_OVERRIDE_KEY); } catch { }
        _resolvedBackendUrl = null;
        _resolvePromise = null;
        getBackendUrl().then(url => {
            console.log(`Backend: auto → ${url}`);
            _overrideListeners.forEach(fn => { try { fn(url); } catch { } });
        });
        return;
    }
    const url = BACKEND_URLS[k];
    if (!url) {
        console.warn(`Unknown backend key: ${key}`);
        return;
    }
    try { localStorage.setItem(BACKEND_OVERRIDE_KEY, k); } catch { }
    _resolvedBackendUrl = url;
    _resolvePromise = null;
    console.log(`Backend switched to: ${k} (${url})`);
    _overrideListeners.forEach(fn => { try { fn(url); } catch { } });
}

/**
 * Synchronous getter — returns the resolved URL or the Render fallback if not yet resolved.
 * Prefer getBackendUrl() when possible.
 */
export function getBackendUrlSync() {
    if (_resolvedBackendUrl) return _resolvedBackendUrl;
    const isLocal = window.location.hostname === 'localhost' || window.location.hostname === '127.0.0.1';
    if (isLocal) {
        _resolvedBackendUrl = LOCAL_URL;
        return LOCAL_URL;
    }
    if (window.location.hostname === 'chopchopmoldev.web.app' ||
        window.location.hostname === 'chopchopmoldev.firebaseapp.com' ||
        window.location.hostname === 'dev.chopchopmol.com') {
        _resolvedBackendUrl = DEV_URL;
        return DEV_URL;
    }
    // Kick off async resolution if not started
    if (!_resolvePromise) getBackendUrl();
    return RENDER_URL; // fallback until resolved
}

/**
 * Register a callback to be notified when the backend URL is manually overridden.
 * @param {function(string)} fn - Called with the new URL
 */
export function onBackendUrlOverride(fn) {
    _overrideListeners.push(fn);
}

/**
 * Invalidate the cached backend URL so the next getBackendUrl() call re-detects.
 * Called automatically when a fetch fails (timeout, network error) to trigger
 * fallback from RunPod to Render if RunPod has gone down mid-session.
 * Local dev URLs are never invalidated.
 */
export function invalidateBackendUrl() {
    const isLocal = window.location.hostname === 'localhost' || window.location.hostname === '127.0.0.1';
    if (isLocal) return; // Never invalidate localhost
    if (_readSavedOverride()) return; // User explicitly chose this backend — don't auto-fallback
    if (_resolvedBackendUrl === RENDER_URL) return; // Already on fallback
    console.warn(`⚠️ Invalidating backend URL (was: ${_resolvedBackendUrl}), will re-detect on next request`);
    _resolvedBackendUrl = null;
    _resolvePromise = null;
}

// Press \ five times consecutively to switch backend endpoint
let _backslashCount = 0;
let _backslashTimer = null;
window.addEventListener('keydown', (e) => {
    if (e.key === '\\') {
        _backslashCount++;
        clearTimeout(_backslashTimer);
        _backslashTimer = setTimeout(() => { _backslashCount = 0; }, 1500);
        if (_backslashCount >= 5) {
            _backslashCount = 0;
            const choice = prompt('Switch backend:\n1: RunPod\n2: Render\n3: Local\n4: Dev\n5: Auto-detect');
            const keys = { '1': 'runpod', '2': 'render', '3': 'local', '4': 'dev', '5': 'auto' };
            if (keys[choice]) setBackendOverride(keys[choice]);
        }
    } else {
        _backslashCount = 0;
    }
});

/**
 * Auth headers for backend `/ai/*` and `/api/*` requests. The backend's
 * `before_request` gate accepts:
 *   - Firebase ID token: `Authorization: Bearer ...` (signed-in users)
 *   - Guest token (new): `X-Guest-Token: ...` (issued by `/auth/guest-token`,
 *     1-hour expiry, replaces the old hardcoded bypass)
 *   - Guest bypass code (legacy): `X-Guest-Code: 0987` (kept for prod backend
 *     until it's upgraded to the token system)
 *
 * Sources:
 *   - window._firebaseIdToken: set by onIdTokenChanged elsewhere
 *   - sessionStorage.guestToken: bootstrapped lazily by `bootstrapGuestToken()`
 *   - sessionStorage.guestBypass: set by the gate's guest entry path
 */
const GUEST_TOKEN_KEY = 'chopchop_guest_token';
const GUEST_TOKEN_EXPIRES_KEY = 'chopchop_guest_token_expires';

export function getAuthHeaders() {
    const h = {};
    const t = (typeof window !== 'undefined') ? window._firebaseIdToken : null;
    if (t) h['Authorization'] = `Bearer ${t}`;
    try {
        const guestToken = sessionStorage.getItem(GUEST_TOKEN_KEY);
        const expires = parseInt(sessionStorage.getItem(GUEST_TOKEN_EXPIRES_KEY) || '0', 10);
        if (guestToken && Date.now() < expires) {
            h['X-Guest-Token'] = guestToken;
        }
        if (sessionStorage.getItem('guestBypass') === '1') h['X-Guest-Code'] = '0987';
    } catch { }
    return h;
}

/**
 * Fetch a fresh guest token from the backend and cache it in sessionStorage.
 * The token expires after 1 hour server-side; we refresh ~5 min before that.
 * Safe to call multiple times — concurrent calls are deduped.
 */
let _guestTokenPromise = null;
export async function bootstrapGuestToken() {
    try {
        const existing = sessionStorage.getItem(GUEST_TOKEN_KEY);
        const expires = parseInt(sessionStorage.getItem(GUEST_TOKEN_EXPIRES_KEY) || '0', 10);
        // Reuse if at least 5 minutes of life remaining
        if (existing && (expires - Date.now()) > 5 * 60 * 1000) return existing;
    } catch { }

    if (_guestTokenPromise) return _guestTokenPromise;

    _guestTokenPromise = (async () => {
        try {
            const url = await getBackendUrl();
            const res = await fetch(`${url}/auth/guest-token`, {
                method: 'POST',
                headers: { 'Content-Type': 'application/json' },
            });
            if (!res.ok) return null;
            const data = await res.json();
            if (!data || !data.token) return null;
            try {
                sessionStorage.setItem(GUEST_TOKEN_KEY, data.token);
                // Server expires in 1h; cache slightly less to refresh in time
                sessionStorage.setItem(GUEST_TOKEN_EXPIRES_KEY, String(Date.now() + 55 * 60 * 1000));
            } catch { }
            return data.token;
        } catch (e) {
            console.warn('Guest token bootstrap failed:', e?.message || e);
            return null;
        } finally {
            _guestTokenPromise = null;
        }
    })();
    return _guestTokenPromise;
}

// Bootstrap a guest token on module load for dev/prod (skipped on localhost since
// the local backend doesn't enforce auth either). The fetch is fire-and-forget;
// `getAuthHeaders()` reads sessionStorage so callers don't need to await.
if (typeof window !== 'undefined' &&
    window.location.hostname !== 'localhost' &&
    window.location.hostname !== '127.0.0.1') {
    bootstrapGuestToken();
}

/**
 * Safe fetch wrapper with timeout and comprehensive error handling.
 * @param {string} url - The URL to fetch
 * @param {RequestInit} options - Fetch options
 * @param {number} timeoutMs - Timeout in milliseconds (default: 30000)
 * @returns {Promise<Response>} The fetch response
 * @throws {Error} Throws detailed error on failure
 */
export async function safeFetch(url, options = {}, timeoutMs = DEFAULT_TIMEOUT_MS) {
    const controller = new AbortController();
    const timeout = setTimeout(() => controller.abort(), timeoutMs);

    let gotResponse = false;
    try {
        const response = await fetch(url, {
            ...options,
            signal: controller.signal
        });

        clearTimeout(timeout);
        gotResponse = true;

        if (!response.ok) {
            throw new Error(`HTTP ${response.status}: ${response.statusText}`);
        }

        return response;
    } catch (error) {
        clearTimeout(timeout);

        // Only invalidate the cached backend URL on a real network failure
        // (timeout, DNS, connection refused). HTTP-level errors like 401/403
        // mean the server is reachable, so don't waste time re-detecting.
        if (!gotResponse) invalidateBackendUrl();

        if (error.name === 'AbortError') {
            throw new Error(`Request timeout after ${timeoutMs}ms: ${url}`);
        }

        // Network or other fetch errors
        console.error('Fetch failed:', url, error);
        throw error;
    }
}

/**
 * Safe fetch wrapper that returns JSON with error handling.
 * @param {string} url - The URL to fetch
 * @param {RequestInit} options - Fetch options
 * @param {number} timeoutMs - Timeout in milliseconds (default: 30000)
 * @returns {Promise<any>} The parsed JSON response
 * @throws {Error} Throws detailed error on failure
 */
export async function safeFetchJson(url, options = {}, timeoutMs = DEFAULT_TIMEOUT_MS) {
    try {
        const response = await safeFetch(url, options, timeoutMs);
        const data = await response.json();
        return data;
    } catch (error) {
        if (error.message.includes('JSON')) {
            throw new Error(`Invalid JSON response from ${url}: ${error.message}`);
        }
        throw error;
    }
}

/**
 * Safe fetch wrapper that returns text with error handling.
 * @param {string} url - The URL to fetch
 * @param {RequestInit} options - Fetch options
 * @param {number} timeoutMs - Timeout in milliseconds (default: 30000)
 * @returns {Promise<string>} The response text
 * @throws {Error} Throws detailed error on failure
 */
export async function safeFetchText(url, options = {}, timeoutMs = DEFAULT_TIMEOUT_MS) {
    const response = await safeFetch(url, options, timeoutMs);
    return await response.text();
}

/**
 * POST request helper with JSON body.
 * @param {string} url - The URL to post to
 * @param {object} body - The request body (will be JSON stringified)
 * @param {RequestInit} options - Additional fetch options
 * @param {number} timeoutMs - Timeout in milliseconds (default: 30000)
 * @returns {Promise<any>} The parsed JSON response
 */
export async function postJson(url, body, options = {}, timeoutMs = DEFAULT_TIMEOUT_MS) {
    return safeFetchJson(url, {
        ...options,
        method: 'POST',
        headers: {
            'Content-Type': 'application/json',
            ...getAuthHeaders(),
            ...options.headers
        },
        body: JSON.stringify(body),
    }, timeoutMs);
}

/**
 * Retry wrapper for fetch operations with exponential backoff.
 * @param {Function} fetchFn - The fetch function to retry
 * @param {number} maxRetries - Maximum number of retries (default: 3)
 * @param {number} baseDelayMs - Base delay between retries in ms (default: 1000)
 * @returns {Promise<any>} The result of the fetch function
 */
export async function retryFetch(fetchFn, maxRetries = 3, baseDelayMs = 1000) {
    let lastError;

    for (let attempt = 0; attempt <= maxRetries; attempt++) {
        try {
            return await fetchFn();
        } catch (error) {
            lastError = error;

            if (attempt < maxRetries) {
                // Exponential backoff: 1s, 2s, 4s
                const delay = baseDelayMs * Math.pow(2, attempt);
                console.warn(`Retry attempt ${attempt + 1}/${maxRetries} after ${delay}ms...`);
                await new Promise(resolve => setTimeout(resolve, delay));
            }
        }
    }

    throw lastError;
}

/**
 * Generic SSE streaming POST helper. Calls `onEvent(event)` for every SSE
 * `data:` line. Returns the final `done` event's summary (or `{success:true}`).
 *
 * Events emitted by the backend follow the shape:
 *   {type: 'progress' | 'frame' | 'scf' | 'stdout' | 'stderr' | 'status'
 *         | 'heartbeat' | 'figure' | 'done' | 'error', ...payload}
 *
 * @param {string} url         Full endpoint URL
 * @param {object} body        POST body (JSON-serialized)
 * @param {object} opts
 * @param {(ev:object)=>void} opts.onEvent  Per-event callback
 * @param {AbortSignal}       [opts.signal] Abort signal
 * @param {Record<string,string>} [opts.headers]
 */
export async function streamSSE(url, body, { onEvent, signal, headers } = {}) {
    const res = await fetch(url, {
        method: 'POST',
        headers: { 'Content-Type': 'application/json', ...getAuthHeaders(), ...(headers || {}) },
        body: JSON.stringify(body),
        signal,
    });
    if (!res.ok) {
        let err;
        try { err = await res.json(); } catch { err = { error: res.statusText }; }
        throw new Error(err.error || `HTTP ${res.status}`);
    }
    const reader = res.body.getReader();
    const decoder = new TextDecoder();
    let buffer = '';
    let summary = null;

    const handle = (event) => {
        if (event.type === 'done') {
            summary = event.summary || { success: true };
        } else if (event.type === 'error') {
            throw new Error(event.error || 'stream error');
        }
        if (onEvent) onEvent(event);
    };

    const parseLine = (line) => {
        if (!line.startsWith('data: ')) return;
        const json = line.slice(6);
        try {
            handle(JSON.parse(json));
        } catch (e) {
            if (!(e instanceof SyntaxError)) throw e;
        }
    };

    while (true) {
        const { done, value } = await reader.read();
        if (done) break;
        buffer += decoder.decode(value, { stream: true });
        let nl;
        while ((nl = buffer.indexOf('\n')) !== -1) {
            const line = buffer.slice(0, nl).trim();
            buffer = buffer.slice(nl + 1);
            if (line) parseLine(line);
        }
    }
    const remaining = buffer.trim();
    if (remaining) parseLine(remaining);
    return summary || { success: true };
}

// Resolve backend URL on module load so it's logged immediately
getBackendUrl();
