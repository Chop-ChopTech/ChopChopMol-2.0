/**
 * RemoteFileManager - SSH/SFTP remote file access
 * Integrates into the local file explorer toolbar
 */

import { safeFetch } from './utils/apiUtils.js';

export class RemoteFileManager {
    constructor() {
        this.sessionId = this.generateSessionId();
        this.connected = false;
        this.currentPath = '.';
        this.host = null;
        this.username = null;
        this.remoteFiles = [];
        this.backendUrl = window.location.hostname === 'localhost' || window.location.hostname === '127.0.0.1'
            ? 'http://127.0.0.1:10000'
            : 'http://127.0.0.1:10000';

        this.init();
    }

    generateSessionId() {
        return 'remote-' + Math.random().toString(36).substr(2, 9) + '-' + Date.now();
    }

    init() {
        this.createConnectionModal();
        this.addToolbarButton();
    }

    addToolbarButton() {
        // Find the save button and its parent toolbar
        const saveBtn = document.getElementById('saveLocalBtn');
        if (!saveBtn) {
            // Wait for DOM and retry
            setTimeout(() => this.addToolbarButton(), 100);
            return;
        }

        const toolbar = saveBtn.parentElement;
        if (!toolbar) return;

        // Check if button already exists
        if (document.getElementById('remoteConnectBtn')) return;

        // Create remote connect button
        const remoteBtn = document.createElement('button');
        remoteBtn.id = 'remoteConnectBtn';
        remoteBtn.className = 'local-toolbar-button remote-connect-btn';
        remoteBtn.title = 'Connect to Remote Host (SSH/SFTP)';
        remoteBtn.innerHTML = '<i class="fas fa-plug"></i>';

        remoteBtn.addEventListener('click', () => {
            if (this.connected) {
                this.showRemoteFilesPanel();
            } else {
                this.showConnectionModal();
            }
        });

        // Insert before the save button
        toolbar.insertBefore(remoteBtn, saveBtn);

        // Update button state
        this.updateToolbarButton();
    }

    updateToolbarButton() {
        const btn = document.getElementById('remoteConnectBtn');
        if (!btn) return;

        if (this.connected) {
            btn.classList.add('connected');
            btn.title = `Connected to ${this.username}@${this.host} - Click to browse`;
            btn.innerHTML = '<i class="fas fa-server"></i>';
        } else {
            btn.classList.remove('connected');
            btn.title = 'Connect to Remote Host (SSH/SFTP)';
            btn.innerHTML = '<i class="fas fa-plug"></i>';
        }
    }

