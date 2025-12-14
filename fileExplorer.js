// fileExplorer.js - File Explorer for ChopChopMol

const MOLECULE_EXTENSIONS = ['pdb', 'mol', 'sdf', 'xyz', 'cif', 'mmcif', 'mol2', 'pqr', 'gro', 'cml'];

class FileExplorer {
    constructor() {
        this.directoryHandle = null;
        this.fileHandles = new Map(); // path -> FileSystemFileHandle
        this.aiCreatedFiles = new Set(); // tracks files created by AI
        this.currentFile = null;
        this.unsavedChanges = false;
        this.dbName = 'ChopChopMolDB';
        this.storeName = 'directoryHandles';
        this.activeTab = 'local';
        this.cloudMolecules = [];
        this.init();
    }

    init() {
        // DOM elements
        this.panel = document.getElementById('fileExplorerPanel');
        this.fileTree = document.getElementById('fileTree');
        this.textEditor = document.getElementById('textEditorModal');
        this.textContent = document.getElementById('textEditorContent');
        this.textFilename = document.getElementById('textEditorFilename');
        this.textStatus = document.getElementById('textEditorStatus');

        // Event listeners
        document.getElementById('toggleFileExplorer')?.addEventListener('click', () => this.toggle());
        document.getElementById('openFileBtn')?.addEventListener('click', () => document.getElementById('fileInput')?.click());
        document.getElementById('openFolderBtn')?.addEventListener('click', () => this.openFolder());
        document.getElementById('openFolderPrompt')?.addEventListener('click', () => this.openFolder());
        document.getElementById('newFileBtn')?.addEventListener('click', () => this.promptNewFile());
        document.getElementById('refreshFolderBtn')?.addEventListener('click', () => this.refresh());
        document.getElementById('closeExplorerBtn')?.addEventListener('click', () => this.close());
        document.getElementById('saveTextFileBtn')?.addEventListener('click', () => this.saveCurrentTextFile());
        document.getElementById('closeTextEditorBtn')?.addEventListener('click', () => this.closeTextEditor());
        document.getElementById('localTab')?.addEventListener('click', () => this.switchTab('local'));
        document.getElementById('cloudTab')?.addEventListener('click', () => this.switchTab('cloud'));
        // Track unsaved changes
        this.textContent?.addEventListener('input', () => {
            this.unsavedChanges = true;
            this.textStatus.textContent = 'Modified';
        });

        // Keyboard shortcuts
        document.addEventListener('keydown', (e) => {
            if ((e.ctrlKey || e.metaKey) && e.key === 's' && this.textEditor?.classList.contains('open')) {
                e.preventDefault();
                this.saveCurrentTextFile();
            }
        });

        // Try to restore previous folder on load
        this.tryRestorePreviousFolder();
    }

    switchTab(tab) {
        this.activeTab = tab;
        document.getElementById('localTab')?.classList.toggle('active', tab === 'local');
        document.getElementById('cloudTab')?.classList.toggle('active', tab === 'cloud');
        document.getElementById('openFolderBtn').style.display = tab === 'local' ? '' : 'none';
        document.getElementById('newFileBtn').style.display = tab === 'local' ? '' : 'none';
        tab === 'local' ? this.showLocalFiles() : this.showCloudFiles();
    }

    showLocalFiles() {
        if (this.directoryHandle) {
            this.refresh();
        } else {
            this.fileTree.innerHTML = `<div class="file-tree-empty"><i class="fas fa-folder-open"></i><p>No folder open</p><button id="openFolderPrompt" class="fancy-button" style="background-color: #006dea;">Open Folder</button></div>`;
            document.getElementById('openFolderPrompt')?.addEventListener('click', () => this.openFolder());
        }
    }

