/**
 * terminal.js — in-app web terminal.
 * ----------------------------------
 * Opens a WebSocket to the terminal gateway (wss://api.chopchopmol.com/terminal/ws),
 * which drops the user into their own isolated, sandboxed container. xterm.js
 * renders it; we pipe keystrokes up and shell output down.
 *
 * Auth: the gateway can't read an Authorization header on a browser WebSocket,
 * so we pass the Firebase ID token (window._firebaseIdToken, the same token
 * getAuthHeaders() uses) as a ?token= query param. The gateway verifies it.
 *
 * Wire protocol mirrors gateway.py:
 *   - keystrokes: sent as raw text frames
 *   - resize:     sent as JSON text {"type":"resize","cols":N,"rows":M}
 *   - output:     received as binary frames, written straight to xterm
 */

import { getWsUrl } from './utils/apiUtils.js';

const WS_UNAUTHORIZED = 4401;
const WS_CAPACITY = 4503;

class TerminalManager {
    constructor() {
        this.panel = null;
        this.term = null;
        this.fitAddon = null;
        this.ws = null;
        this.connected = false;
        this.manualClose = false;
        this.reconnectDelay = 1000;       // backoff, capped
        this.reconnectTimer = null;
        this.resizeObserver = null;
    }

    /** Wire up DOM references + the toolbar toggle. Called once on load. */
    init() {
        this.panel = document.getElementById('terminalPanel');
        if (!this.panel) return;
        this.containerEl = this.panel.querySelector('#terminalContainer');
        this.statusEl = this.panel.querySelector('#terminalStatus');

        const closeBtn = this.panel.querySelector('#terminalCloseBtn');
        if (closeBtn) closeBtn.addEventListener('click', () => this.close());

        this._setupResizer();
    }

    toggle() {
        if (this.panel?.classList.contains('open')) this.close();
        else this.open();
    }

    open() {
        if (!this.panel) return;
        this.panel.classList.add('open');
        this._ensureTerm();
        // Let the panel finish its open transition before measuring for fit.
        setTimeout(() => {
            this.fitAddon?.fit();
            this.connect();
            this.term?.focus();
        }, 60);
    }

    close() {
        this.panel?.classList.remove('open');
        this.manualClose = true;
        this._disconnect();
    }

    // ── xterm setup ──────────────────────────────────────────────────────
    _ensureTerm() {
        if (this.term) return;
        if (!window.Terminal) {
            this._status('xterm.js failed to load', 'error');
            return;
        }
        this.term = new window.Terminal({
            cursorBlink: true,
            // JetBrains Mono is strictly fixed-width; fallbacks are too. Avoid
            // the bare `monospace` keyword, which can resolve to an ill-fitting
            // system face and produce uneven column spacing.
            fontFamily: '"JetBrains Mono", ui-monospace, SFMono-Regular, Menlo, Consolas, "Liberation Mono", monospace',
            fontSize: 13,
            fontWeight: 400,
            letterSpacing: 0,
            lineHeight: 1.2,
            theme: { background: '#0b0e14', foreground: '#d7dce5' },
            scrollback: 5000,
        });
        try {
            this.fitAddon = new window.FitAddon.FitAddon();
            this.term.loadAddon(this.fitAddon);
        } catch { this.fitAddon = null; }

        this.term.open(this.containerEl);

        // WebGL renderer: draws each cell on a fixed pixel grid, eliminating the
        // DOM renderer's subpixel drift (the "letters look spaced apart" bug).
        // Falls back to the default renderer if WebGL is unavailable or its
        // context is lost.
        try {
            if (window.WebglAddon) {
                const webgl = new window.WebglAddon.WebglAddon();
                webgl.onContextLoss(() => { try { webgl.dispose(); } catch { /* noop */ } });
                this.term.loadAddon(webgl);
            }
        } catch { /* keep the default DOM renderer */ }

        this.fitAddon?.fit();

        // xterm measures glyph width at open() time. If the webfont finishes
        // loading afterwards, those measurements are stale and columns look
        // uneven — so re-measure (clearTextureAtlas + refit) once it's ready.
        if (document.fonts && document.fonts.load) {
            document.fonts.load('13px "JetBrains Mono"')
                .then(() => document.fonts.ready)
                .then(() => {
                    try { this.term.clearTextureAtlas?.(); } catch { /* older xterm */ }
                    this.fitAddon?.fit();
                    this.term?.refresh(0, Math.max(0, (this.term.rows || 1) - 1));
                })
                .catch(() => { /* font load failed — fallbacks still fixed-width */ });
        }

        // Keystrokes -> gateway.
        this.term.onData((data) => {
            if (this.ws && this.ws.readyState === WebSocket.OPEN) this.ws.send(data);
        });

        // Resize -> gateway (and refit on panel/window resize).
        this.term.onResize(({ cols, rows }) => this._sendResize(cols, rows));
        this.resizeObserver = new ResizeObserver(() => {
            if (this.panel?.classList.contains('open')) this.fitAddon?.fit();
        });
        this.resizeObserver.observe(this.containerEl);
    }