    createConnectionModal() {
        const modal = document.createElement('div');
        modal.id = 'remoteConnectionModal';
        modal.className = 'remote-modal-overlay';
        modal.innerHTML = `
            <div class="remote-modal">
                <div class="remote-modal-header">
                    <div class="remote-modal-title">
                        <i class="fas fa-server"></i>
                        <span>Remote Connection</span>
                    </div>
                    <button class="remote-modal-close" onclick="window.remoteFileManager.closeConnectionModal()">
                        <i class="fas fa-times"></i>
                    </button>
                </div>

                <div class="remote-modal-body">
                    <div class="remote-status-banner" id="remoteStatusBanner" style="display: none;">
                        <i class="fas fa-check-circle"></i>
                        <span id="remoteStatusText"></span>
                        <button class="remote-disconnect-btn" onclick="window.remoteFileManager.disconnect()">
                            Disconnect
                        </button>
                    </div>

                    <div class="remote-form" id="remoteConnectionForm">
                        <div class="remote-form-row">
                            <div class="remote-form-group flex-3">
                                <label>Host</label>
                                <input type="text" id="remoteHost" placeholder="server.example.com" />
                            </div>
                            <div class="remote-form-group flex-1">
                                <label>Port</label>
                                <input type="number" id="remotePort" value="22" />
                            </div>
                        </div>

                        <div class="remote-form-group">
                            <label>Username</label>
                            <input type="text" id="remoteUsername" placeholder="username" />
                        </div>

                        <div class="remote-auth-tabs">
                            <button class="remote-auth-tab active" data-method="password">
                                <i class="fas fa-key"></i> Password
                            </button>
                            <button class="remote-auth-tab" data-method="key">
                                <i class="fas fa-file-code"></i> SSH Key
                            </button>
                        </div>

                        <div id="passwordAuthSection" class="remote-auth-section">
                            <div class="remote-form-group">
                                <label>Password</label>
                                <input type="password" id="remotePassword" placeholder="Enter password" />
                            </div>
                        </div>

                        <div id="keyAuthSection" class="remote-auth-section" style="display: none;">
                            <div class="remote-form-group">
                                <label>Private Key File</label>
                                <div class="remote-file-input">
                                    <input type="file" id="remoteKeyFile" accept=".pem,.key,.pub" />
                                    <span class="remote-file-label" id="keyFileLabel">Choose file...</span>
                                </div>
                            </div>
                        </div>

                        <div class="remote-error" id="remoteError" style="display: none;"></div>
                    </div>

                    <div class="remote-files-browser" id="remoteFilesBrowser" style="display: none;">
                        <div class="remote-path-bar">
                            <button class="remote-nav-btn" onclick="window.remoteFileManager.navigateUp()" title="Go up">
                                <i class="fas fa-level-up-alt"></i>
                            </button>
                            <span class="remote-path" id="remoteCurrentPath">~</span>
                            <button class="remote-nav-btn" onclick="window.remoteFileManager.refreshFiles()" title="Refresh">
                                <i class="fas fa-sync-alt"></i>
                            </button>
                        </div>
                        <div class="remote-files-list" id="remoteFilesList"></div>
                    </div>
                </div>

                <div class="remote-modal-footer" id="remoteModalFooter">
                    <button class="remote-btn-secondary" onclick="window.remoteFileManager.closeConnectionModal()">
                        Cancel
                    </button>
                    <button class="remote-btn-primary" onclick="window.remoteFileManager.connect()" id="remoteConnectActionBtn">
                        <i class="fas fa-plug"></i> Connect
                    </button>
                </div>
            </div>
        `;

        document.body.appendChild(modal);

        // Auth tab toggle
        modal.querySelectorAll('.remote-auth-tab').forEach(tab => {
            tab.addEventListener('click', () => {
                modal.querySelectorAll('.remote-auth-tab').forEach(t => t.classList.remove('active'));
                tab.classList.add('active');

                const method = tab.dataset.method;
                document.getElementById('passwordAuthSection').style.display = method === 'password' ? 'block' : 'none';
                document.getElementById('keyAuthSection').style.display = method === 'key' ? 'block' : 'none';
            });
        });

        // File input label update
        document.getElementById('remoteKeyFile').addEventListener('change', (e) => {
            const label = document.getElementById('keyFileLabel');
            label.textContent = e.target.files[0]?.name || 'Choose file...';
        });

        // Enter key to connect
        modal.querySelectorAll('input').forEach(input => {
            input.addEventListener('keypress', (e) => {
                if (e.key === 'Enter') this.connect();
            });
        });

        // Close on backdrop click
        modal.addEventListener('click', (e) => {
            if (e.target === modal) this.closeConnectionModal();
        });
    }

    showConnectionModal() {
        const modal = document.getElementById('remoteConnectionModal');
        modal.style.display = 'flex';

        if (this.connected) {
            this.showBrowserMode();
        } else {
            this.showConnectMode();
        }

        setTimeout(() => document.getElementById('remoteHost').focus(), 100);
    }

    showConnectMode() {
        document.getElementById('remoteStatusBanner').style.display = 'none';
        document.getElementById('remoteConnectionForm').style.display = 'block';
        document.getElementById('remoteFilesBrowser').style.display = 'none';
        document.getElementById('remoteModalFooter').style.display = 'flex';
    }

    showBrowserMode() {
        document.getElementById('remoteStatusBanner').style.display = 'flex';
        document.getElementById('remoteStatusText').textContent = `${this.username}@${this.host}`;
        document.getElementById('remoteConnectionForm').style.display = 'none';
        document.getElementById('remoteFilesBrowser').style.display = 'flex';
        document.getElementById('remoteModalFooter').style.display = 'none';
        this.refreshFiles();
    }

    showRemoteFilesPanel() {
        this.showConnectionModal();
        this.showBrowserMode();
    }

    closeConnectionModal() {
        document.getElementById('remoteConnectionModal').style.display = 'none';
        document.getElementById('remoteError').style.display = 'none';
    }