    async showCloudFiles() {
        this.fileTree.innerHTML = `<div class="file-tree-empty"><i class="fas fa-spinner fa-spin"></i><p>Loading...</p></div>`;
        if (!window.currentUser) {
            this.fileTree.innerHTML = `<div class="file-tree-empty"><i class="fas fa-cloud"></i><p>Sign in to access cloud storage</p></div>`;
            return;
        }
        try {
            this.cloudMolecules = await window.loadMoleculesList();
            if (!this.cloudMolecules.length) {
                this.fileTree.innerHTML = `<div class="file-tree-empty"><i class="fas fa-cloud"></i><p>No saved molecules</p></div>`;
                return;
            }
            this.fileTree.innerHTML = '';
            for (const mol of this.cloudMolecules) {
                const el = document.createElement('div');
                el.className = 'file-item cloud-file';
                el.dataset.id = mol.id;
                const date = mol.timestamp?.toDate?.()?.toLocaleDateString() || '';
                el.innerHTML = `<i class="fas fa-atom file-mol"></i><div class="cloud-file-info"><span class="cloud-file-name">${mol.name}</span><span class="cloud-file-meta">${mol.atomCount || '?'} atoms • ${date}</span></div><div class="cloud-file-actions">${this.directoryHandle ? `<button class="cloud-action-btn import-btn" title="Import to local"><i class="fas fa-download"></i></button>` : ''}<button class="cloud-action-btn delete-btn" title="Delete"><i class="fas fa-trash"></i></button></div>`;
                el.addEventListener('click', (e) => { if (!e.target.closest('.cloud-action-btn')) window.loadMolecule?.(mol); });
                el.querySelector('.import-btn')?.addEventListener('click', (e) => { e.stopPropagation(); this.importToLocal(mol); });
                el.querySelector('.delete-btn')?.addEventListener('click', (e) => { e.stopPropagation(); if (confirm(`Delete "${mol.name}"?`)) window.deleteMolecule?.(mol.id).then(() => this.showCloudFiles()); });
                this.fileTree.appendChild(el);
            }
        } catch (err) {
            this.fileTree.innerHTML = `<div class="file-tree-empty"><i class="fas fa-exclamation-triangle"></i><p>Error loading</p></div>`;
        }
    }

    async importToLocal(mol) {
        if (!this.directoryHandle) return alert('Open a local folder first');
        const data = mol.data?.molecule || mol.data;
        if (!data?.atoms) return alert('Invalid molecule data');
        let xyz = `${data.numAtoms}\n${mol.name}\n`;
        for (const a of data.atoms) xyz += `${a.element} ${a.x.toFixed(6)} ${a.y.toFixed(6)} ${a.z.toFixed(6)}\n`;
        const fh = await this.directoryHandle.getFileHandle(`${mol.name.replace(/[^a-zA-Z0-9_-]/g, '_')}.xyz`, { create: true });
        const w = await fh.createWritable(); await w.write(xyz); await w.close();
        window.showSaveNotification?.(`Imported to local folder`);
    }

    toggle() {
        this.panel?.classList.toggle('open');
        window.updateRendererSize?.();
    }

    close() {
        this.panel?.classList.remove('open');
        window.updateRendererSize?.();
    }

    async openFolder() {
        try {
            this.directoryHandle = await window.showDirectoryPicker({
                mode: 'readwrite'
            });

            const permission = await this.directoryHandle.queryPermission({ mode: 'readwrite' });
            if (permission !== 'granted') {
                const requested = await this.directoryHandle.requestPermission({ mode: 'readwrite' });
                if (requested !== 'granted') {
                    alert('Write permission is required to save files');
                    this.directoryHandle = null;
                    return;
                }
            }

            // Save handle to IndexedDB for next session
            await this.saveDirectoryHandle(this.directoryHandle);

            document.getElementById('newFileBtn').disabled = false;
            document.getElementById('refreshFolderBtn').disabled = false;
            await this.refresh();
        } catch (err) {
            if (err.name !== 'AbortError') {
                console.error('Error opening folder:', err);
                alert('Error opening folder: ' + err.message);
            }
        }
    }

    async refresh() {
        if (this.activeTab === 'cloud') { this.showCloudFiles(); return; }
        if (!this.directoryHandle) return;

        this.fileHandles.clear();
        this.fileTree.innerHTML = '';

        await this.buildTree(this.directoryHandle, this.fileTree, '');
    }

