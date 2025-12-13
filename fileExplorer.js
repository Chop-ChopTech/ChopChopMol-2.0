// fileExplorer.js - File Explorer for ChopChopMol

const MOLECULE_EXTENSIONS = ['pdb', 'mol', 'sdf', 'xyz', 'cif', 'mmcif', 'mol2', 'pqr', 'gro', 'cml'];

class FileExplorer {
    constructor() {
        this.directoryHandle = null;
        this.fileHandles = new Map(); // path -> FileSystemFileHandle
        this.aiCreatedFiles = new Set(); // tracks files created by AI
        this.currentFile = null;
        this.unsavedChanges = false;

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
        document.getElementById('newFileBtn')?.addEventListener('click', () => this.promptNewFile());
        document.getElementById('refreshFolderBtn')?.addEventListener('click', () => this.refresh());
        document.getElementById('closeExplorerBtn')?.addEventListener('click', () => this.close());
        document.getElementById('saveTextFileBtn')?.addEventListener('click', () => this.saveCurrentTextFile());
        document.getElementById('closeTextEditorBtn')?.addEventListener('click', () => this.closeTextEditor());

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
            this.directoryHandle = await window.showDirectoryPicker({ mode: 'readwrite' });
            document.getElementById('newFileBtn').disabled = false;
            document.getElementById('refreshFolderBtn').disabled = false;
            await this.refresh();
        } catch (err) {
            if (err.name !== 'AbortError') {
                console.error('Error opening folder:', err);
            }
        }
    }

    async refresh() {
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
            return { success: false, error: 'No folder open' };
        }

        try {
            const handle = await this.directoryHandle.getFileHandle(filename, { create: true });
            const writable = await handle.createWritable();
            await writable.write(content);
            await writable.close();

            this.aiCreatedFiles.add(filename);
            await this.refresh();

            return { success: true, path: filename };
        } catch (err) {
            return { success: false, error: err.message };
        }
    }

    async editFile(filename, content) {
        // AI can only edit files it created
        if (!this.aiCreatedFiles.has(filename)) {
            return { success: false, error: 'AI can only edit files it created' };
        }

        const handle = this.fileHandles.get(filename);
        if (!handle) {
            return { success: false, error: 'File not found' };
        }

        try {
            const writable = await handle.createWritable();
            await writable.write(content);
            await writable.close();

            return { success: true };
        } catch (err) {
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
}

// Initialize and export
window.fileExplorer = new FileExplorer();