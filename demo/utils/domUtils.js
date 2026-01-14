/**
 * DOM utility functions for cleaner code and reduced duplication
 */

/**
 * Reattaches a button's event handler by cloning and replacing it.
 * This removes all existing event listeners before adding the new one.
 * @param {string} buttonId - The ID of the button element
 * @param {Function} handler - The event handler to attach
 * @returns {HTMLElement|null} The new button element, or null if button not found
 */
export function reattachButtonHandler(buttonId, handler) {
    const button = document.getElementById(buttonId);
    if (!button) {
        console.warn(`Button with id "${buttonId}" not found`);
        return null;
    }

    const newButton = button.cloneNode(true);
    button.parentNode.replaceChild(newButton, button);

    if (handler) {
        newButton.addEventListener('click', handler);
    }

    return newButton;
}

/**
 * Toggles a panel's visibility and optionally hides other panels.
 * @param {string} panelId - The ID of the panel to toggle
 * @param {string[]} hideOtherIds - Array of panel IDs to hide when showing this panel
 * @returns {boolean} True if panel was toggled on, false if toggled off or not found
 */
export function togglePanel(panelId, hideOtherIds = []) {
    const panel = document.getElementById(panelId);
    if (!panel) {
        console.warn(`Panel with id "${panelId}" not found`);
        return false;
    }

    const wasOn = panel.classList.contains('on');
    panel.classList.toggle('on');

    if (!wasOn) {
        // Panel is now on, hide others
        hideOtherIds.forEach(id => {
            const otherPanel = document.getElementById(id);
            if (otherPanel) {
                otherPanel.classList.remove('on');
            }
        });
    }

    return panel.classList.contains('on');
}

/**
 * Simple DOM element cache to reduce redundant getElementById calls.
 */
class DOMCache {
    constructor() {
        this.cache = new Map();
    }

    /**
     * Gets an element by ID, using cache if available.
     * @param {string} id - The element ID
     * @returns {HTMLElement|null}
     */
    get(id) {
        if (!this.cache.has(id)) {
            const element = document.getElementById(id);
            if (element) {
                this.cache.set(id, element);
            }
            return element;
        }
        return this.cache.get(id);
    }

    /**
     * Clears a specific element or all cached elements.
     * @param {string} [id] - Optional ID to clear from cache
     */
    clear(id = null) {
        if (id) {
            this.cache.delete(id);
        } else {
            this.cache.clear();
        }
    }

    /**
     * Forces a refresh of a cached element.
     * @param {string} id - The element ID
     * @returns {HTMLElement|null}
     */
    refresh(id) {
        this.cache.delete(id);
        return this.get(id);
    }
}

// Export a singleton instance
export const domCache = new DOMCache();

/**
 * Safely gets an element by ID with optional caching.
 * @param {string} id - The element ID
 * @param {boolean} useCache - Whether to use cache (default: false)
 * @returns {HTMLElement|null}
 */
export function getElement(id, useCache = false) {
    return useCache ? domCache.get(id) : document.getElementById(id);
}
