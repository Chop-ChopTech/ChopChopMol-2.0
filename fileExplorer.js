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
        document.getElementById('openFolderBtn')?.addEventListener('click', () => this.openFolder());
        document.getElementById('openFolderPrompt')?.addEventListener('click', () => this.openFolder());
        document.getElementById('refreshFolderBtn')?.addEventListener('click', () => this.refresh());
        document.getElementById('fileSortSelect')?.addEventListener('change', () => {
            this.refresh();
            this.loadCloudMolecules();
        });
        document.getElementById('saveTextFileBtn')?.addEventListener('click', () => this.saveCurrentTextFile());
        document.getElementById('closeTextEditorBtn')?.addEventListener('click', () => this.closeTextEditor());
        document.getElementById('saveLocalBtn')?.addEventListener('click', () => this.saveToLocal());
        // File search filter
        document.getElementById('fileSearchInput')?.addEventListener('input', (e) => {
            this.filterFiles(e.target.value.toLowerCase());
        });

        // Cloud save
        const cloudInput = document.getElementById('cloudSaveInput');
        const cloudBtn = document.getElementById('cloudSaveBtn');

        cloudBtn?.addEventListener('click', () => {
            if (cloudInput.classList.contains('visible')) {
                this.saveToCloud();
            } else {
                cloudInput.classList.add('visible');
                cloudInput.focus();
            }
        });

        cloudInput?.addEventListener('keypress', (e) => {
            if (e.key === 'Enter') this.saveToCloud();
        });

        cloudInput?.addEventListener('blur', () => {
            // Hide after a short delay (allows click on save button)
            setTimeout(() => {
                if (!cloudInput.value.trim()) {
                    cloudInput.classList.remove('visible');
                }
            }, 150);
        });

        cloudInput?.addEventListener('keydown', (e) => {
            if (e.key === 'Escape') {
                cloudInput.value = '';
                cloudInput.classList.remove('visible');
            }
        });

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
        // Load cloud molecules on startup
        if (window.loadMoleculesList) {
            this.loadCloudMolecules();
        } else {
            window.addEventListener('authStateChanged', () => {
                if (window.loadMoleculesList) this.loadCloudMolecules();
            }, { once: true });
        }
        // Clear highlights when clicking outside file explorer items
        document.addEventListener('click', (e) => {
            if (!e.target.closest('.file-item') && !e.target.closest('.cloud-item')) {
                document.querySelectorAll('.file-item.active, .cloud-item.active').forEach(el => el.classList.remove('active'));
            }
        });
        // Setup drag-drop for local folder
        this.setupCloudDragDrop();
        this.setupLocalToCloudDrop();

        // Try to restore previous folder on load
        this.tryRestorePreviousFolder();
    }
    setupCloudDragDrop() {
        const fileTree = document.getElementById('fileTree');

        fileTree.addEventListener('dragover', (e) => {
            if (!this.directoryHandle) return;
            e.preventDefault();
            fileTree.classList.add('drag-over');
        });

        fileTree.addEventListener('dragleave', () => {
            fileTree.classList.remove('drag-over');
        });

        fileTree.addEventListener('drop', async (e) => {
            e.preventDefault();
            fileTree.classList.remove('drag-over');

            if (!this.directoryHandle) {
                alert('Open a local folder first');
                return;
            }

            const molData = e.dataTransfer.getData('application/json');
            if (molData) {
                const mol = JSON.parse(molData);
                await this.importAsXYZ(mol);
            }
        });
    }

    setupLocalToCloudDrop() {
        const cloudList = document.getElementById('cloudList');

        cloudList.addEventListener('dragover', (e) => {
            if (e.dataTransfer.types.includes('text/plain')) {
                e.preventDefault();
                cloudList.classList.add('drag-over');
            }
        });

        cloudList.addEventListener('dragleave', () => {
            cloudList.classList.remove('drag-over');
        });

        cloudList.addEventListener('drop', async (e) => {
            e.preventDefault();
            cloudList.classList.remove('drag-over');

            const filePath = e.dataTransfer.getData('text/plain');
            if (!filePath || !this.fileHandles.has(filePath)) return;

            const handle = this.fileHandles.get(filePath);
            const file = await handle.getFile();
            const ext = file.name.split('.').pop().toLowerCase();

            if (!MOLECULE_EXTENSIONS.includes(ext)) {
                alert('Only molecule files can be uploaded to cloud');
                return;
            }

            // Load and save to cloud
            const text = await file.text();
            const name = file.name.replace(/\.[^/.]+$/, ''); // Remove extension

            // Parse and load the molecule first
            await window.main?.loader?.handleFile({ target: { files: [file] } }, false);

            // Wait a tick for molecule to load, then save
            setTimeout(async () => {
                if (window.main?.data) {
                    const saved = await window.saveMolecule(name);
                    if (saved) {
                        this.loadCloudMolecules();
                        window.showSaveNotification?.(`Uploaded: ${name}`);
                    }
                }
            }, 100);
        });
    }

    async saveToLocal() {
        if (!this.directoryHandle) return;
        if (!window.main?.data) return window.showSaveNotification?.('No molecule loaded');

        const atoms = window.main.data?.atomData || window.main.molecule?.atomData || [];
        if (!atoms.length) return window.showSaveNotification?.('No atom data to save');

        const defaultName = (window.main.data.name || 'molecule').replace(/[^a-zA-Z0-9_-]/g, '_');

        // Create inline save dialog
        const existing = document.getElementById('localSaveDialog');
        if (existing) existing.remove();

        const dialog = document.createElement('div');
        dialog.id = 'localSaveDialog';
        dialog.className = 'local-save-dialog';
        dialog.innerHTML = `
        <input type="text" id="localSaveInput" placeholder="filename" value="${defaultName}">
        <select id="localSaveExt">
            <option value="xyz">.xyz</option>
            <option value="pdb">.pdb</option>
            <option value="mol">.mol</option>
        </select>
        <button id="localSaveConfirm" title="Save"><i class="fas fa-check"></i></button>
        <button id="localSaveCancel" title="Cancel"><i class="fas fa-times"></i></button>
    `;

        const localActions = document.querySelector('.local-actions');
        localActions.insertAdjacentElement('afterend', dialog);

        const input = document.getElementById('localSaveInput');
        const extSelect = document.getElementById('localSaveExt');
        input.focus();
        input.select();

        const cleanup = () => dialog.remove();

        const doSave = async () => {
            const name = input.value.trim();
            if (!name) return;

            const ext = extSelect.value;
            const filename = name + '.' + ext;
            let content = '';

            if (ext === 'xyz') {
                content = `${atoms.length}\n${name}\n`;
                atoms.forEach(a => {
                    content += `${a.element}  ${a.x.toFixed(6)}  ${a.y.toFixed(6)}  ${a.z.toFixed(6)}\n`;
                });
            } else if (ext === 'pdb') {
                atoms.forEach((a, i) => {
                    const serial = String(i + 1).padStart(5);
                    const atomName = a.element.padEnd(4);
                    const x = a.x.toFixed(3).padStart(8);
                    const y = a.y.toFixed(3).padStart(8);
                    const z = a.z.toFixed(3).padStart(8);
                    content += `ATOM  ${serial}  ${atomName}MOL     1    ${x}${y}${z}  1.00  0.00          ${a.element.padStart(2)}\n`;
                });
                content += 'END\n';
            } else if (ext === 'mol') {
                content = `${name}\n  ChopChopMol\n\n`;
                const bonds = window.main.molecule?.bonds || [];
                content += `${String(atoms.length).padStart(3)}${String(bonds.length).padStart(3)}  0  0  0  0  0  0  0  0999 V2000\n`;
                atoms.forEach(a => {
                    content += `${a.x.toFixed(4).padStart(10)}${a.y.toFixed(4).padStart(10)}${a.z.toFixed(4).padStart(10)} ${a.element.padEnd(3)} 0  0  0  0  0  0  0  0  0  0  0  0\n`;
                });
                bonds.forEach(b => {
                    content += `${String(b.start + 1).padStart(3)}${String(b.end + 1).padStart(3)}${String(b.order || 1).padStart(3)}  0  0  0  0\n`;
                });
                content += 'M  END\n';
            }

            try {
                const fileHandle = await this.directoryHandle.getFileHandle(filename, { create: true });
                const writable = await fileHandle.createWritable();
                await writable.write(content);
                await writable.close();
                cleanup();
                this.refresh();
                window.showSaveNotification?.(`Saved: ${filename}`);
            } catch (err) {
                window.showSaveNotification?.('Error: ' + err.message);
            }
        };

        document.getElementById('localSaveConfirm').addEventListener('click', doSave);
        document.getElementById('localSaveCancel').addEventListener('click', cleanup);
        input.addEventListener('keydown', (e) => {
            if (e.key === 'Enter') doSave();
            if (e.key === 'Escape') cleanup();
        });
    }

    async renameFile(path) {
        const handle = this.fileHandles.get(path);
        if (!handle) return;

        const oldName = path.split('/').pop();
        const fileItem = document.querySelector(`.file-item[data-path="${path}"]`);
        if (!fileItem) return;

        const originalHTML = fileItem.innerHTML;
        fileItem.innerHTML = `
        <input type="text" class="rename-input" value="${oldName}">
        <button class="rename-confirm" title="Confirm"><i class="fas fa-check"></i></button>
        <button class="rename-cancel" title="Cancel"><i class="fas fa-times"></i></button>
    `;

        const input = fileItem.querySelector('.rename-input');
        input.focus();
        const dotIndex = oldName.lastIndexOf('.');
        input.setSelectionRange(0, dotIndex > 0 ? dotIndex : oldName.length);

        const cleanup = () => { fileItem.innerHTML = originalHTML; };

        const doRename = async () => {
            const newName = input.value.trim();
            if (!newName || newName === oldName) return cleanup();

            try {
                const file = await handle.getFile();
                const content = await file.text();

                const newHandle = await this.directoryHandle.getFileHandle(newName, { create: true });
                const writable = await newHandle.createWritable();
                await writable.write(content);
                await writable.close();

                await this.directoryHandle.removeEntry(oldName);

                this.fileHandles.delete(path);
                this.fileHandles.set(newName, newHandle);
                if (this.aiCreatedFiles.has(oldName)) {
                    this.aiCreatedFiles.delete(oldName);
                    this.aiCreatedFiles.add(newName);
                }

                this.refresh();
                window.showSaveNotification?.(`Renamed to: ${newName}`);
            } catch (err) {
                window.showSaveNotification?.('Error: ' + err.message);
                cleanup();
            }
        };

        fileItem.querySelector('.rename-confirm').addEventListener('click', doRename);
        fileItem.querySelector('.rename-cancel').addEventListener('click', cleanup);
        input.addEventListener('keydown', (e) => {
            if (e.key === 'Enter') doRename();
            if (e.key === 'Escape') cleanup();
        });
        input.addEventListener('blur', (e) => {
            if (!e.relatedTarget?.closest('.file-item')) cleanup();
        });
    }
    async deleteFile(path) {
        const name = path.split('/').pop();
        const fileItem = document.querySelector(`.file-item[data-path="${path}"]`);
        if (!fileItem) return;

        const originalHTML = fileItem.innerHTML;
        fileItem.innerHTML = `
        <span class="delete-prompt">Delete "${name}"?</span>
        <button class="delete-confirm" title="Yes"><i class="fas fa-check"></i></button>
        <button class="delete-cancel" title="No"><i class="fas fa-times"></i></button>
    `;

        const cleanup = () => { fileItem.innerHTML = originalHTML; };

        const doDelete = async () => {
            try {
                await this.directoryHandle.removeEntry(name);
                this.fileHandles.delete(path);
                this.aiCreatedFiles.delete(name);
                this.refresh();
                window.showSaveNotification?.(`Deleted: ${name}`);
            } catch (err) {
                window.showSaveNotification?.('Error: ' + err.message);
                cleanup();
            }
        };

        fileItem.querySelector('.delete-confirm').addEventListener('click', doDelete);
        fileItem.querySelector('.delete-cancel').addEventListener('click', cleanup);
    }

    showContextMenu(e, path) {
        e.preventDefault();

        // Remove existing menu
        document.querySelector('.file-context-menu')?.remove();

        const menu = document.createElement('div');
        menu.className = 'file-context-menu';
        menu.innerHTML = `
        <div class="file-context-menu-item" data-action="open"><i class="fas fa-external-link-alt"></i> Open</div>
        <div class="file-context-menu-item" data-action="rename"><i class="fas fa-pen"></i> Rename</div>
        <div class="file-context-menu-divider"></div>
        <div class="file-context-menu-item danger" data-action="delete"><i class="fas fa-trash"></i> Delete</div>
    `;

        menu.style.left = e.clientX + 'px';
        menu.style.top = e.clientY + 'px';
        document.body.appendChild(menu);

        // Keep menu in viewport
        const rect = menu.getBoundingClientRect();
        if (rect.right > window.innerWidth) menu.style.left = (window.innerWidth - rect.width - 10) + 'px';
        if (rect.bottom > window.innerHeight) menu.style.top = (window.innerHeight - rect.height - 10) + 'px';

        menu.addEventListener('click', (ev) => {
            const action = ev.target.closest('.file-context-menu-item')?.dataset.action;
            if (action === 'open') this.openFile(path);
            if (action === 'rename') this.renameFile(path);
            if (action === 'delete') this.deleteFile(path);
            menu.remove();
        });

        // Close on click outside
        setTimeout(() => {
            document.addEventListener('click', () => menu.remove(), { once: true });
        }, 0);
    }
    filterFiles(query) {
        // Filter LOCAL files
        const localItems = this.fileTree.querySelectorAll('.file-item, .folder-item');

        // Filter CLOUD items
        const cloudItems = document.querySelectorAll('#cloudList .cloud-item');

        if (!query) {
            // Show all local
            localItems.forEach(item => item.classList.remove('hidden'));
            this.fileTree.querySelectorAll('.folder-contents').forEach(fc => fc.classList.remove('hidden'));
            // Show all cloud
            cloudItems.forEach(item => item.classList.remove('hidden'));
            return;
        }

        // Filter local items
        localItems.forEach(item => {
            const name = item.querySelector('span')?.textContent?.toLowerCase() || '';
            const matches = name.includes(query);
            item.classList.toggle('hidden', !matches);

            // If it's a matching folder, show its contents
            if (item.classList.contains('folder-item') && matches) {
                const contents = item.nextElementSibling;
                if (contents?.classList.contains('folder-contents')) {
                    contents.classList.remove('hidden');
                    contents.querySelectorAll('.file-item, .folder-item').forEach(child => child.classList.remove('hidden'));
                }
            }
        });

        // Show parent folders of matching files
        this.fileTree.querySelectorAll('.file-item:not(.hidden)').forEach(file => {
            let parent = file.parentElement;
            while (parent && parent !== this.fileTree) {
                parent.classList.remove('hidden');
                const folderItem = parent.previousElementSibling;
                if (folderItem?.classList.contains('folder-item')) {
                    folderItem.classList.remove('hidden');
                    folderItem.classList.add('expanded');
                }
                parent = parent.parentElement;
            }
        });

        // Filter cloud items
        cloudItems.forEach(item => {
            const name = item.querySelector('.cloud-item-name')?.textContent?.toLowerCase() || '';
            const matches = name.includes(query);
            item.classList.toggle('hidden', !matches);
        });
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
            // Update local header with folder name
            document.querySelector('.local-section .section-header span').innerHTML =
                `<i class="fas fa-folder"></i> ${this.directoryHandle.name}`;

            document.getElementById('fileSearchInput').disabled = false;
            document.getElementById('refreshFolderBtn').disabled = false;
            document.getElementById('saveLocalBtn').disabled = false;
            await this.refresh();
        } catch (err) {
            if (err.name !== 'AbortError') {
                console.error('Error opening folder:', err);
                alert('Error opening folder: ' + err.message);
            }
        }
    }

    async refresh() {
        if (!this.directoryHandle) return;

        // Update local header with folder name
        document.querySelector('.local-section .section-header span').innerHTML =
            `<i class="fas fa-folder"></i> ${this.directoryHandle.name}`;

        this.fileHandles.clear();
        this.fileTree.innerHTML = '';

        await this.buildTree(this.directoryHandle, this.fileTree, '');
    }

    async buildTree(dirHandle, container, path) {
        const entries = [];

        for await (const entry of dirHandle.values()) {
            entries.push(entry);
        }

        // Sort based on dropdown selection
        const sortMode = document.getElementById('fileSortSelect')?.value || 'alpha';

        // Get file dates if sorting by date
        if (sortMode === 'date') {
            const dateMap = new Map();
            for (const entry of entries) {
                if (entry.kind === 'file') {
                    const file = await entry.getFile();
                    dateMap.set(entry.name, file.lastModified);
                }
            }
            entries.sort((a, b) => {
                if (a.kind !== b.kind) return a.kind === 'directory' ? -1 : 1;
                if (a.kind === 'directory') return a.name.localeCompare(b.name);
                return (dateMap.get(b.name) || 0) - (dateMap.get(a.name) || 0);
            });
        } else {
            entries.sort((a, b) => {
                if (a.kind !== b.kind) return a.kind === 'directory' ? -1 : 1;
                if (a.kind === 'directory') return a.name.localeCompare(b.name);
                if (sortMode === 'ext') {
                    const extA = a.name.split('.').pop().toLowerCase();
                    const extB = b.name.split('.').pop().toLowerCase();
                    return extA.localeCompare(extB) || a.name.localeCompare(b.name);
                }
                return a.name.localeCompare(b.name);
            });
        }

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
                fileEl.addEventListener('contextmenu', (e) => this.showContextMenu(e, fullPath));

                // Make local files draggable to cloud
                fileEl.draggable = true;
                fileEl.addEventListener('dragstart', async (e) => {
                    fileEl.classList.add('dragging');
                    e.dataTransfer.setData('text/plain', fullPath);
                    e.dataTransfer.effectAllowed = 'copy';
                });
                fileEl.addEventListener('dragend', () => {
                    fileEl.classList.remove('dragging');
                });

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
                document.querySelector('.local-section .section-header span').innerHTML =
                    `<i class="fas fa-folder"></i> ${this.directoryHandle.name}`;
                document.getElementById('fileSearchInput').disabled = false;
                document.getElementById('refreshFolderBtn').disabled = false;
                document.getElementById('saveLocalBtn').disabled = false;
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
                    document.querySelector('.local-section .section-header span').innerHTML =
                        `<i class="fas fa-folder"></i> ${this.directoryHandle.name}`;
                    document.getElementById('refreshFolderBtn').disabled = false;
                    document.getElementById('saveLocalBtn').disabled = false;
                    await this.refresh();
                }
            } catch (err) {
                console.error('Error reconnecting:', err);
            }
        });

        document.getElementById('openNewFolderBtn')?.addEventListener('click', () => this.openFolder());
    }
    async saveToCloud() {
        const input = document.getElementById('cloudSaveInput');
        const name = input.value.trim();
        if (!name) return alert('Enter a molecule name');
        if (!window.main?.data) return alert('No molecule loaded');

        const saved = await window.saveMolecule(name);
        if (saved) {
            input.value = '';
            input.classList.remove('visible');
            this.loadCloudMolecules();
        }
    }

    // Find where cloud items are created and add draggable attribute + events:
    async loadCloudMolecules() {
        const list = document.getElementById('cloudList');
        list.innerHTML = '<div class="cloud-loading"><i class="fas fa-spinner fa-spin"></i> Loading...</div>';

        const molecules = await window.loadMoleculesList();

        if (!molecules.length) {
            list.innerHTML = '<div class="cloud-empty"><i class="fas fa-cloud"></i><p>No saved molecules</p></div>';
            return;
        }

        // Sort based on dropdown selection
        const sortMode = document.getElementById('fileSortSelect')?.value || 'alpha';

        molecules.sort((a, b) => {
            if (sortMode === 'date') {
                const dateA = a.timestamp?.toDate?.() || new Date(0);
                const dateB = b.timestamp?.toDate?.() || new Date(0);
                return dateB - dateA; // newest first
            } else if (sortMode === 'ext') {
                // Cloud molecules don't have extensions, fall back to alpha
                return (a.name || '').localeCompare(b.name || '');
            } else {
                // alpha
                return (a.name || '').localeCompare(b.name || '');
            }
        });

        list.innerHTML = '';
        molecules.forEach(mol => {
            const date = mol.timestamp?.toDate?.() || new Date();
            const item = document.createElement('div');
            item.className = 'cloud-item';
            item.draggable = true;
            item.innerHTML = `
            <i class="fas fa-atom file-mol"></i>
            <span class="cloud-item-name">${mol.name}</span>
            <div class="cloud-item-actions">
                <button class="import-btn" title="Download as XYZ"><i class="fas fa-download"></i></button>
                <button class="delete-btn" title="Delete"><i class="fas fa-trash"></i></button>
            </div>
        `;

            // Drag events
            item.addEventListener('dragstart', (e) => {
                item.classList.add('dragging');
                e.dataTransfer.setData('application/json', JSON.stringify(mol));
                e.dataTransfer.effectAllowed = 'copy';
            });

            item.addEventListener('dragend', () => {
                item.classList.remove('dragging');
            });

            item.querySelector('.cloud-item-name').addEventListener('click', () => {
                // Highlight this cloud item
                document.querySelectorAll('.file-item.active, .cloud-item.active').forEach(el => el.classList.remove('active'));
                item.classList.add('active');

                window.resetIsolationState?.();
                window.resetIsolationState?.();
                window.loadMolecule(mol);
                if (mol.data?.fragments) window.fragments = mol.data.fragments.map(f => f.atoms);
            });

            item.querySelector('.import-btn')?.addEventListener('click', (e) => {
                e.stopPropagation();
                this.importAsXYZ(mol);
            });

            item.querySelector('.delete-btn').addEventListener('click', async (e) => {
                e.stopPropagation();
                if (await window.deleteMolecule(mol.id)) this.loadCloudMolecules();
            });

            list.appendChild(item);
        });
    }

    async importAsXYZ(mol) {
        if (!this.directoryHandle) return alert('Open a local folder first');
        if (!mol.data?.molecule?.atomData) return alert('Invalid molecule data');

        const atoms = mol.data.molecule.atomData;
        let xyz = `${atoms.length}\n${mol.name}\n`;
        atoms.forEach(a => {
            xyz += `${a.element}  ${a.x.toFixed(6)}  ${a.y.toFixed(6)}  ${a.z.toFixed(6)}\n`;
        });

        const filename = mol.name.replace(/[^a-zA-Z0-9]/g, '_') + '.xyz';
        try {
            const fileHandle = await this.directoryHandle.getFileHandle(filename, { create: true });
            const writable = await fileHandle.createWritable();
            await writable.write(xyz);
            await writable.close();
            this.refresh();
            window.showSaveNotification?.(`Imported: ${filename}`);
        } catch (err) {
            alert('Error saving file: ' + err.message);
        }
    }
}

// Initialize and export
window.fileExplorer = new FileExplorer();