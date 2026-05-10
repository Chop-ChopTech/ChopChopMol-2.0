/**
 * RemoteFileManager - SSH/SFTP remote file access
 * Creates a separate REMOTE section in the file explorer (alongside LOCAL)
 */

import { safeFetch, getBackendUrl, getBackendUrlSync, onBackendUrlOverride, getAuthHeaders } from './utils/apiUtils.js';

const MOLECULE_EXTENSIONS = ['xyz', 'pdb', 'mol', 'sdf', 'cif', 'mol2', 'pqr', 'gro', 'cml', 'extxyz', 'out'];

export class RemoteFileManager {
    constructor() {
        this.sessionId = this.generateSessionId();
        this.connected = false;
        this.homePath = '.';
        this.host = null;
        this.username = null;
        this.backendUrl = getBackendUrlSync();
        // Update when async resolution completes
        getBackendUrl().then(url => { this.backendUrl = url; });
        onBackendUrlOverride(url => { this.backendUrl = url; });

        this.init();
    }

    generateSessionId() {
        return 'remote-' + Math.random().toString(36).substr(2, 9) + '-' + Date.now();
    }

    init() {
        this.createRemoteSection();
        this.createConnectionModal();
        this.addToolbarButton();
    }

    createRemoteSection() {
        // Create remote section (hidden by default) - insert after local section
        const localSection = document.querySelector('.local-section');
        if (!localSection) {
            setTimeout(() => this.createRemoteSection(), 100);
            return;
        }

        // Check if already created
        if (document.getElementById('remoteSection')) return;

        // Create the divider first (between local and remote)
        const divider = document.createElement('div');
        divider.id = 'remoteDivider';
        divider.className = 'explorer-divider explorer-divider-resizer';
        divider.style.display = 'none'; // Hidden until connected

        const remoteSection = document.createElement('div');
        remoteSection.id = 'remoteSection';
        remoteSection.className = 'explorer-section remote-section';
        remoteSection.style.display = 'none'; // Hidden until connected
        remoteSection.innerHTML = `
            <div class="section-header" style="gap: 6px; display: flex; flex-direction: row; align-items: center;">
                <span id="remoteHeaderTitle" style="font-weight: bold"><i class="fa-solid fa-server"></i> REMOTE</span>
            </div>
            <div class="explorer-section" style="display: flex; flex-direction: row; padding: 6px; gap: 6px; border-bottom: 1px solid rgba(255, 255, 255, 0.1);">
                <button id="remoteRefreshBtn" class="local-toolbar-button" title="Refresh Remote Files">
                    <i class="fas fa-sync-alt"></i>
                </button>
                <button id="remoteHomeBtn" class="local-toolbar-button" title="Go to Home Directory">
                    <i class="fas fa-home"></i>
                </button>
                <button id="remoteDisconnectBtn" class="local-toolbar-button" title="Disconnect from Remote Host" style="margin-left: auto;">
                    <i class="fas fa-plug" style="color: #f87171;"></i>
                </button>
            </div>
            <div id="remoteFileTree" class="file-tree">
                <div class="file-tree-empty">
                    <i class="fas fa-server"></i>
                    <p>Loading remote files...</p>
                </div>
            </div>
        `;

        // Insert divider and remote section after local section
        localSection.parentNode.insertBefore(divider, localSection.nextSibling);
        divider.parentNode.insertBefore(remoteSection, divider.nextSibling);

        // Add event listeners for remote toolbar buttons
        document.getElementById('remoteRefreshBtn').addEventListener('click', () => this.refreshFiles());
        document.getElementById('remoteHomeBtn').addEventListener('click', () => {
            this.buildRemoteTree(this.homePath, document.getElementById('remoteFileTree'));
        });
        document.getElementById('remoteDisconnectBtn').addEventListener('click', () => this.disconnect());

        // Setup divider resize functionality
        this.setupDividerResize(divider, localSection, remoteSection);
    }

    setupDividerResize(divider, localSection, remoteSection) {
        let startY, startLocalHeight, didDrag;

        divider.addEventListener('mousedown', (e) => {
            e.preventDefault();
            startY = e.clientY;
            startLocalHeight = localSection.offsetHeight;
            didDrag = false;
            divider.classList.add('active');
            document.addEventListener('mousemove', resizeSections);
            document.addEventListener('mouseup', stopResizeSections);
        });

        const resizeSections = (e) => {
            didDrag = true;
            localSection.classList.add('resizing');
            remoteSection.classList.add('resizing');
            const diff = e.clientY - startY;
            const parentHeight = localSection.parentElement.offsetHeight;
            const newHeight = Math.max(50, Math.min(parentHeight - 150, startLocalHeight + diff));
            localSection.style.height = newHeight + 'px';
            localSection.style.flex = 'none';
        };

        const stopResizeSections = () => {
            localSection.classList.remove('resizing');
            remoteSection.classList.remove('resizing');
            divider.classList.remove('active');
            document.removeEventListener('mousemove', resizeSections);
            document.removeEventListener('mouseup', stopResizeSections);

            // Click without drag = collapse local section to header
            if (!didDrag) {
                const header = localSection.querySelector('.section-header');
                if (header) {
                    localSection.style.height = (header.offsetHeight + 40) + 'px'; // header + toolbar
                    localSection.style.flex = 'none';
                }
            }
        };
    }