    // ── WebSocket lifecycle ──────────────────────────────────────────────
    connect() {
        if (this.ws && (this.ws.readyState === WebSocket.OPEN || this.ws.readyState === WebSocket.CONNECTING)) return;

        const token = window._firebaseIdToken;
        let guest = false;
        try { guest = sessionStorage.getItem('guestBypass') === '1'; } catch { /* ignore */ }
        if (!token && !guest) {
            this._status('Sign in to use the terminal', 'error');
            return;
        }

        this.manualClose = false;
        this._status('Connecting…', 'pending');
        // Signed-in users send their ID token; guests send the bypass code
        // (matches getAuthHeaders()'s X-Guest-Code in apiUtils.js).
        const query = token ? `token=${encodeURIComponent(token)}` : 'guest=0852';
        const url = `${getWsUrl()}?${query}`;
        let ws;
        try {
            ws = new WebSocket(url);
        } catch (e) {
            this._status('Connection failed', 'error');
            return;
        }
        ws.binaryType = 'arraybuffer';
        this.ws = ws;

        ws.onopen = () => {
            this.connected = true;
            this.reconnectDelay = 1000;
            this._status('Connected', 'ok');
            const { cols, rows } = this.term || {};
            if (cols && rows) this._sendResize(cols, rows);
            this.term?.focus();
        };

        ws.onmessage = (ev) => {
            if (!this.term) return;
            if (ev.data instanceof ArrayBuffer) this.term.write(new Uint8Array(ev.data));
            else this.term.write(ev.data);
        };

        ws.onclose = (ev) => {
            this.connected = false;
            this.ws = null;
            if (ev.code === WS_UNAUTHORIZED) {
                this._status('Unauthorized — sign in again', 'error');
                return;
            }
            if (ev.code === WS_CAPACITY) {
                this._status('Server at capacity — retry shortly', 'error');
                return;
            }
            if (this.manualClose) { this._status('Disconnected', 'idle'); return; }
            // Unexpected drop: reconnect with backoff while the panel stays open.
            this._status('Reconnecting…', 'pending');
            this.term?.writeln('\r\n\x1b[33m[disconnected — reconnecting…]\x1b[0m');
            this._scheduleReconnect();
        };

        ws.onerror = () => { /* surfaced via onclose */ };
    }

    _scheduleReconnect() {
        clearTimeout(this.reconnectTimer);
        this.reconnectTimer = setTimeout(() => {
            if (!this.manualClose && this.panel?.classList.contains('open')) this.connect();
        }, this.reconnectDelay);
        this.reconnectDelay = Math.min(this.reconnectDelay * 2, 15000);
    }

    _disconnect() {
        clearTimeout(this.reconnectTimer);
        if (this.ws) {
            try { this.ws.close(); } catch { /* ignore */ }
            this.ws = null;
        }
        this.connected = false;
    }

    _sendResize(cols, rows) {
        if (this.ws && this.ws.readyState === WebSocket.OPEN) {
            this.ws.send(JSON.stringify({ type: 'resize', cols, rows }));
        }
    }

    // ── UI helpers ───────────────────────────────────────────────────────
    _status(text, kind) {
        if (!this.statusEl) return;
        this.statusEl.textContent = text;
        this.statusEl.dataset.kind = kind || 'idle';
    }

    _setupResizer() {
        const handle = this.panel.querySelector('#terminalResizer');
        if (!handle) return;
        let startY = 0, startH = 0, dragging = false;
        const onMove = (e) => {
            if (!dragging) return;
            const dy = startY - e.clientY;
            const h = Math.min(Math.max(startH + dy, 140), window.innerHeight - 80);
            this.panel.style.height = `${h}px`;
            this.fitAddon?.fit();
        };
        const onUp = () => {
            dragging = false;
            document.removeEventListener('mousemove', onMove);
            document.removeEventListener('mouseup', onUp);
        };
        handle.addEventListener('mousedown', (e) => {
            dragging = true;
            startY = e.clientY;
            startH = this.panel.offsetHeight;
            document.addEventListener('mousemove', onMove);
            document.addEventListener('mouseup', onUp);
            e.preventDefault();
        });
    }
}

const terminalManager = new TerminalManager();
window.terminalManager = terminalManager;

if (document.readyState === 'loading') {
    document.addEventListener('DOMContentLoaded', () => terminalManager.init());
} else {
    terminalManager.init();
}

export default terminalManager;
