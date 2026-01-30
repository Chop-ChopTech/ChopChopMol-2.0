/**
 * Unified toast notification system for ChopChopMol 2.0
 * Replaces alert() and consolidates all notification patterns.
 */

const MAX_TOASTS = 3;
const DURATIONS = { info: 3000, success: 3000, warning: 4000, error: 5000 };

const ICONS = {
    info: '<svg width="18" height="18" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2"><circle cx="12" cy="12" r="10"/><line x1="12" y1="16" x2="12" y2="12"/><line x1="12" y1="8" x2="12.01" y2="8"/></svg>',
    success: '<svg width="18" height="18" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2"><path d="M22 11.08V12a10 10 0 1 1-5.93-9.14"/><polyline points="22 4 12 14.01 9 11.01"/></svg>',
    warning: '<svg width="18" height="18" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2"><path d="M10.29 3.86L1.82 18a2 2 0 0 0 1.71 3h16.94a2 2 0 0 0 1.71-3L13.71 3.86a2 2 0 0 0-3.42 0z"/><line x1="12" y1="9" x2="12" y2="13"/><line x1="12" y1="17" x2="12.01" y2="17"/></svg>',
    error: '<svg width="18" height="18" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2"><circle cx="12" cy="12" r="10"/><line x1="15" y1="9" x2="9" y2="15"/><line x1="9" y1="9" x2="15" y2="15"/></svg>'
};

let container = null;

function getContainer() {
    if (container && document.body.contains(container)) return container;
    container = document.createElement('div');
    container.id = 'toast-container';
    document.body.appendChild(container);
    return container;
}

/**
 * Show a toast notification.
 * @param {string} message - The message to display
 * @param {object} options - { type: 'info'|'success'|'error'|'warning', duration: ms }
 */
export function toast(message, options = {}) {
    const type = options.type || 'info';
    const duration = options.duration || DURATIONS[type] || 3000;
    const cont = getContainer();

    // Enforce max visible toasts
    while (cont.children.length >= MAX_TOASTS) {
        const oldest = cont.firstChild;
        oldest.remove();
    }

    const el = document.createElement('div');
    el.className = `toast-item toast-${type}`;
    el.innerHTML = `
        <span class="toast-icon">${ICONS[type] || ICONS.info}</span>
        <span class="toast-message">${escapeHtml(message)}</span>
        <button class="toast-close" aria-label="Close">&times;</button>
    `;

    el.querySelector('.toast-close').addEventListener('click', () => dismissToast(el));
    cont.appendChild(el);

    // Trigger reflow for animation
    el.offsetHeight;
    el.classList.add('toast-visible');

    const timer = setTimeout(() => dismissToast(el), duration);
    el._timer = timer;
}

function dismissToast(el) {
    if (!el || !el.parentNode) return;
    clearTimeout(el._timer);
    el.classList.remove('toast-visible');
    el.classList.add('toast-exit');
    el.addEventListener('animationend', () => el.remove(), { once: true });
    // Fallback removal if animationend doesn't fire
    setTimeout(() => { if (el.parentNode) el.remove(); }, 400);
}

function escapeHtml(str) {
    const div = document.createElement('div');
    div.textContent = str;
    return div.innerHTML;
}

export function toastSuccess(message, duration) {
    toast(message, { type: 'success', duration });
}

export function toastError(message, duration) {
    toast(message, { type: 'error', duration });
}

export function toastWarning(message, duration) {
    toast(message, { type: 'warning', duration });
}

export function toastInfo(message, duration) {
    toast(message, { type: 'info', duration });
}

// Expose globally for non-module scripts (index.html inline, stripe.js, undo.js)
window.toast = toast;
window.toastSuccess = toastSuccess;
window.toastError = toastError;
window.toastWarning = toastWarning;
window.toastInfo = toastInfo;