    async buildTree(dirHandle, container, path) {
        const entries = [];

        for await (const entry of dirHandle.values()) {
            entries.push(entry);
        }

        // Sort: folders first, then files alphabetically
        entries.sort((a, b) => {
            if (a.kind !== b.kind) return a.kind === 'directory' ? -1 : 1;
            return a.name.localeCompare(b.name);
        });

        for (const entry of entries) {
            const fullPath = path ? `${path}/${entry.name}` : entry.name;

            if (entry.kind === 'directory') {
                // Create folder element
                const folderEl = document.createElement('div');
                folderEl.className = 'folder-item';
                folderEl.innerHTML = `
                    <i class="fas fa-chevron-right chevron"></i>
                    <i class="fas fa-folder folder-icon"></i>
                    <span>${entry.name}</span>
                `;

                const contentsEl = document.createElement('div');
                contentsEl.className = 'folder-contents';

                folderEl.addEventListener('click', async (e) => {
                    e.stopPropagation();
                    folderEl.classList.toggle('expanded');

                    // Lazy load contents
                    if (folderEl.classList.contains('expanded') && contentsEl.children.length === 0) {
                        await this.buildTree(entry, contentsEl, fullPath);
                    }
                });

                container.appendChild(folderEl);
                container.appendChild(contentsEl);
            } else {
                // Store file handle
                this.fileHandles.set(fullPath, entry);

                // Create file element
                const fileEl = document.createElement('div');
                fileEl.className = 'file-item';
                fileEl.dataset.path = fullPath;

                if (this.aiCreatedFiles.has(fullPath)) {
                    fileEl.classList.add('ai-created');
                }

                const ext = entry.name.split('.').pop().toLowerCase();
                const iconClass = this.getFileIcon(ext);

                fileEl.innerHTML = `
                    <i class="${iconClass}"></i>
                    <span>${entry.name}</span>
                `;

                fileEl.addEventListener('click', () => this.openFile(fullPath));
                container.appendChild(fileEl);
            }
        }
    }

    getFileIcon(ext) {
        if (MOLECULE_EXTENSIONS.includes(ext)) {
            if (ext === 'pdb') return 'fas fa-dna file-pdb';
            if (ext === 'xyz') return 'fas fa-atom file-xyz';
            return 'fas fa-atom file-mol';
        }
        if (ext === 'json') return 'fas fa-code file-json';
        if (['js', 'py', 'html', 'css'].includes(ext)) return 'fas fa-file-code file-text';
        return 'fas fa-file file-text';
    }

    async openFile(path) {
        const handle = this.fileHandles.get(path);
        if (!handle) return;

        // Highlight active file
        document.querySelectorAll('.file-item').forEach(el => el.classList.remove('active'));
        document.querySelector(`.file-item[data-path="${path}"]`)?.classList.add('active');

        const file = await handle.getFile();
        const ext = file.name.split('.').pop().toLowerCase();

        if (MOLECULE_EXTENSIONS.includes(ext)) {
            // Load as molecule
            await this.loadMoleculeFile(file);
        } else {
            // Open in text editor
            await this.openTextEditor(path, file);
        }
    }

    async loadMoleculeFile(file) {
        // Create a mock event to use existing FileHandler
        const mockEvent = {
            target: { files: [file] }
        };
        window.main?.loader?.handleFile(mockEvent, false);
    }

    async openTextEditor(path, file) {
        this.currentFile = { path, handle: this.fileHandles.get(path) };
        this.textFilename.textContent = path;
        this.textContent.value = await file.text();
        this.textStatus.textContent = 'Ready';
        this.unsavedChanges = false;
        this.textEditor.classList.add('open');
    }

    closeTextEditor() {
        if (this.unsavedChanges) {
            if (!confirm('You have unsaved changes. Close anyway?')) return;
        }
        this.textEditor.classList.remove('open');
        this.currentFile = null;
        this.unsavedChanges = false;
    }

    async saveCurrentTextFile() {
        if (!this.currentFile) return;

        try {
            const writable = await this.currentFile.handle.createWritable();
            await writable.write(this.textContent.value);
            await writable.close();

            this.unsavedChanges = false;
            this.textStatus.textContent = 'Saved';
            setTimeout(() => {
                if (!this.unsavedChanges) this.textStatus.textContent = 'Ready';
            }, 2000);
        } catch (err) {
            console.error('Error saving file:', err);
            this.textStatus.textContent = 'Error saving!';
        }
    }

    async promptNewFile() {
        const name = prompt('Enter filename (with extension):');
        if (!name) return;
        await this.createFile(name, '');
    }

    // === AI Integration Methods ===

    async createFile(filename, content) {
        if (!this.directoryHandle) {
            return { success: false, error: 'No folder open. Please open a folder first.' };
        }

        try {
            // Verify we still have permission
            const permission = await this.directoryHandle.queryPermission({ mode: 'readwrite' });
            if (permission !== 'granted') {
                const requested = await this.directoryHandle.requestPermission({ mode: 'readwrite' });
                if (requested !== 'granted') {
                    return { success: false, error: 'Write permission denied' };
                }
            }

            // Create the file in the directory
            const fileHandle = await this.directoryHandle.getFileHandle(filename, { create: true });

            // Write content to the file
            const writable = await fileHandle.createWritable();
            await writable.write(content);
            await writable.close();

            // Track as AI-created and refresh tree
            this.aiCreatedFiles.add(filename);
            this.fileHandles.set(filename, fileHandle);
            await this.refresh();

            return { success: true, path: filename, message: `Created ${filename} in folder` };
        } catch (err) {
            console.error('Error creating file:', err);
            return { success: false, error: err.message };
        }
    }

