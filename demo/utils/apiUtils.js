/**
 * API utility functions for safe HTTP requests with error handling.
 *
 * Backend is fixed to AWS. If the AWS backend is unreachable, a window event
 * 'backend-status' fires with { up: false } so the UI can render a banner.
 */

const DEFAULT_TIMEOUT_MS = 30000;
const AWS_URL = 'https://api.chopchopmol.com';

let _backendUp = true;

function _setBackendStatus(up) {
    if (_backendUp === up) return;
    _backendUp = up;
    try {
        window.dispatchEvent(new CustomEvent('backend-status', { detail: { up } }));
    } catch { }
}

/** Returns the backend URL (always AWS). */
export async function getBackendUrl() {
    return AWS_URL;
}

/** Synchronous backend URL getter. */
export function getBackendUrlSync() {
    return AWS_URL;
}

/**
 * Legacy alias kept for callers that used to hit the Render backend for
 * non-AI traffic (admin, access gate, early-access). All traffic now goes
 * to AWS.
 */
export async function getRenderBackendUrl() {
    return AWS_URL;
}

/** Legacy no-op stubs — backend switching has been removed. */
export function getBackendKey() { return 'aws'; }
export function getSavedBackendOverride() { return null; }
export function setBackendOverride() { }
export function onBackendUrlOverride() { }
export function invalidateBackendUrl() { }

/**
 * Auth headers for backend `/ai/*` and `/api/*` requests. The backend's
 * `before_request` gate requires either a Firebase ID token (`Authorization:
 * Bearer ...`) or the guest bypass code (`X-Guest-Code`).
 */
export function getAuthHeaders() {
    const h = {};
    const t = (typeof window !== 'undefined') ? window._firebaseIdToken : null;
    if (t) h['Authorization'] = `Bearer ${t}`;
    try {
        if (sessionStorage.getItem('guestBypass') === '1') h['X-Guest-Code'] = '0852';
    } catch { }
    return h;
}

/**
 * Safe fetch wrapper with timeout and comprehensive error handling.
 */
export async function safeFetch(url, options = {}, timeoutMs = DEFAULT_TIMEOUT_MS) {
    const controller = new AbortController();
    const timeout = setTimeout(() => controller.abort(), timeoutMs);

    let gotResponse = false;
    try {
        const response = await fetch(url, { ...options, signal: controller.signal });
        clearTimeout(timeout);
        gotResponse = true;

        // If the request reached the AWS backend, mark it up regardless of HTTP status.
        if (url.startsWith(AWS_URL)) _setBackendStatus(true);

        if (!response.ok) {
            throw new Error(`HTTP ${response.status}: ${response.statusText}`);
        }
        return response;
    } catch (error) {
        clearTimeout(timeout);

        // No response at all from the AWS backend = it's down/unreachable.
        if (!gotResponse && url.startsWith(AWS_URL)) _setBackendStatus(false);

        if (error.name === 'AbortError') {
            throw new Error(`Request timeout after ${timeoutMs}ms: ${url}`);
        }
        console.error('Fetch failed:', url, error);
        throw error;
    }
}

export async function safeFetchJson(url, options = {}, timeoutMs = DEFAULT_TIMEOUT_MS) {
    try {
        const response = await safeFetch(url, options, timeoutMs);
        return await response.json();
    } catch (error) {
        if (error.message.includes('JSON')) {
            throw new Error(`Invalid JSON response from ${url}: ${error.message}`);
        }
        throw error;
    }
}

export async function safeFetchText(url, options = {}, timeoutMs = DEFAULT_TIMEOUT_MS) {
    const response = await safeFetch(url, options, timeoutMs);
    return await response.text();
}

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

export async function retryFetch(fetchFn, maxRetries = 3, baseDelayMs = 1000) {
    let lastError;
    for (let attempt = 0; attempt <= maxRetries; attempt++) {
        try {
            return await fetchFn();
        } catch (error) {
            lastError = error;
            if (attempt < maxRetries) {
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
 */
export async function streamSSE(url, body, { onEvent, signal, headers } = {}) {
    let res;
    try {
        res = await fetch(url, {
            method: 'POST',
            headers: { 'Content-Type': 'application/json', ...getAuthHeaders(), ...(headers || {}) },
            body: JSON.stringify(body),
            signal,
        });
    } catch (e) {
        if (url.startsWith(AWS_URL)) _setBackendStatus(false);
        throw e;
    }
    if (url.startsWith(AWS_URL)) _setBackendStatus(true);
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
        try { handle(JSON.parse(json)); }
        catch (e) { if (!(e instanceof SyntaxError)) throw e; }
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

/**
 * Periodic health check. Pings /health every 30s; emits 'backend-status'
 * events when state flips. Runs once immediately, then on an interval.
 */
async function _pingHealth() {
    try {
        const res = await fetch(`${AWS_URL}/health`, { signal: AbortSignal.timeout(5000) });
        _setBackendStatus(res.ok);
    } catch {
        _setBackendStatus(false);
    }
}
_pingHealth();
setInterval(_pingHealth, 30000);
