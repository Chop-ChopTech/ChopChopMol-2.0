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
        this.localSortMode = 'alpha';
        this.cloudSortMode = 'alpha';
        this.selectedLocalFiles = new Set();  // paths of selected local files
        this.selectedCloudItems = new Set();  // mol ids of selected cloud items
        this.isMarqueeSelecting = false;
        this.marqueeStart = null;
        this.marqueeElement = null;
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
        document.getElementById('cloudRefreshBtn')?.addEventListener('click', () => this.loadCloudMolecules());

        // Setup filter dropdowns for local and cloud sorting
        this.setupFilterDropdown('localSortFilterBtn', 'localSortDropdown', 'localSortMode');
        this.setupFilterDropdown('cloudSortFilterBtn', 'cloudSortDropdown', 'cloudSortMode');
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
            this.showCloudSaveDialog();
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
            // Clear active highlight when clicking outside items
            if (!e.target.closest('.file-item') && !e.target.closest('.cloud-item')) {
                document.querySelectorAll('.file-item.active, .cloud-item.active').forEach(el => el.classList.remove('active'));
            }

            // Clear multi-selection when clicking outside file explorer entirely
            if (!e.target.closest('.file-explorer-panel')) {
                this.clearLocalSelection();
                this.clearCloudSelection();
            }
        });
        document.getElementById('createFolderBtn')?.addEventListener('click', () => this.createFolder());
        document.getElementById('createCloudFolderBtn')?.addEventListener('click', () => this.createCloudFolder());
        // Setup drag-drop for local folder
        this.setupCloudDragDrop();
        this.setupLocalToCloudDrop();

        // Try to restore previous folder on load
        this.tryRestorePreviousFolder();
        // Setup marquee selection
        this.setupMarqueeSelection();
    }

    clearLocalSelection() {
        this.selectedLocalFiles.clear();
        document.querySelectorAll('.file-item.selected').forEach(el => el.classList.remove('selected'));
    }

    clearCloudSelection() {
        this.selectedCloudItems.clear();
        document.querySelectorAll('.cloud-item.selected').forEach(el => el.classList.remove('selected'));
    }

    getSelectedLocalPaths() {
        return Array.from(this.selectedLocalFiles);
    }

    getSelectedCloudMolecules() {
        return Array.from(this.selectedCloudItems);
    }

    setupMarqueeSelection() {
        const fileTree = this.fileTree;
        const cloudList = document.getElementById('cloudList');

        // Marquee for local files
        fileTree?.addEventListener('mousedown', (e) => this.startMarquee(e, 'local'));
        cloudList?.addEventListener('mousedown', (e) => this.startMarquee(e, 'cloud'));

        document.addEventListener('mousemove', (e) => this.updateMarquee(e));
        document.addEventListener('mouseup', (e) => this.endMarquee(e));
    }

    startMarquee(e, section) {
        // Only start marquee if cmd/ctrl is held and clicking on empty space
        if (!(e.metaKey || e.ctrlKey)) return;
        if (e.target.closest('.file-item') || e.target.closest('.cloud-item') || e.target.closest('.folder-item')) return;

        e.preventDefault();
        this.isMarqueeSelecting = true;
        this.marqueeSection = section;

        const container = section === 'local' ? this.fileTree : document.getElementById('cloudList');
        const rect = container.getBoundingClientRect();

        this.marqueeStart = {
            x: e.clientX,
            y: e.clientY,
            scrollTop: container.scrollTop
        };
        this.marqueeContainer = container;

        // Create marquee element
        this.marqueeElement = document.createElement('div');
        this.marqueeElement.className = 'selection-marquee';
        document.body.appendChild(this.marqueeElement);
    }

    updateMarquee(e) {
        if (!this.isMarqueeSelecting || !this.marqueeElement) return;

        const x1 = Math.min(this.marqueeStart.x, e.clientX);
        const y1 = Math.min(this.marqueeStart.y, e.clientY);
        const x2 = Math.max(this.marqueeStart.x, e.clientX);
        const y2 = Math.max(this.marqueeStart.y, e.clientY);

        this.marqueeElement.style.left = x1 + 'px';
        this.marqueeElement.style.top = y1 + 'px';
        this.marqueeElement.style.width = (x2 - x1) + 'px';
        this.marqueeElement.style.height = (y2 - y1) + 'px';

        // Highlight items within marquee
        const marqueeRect = { left: x1, top: y1, right: x2, bottom: y2 };
        const selector = this.marqueeSection === 'local' ? '.file-item' : '.cloud-item';

        this.marqueeContainer.querySelectorAll(selector).forEach(item => {
            const itemRect = item.getBoundingClientRect();
            const intersects = !(itemRect.right < marqueeRect.left ||
                itemRect.left > marqueeRect.right ||
                itemRect.bottom < marqueeRect.top ||
                itemRect.top > marqueeRect.bottom);
            item.classList.toggle('marquee-hover', intersects);
        });
    }

    endMarquee(e) {
        if (!this.isMarqueeSelecting) return;

        // Select all items that were in the marquee
        const selector = this.marqueeSection === 'local' ? '.file-item' : '.cloud-item';
        this.marqueeContainer?.querySelectorAll(selector + '.marquee-hover').forEach(item => {
            item.classList.remove('marquee-hover');
            item.classList.add('selected');

            if (this.marqueeSection === 'local') {
                this.selectedLocalFiles.add(item.dataset.path);
            } else {
                const molData = item._molData;
                if (molData) this.selectedCloudItems.add(molData.id);
            }
        });

        this.isMarqueeSelecting = false;
        this.marqueeElement?.remove();
        this.marqueeElement = null;
    }

    async deleteSelectedLocalFiles() {
        const paths = this.getSelectedLocalPaths();
        if (!paths.length) return;

        if (!confirm(`Delete ${paths.length} file(s)?`)) return;

        for (const path of paths) {
            try {
                const name = path.split('/').pop();
                const parentPath = path.includes('/') ? path.substring(0, path.lastIndexOf('/')) : '';
                const parentHandle = parentPath ? await this.getDirectoryHandle(parentPath) : this.directoryHandle;
                await parentHandle.removeEntry(name);
                this.fileHandles.delete(path);
            } catch (err) {
                console.error('Error deleting:', path, err);
            }
        }

        this.clearLocalSelection();
        this.refresh();
        window.showSaveNotification?.(`Deleted ${paths.length} file(s)`);
    }

    async deleteSelectedCloudItems() {
        const ids = this.getSelectedCloudMolecules();
        if (!ids.length) return;

        if (!confirm(`Delete ${ids.length} molecule(s)?`)) return;

        for (const id of ids) {
            await window.deleteMolecule?.(id);
        }

        this.clearCloudSelection();
        this.loadCloudMolecules();
        window.showSaveNotification?.(`Deleted ${ids.length} molecule(s)`);
    }

    async moveSelectedLocalToFolder(targetHandle) {
        const paths = this.getSelectedLocalPaths();
        for (const path of paths) {
            await this.moveFileToFolder(path, targetHandle);
        }
        this.clearLocalSelection();
    }

    async moveSelectedCloudToFolder(folderId) {
        const ids = this.getSelectedCloudMolecules();
        for (const id of ids) {
            await window.moveMoleculeToFolder?.(id, folderId);
        }
        this.clearCloudSelection();
        this.loadCloudMolecules();
        window.showSaveNotification?.(`Moved ${ids.length} molecule(s)`);
    }

    async uploadSelectedLocalToCloud() {
        const paths = this.getSelectedLocalPaths();
        let uploaded = 0;

        for (const path of paths) {
            const handle = this.fileHandles.get(path);
            if (!handle) continue;

            const file = await handle.getFile();
            const ext = file.name.split('.').pop().toLowerCase();
            if (!MOLECULE_EXTENSIONS.includes(ext)) continue;

            const text = await file.text();
            const name = file.name.replace(/\.[^/.]+$/, '');

            // Parse and save
            await window.main?.loader?.handleFile({ target: { files: [file] } }, false);
            await new Promise(r => setTimeout(r, 100));

            if (window.main?.data) {
                await window.saveMolecule(name);
                uploaded++;
            }
        }

        if (uploaded) {
            this.loadCloudMolecules();
            window.showSaveNotification?.(`Uploaded ${uploaded} file(s) to cloud`);
        }
        this.clearLocalSelection();
    }

    async downloadSelectedCloudToLocal() {
        if (!this.directoryHandle) return alert('Open a local folder first');

        const ids = this.getSelectedCloudMolecules();
        let downloaded = 0;

        // Get all cloud items and find matching ones
        const cloudItems = document.querySelectorAll('.cloud-item');
        for (const item of cloudItems) {
            const mol = item._molData;
            if (!mol || !ids.includes(mol.id)) continue;

            await this.importToLocal(mol);
            downloaded++;
        }

        if (downloaded) {
            window.showSaveNotification?.(`Downloaded ${downloaded} file(s)`);
        }
        this.clearCloudSelection();
    }

    setupFilterDropdown(buttonId, dropdownId, sortModeProperty) {
        const button = document.getElementById(buttonId);
        const dropdown = document.getElementById(dropdownId);

        if (!button || !dropdown) return;

        // Toggle dropdown on button click
        button.addEventListener('click', (e) => {
            e.stopPropagation();
            const isShowing = dropdown.classList.contains('show');

            // Close all dropdowns first
            document.querySelectorAll('.filter-dropdown').forEach(dd => dd.classList.remove('show'));

            // Toggle this dropdown (open if it wasn't showing)
            if (!isShowing) {
                dropdown.classList.add('show');
            }
        });

        // Handle dropdown item clicks
        dropdown.querySelectorAll('.filter-dropdown-item').forEach(item => {
            item.addEventListener('click', (e) => {
                e.stopPropagation();
                const sortMode = item.dataset.sort;

                // Update sort mode
                this[sortModeProperty] = sortMode;

                // Update active state
                dropdown.querySelectorAll('.filter-dropdown-item').forEach(i => i.classList.remove('active'));
                item.classList.add('active');

                // Close dropdown
                dropdown.classList.remove('show');

                // Refresh appropriate list
                if (sortModeProperty === 'localSortMode') {
                    this.refresh();
                } else {
                    this.loadCloudMolecules();
                }
            });
        });

        // Close dropdown when clicking outside
        document.addEventListener('click', (e) => {
            if (!dropdown.contains(e.target) && e.target !== button) {
                dropdown.classList.remove('show');
            }
        });

        // Set initial active state
        const initialMode = this[sortModeProperty] || 'alpha';
        dropdown.querySelectorAll('.filter-dropdown-item').forEach(item => {
            if (item.dataset.sort === initialMode) {
                item.classList.add('active');
            }
        });
    }
    setupCloudDragDrop() {
        const fileTree = document.getElementById('fileTree');

        fileTree.addEventListener('dragover', (e) => {
            if (!this.directoryHandle) return;
            e.preventDefault();
            fileTree.classList.add('drag-over');
        });

        fileTree.addEventListener('dragleave', (e) => {
            if (e.target === fileTree) fileTree.classList.remove('drag-over');
        });

        fileTree.addEventListener('drop', async (e) => {
            e.preventDefault();
            fileTree.classList.remove('drag-over');

            if (!this.directoryHandle) {
                alert('Open a local folder first');
                return;
            }

            // Handle cloud molecule drops
            const molData = e.dataTransfer.getData('application/json');
            if (molData) {
                const mol = JSON.parse(molData);
                await this.importToLocal(mol);
                return;
            }

            // Handle local file moves to root
            const srcPath = e.dataTransfer.getData('text/plain');
            if (srcPath && this.fileHandles.has(srcPath) && srcPath.includes('/')) {
                await this.moveFileToFolder(srcPath, this.directoryHandle);
            }
        });
    }

    setupLocalToCloudDrop() {
        const cloudList = document.getElementById('cloudList');

        cloudList.addEventListener('dragover', (e) => {
            // Allow drops from local files (text/plain) or cloud molecules (application/json)
            if (e.dataTransfer.types.includes('text/plain') || e.dataTransfer.types.includes('application/json')) {
                e.preventDefault();
                cloudList.classList.add('drag-over');
            }
        });

        cloudList.addEventListener('dragleave', (e) => {
            // Only remove drag-over if leaving the cloudList itself
            if (!cloudList.contains(e.relatedTarget)) {
                cloudList.classList.remove('drag-over');
            }
        });

        cloudList.addEventListener('drop', async (e) => {
            e.preventDefault();
            cloudList.classList.remove('drag-over');

            // Handle cloud molecule drop (move to root)
            const molData = e.dataTransfer.getData('application/json');
            if (molData) {
                try {
                    const mol = JSON.parse(molData);
                    if (mol.id && window.moveMoleculeToFolder) {
                        const moved = await window.moveMoleculeToFolder(mol.id, null); // null = move to root
                        if (moved) {
                            this.loadCloudMolecules();
                            window.showSaveNotification?.(`Moved ${mol.name} to root`);
                        }
                    }
                } catch (err) {
                    console.error('Error moving molecule to root:', err);
                }
                return;
            }

            // Handle local file drop (upload to cloud)
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
        // Create overlay + modal (same pattern as cloud save)
        const existing = document.getElementById('localSaveOverlay');
        if (existing) existing.remove();

        const overlay = document.createElement('div');
        overlay.className = 'save-dialog-overlay';
        overlay.id = 'localSaveOverlay';

        const dialog = document.createElement('div');
        dialog.id = 'localSaveDialog';
        dialog.className = 'local-save-dialog';
        dialog.innerHTML = `
    <h3 class="save-dialog-title"><i class="fas fa-laptop"></i> Save to Local</h3>
    <div class="save-dialog-row">
        <input type="text" id="localSaveInput" placeholder="Enter filename" value="${defaultName}">
        <select id="localSaveExt">
            <option value="xyz">.xyz</option>
            <option value="pdb">.pdb</option>
            <option value="mol">.mol</option>
        </select>
    </div>
    <div class="save-dialog-buttons">
        <button id="localSaveCancel"><i class="fas fa-times"></i> Cancel</button>
        <button id="localSaveConfirm"><i class="fas fa-check"></i> Save</button>
    </div>
`;

        overlay.appendChild(dialog);
        document.body.appendChild(overlay);

        // Click outside to close
        overlay.addEventListener('click', (e) => {
            if (e.target === overlay) cleanup();
        });

        const input = document.getElementById('localSaveInput');
        const extSelect = document.getElementById('localSaveExt');
        input.focus();
        input.select();

        const cleanup = () => overlay.remove();
        overlay.addEventListener('click', (e) => {
            if (e.target === overlay) cleanup();
        });

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
        document.querySelector('.file-context-menu')?.remove();

        const isMultiSelect = this.selectedLocalFiles.size > 1 && this.selectedLocalFiles.has(path);
        const count = isMultiSelect ? this.selectedLocalFiles.size : 1;

        const menu = document.createElement('div');
        menu.className = 'file-context-menu';
        menu.innerHTML = isMultiSelect ? `
        <div class="file-context-menu-item" data-action="upload"><i class="fas fa-cloud-upload-alt"></i> Upload ${count} to Cloud</div>
        <div class="file-context-menu-divider"></div>
        <div class="file-context-menu-item danger" data-action="delete"><i class="fas fa-trash"></i> Delete ${count} Files</div>
    ` : `
        <div class="file-context-menu-item" data-action="open"><i class="fas fa-external-link-alt"></i> Open</div>
        <div class="file-context-menu-item" data-action="upload"><i class="fas fa-cloud-upload-alt"></i> Upload to Cloud</div>
        <div class="file-context-menu-item" data-action="rename"><i class="fas fa-pen"></i> Rename</div>
        <div class="file-context-menu-divider"></div>
        <div class="file-context-menu-item danger" data-action="delete"><i class="fas fa-trash"></i> Delete</div>
    `;

        menu.style.left = e.clientX + 'px';
        menu.style.top = e.clientY + 'px';
        document.body.appendChild(menu);

        const rect = menu.getBoundingClientRect();
        if (rect.right > window.innerWidth) menu.style.left = (window.innerWidth - rect.width - 10) + 'px';
        if (rect.bottom > window.innerHeight) menu.style.top = (window.innerHeight - rect.height - 10) + 'px';

        menu.addEventListener('click', async (ev) => {
            const action = ev.target.closest('.file-context-menu-item')?.dataset.action;
            if (!action) return;

            if (isMultiSelect) {
                if (action === 'delete') this.deleteSelectedLocalFiles();
                if (action === 'upload') this.uploadSelectedLocalToCloud();
            } else {
                if (action === 'open') this.openFile(path);
                if (action === 'rename') this.renameFile(path);
                if (action === 'delete') this.deleteFile(path);
                if (action === 'upload') {
                    this.selectedLocalFiles.add(path);
                    this.uploadSelectedLocalToCloud();
                }
            }
            menu.remove();
        });

        setTimeout(() => {
            document.addEventListener('click', () => menu.remove(), { once: true });
        }, 0);
    }
    filterFiles(query) {
        // Filter LOCAL files
        const localItems = this.fileTree.querySelectorAll('.file-item, .folder-item');

        // Filter CLOUD items and folders
        const cloudItems = document.querySelectorAll('#cloudList .cloud-item');
        const cloudFolders = document.querySelectorAll('#cloudList .cloud-folder-item');

        if (!query) {
            // Show all local
            localItems.forEach(item => item.classList.remove('hidden'));
            this.fileTree.querySelectorAll('.folder-contents').forEach(fc => fc.classList.remove('hidden'));
            // Show all cloud
            cloudItems.forEach(item => item.classList.remove('hidden'));
            cloudFolders.forEach(item => item.classList.remove('hidden'));
            document.querySelectorAll('#cloudList .cloud-folder-contents').forEach(fc => {
                // Keep expanded state but show if parent is visible
                if (fc.previousElementSibling?.classList.contains('expanded')) {
                    fc.classList.remove('hidden');
                }
            });
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

        // Filter cloud folders
        cloudFolders.forEach(item => {
            const name = item.querySelector('span')?.textContent?.toLowerCase() || '';
            const matches = name.includes(query);
            item.classList.toggle('hidden', !matches);

            // If it's a matching folder, show its contents
            if (matches) {
                const contents = item.nextElementSibling;
                if (contents?.classList.contains('cloud-folder-contents')) {
                    contents.classList.remove('hidden');
                    item.classList.add('expanded');
                    contents.querySelectorAll('.cloud-item').forEach(child => child.classList.remove('hidden'));
                }
            }
        });

        // Filter cloud items
        cloudItems.forEach(item => {
            const name = item.querySelector('.cloud-item-name')?.textContent?.toLowerCase() || '';
            const matches = name.includes(query);
            item.classList.toggle('hidden', !matches);

            // Show parent folder if this item matches
            if (matches) {
                let parent = item.parentElement;
                while (parent && parent.id !== 'cloudList') {
                    if (parent.classList.contains('cloud-folder-contents')) {
                        parent.classList.remove('hidden');
                        const folderItem = parent.previousElementSibling;
                        if (folderItem?.classList.contains('cloud-folder-item')) {
                            folderItem.classList.remove('hidden');
                            folderItem.classList.add('expanded');
                        }
                    }
                    parent = parent.parentElement;
                }
            }
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
                `${this.directoryHandle.name}`;

            document.getElementById('fileSearchInput').disabled = false;
            document.getElementById('refreshFolderBtn').disabled = false;
            document.getElementById('saveLocalBtn').disabled = false;
            document.getElementById('createFolderBtn').disabled = false;
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
            `<i class="fa-solid fa-laptop"></i> LOCAL:   ${this.directoryHandle.name}`;

        this.fileHandles.clear();
        this.fileTree.innerHTML = '';

        await this.buildTree(this.directoryHandle, this.fileTree, '');
    }

    async createFolder() {
        if (!this.directoryHandle) return;

        // Remove any existing input
        document.querySelector('.folder-name-input')?.remove();

        // Create input element
        const inputWrapper = document.createElement('div');
        inputWrapper.className = 'folder-name-input';
        inputWrapper.innerHTML = `
        <i class="fas fa-folder folder-icon"></i>
        <input type="text" placeholder="Folder name..." autofocus>
    `;

        const input = inputWrapper.querySelector('input');

        const confirm = async () => {
            const name = input.value.trim();
            if (name) {
                try {
                    await this.directoryHandle.getDirectoryHandle(name, { create: true });
                    await this.refresh();
                } catch (err) {
                    alert('Error creating folder: ' + err.message);
                }
            }
            inputWrapper.remove();
        };

        input.addEventListener('keydown', (e) => {
            if (e.key === 'Enter') confirm();
            if (e.key === 'Escape') inputWrapper.remove();
        });

        input.addEventListener('blur', () => {
            setTimeout(() => inputWrapper.remove(), 100);
        });

        // Insert at top of file tree
        this.fileTree.prepend(inputWrapper);
        input.focus();
    }

    async createCloudFolder() {
        // Check if user is signed in
        if (!window.auth?.currentUser) {
            alert('Please sign in to create folders');
            return;
        }

        const cloudList = document.getElementById('cloudList');
        if (!cloudList) return;

        // Remove any existing input
        cloudList.querySelector('.folder-name-input')?.remove();

        // Create input element (same style as local)
        const inputWrapper = document.createElement('div');
        inputWrapper.className = 'folder-name-input';
        inputWrapper.innerHTML = `
        <input type="text" placeholder="Folder name..." autofocus>
    `;

        const input = inputWrapper.querySelector('input');

        const confirm = async () => {
            const name = input.value.trim();
            if (name && window.createCloudFolder) {
                const folderId = await window.createCloudFolder(name);
                if (folderId) {
                    await this.loadCloudMolecules();
                }
            }
            inputWrapper.remove();
        };

        input.addEventListener('keydown', (e) => {
            if (e.key === 'Enter') confirm();
            if (e.key === 'Escape') inputWrapper.remove();
        });

        input.addEventListener('blur', () => {
            setTimeout(() => inputWrapper.remove(), 100);
        });

        // Insert at top of cloud list
        cloudList.prepend(inputWrapper);
        input.focus();
    }

    async buildTree(dirHandle, container, path) {
        const entries = [];

        for await (const entry of dirHandle.values()) {
            entries.push(entry);
        }

        // Sort based on local sort mode
        const sortMode = this.localSortMode || 'alpha';

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
                const folderEl = document.createElement('div');
                folderEl.className = 'folder-item';
                folderEl.dataset.path = fullPath;
                folderEl.innerHTML = `
                    <i class="fas fa-chevron-right chevron"></i>
                    <span>${entry.name}</span>
                `;

                // Make folder a drop target
                folderEl.addEventListener('dragover', (e) => {
                    e.preventDefault();
                    e.stopPropagation();
                    folderEl.classList.add('drop-target');
                });
                folderEl.addEventListener('dragleave', (e) => {
                    if (!folderEl.contains(e.relatedTarget)) {
                        folderEl.classList.remove('drop-target');
                    }
                });
                folderEl.addEventListener('drop', async (e) => {
                    e.preventDefault();
                    e.stopPropagation();
                    folderEl.classList.remove('drop-target');

                    const data = e.dataTransfer.getData('text/plain');
                    if (!data) return;

                    try {
                        const parsed = JSON.parse(data);
                        if (parsed.multi && parsed.paths) {
                            // Multi-file drop
                            for (const path of parsed.paths) {
                                if (this.fileHandles.has(path)) {
                                    await this.moveFileToFolder(path, entry);
                                }
                            }
                            this.clearLocalSelection();
                            return;
                        }
                    } catch { }

                    // Single file drop
                    if (data && this.fileHandles.has(data)) {
                        await this.moveFileToFolder(data, entry);
                    }
                });

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

                fileEl.addEventListener('click', (e) => {
                    if (e.metaKey || e.ctrlKey) {
                        // Multi-select toggle
                        e.stopPropagation();
                        if (this.selectedLocalFiles.has(fullPath)) {
                            this.selectedLocalFiles.delete(fullPath);
                            fileEl.classList.remove('selected');
                        } else {
                            this.selectedLocalFiles.add(fullPath);
                            fileEl.classList.add('selected');
                        }
                    } else if (e.shiftKey && this.selectedLocalFiles.size > 0) {
                        // Range select
                        e.stopPropagation();
                        const allFiles = Array.from(container.querySelectorAll('.file-item'));
                        const lastSelected = Array.from(this.selectedLocalFiles).pop();
                        const lastIdx = allFiles.findIndex(f => f.dataset.path === lastSelected);
                        const thisIdx = allFiles.indexOf(fileEl);
                        const [start, end] = [Math.min(lastIdx, thisIdx), Math.max(lastIdx, thisIdx)];

                        for (let i = start; i <= end; i++) {
                            const path = allFiles[i].dataset.path;
                            this.selectedLocalFiles.add(path);
                            allFiles[i].classList.add('selected');
                        }
                    } else {
                        // Normal click - clear selection and open
                        this.clearLocalSelection();
                        this.openFile(fullPath);
                    }
                });
                fileEl.addEventListener('contextmenu', (e) => this.showContextMenu(e, fullPath));

                // Make local files draggable to cloud
                fileEl.draggable = true;
                fileEl.addEventListener('dragstart', (e) => {
                    fileEl.classList.add('dragging');

                    // If this file is part of a multi-selection, drag all selected
                    if (this.selectedLocalFiles.has(fullPath) && this.selectedLocalFiles.size > 1) {
                        const paths = Array.from(this.selectedLocalFiles);
                        e.dataTransfer.setData('text/plain', JSON.stringify({ multi: true, paths }));
                    } else {
                        e.dataTransfer.setData('text/plain', fullPath);
                    }
                    e.dataTransfer.effectAllowed = 'copy';
                });
                fileEl.addEventListener('dragend', () => {
                    fileEl.classList.remove('dragging');
                    document.querySelectorAll('.drop-target, .drag-over').forEach(el => {
                        el.classList.remove('drop-target', 'drag-over');
                    });
                });

                container.appendChild(fileEl);
            }
        }
    }

    async moveFileToFolder(srcPath, targetDirHandle) {
        const srcHandle = this.fileHandles.get(srcPath);
        if (!srcHandle) return;

        const fileName = srcPath.includes('/') ? srcPath.split('/').pop() : srcPath;
        const srcParentPath = srcPath.includes('/') ? srcPath.substring(0, srcPath.lastIndexOf('/')) : '';

        // Get target folder name for comparison
        const targetName = targetDirHandle === this.directoryHandle ? '' : targetDirHandle.name;

        // Don't move if already in target folder
        if (srcParentPath === targetName || (srcParentPath === '' && targetDirHandle === this.directoryHandle)) {
            return;
        }

        try {
            const file = await srcHandle.getFile();
            const newHandle = await targetDirHandle.getFileHandle(file.name, { create: true });
            const writable = await newHandle.createWritable();
            await writable.write(await file.arrayBuffer());
            await writable.close();

            // Delete original
            const parentHandle = srcParentPath ? await this.getDirectoryHandle(srcParentPath) : this.directoryHandle;
            await parentHandle.removeEntry(file.name);

            document.querySelectorAll('.drop-target, .drag-over').forEach(el => {
                el.classList.remove('drop-target', 'drag-over');
            });
            await this.refresh();
        } catch (err) {
            alert('Error moving file: ' + err.message);
        }
    }

    async getDirectoryHandle(path) {
        const parts = path.split('/');
        let handle = this.directoryHandle;
        for (const part of parts) {
            handle = await handle.getDirectoryHandle(part);
        }
        return handle;
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
                    `<i class="fa-solid fa-laptop"></i> LOCAL:    ${this.directoryHandle.name}`;
                document.getElementById('fileSearchInput').disabled = false;
                document.getElementById('refreshFolderBtn').disabled = false;
                document.getElementById('saveLocalBtn').disabled = false;
                document.getElementById('createFolderBtn').disabled = false;
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
                <i class="fa-solid fa-laptop"></i>LOCAL:  
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
                        `${this.directoryHandle.name}`;
                    document.getElementById('refreshFolderBtn').disabled = false;
                    document.getElementById('saveLocalBtn').disabled = false;
                    document.getElementById('createFolderBtn').disabled = false;
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

    showCloudSaveDialog() {
        if (!window.main?.data) return window.showSaveNotification?.('No molecule loaded');

        const defaultName = (window.main.data.name || 'molecule').replace(/[^a-zA-Z0-9_-]/g, '_');

        const existing = document.getElementById('cloudSaveOverlay');
        if (existing) existing.remove();

        const overlay = document.createElement('div');
        overlay.className = 'save-dialog-overlay';
        overlay.id = 'cloudSaveOverlay';

        const dialog = document.createElement('div');
        dialog.className = 'local-save-dialog'; // reuse same styling
        dialog.innerHTML = `
            <h3 class="save-dialog-title"><i class="fas fa-cloud-upload-alt"></i> Save to Cloud</h3>
            <input type="text" id="cloudSaveModalInput" placeholder="Enter molecule name" value="${defaultName}">
            <div class="save-dialog-buttons">
                <button id="cloudSaveCancel"><i class="fas fa-times"></i> Cancel</button>
                <button id="cloudSaveConfirmBtn" style="background: linear-gradient(135deg, #22c55e, #16a34a);"><i class="fas fa-cloud-upload-alt"></i> Save</button>
            </div>
        `;

        overlay.appendChild(dialog);
        document.body.appendChild(overlay);

        const input = document.getElementById('cloudSaveModalInput');
        input.focus();
        input.select();

        const cleanup = () => overlay.remove();

        overlay.addEventListener('click', (e) => {
            if (e.target === overlay) cleanup();
        });

        document.getElementById('cloudSaveCancel').addEventListener('click', cleanup);

        const doSave = async () => {
            const name = input.value.trim();
            if (!name) return;
            const saved = await window.saveMolecule(name);
            if (saved) {
                cleanup();
                this.loadCloudMolecules();
            }
        };

        document.getElementById('cloudSaveConfirmBtn').addEventListener('click', doSave);
        input.addEventListener('keypress', (e) => {
            if (e.key === 'Enter') doSave();
        });
    }

    // Find where cloud items are created and add draggable attribute + events:
    async loadCloudMolecules() {
        const list = document.getElementById('cloudList');
        list.innerHTML = '<div class="cloud-loading"><i class="fas fa-spinner fa-spin"></i> Loading...</div>';

        const [molecules, folders] = await Promise.all([
            window.loadMoleculesList?.() || [],
            window.loadFoldersList?.() || []
        ]);

        if (!molecules.length && !folders.length) {
            list.innerHTML = '<div class="cloud-empty"><i class="fas fa-cloud"></i><p>No saved molecules</p></div>';
            return;
        }

        // Sort based on cloud sort mode
        const sortMode = this.cloudSortMode || 'alpha';

        // Organize molecules by folder
        const moleculesByFolder = new Map();
        const rootMolecules = [];

        molecules.forEach(mol => {
            const folderId = mol.folderId || null;
            if (folderId) {
                if (!moleculesByFolder.has(folderId)) {
                    moleculesByFolder.set(folderId, []);
                }
                moleculesByFolder.get(folderId).push(mol);
            } else {
                rootMolecules.push(mol);
            }
        });

        // Sort molecules
        const sortMolecules = (mols) => {
            return mols.sort((a, b) => {
                if (sortMode === 'date') {
                    const dateA = a.timestamp?.toDate?.() || new Date(0);
                    const dateB = b.timestamp?.toDate?.() || new Date(0);
                    return dateB - dateA; // newest first
                } else if (sortMode === 'ext') {
                    return (a.name || '').localeCompare(b.name || '');
                } else {
                    return (a.name || '').localeCompare(b.name || '');
                }
            });
        };

        // Sort folders
        folders.sort((a, b) => {
            if (sortMode === 'date') {
                const dateA = a.timestamp?.toDate?.() || new Date(0);
                const dateB = b.timestamp?.toDate?.() || new Date(0);
                return dateB - dateA;
            } else {
                return (a.name || '').localeCompare(b.name || '');
            }
        });

        list.innerHTML = '';

        // Render folders first
        folders.forEach(folder => {
            const folderMolecules = sortMolecules(moleculesByFolder.get(folder.id) || []);
            if (folderMolecules.length === 0 && !folder.parentFolderId) {
                // Skip empty root folders for now, or show them
                // Actually, let's show all folders
            }

            const folderEl = document.createElement('div');
            folderEl.className = 'folder-item cloud-folder-item';
            folderEl.dataset.folderId = folder.id;
            folderEl.innerHTML = `
                <i class="fas fa-chevron-right chevron"></i>
                <span>${folder.name}</span>
                <div class="cloud-item-actions" style="margin-left: auto;">
                    <button class="delete-folder-btn" title="Delete Folder"><i class="fas fa-trash"></i></button>
                </div>
            `;

            const contentsEl = document.createElement('div');
            contentsEl.className = 'folder-contents cloud-folder-contents';

            // Make folder a drop target for cloud molecules
            folderEl.addEventListener('dragover', (e) => {
                if (e.dataTransfer.types.includes('application/json')) {
                    e.preventDefault();
                    e.stopPropagation();
                    folderEl.classList.add('drop-target');
                }
            });

            folderEl.addEventListener('dragleave', (e) => {
                if (!folderEl.contains(e.relatedTarget)) {
                    folderEl.classList.remove('drop-target');
                }
            });

            folderEl.addEventListener('drop', async (e) => {
                e.preventDefault();
                e.stopPropagation();
                folderEl.classList.remove('drop-target');

                const molData = e.dataTransfer.getData('application/json');
                if (molData) {
                    try {
                        const parsed = JSON.parse(molData);

                        if (parsed.multi && parsed.ids) {
                            // Multi-molecule drop
                            for (const id of parsed.ids) {
                                await window.moveMoleculeToFolder?.(id, folder.id);
                            }
                            this.clearCloudSelection();
                            this.loadCloudMolecules();
                            window.showSaveNotification?.(`Moved ${parsed.ids.length} molecules to ${folder.name}`);
                        } else if (parsed.id) {
                            // Single molecule drop
                            const moved = await window.moveMoleculeToFolder(parsed.id, folder.id);
                            if (moved) {
                                this.loadCloudMolecules();
                                window.showSaveNotification?.(`Moved ${parsed.name} to ${folder.name}`);
                            }
                        }
                    } catch (err) {
                        console.error('Error moving molecule to folder:', err);
                    }
                }
            });

            // Toggle expand/collapse
            folderEl.addEventListener('click', async (e) => {
                if (e.target.closest('.delete-folder-btn')) return;
                e.stopPropagation();
                folderEl.classList.toggle('expanded');

                if (folderEl.classList.contains('expanded') && contentsEl.children.length === 0) {
                    // Render molecules in this folder
                    folderMolecules.forEach(mol => {
                        contentsEl.appendChild(this.createCloudItem(mol));
                    });
                }
            });

            // Delete folder button
            folderEl.querySelector('.delete-folder-btn').addEventListener('click', async (e) => {
                e.stopPropagation();
                if (await window.deleteCloudFolder?.(folder.id)) {
                    this.loadCloudMolecules();
                }
            });

            list.appendChild(folderEl);
            list.appendChild(contentsEl);
        });

        // Render root molecules
        sortMolecules(rootMolecules).forEach(mol => {
            list.appendChild(this.createCloudItem(mol));
        });
    }

    createCloudItem(mol) {
        const item = document.createElement('div');
        item.className = 'cloud-item';
        item.draggable = true;
        item._molData = mol; // Store reference for multi-select

        const iconClass = this.getCloudFileIcon(mol.fileFormat);
        item.innerHTML = `
            <i class="${iconClass}"></i>
            <span class="cloud-item-name">${mol.name}</span>
            <div class="cloud-item-actions">
                <button class="import-btn" title="Download"><i class="fas fa-download"></i></button>
                <button class="delete-btn" title="Delete"><i class="fas fa-trash"></i></button>
            </div>
        `;

        // Drag events - handle multi-drag
        item.addEventListener('dragstart', (e) => {
            item.classList.add('dragging');

            // If this item is selected, drag all selected; otherwise just this one
            if (this.selectedCloudItems.has(mol.id) && this.selectedCloudItems.size > 1) {
                const ids = Array.from(this.selectedCloudItems);
                e.dataTransfer.setData('application/json', JSON.stringify({ multi: true, ids }));
            } else {
                e.dataTransfer.setData('application/json', JSON.stringify(mol));
            }
            e.dataTransfer.effectAllowed = 'copy';
        });

        item.addEventListener('dragend', () => {
            item.classList.remove('dragging');
        });

        // Click on name - handle multi-select
        // Click anywhere on item - handle selection
        item.addEventListener('click', (e) => {
            // Ignore if clicking on action buttons
            if (e.target.closest('.cloud-item-actions')) return;

            if (e.metaKey || e.ctrlKey) {
                // Toggle multi-selection
                e.stopPropagation();
                if (this.selectedCloudItems.has(mol.id)) {
                    this.selectedCloudItems.delete(mol.id);
                    item.classList.remove('selected');
                } else {
                    this.selectedCloudItems.add(mol.id);
                    item.classList.add('selected');
                }
            } else {
                // Normal click - clear selection, select this one, and load
                this.clearCloudSelection();
                this.clearLocalSelection();
                document.querySelectorAll('.file-item.active, .cloud-item.active').forEach(el => el.classList.remove('active'));
                item.classList.add('active');
                item.classList.add('selected');
                this.selectedCloudItems.add(mol.id);

                window.resetIsolationState?.();
                window.loadMolecule(mol);
                // Handle fragments for both old and new format
                if (mol.fragments) {
                    window.fragments = mol.fragments.map(f => f.atoms);
                } else if (mol.data?.fragments) {
                    window.fragments = mol.data.fragments.map(f => f.atoms);
                }
            }
        });

        item.querySelector('.import-btn')?.addEventListener('click', (e) => {
            e.stopPropagation();
            if (this.selectedCloudItems.size > 1 && this.selectedCloudItems.has(mol.id)) {
                this.downloadSelectedCloudToLocal();
            } else {
                this.importToLocal(mol);
            }
        });

        item.querySelector('.delete-btn').addEventListener('click', async (e) => {
            e.stopPropagation();
            if (this.selectedCloudItems.size > 1 && this.selectedCloudItems.has(mol.id)) {
                this.deleteSelectedCloudItems();
            } else {
                if (await window.deleteMolecule(mol.id)) this.loadCloudMolecules();
            }
        });

        return item;
    }

    getCloudFileIcon(format) {
        switch (format) {
            // case 'pdb': return 'fas fa-dna file-pdb';
            // case 'xyz': return 'fas fa-atom file-xyz';
            // case 'mol': case 'sdf': return 'fas fa-cube file-mol';
            // case 'mol2': return 'fas fa-cubes file-mol2';
            // case 'cif': return 'fas fa-th file-cif';
            // case 'cml': return 'fas fa-code file-cml';
            // case 'gro': return 'fas fa-box file-gro';
            // case 'pqr': return 'fas fa-bolt file-pqr';
            default: return 'fas fa-atom file-mol'; // fallback for old format molecules
        }
    }

    async importToLocal(mol) {
        if (!this.directoryHandle) return alert('Open a local folder first');

        let fileContent, filename;

        // New format - has raw file content
        if (mol.fileContent && mol.fileFormat) {
            fileContent = mol.fileContent;
            const ext = mol.fileFormat;
            filename = mol.name.replace(/[^a-zA-Z0-9_-]/g, '_') + '.' + ext;
        }
        // Old format - has parsed JSON data, convert to XYZ
        else if (mol.data?.molecule?.atomData) {
            const atoms = mol.data.molecule.atomData;
            fileContent = `${atoms.length}\n${mol.name}\n`;
            atoms.forEach(a => {
                fileContent += `${a.element}  ${a.x.toFixed(6)}  ${a.y.toFixed(6)}  ${a.z.toFixed(6)}\n`;
            });
            filename = mol.name.replace(/[^a-zA-Z0-9_-]/g, '_') + '.xyz';
        }
        else {
            return alert('Invalid molecule data');
        }

        try {
            const fileHandle = await this.directoryHandle.getFileHandle(filename, { create: true });
            const writable = await fileHandle.createWritable();
            await writable.write(fileContent);
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