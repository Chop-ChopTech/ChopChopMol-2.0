// auth-cognito.js — frontend authentication via Amazon Cognito Hosted UI.
// ===========================================================================
// Replaces Firebase Auth. Handles BOTH "Sign in with Google" and email/password
// through Cognito's Hosted UI, using the OAuth2 Authorization Code flow with
// PKCE (the secure flow for browser apps — no client secret needed).
//
// Move this file into demo/ (e.g. demo/utils/auth-cognito.js) and import it
// from index.html. See AWS_MIGRATION_GUIDE.md §4.5.
//
// Exports:
//   redirectToLogin()           -> send user to the Hosted UI login page
//   handleRedirectCallback()    -> call once on page load; completes login
//   getIdToken()                -> a valid (auto-refreshed) JWT, or null
//   getUser()                   -> { sub, email, name } or null
//   isSignedIn()                -> boolean
//   logout()                    -> clear tokens + redirect to Hosted UI logout
// ===========================================================================

// ---- CONFIG: fill these in from the Cognito console (AWS_MIGRATION_GUIDE §4) ----
const COGNITO_DOMAIN   = 'https://chopchopmol-auth.auth.us-east-1.amazoncognito.com'; // §4.2a
const COGNITO_CLIENT_ID = 'CHANGEME_APP_CLIENT_ID';                                  // §4.3
// Redirect URI must EXACTLY match an "Allowed callback URL" on the app client,
// trailing slash included. Auto-picks prod vs local.
const REDIRECT_URI = (location.hostname === 'localhost' || location.hostname === '127.0.0.1')
    ? `${location.origin}/demo/`
    : 'https://www.chopchopmol.com/';
const SCOPES = 'openid email profile';
// --------------------------------------------------------------------------------

const STORE_KEY = 'ccm_cognito_tokens';   // localStorage key for the token bundle
const PKCE_KEY  = 'ccm_pkce_verifier';    // sessionStorage key for the PKCE verifier

// ---- small crypto/encoding helpers for PKCE ----
function _b64url(bytes) {
    return btoa(String.fromCharCode(...new Uint8Array(bytes)))
        .replace(/\+/g, '-').replace(/\//g, '_').replace(/=+$/, '');
}
function _randomVerifier() {
    const a = new Uint8Array(48);
    crypto.getRandomValues(a);
    return _b64url(a);
}
async function _challenge(verifier) {
    const digest = await crypto.subtle.digest('SHA-256', new TextEncoder().encode(verifier));
    return _b64url(digest);
}
function _decodeJwt(jwt) {
    try {
        const payload = jwt.split('.')[1].replace(/-/g, '+').replace(/_/g, '/');
        return JSON.parse(decodeURIComponent(escape(atob(payload))));
    } catch {
        return null;
    }
}

// ---- token storage ----
function _saveTokens(t) {
    // t: { id_token, access_token, refresh_token, expires_in }
    const bundle = {
        idToken: t.id_token,
        accessToken: t.access_token,
        // refresh_token is absent on a refresh response — keep the old one
        refreshToken: t.refresh_token || _loadTokens()?.refreshToken || null,
        expiresAt: Date.now() + (t.expires_in || 3600) * 1000,
    };
    localStorage.setItem(STORE_KEY, JSON.stringify(bundle));
    return bundle;
}
function _loadTokens() {
    try { return JSON.parse(localStorage.getItem(STORE_KEY)); }
    catch { return null; }
}
function _clearTokens() {
    localStorage.removeItem(STORE_KEY);
}

// ---- public API ----

/** Send the user to the Cognito Hosted UI (shows Google + email/password). */
export async function redirectToLogin() {
    const verifier = _randomVerifier();
    sessionStorage.setItem(PKCE_KEY, verifier);
    const challenge = await _challenge(verifier);
    const url = `${COGNITO_DOMAIN}/oauth2/authorize?` + new URLSearchParams({
        response_type: 'code',
        client_id: COGNITO_CLIENT_ID,
        redirect_uri: REDIRECT_URI,
        scope: SCOPES,
        code_challenge: challenge,
        code_challenge_method: 'S256',
    });
    location.assign(url);
}

/**
 * Call ONCE on page load. If the URL came back from Cognito with `?code=`,
 * exchanges it for tokens, stores them, and strips the query string.
 * Returns the signed-in user ({sub,email,name}) or null.
 */
export async function handleRedirectCallback() {
    const params = new URLSearchParams(location.search);
    const code = params.get('code');
    if (!code) return getUser();   // not a callback — just report current state

    const verifier = sessionStorage.getItem(PKCE_KEY);
    sessionStorage.removeItem(PKCE_KEY);
    if (!verifier) {
        console.warn('[auth] callback without a PKCE verifier — ignoring');
        return null;
    }

    const res = await fetch(`${COGNITO_DOMAIN}/oauth2/token`, {
        method: 'POST',
        headers: { 'Content-Type': 'application/x-www-form-urlencoded' },
        body: new URLSearchParams({
            grant_type: 'authorization_code',
            client_id: COGNITO_CLIENT_ID,
            code,
            redirect_uri: REDIRECT_URI,
            code_verifier: verifier,
        }),
    });
    if (!res.ok) {
        console.error('[auth] token exchange failed:', res.status, await res.text());
        return null;
    }
    _saveTokens(await res.json());

    // Remove ?code=...&state=... from the address bar without reloading.
    history.replaceState({}, document.title, location.pathname);
    return getUser();
}

/**
 * Returns a valid Cognito ID token (JWT), refreshing it first if it has
 * expired or is about to. Returns null if the user isn't signed in.
 * ALWAYS `await getIdToken()` immediately before a backend request — don't
 * cache it in a long-lived variable (tokens last 1 hour).
 */
export async function getIdToken() {
    let t = _loadTokens();
    if (!t) return null;

    // Still valid for at least another 60s? Use it.
    if (t.expiresAt - Date.now() > 60_000) return t.idToken;

    // Expired-ish — try to refresh.
    if (!t.refreshToken) { _clearTokens(); return null; }
    try {
        const res = await fetch(`${COGNITO_DOMAIN}/oauth2/token`, {
            method: 'POST',
            headers: { 'Content-Type': 'application/x-www-form-urlencoded' },
            body: new URLSearchParams({
                grant_type: 'refresh_token',
                client_id: COGNITO_CLIENT_ID,
                refresh_token: t.refreshToken,
            }),
        });
        if (!res.ok) { _clearTokens(); return null; }
        t = _saveTokens(await res.json());
        return t.idToken;
    } catch (e) {
        console.error('[auth] token refresh failed:', e);
        return null;
    }
}

/** Synchronous best-effort read of the current user from the stored ID token. */
export function getUser() {
    const t = _loadTokens();
    if (!t || !t.idToken) return null;
    const claims = _decodeJwt(t.idToken);
    if (!claims) return null;
    return {
        sub: claims.sub,                 // stable user id — use this as `uid`
        email: claims.email || null,
        name: claims.name || claims['cognito:username'] || null,
    };
}

export function isSignedIn() {
    const t = _loadTokens();
    return !!(t && t.refreshToken);
}

/** Clear local tokens and bounce through the Hosted UI logout endpoint. */
export function logout() {
    _clearTokens();
    const url = `${COGNITO_DOMAIN}/logout?` + new URLSearchParams({
        client_id: COGNITO_CLIENT_ID,
        logout_uri: REDIRECT_URI,
    });
    location.assign(url);
}

// Convenience: expose on window so non-module code in index.html can use it.
window.CognitoAuth = {
    redirectToLogin, handleRedirectCallback, getIdToken, getUser, isSignedIn, logout,
};
