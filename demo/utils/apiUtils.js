/**
 * API utility functions for safe HTTP requests with error handling.
 *
 * Backend is fixed to AWS. A window event 'backend-status' fires with
 * { up: boolean } whenever the /health probe state flips, used by the
 * access gate to gate sign-in behind a "starting up server" panel.
 *
 * LAMBDA_BASE_URL is the API Gateway HTTP API endpoint for the auto-session
 * Lambdas (start-session, heartbeat, end-session). Until Phase 2 of the
 * auto-session rollout deploys those Lambdas, this is empty and the helpers
 * below no-op.
 */

const DEFAULT_TIMEOUT_MS = 30000;
const AWS_URL = 'https://api.chopchopmol.com';
export const LAMBDA_BASE_URL = '';

let _backendUp = null;  // null = unknown (pre-first-ping), then true/false

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
 * WebSocket URL for the terminal gateway, derived from AWS_URL (https -> wss).
 * Caddy routes /terminal/ws* to the gateway service. For local dev against a
 * gateway on localhost, set window.__TERMINAL_WS_OVERRIDE = 'ws://localhost:10001'.
 */
export function getWsUrl(path = '/terminal/ws') {
    const override = (typeof window !== 'undefined') ? window.__TERMINAL_WS_OVERRIDE : null;
    const base = override || AWS_URL.replace(/^http/, 'ws');
    return base.replace(/\/$/, '') + path;
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
        return res.ok;
    } catch {
        _setBackendStatus(false);
        return false;
    }
}
_pingHealth();
setInterval(_pingHealth, 30000);

/**
 * Returns true only when we have a positive recent health-check result.
 * Returns false before the first ping completes (unknown) or if the most
 * recent ping failed. Use waitForBackendHealth() for an authoritative live check.
 */
export function isBackendKnownUp() { return _backendUp === true; }

/**
 * Poll /health every `intervalMs` until it returns ok, up to `maxWaitMs`.
 * Resolves true if it came up, false on timeout. Used by the access gate
 * to block sign-in until the backend is reachable after auto-start.
 */
export async function waitForBackendHealth({ intervalMs = 3000, maxWaitMs = 180000 } = {}) {
    if (await _pingHealth()) return true;
    const deadline = Date.now() + maxWaitMs;
    while (Date.now() < deadline) {
        await new Promise(r => setTimeout(r, intervalMs));
        if (await _pingHealth()) return true;
    }
    return false;
}

/**
 * Tell the auto-session Lambda that a user just signed in. If the EC2 box
 * is stopped, the Lambda kicks off ec2:StartInstances. Safe to call
 * unconditionally — server-side dedupes if already running.
 *
 * @param {string|null} firebaseToken - Firebase ID token if signed in
 * @param {boolean} isGuest - true if entered via guest code
 * @returns {Promise<{state: 'ready'|'waking'} | null>} null if Lambda not deployed yet
 */
export async function startSession(firebaseToken, isGuest = false) {
    if (!LAMBDA_BASE_URL) return null;
    try {
        const res = await fetch(`${LAMBDA_BASE_URL}/session/start`, {
            method: 'POST',
            headers: {
                'Content-Type': 'application/json',
                ...(firebaseToken ? { 'Authorization': `Bearer ${firebaseToken}` } : {}),
            },
            body: JSON.stringify({ guest: !!isGuest }),
            signal: AbortSignal.timeout(10000),
        });
        if (!res.ok) return null;
        return await res.json();
    } catch (e) {
        console.warn('startSession failed:', e);
        return null;
    }
}

/**
 * 60s keepalive ping. Lambda upserts the row keyed by userId with lastSeen=now,
 * ttl=now+15min. The autostop Lambda reads MAX(lastSeen) across all rows to
 * decide whether anyone is still active.
 */
export async function sendHeartbeat(userId, firebaseToken) {
    if (!LAMBDA_BASE_URL || !userId) return;
    try {
        await fetch(`${LAMBDA_BASE_URL}/session/heartbeat`, {
            method: 'POST',
            headers: {
                'Content-Type': 'application/json',
                ...(firebaseToken ? { 'Authorization': `Bearer ${firebaseToken}` } : {}),
            },
            body: JSON.stringify({ userId }),
            keepalive: true,
            signal: AbortSignal.timeout(5000),
        });
    } catch { /* fire-and-forget */ }
}

/**
 * Drop the session row immediately (best-effort cleanup on tab close /
 * explicit sign-out). Uses sendBeacon when available so it survives unload.
 */
export function endSession(userId) {
    if (!LAMBDA_BASE_URL || !userId) return;
    const url = `${LAMBDA_BASE_URL}/session/end`;
    const body = JSON.stringify({ userId });
    try {
        if (navigator.sendBeacon) {
            navigator.sendBeacon(url, new Blob([body], { type: 'application/json' }));
            return;
        }
    } catch { }
    try { fetch(url, { method: 'POST', body, keepalive: true, headers: { 'Content-Type': 'application/json' } }); } catch { }
}