    async editFile(filename, content) {
        // AI can only edit files it created
        if (!this.aiCreatedFiles.has(filename)) {
            return { success: false, error: 'AI can only edit files it created' };
        }

        if (!this.directoryHandle) {
            return { success: false, error: 'No folder open' };
        }

        try {
            // Get the file handle from the directory
            const fileHandle = await this.directoryHandle.getFileHandle(filename);

            // Write new content
            const writable = await fileHandle.createWritable();
            await writable.write(content);
            await writable.close();

            return { success: true, message: `Updated ${filename}` };
        } catch (err) {
            console.error('Error editing file:', err);
            return { success: false, error: err.message };
        }
    }

    async readFile(filename) {
        const handle = this.fileHandles.get(filename);
        if (!handle) {
            return { success: false, error: 'File not found' };
        }

        try {
            const file = await handle.getFile();
            const content = await file.text();
            return { success: true, content };
        } catch (err) {
            return { success: false, error: err.message };
        }
    }

    listFiles() {
        return {
            success: true,
            files: Array.from(this.fileHandles.keys()),
            aiCreatedFiles: Array.from(this.aiCreatedFiles)
        };
    }

    isAIEditable(filename) {
        return this.aiCreatedFiles.has(filename);
    }

    // === IndexedDB methods for persisting directory handle ===

    async openDB() {
        return new Promise((resolve, reject) => {
            const request = indexedDB.open(this.dbName, 1);
            request.onerror = () => reject(request.error);
            request.onsuccess = () => resolve(request.result);
            request.onupgradeneeded = (e) => {
                e.target.result.createObjectStore(this.storeName);
            };
        });
    }

    async saveDirectoryHandle(handle) {
        try {
            const db = await this.openDB();
            const tx = db.transaction(this.storeName, 'readwrite');
            tx.objectStore(this.storeName).put(handle, 'lastDirectory');
            await new Promise((resolve, reject) => {
                tx.oncomplete = resolve;
                tx.onerror = () => reject(tx.error);
            });
            db.close();
        } catch (err) {
            console.error('Error saving directory handle:', err);
        }
    }

    async getSavedDirectoryHandle() {
        try {
            const db = await this.openDB();
            const tx = db.transaction(this.storeName, 'readonly');
            const request = tx.objectStore(this.storeName).get('lastDirectory');
            const handle = await new Promise((resolve, reject) => {
                request.onsuccess = () => resolve(request.result);
                request.onerror = () => reject(request.error);
            });
            db.close();
            return handle;
        } catch (err) {
            console.error('Error getting saved directory handle:', err);
            return null;
        }
    }

    async tryRestorePreviousFolder() {
        const handle = await this.getSavedDirectoryHandle();
        if (!handle) return;

        try {
            const permission = await handle.queryPermission({ mode: 'readwrite' });

            if (permission === 'granted') {
                this.directoryHandle = handle;
                document.getElementById('newFileBtn').disabled = false;
                document.getElementById('refreshFolderBtn').disabled = false;
                await this.refresh();
            } else {
                this.showReconnectPrompt(handle);
            }
        } catch (err) {
            console.error('Error restoring folder:', err);
        }
    }

    showReconnectPrompt(handle) {
        this.fileTree.innerHTML = `
            <div class="file-tree-empty">
                <i class="fas fa-folder"></i>
                <p>Previous: ${handle.name}</p>
                <button id="reconnectFolderBtn" class="fancy-button" style="background-color: #00aa55;">Reconnect</button>
                <button id="openNewFolderBtn" class="fancy-button" style="background-color: #006dea; margin-top: 8px;">Open Different</button>
            </div>
        `;

        document.getElementById('reconnectFolderBtn')?.addEventListener('click', async () => {
            try {
                const permission = await handle.requestPermission({ mode: 'readwrite' });
                if (permission === 'granted') {
                    this.directoryHandle = handle;
                    document.getElementById('newFileBtn').disabled = false;
                    document.getElementById('refreshFolderBtn').disabled = false;
                    await this.refresh();
                }
            } catch (err) {
                console.error('Error reconnecting:', err);
            }
        });

        document.getElementById('openNewFolderBtn')?.addEventListener('click', () => this.openFolder());
    }
}

// Initialize and export
window.fileExplorer = new FileExplorer();