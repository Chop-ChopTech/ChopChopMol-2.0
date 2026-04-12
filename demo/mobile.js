/**
 * mobile.js — Mobile UI controller for ChopChopMol 2.0
 *
 * Layout: toolbar (top) | 3D viewport (middle) | chat messages + input (bottom, always visible)
 * The AI panel is always visible on mobile — no toggling, no bottom sheet.
 *
 * Handles: toolbar overflow menu, file explorer overlay coordination,
 * floating panel backdrop, virtual keyboard adjustments.
 *
 * Only activates when viewport <= 768px.
 */

(function () {
    'use strict';

    const BREAKPOINT = 768;
    let mobileInitialized = false;

    function isMobile() {
        return window.matchMedia('(max-width: ' + BREAKPOINT + 'px)').matches;
    }


    // ─── Mobile Toolbar Controller ──────────────────────────────────

    class MobileToolbarController {
        constructor() {
            this.overflowBtn = document.getElementById('mobileOverflowBtn');
            this.overflowMenu = document.getElementById('mobileOverflowMenu');
            this._open = false;
        }

        init() {
            if (!this.overflowBtn || !this.overflowMenu) return;
            this._populateMenu();
            this.overflowBtn.addEventListener('click', (e) => {
                e.stopPropagation();
                this.toggleMenu();
            });
            document.addEventListener('click', () => this.closeMenu());
        }

        _populateMenu() {
            const items = [
                { icon: 'fa-solid fa-arrows-to-circle', label: 'Reset Camera', action: () => window.resetCamera?.() },
                { icon: 'fa-solid fa-flask-vial', label: 'Properties', action: () => {
                    document.getElementById('propertiesPanel')?.classList.toggle('open');
                    window.mobilePanelCoordinator?.onFloatingPanelToggle('propertiesPanel');
                }},
                { icon: 'fa-solid fa-puzzle-piece', label: 'Fragments', action: () => {
                    document.getElementById('fragmentListContainer')?.classList.toggle('open');
                    window.mobilePanelCoordinator?.onFloatingPanelToggle('fragmentListContainer');
                }},
                { icon: 'fa-solid fa-expand', label: 'Fullscreen', action: () => {
                    if (typeof toggleFullscreen === 'function') toggleFullscreen();
                }},
                { icon: 'fa-solid fa-book-open', label: 'Tutorial', action: () => {
                    document.getElementById('startTutorialBtn')?.click();
                }},
                { icon: 'fa-solid fa-user', label: 'Account', action: () => {
                    const gear = document.getElementById('settingsGear');
                    gear?.classList.toggle('active');
                }},
            ];

            this.overflowMenu.innerHTML = '';
            for (const item of items) {
                const btn = document.createElement('button');
                btn.className = 'mobile-overflow-item';
                btn.innerHTML = '<i class="' + item.icon + '"></i><span>' + item.label + '</span>';
                btn.addEventListener('click', (e) => {
                    e.stopPropagation();
                    this.closeMenu();
                    item.action();
                });
                this.overflowMenu.appendChild(btn);
            }
        }

        toggleMenu() {
            this._open = !this._open;
            this.overflowMenu.classList.toggle('open', this._open);
        }

        closeMenu() {
            this._open = false;
            this.overflowMenu.classList.remove('open');
        }
    }


    // ─── Mobile Panel Coordinator ───────────────────────────────────

    class MobilePanelCoordinator {
        constructor() {
            this.backdrop = document.getElementById('mobileBackdrop');
            this.explorerPanel = document.getElementById('fileExplorerPanel');
            this._activeFloatingPanel = null;
        }

        init() {
            if (!this.backdrop) return;
            this.backdrop.addEventListener('click', () => this.dismissAll());
        }

        toggleFileExplorer() {
            if (!this.explorerPanel) return;
            const isOpen = this.explorerPanel.classList.contains('open');

            if (isOpen) {
                this.explorerPanel.classList.remove('open');
                this.backdrop.classList.remove('active');
            } else {
                this.explorerPanel.classList.add('open');
                this.backdrop.classList.add('active');
            }

            document.getElementById('toggleFileExplorer')?.classList.toggle('active', !isOpen);
            window.updateRendererSize?.();
        }

        onFloatingPanelToggle(panelId) {
            const panel = document.getElementById(panelId);
            if (!panel) return;
            const isOpen = panel.classList.contains('open');

            if (isOpen) {
                this._activeFloatingPanel = panelId;
                this.backdrop.classList.add('active');
            } else {
                this._activeFloatingPanel = null;
                if (!this.explorerPanel?.classList.contains('open')) {
                    this.backdrop.classList.remove('active');
                }
            }
        }

        dismissAll() {
            if (this._activeFloatingPanel) {
                document.getElementById(this._activeFloatingPanel)?.classList.remove('open');
                this._activeFloatingPanel = null;
            }

            if (this.explorerPanel?.classList.contains('open')) {
                this.explorerPanel.classList.remove('open');
                document.getElementById('toggleFileExplorer')?.classList.remove('active');
            }

            this.backdrop.classList.remove('active');
            window.updateRendererSize?.();
        }
    }


    // ─── Virtual Keyboard Handler ───────────────────────────────────

    function initVirtualKeyboardHandler() {
        if (!window.visualViewport) return;

        const panel = document.getElementById('aiChatPanel');
        if (!panel) return;

        window.visualViewport.addEventListener('resize', () => {
            if (!isMobile()) return;
            const keyboardHeight = window.innerHeight - window.visualViewport.height;
            if (keyboardHeight > 100) {
                // Keyboard open — shrink panel to stay visible
                panel.style.height = Math.min(window.visualViewport.height * 0.45, window.innerHeight * 0.4) + 'px';
            } else {
                // Keyboard closed — reset
                panel.style.height = '';
            }
            window.updateRendererSize?.();
        });
    }


    // ─── Init / Teardown ────────────────────────────────────────────

    function initMobileUI() {
        if (mobileInitialized) return;
        mobileInitialized = true;

        const toolbar = new MobileToolbarController();
        toolbar.init();
        window.mobileToolbar = toolbar;

        const coordinator = new MobilePanelCoordinator();
        coordinator.init();
        window.mobilePanelCoordinator = coordinator;

        initVirtualKeyboardHandler();

        // AI panel is always visible on mobile — force it open
        const aiPanel = document.getElementById('aiChatPanel');
        if (aiPanel) {
            aiPanel.classList.add('open');
            aiPanel.style.width = '';
        }

        // File explorer must start closed on mobile
        const explorerPanel = document.getElementById('fileExplorerPanel');
        if (explorerPanel) {
            explorerPanel.classList.remove('open');
        }

        window.updateRendererSize?.();
    }

    function teardownMobileUI() {
        if (!mobileInitialized) return;
        mobileInitialized = false;

        const backdrop = document.getElementById('mobileBackdrop');
        if (backdrop) backdrop.classList.remove('active');

        const overflowMenu = document.getElementById('mobileOverflowMenu');
        if (overflowMenu) overflowMenu.classList.remove('open');

        const aiPanel = document.getElementById('aiChatPanel');
        if (aiPanel) {
            aiPanel.style.height = '';
        }

        window.mobileToolbar = null;
        window.mobilePanelCoordinator = null;
    }


    // ─── Bootstrap ──────────────────────────────────────────────────

    if (document.readyState === 'loading') {
        document.addEventListener('DOMContentLoaded', () => {
            if (isMobile()) initMobileUI();
        });
    } else {
        if (isMobile()) initMobileUI();
    }

    window.matchMedia('(max-width: ' + BREAKPOINT + 'px)').addEventListener('change', (e) => {
        if (e.matches) {
            initMobileUI();
        } else {
            teardownMobileUI();
        }
    });

    window.isMobile = isMobile;
})();