    async connect() {
        const host = document.getElementById('remoteHost').value.trim();
        const port = parseInt(document.getElementById('remotePort').value) || 22;
        const username = document.getElementById('remoteUsername').value.trim();
        const password = document.getElementById('remotePassword').value;
        const keyFile = document.getElementById('remoteKeyFile').files[0];

        if (!host || !username) {
            this.showError('Host and username are required');
            return;
        }

        const activeMethod = document.querySelector('.remote-auth-tab.active').dataset.method;
        if (activeMethod === 'password' && !password) {
            this.showError('Password is required');
            return;
        }
        if (activeMethod === 'key' && !keyFile) {
            this.showError('SSH key file is required');
            return;
        }

        const btn = document.getElementById('remoteConnectActionBtn');
        btn.disabled = true;
        btn.innerHTML = '<i class="fas fa-spinner fa-spin"></i> Connecting...';

        try {
            let keyData = null;
            if (activeMethod === 'key' && keyFile) {
                const keyContent = await this.readFileAsText(keyFile);
                keyData = btoa(keyContent);
            }

            const response = await safeFetch(
                `${this.backendUrl}/api/remote/connect`,
                {
                    method: 'POST',
                    headers: { 'Content-Type': 'application/json' },
                    body: JSON.stringify({
                        sessionId: this.sessionId,
                        host,
                        port,
                        username,
                        password: activeMethod === 'password' ? password : undefined,
                        keyFile: keyData
                    })
                },
                30000
            );

            const data = await response.json();

            if (data.success) {
                this.connected = true;
                this.host = host;
                this.username = username;
                this.currentPath = data.homeDir || '.';

                this.updateToolbarButton();
                this.showBrowserMode();
            } else {
                this.showError(data.error || 'Connection failed');
            }
        } catch (error) {
            this.showError(error.message || 'Connection failed');
        } finally {
            btn.disabled = false;
            btn.innerHTML = '<i class="fas fa-plug"></i> Connect';
        }
    }

    async disconnect() {
        try {
            await safeFetch(
                `${this.backendUrl}/api/remote/disconnect`,
                {
                    method: 'POST',
                    headers: { 'Content-Type': 'application/json' },
                    body: JSON.stringify({ sessionId: this.sessionId })
                },
                10000
            );
        } catch (error) {
            console.error('Disconnect error:', error);
        }

        this.connected = false;
        this.host = null;
        this.username = null;
        this.currentPath = '.';
        this.remoteFiles = [];

        this.updateToolbarButton();
        this.showConnectMode();
    }

    async refreshFiles() {
        if (!this.connected) return;

        const list = document.getElementById('remoteFilesList');
        list.innerHTML = '<div class="remote-loading"><i class="fas fa-spinner fa-spin"></i> Loading...</div>';

        try {
            const response = await safeFetch(
                `${this.backendUrl}/api/remote/list`,
                {
                    method: 'POST',
                    headers: { 'Content-Type': 'application/json' },
                    body: JSON.stringify({
                        sessionId: this.sessionId,
                        path: this.currentPath
                    })
                },
                30000
            );

            const data = await response.json();

            if (data.success) {
                this.remoteFiles = data.items;
                this.currentPath = data.path;
                document.getElementById('remoteCurrentPath').textContent = this.currentPath;
                this.renderFiles();
            } else {
                list.innerHTML = `<div class="remote-error-inline">${data.error || 'Failed to load files'}</div>`;
            }
        } catch (error) {
            list.innerHTML = `<div class="remote-error-inline">${error.message || 'Failed to load files'}</div>`;
        }
    }

    renderFiles() {
        const list = document.getElementById('remoteFilesList');

        if (this.remoteFiles.length === 0) {
            list.innerHTML = '<div class="remote-empty">No files in this directory</div>';
            return;
        }

        let html = '';

        // Filter for molecule files and directories
        const items = this.remoteFiles.filter(f => {
            if (f.isDir) return true;
            const ext = f.name.split('.').pop().toLowerCase();
            return ['xyz', 'pdb', 'mol', 'sdf', 'cif', 'mol2', 'pqr', 'gro', 'cml', 'extxyz', 'out', 'txt', 'log'].includes(ext);
        });

        items.forEach(file => {
            const icon = file.isDir ? 'fa-folder' : this.getFileIcon(file.name);
            const iconClass = file.isDir ? 'folder-icon' : 'file-icon';
            const size = file.isDir ? '' : this.formatFileSize(file.size);

            html += `
                <div class="remote-file-item ${file.isDir ? 'is-folder' : ''}"
                     onclick="window.remoteFileManager.handleItemClick('${file.path}', ${file.isDir})">
                    <i class="fas ${icon} ${iconClass}"></i>
                    <span class="remote-file-name">${file.name}</span>
                    ${size ? `<span class="remote-file-size">${size}</span>` : ''}
                    ${!file.isDir ? `
                        <button class="remote-file-action" onclick="event.stopPropagation(); window.remoteFileManager.downloadFile('${file.path}', '${file.name}')" title="Download">
                            <i class="fas fa-download"></i>
                        </button>
                    ` : ''}
                </div>
            `;
        });

        list.innerHTML = html;
    }