    addToolbarButton() {
        const saveBtn = document.getElementById('saveLocalBtn');
        if (!saveBtn) {
            setTimeout(() => this.addToolbarButton(), 100);
            return;
        }

        const toolbar = saveBtn.parentElement;
        if (!toolbar) return;

        if (document.getElementById('remoteConnectBtn')) return;

        const remoteBtn = document.createElement('button');
        remoteBtn.id = 'remoteConnectBtn';
        remoteBtn.className = 'local-toolbar-button remote-connect-btn';
        remoteBtn.title = 'Connect to Remote Host (SSH/SFTP)';
        remoteBtn.innerHTML = '<i class="fas fa-plug"></i>';

        remoteBtn.addEventListener('click', () => {
            this.showConnectionModal();
        });

        toolbar.insertBefore(remoteBtn, saveBtn);
        this.updateToolbarButton();
    }

    updateToolbarButton() {
        const btn = document.getElementById('remoteConnectBtn');
        if (!btn) return;

        if (this.connected) {
            btn.classList.add('connected');
            btn.title = `Connected to ${this.username}@${this.host} - Click to manage`;
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
                    <button class="remote-modal-close" aria-label="Close remote connection dialog" title="Close" onclick="window.remoteFileManager.closeConnectionModal()">
                        <i class="fas fa-times" aria-hidden="true"></i>
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
            document.getElementById('remoteStatusBanner').style.display = 'flex';
            document.getElementById('remoteStatusText').textContent = `${this.username}@${this.host}`;
            document.getElementById('remoteConnectionForm').style.display = 'none';
            document.getElementById('remoteModalFooter').style.display = 'none';
        } else {
            document.getElementById('remoteStatusBanner').style.display = 'none';
            document.getElementById('remoteConnectionForm').style.display = 'block';
            document.getElementById('remoteModalFooter').style.display = 'flex';
            setTimeout(() => document.getElementById('remoteHost').focus(), 100);
        }
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
                    headers: { 'Content-Type': 'application/json', ...getAuthHeaders() },
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
                this.homePath = data.homeDir || '.';

                // Update UI
                this.updateToolbarButton();
                this.closeConnectionModal();

                // Show remote section and update header
                this.showRemoteSection();

                // Load remote files
                this.refreshFiles();
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
                    headers: { 'Content-Type': 'application/json', ...getAuthHeaders() },
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

        // Update UI
        this.updateToolbarButton();
        this.closeConnectionModal();

        // Hide remote section
        this.hideRemoteSection();
    }

    showRemoteSection() {
        const remoteSection = document.getElementById('remoteSection');
        const divider = document.getElementById('remoteDivider');

        if (remoteSection) {
            remoteSection.style.display = 'block';
            // Update header with host info
            const header = document.getElementById('remoteHeaderTitle');
            if (header) {
                header.innerHTML = `<i class="fa-solid fa-server"></i> REMOTE: ${this.host}`;
            }
        }
        if (divider) {
            divider.style.display = 'block';
        }
    }

    hideRemoteSection() {
        const remoteSection = document.getElementById('remoteSection');
        const divider = document.getElementById('remoteDivider');

        if (remoteSection) {
            remoteSection.style.display = 'none';
        }
        if (divider) {
            divider.style.display = 'none';
        }

        // Reset local section height when remote is hidden
        const localSection = document.querySelector('.local-section');
        if (localSection) {
            localSection.style.height = '';
            localSection.style.flex = '';
        }
    }

    async refreshFiles() {
        if (!this.connected) return;

        const fileTree = document.getElementById('remoteFileTree');
        fileTree.innerHTML = '<div class="file-tree-empty"><i class="fas fa-spinner fa-spin"></i> Loading...</div>';

        await this.buildRemoteTree(this.homePath, fileTree);
    }

