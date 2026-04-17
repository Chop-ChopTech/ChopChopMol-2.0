/**
 * API utility functions for safe HTTP requests with error handling
 */

/**
 * Default timeout for fetch requests (30 seconds)
 */
const DEFAULT_TIMEOUT_MS = 30000;

const RUNPOD_URL = 'https://chopchopmol-ai-backend.onrender.com';
const RENDER_URL = 'https://chopchopmol-ai-backend.onrender.com';
const LOCAL_URL = 'http://127.0.0.1:10000';


let _resolvedBackendUrl = null;
let _resolvePromise = null;
const _overrideListeners = [];

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
            const choice = prompt('Switch backend:\n1: RunPod\n2: Render\n3: Local');
            const urls = { '1': RUNPOD_URL, '2': RENDER_URL, '3': LOCAL_URL };
            const names = { '1': 'RunPod', '2': 'Render', '3': 'Local' };
            if (urls[choice]) {
                _resolvedBackendUrl = urls[choice];
                console.log(`Backend switched to: ${names[choice]} (${_resolvedBackendUrl})`);
                _overrideListeners.forEach(fn => fn(_resolvedBackendUrl));
            }
        }
    } else {
        _backslashCount = 0;
    }
});

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

    try {
        const response = await fetch(url, {
            ...options,
            signal: controller.signal
        });

        clearTimeout(timeout);

        if (!response.ok) {
            throw new Error(`HTTP ${response.status}: ${response.statusText}`);
        }

        return response;
    } catch (error) {
        clearTimeout(timeout);

        // Backend might be down — trigger re-detection on next request
        invalidateBackendUrl();

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
        headers: { 'Content-Type': 'application/json', ...(headers || {}) },
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