    handleItemClick(path, isDir) {
        if (isDir) {
            this.currentPath = path;
            this.refreshFiles();
        } else {
            this.openFile(path);
        }
    }

    navigateUp() {
        const parts = this.currentPath.split('/').filter(p => p);
        parts.pop();
        this.currentPath = parts.length > 0 ? '/' + parts.join('/') : '/';
        this.refreshFiles();
    }

    async openFile(path) {
        const list = document.getElementById('remoteFilesList');
        const originalHtml = list.innerHTML;
        list.innerHTML = '<div class="remote-loading"><i class="fas fa-spinner fa-spin"></i> Opening file...</div>';

        try {
            const response = await safeFetch(
                `${this.backendUrl}/api/remote/read`,
                {
                    method: 'POST',
                    headers: { 'Content-Type': 'application/json' },
                    body: JSON.stringify({
                        sessionId: this.sessionId,
                        path: path
                    })
                },
                30000
            );

            const data = await response.json();

            if (data.success) {
                const blob = new Blob([data.content], { type: 'text/plain' });
                const file = new File([blob], data.filename);

                if (window.main && window.main.loader) {
                    await window.main.loader.handleFile(file);
                    this.closeConnectionModal();
                }
            } else {
                this.showError(data.error || 'Failed to open file');
                list.innerHTML = originalHtml;
            }
        } catch (error) {
            this.showError(error.message || 'Failed to open file');
            list.innerHTML = originalHtml;
        }
    }

    async downloadFile(path, filename) {
        try {
            const response = await safeFetch(
                `${this.backendUrl}/api/remote/read`,
                {
                    method: 'POST',
                    headers: { 'Content-Type': 'application/json' },
                    body: JSON.stringify({
                        sessionId: this.sessionId,
                        path: path
                    })
                },
                30000
            );

            const data = await response.json();

            if (data.success) {
                const blob = new Blob([data.content], { type: 'text/plain' });
                const url = URL.createObjectURL(blob);
                const a = document.createElement('a');
                a.href = url;
                a.download = filename;
                a.click();
                URL.revokeObjectURL(url);
            } else {
                this.showError(data.error || 'Failed to download');
            }
        } catch (error) {
            this.showError(error.message || 'Failed to download');
        }
    }

    showError(message) {
        const errorDiv = document.getElementById('remoteError');
        errorDiv.textContent = message;
        errorDiv.style.display = 'block';
        setTimeout(() => { errorDiv.style.display = 'none'; }, 5000);
    }

    getFileIcon(filename) {
        const ext = filename.split('.').pop().toLowerCase();
        const iconMap = {
            'xyz': 'fa-atom',
            'pdb': 'fa-dna',
            'mol': 'fa-flask',
            'sdf': 'fa-flask',
            'cif': 'fa-cube',
            'mol2': 'fa-flask',
            'txt': 'fa-file-alt',
            'log': 'fa-file-alt',
            'out': 'fa-file-alt'
        };
        return iconMap[ext] || 'fa-file';
    }

    formatFileSize(bytes) {
        if (bytes === 0) return '0 B';
        const k = 1024;
        const sizes = ['B', 'KB', 'MB', 'GB'];
        const i = Math.floor(Math.log(bytes) / Math.log(k));
        return (bytes / Math.pow(k, i)).toFixed(1) + ' ' + sizes[i];
    }

    readFileAsText(file) {
        return new Promise((resolve, reject) => {
            const reader = new FileReader();
            reader.onload = e => resolve(e.target.result);
            reader.onerror = reject;
            reader.readAsText(file);
        });
    }
}

// Initialize after a short delay to ensure file explorer is ready
function initRemoteFileManager() {
    // Wait for file explorer to be ready
    const checkAndInit = () => {
        const saveBtn = document.getElementById('saveLocalBtn');
        if (saveBtn) {
            window.remoteFileManager = new RemoteFileManager();
            console.log('RemoteFileManager initialized');
        } else {
            // Retry after short delay
            setTimeout(checkAndInit, 200);
        }
    };

    if (document.readyState === 'loading') {
        document.addEventListener('DOMContentLoaded', checkAndInit);
    } else {
        checkAndInit();
    }
}

initRemoteFileManager();