    async buildRemoteTree(path, container) {
        try {
            const response = await safeFetch(
                `${this.backendUrl}/api/remote/list`,
                {
                    method: 'POST',
                    headers: { 'Content-Type': 'application/json', ...getAuthHeaders() },
                    body: JSON.stringify({
                        sessionId: this.sessionId,
                        path: path
                    })
                },
                30000
            );

            const data = await response.json();

            if (!data.success) {
                container.innerHTML = `<div class="file-tree-empty"><i class="fas fa-exclamation-triangle"></i> ${data.error || 'Failed to load'}</div>`;
                return;
            }

            container.innerHTML = '';

            const items = data.items;

            // Sort: folders first, then files alphabetically
            items.sort((a, b) => {
                if (a.isDir !== b.isDir) return a.isDir ? -1 : 1;
                return a.name.localeCompare(b.name);
            });

            for (const entry of items) {
                // Skip hidden files
                if (entry.name.startsWith('.')) continue;

                const fullPath = entry.path;

                if (entry.isDir) {
                    // Create folder element - exactly like local
                    const folderEl = document.createElement('div');
                    folderEl.className = 'folder-item';
                    folderEl.dataset.path = fullPath;
                    folderEl.innerHTML = `
                        <i class="fas fa-chevron-right chevron"></i>
                        <span>${entry.name}</span>
                    `;

                    const contentsEl = document.createElement('div');
                    contentsEl.className = 'folder-contents';

                    // Click to expand/collapse - lazy load contents
                    folderEl.addEventListener('click', async (e) => {
                        e.stopPropagation();
                        folderEl.classList.toggle('expanded');

                        // Lazy load contents on first expand
                        if (folderEl.classList.contains('expanded') && contentsEl.children.length === 0) {
                            contentsEl.innerHTML = '<div class="file-tree-empty" style="padding: 8px 16px; font-size: 11px;"><i class="fas fa-spinner fa-spin"></i> Loading...</div>';
                            await this.buildRemoteTree(fullPath, contentsEl);
                        }
                    });

                    container.appendChild(folderEl);
                    container.appendChild(contentsEl);
                } else {
                    // Filter for molecule files only
                    const ext = entry.name.split('.').pop().toLowerCase();
                    if (!MOLECULE_EXTENSIONS.includes(ext) && !['txt', 'log', 'json'].includes(ext)) {
                        continue;
                    }

                    // Create file element - exactly like local
                    const fileEl = document.createElement('div');
                    fileEl.className = 'file-item';
                    fileEl.dataset.path = fullPath;

                    const iconClass = this.getFileIcon(ext);

                    fileEl.innerHTML = `
                        <i class="${iconClass}"></i>
                        <span>${entry.name}</span>
                    `;

                    // Click to open file
                    fileEl.addEventListener('click', (e) => {
                        // Clear other selections in remote tree
                        document.querySelectorAll('#remoteFileTree .file-item.active').forEach(el => el.classList.remove('active'));
                        fileEl.classList.add('active');
                        this.openRemoteFile(fullPath, entry.name);
                    });

                    container.appendChild(fileEl);
                }
            }

            // Show empty message if no items
            if (container.children.length === 0) {
                container.innerHTML = '<div class="file-tree-empty" style="padding: 8px 16px; font-size: 11px;">Empty folder</div>';
            }

        } catch (error) {
            container.innerHTML = `<div class="file-tree-empty"><i class="fas fa-exclamation-triangle"></i> ${error.message || 'Failed to load'}</div>`;
        }
    }

    async openRemoteFile(path, filename) {
        // Find and show loading state on the clicked file
        const fileEl = document.querySelector(`#remoteFileTree .file-item[data-path="${CSS.escape(path)}"]`);
        if (fileEl) {
            fileEl.classList.add('loading');
        }

        try {
            const response = await safeFetch(
                `${this.backendUrl}/api/remote/read`,
                {
                    method: 'POST',
                    headers: { 'Content-Type': 'application/json', ...getAuthHeaders() },
                    body: JSON.stringify({
                        sessionId: this.sessionId,
                        path: path
                    })
                },
                30000
            );

            const data = await response.json();

            if (data.success) {
                // Create a File object and load it using the existing loader
                const blob = new Blob([data.content], { type: 'text/plain' });
                const file = new File([blob], data.filename);

                if (window.main && window.main.loader) {
                    await window.main.loader.handleFile({ target: { files: [file] } }, false);
                    window.showSaveNotification?.(`Loaded: ${filename}`);
                }
            } else {
                window.showSaveNotification?.(`Error: ${data.error || 'Failed to open file'}`);
            }
        } catch (error) {
            window.showSaveNotification?.(`Error: ${error.message || 'Failed to open file'}`);
        } finally {
            if (fileEl) {
                fileEl.classList.remove('loading');
            }
        }
    }

    showError(message) {
        const errorDiv = document.getElementById('remoteError');
        errorDiv.textContent = message;
        errorDiv.style.display = 'block';
        setTimeout(() => { errorDiv.style.display = 'none'; }, 5000);
    }

    getFileIcon(ext) {
        // Use exact same icons as FileExplorer.getFileIcon
        if (MOLECULE_EXTENSIONS.includes(ext)) {
            if (ext === 'pdb') return 'fas fa-dna file-pdb';
            if (ext === 'xyz') return 'fas fa-atom file-xyz';
            return 'fas fa-atom file-mol';
        }
        if (ext === 'json') return 'fas fa-code file-json';
        if (['js', 'py', 'html', 'css', 'txt', 'log'].includes(ext)) return 'fas fa-file-code file-text';
        return 'fas fa-file file-text';
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

// Initialize after DOM is ready
function initRemoteFileManager() {
    const checkAndInit = () => {
        const saveBtn = document.getElementById('saveLocalBtn');
        if (saveBtn) {
            window.remoteFileManager = new RemoteFileManager();
            console.log('RemoteFileManager initialized');
        } else {
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
