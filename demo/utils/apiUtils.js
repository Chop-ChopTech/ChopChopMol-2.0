/**
 * API utility functions for safe HTTP requests with error handling
 */

/**
 * Default timeout for fetch requests (30 seconds)
 */
const DEFAULT_TIMEOUT_MS = 30000;

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
        method: 'POST',
        headers: {
            'Content-Type': 'application/json',
            ...options.headers
        },
        body: JSON.stringify(body),
        ...options
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
