export default class FileHandler {
    constructor(main) {
        this.main = main;
        this.data = null;
        this.handleFile = this.handleFile.bind(this);

    }

    handleFile(event, overlayOn) {
        const file = event.target.files[0];
        const overlay = overlayOn;
        let rotation = { x: 0, y: 0, z: 0 };
        let translation = { x: 0, y: 0, z: 0 };
        if (!file) return;
        window.xyzFrames = null;

        const reader = new FileReader();
        reader.onload = (e) => {
            try {
                const text = e.target.result;
                const fileType = findFileType(file);

                // Store raw file content for cloud saving
                window.currentFileFormat = fileType;
                let parsedData = null;

                if (fileType === 'mol') {
                    parsedData = this.parseMolToJson(text);
                } else if (fileType === 'pdb') {
                    parsedData = this.parsePdbToJson(text);
                } else if (fileType === 'xyz') {
                    parsedData = this.parseXyzToJson(text);
                } else if (fileType === 'extxyz') {
                    parsedData = this.parseExtxyzToJson(text);
                } else if (fileType === 'cif') {
                    parsedData = this.parseCifToJson(text);
                } else if (fileType === 'mol2') {
                    parsedData = this.parseMol2ToJson(text);
                } else if (fileType === 'pqr') {
                    parsedData = this.parsePqrToJson(text);
                } else if (fileType === 'gro') {
                    parsedData = this.parseGroToJson(text);
                } else if (fileType === 'cml') {
                    parsedData = this.parseCmlToJson(text);
                }

                if (overlay) {
                    const transformation = alignMolecules(parsedData, this.main.data);
                    rotation = transformation.rotation;
                    translation = transformation.translation;
                }

                if (parsedData.numAtoms <= 2000) {
                    this.main.setNewMode(true);
                    document.getElementById("toggleStyleChanges").checked = true;
                } else {
                    this.main.setNewMode();
                    document.getElementById("toggleStyleChanges").checked = false;
                }
                window.resetIsolationState();
                this.main.newMolecule(parsedData, this.main.mode);
                const frameSliderContainer = document.getElementById('frameSliderContainer');

                if (frameSliderContainer) {
                    if (frameSliderContainer) {
                        frameSliderContainer.style.display = 'none';
                    }
                    if (window.xyzFrames && window.xyzFrames.length > 1) {
                        frameSliderContainer.style.display = 'flex';
                        const slider = document.getElementById('frameSlider');
                        const label = document.getElementById('frameLabel');
                        slider.max = window.xyzFrames.length - 1;
                        slider.value = 0;
                        label.textContent = `Frame 1 / ${window.xyzFrames.length}`;
                    } else {
                        frameSliderContainer.style.display = 'none';
                        document.getElementById('frameSlider').value = 0;
                        window.xyzFrames = null;
                    }
                }
                window.resetCamera();

            } catch (error) {
                console.error("Error parsing file:", error);
                alert('Error parsing file: ' + error.message);
            }
        };
        reader.readAsText(file);
    }

    parseXyzToJson(content) {
        const lines = content.trim().split('\n');
        if (lines.length < 2) {
            throw new Error('Invalid XYZ format: Too few lines');
        }

        const frames = [];
        let i = 0;

        while (i < lines.length) {
            // Skip empty lines
            if (!lines[i].trim()) {
                i++;
                continue;
            }

            const numAtoms = parseInt(lines[i].trim(), 10);
            if (isNaN(numAtoms) || numAtoms <= 0) {
                break;
            }

            // Comment line
            const comment = lines[i + 1] ? lines[i + 1].trim() : '';

            const atomData = [];
            const startLine = i + 2;

            if (lines.length < startLine + numAtoms) {
                throw new Error('Invalid XYZ format: Insufficient atom lines');
            }

            for (let j = startLine; j < startLine + numAtoms; j++) {
                const parts = lines[j].trim().split(/\s+/);
                if (parts.length < 4) continue;

                const element = parts[0].trim();
                const x = parseFloat(parts[1]);
                const y = parseFloat(parts[2]);
                const z = parseFloat(parts[3]);

                if (!isNaN(x) && !isNaN(y) && !isNaN(z)) {
                    atomData.push({ element, x, y, z });
                }
            }

            frames.push({ atomData, numAtoms: atomData.length, comment });
            i = startLine + numAtoms;
        }

        // Store frames globally for slider access
        window.xyzFrames = frames.length > 1 ? frames : null;

        // Return first frame data (no circular reference)
        if (frames.length === 0) {
            return { atomData: [], numAtoms: 0 };
        }

        return {
            atomData: frames[0].atomData,
            numAtoms: frames[0].numAtoms
        };
    }

    parseExtxyzToJson(content) {
        const lines = content.trim().split('\n');
        const frames = [];
        const frameEnergies = [];
        let i = 0;

        while (i < lines.length) {
            if (!lines[i].trim()) { i++; continue; }

            const numAtoms = parseInt(lines[i].trim(), 10);
            if (isNaN(numAtoms) || numAtoms <= 0) break;

            // Parse comment line for energy and properties
            const commentLine = lines[i + 1] || '';
            let energy = null;
            const energyMatch = commentLine.match(/energy\s*=\s*(-?[\d.eE+-]+)/i);
            if (energyMatch) energy = parseFloat(energyMatch[1]);
            frameEnergies.push(energy);

            // Parse Properties to find column layout (default: species:S:1:pos:R:3)
            let columns = [{ name: 'species', type: 'S', count: 1 }, { name: 'pos', type: 'R', count: 3 }];
            const propsMatch = commentLine.match(/Properties\s*=\s*"?([^"]+)"?/i);
            if (propsMatch) {
                columns = [];
                const parts = propsMatch[1].split(':');
                for (let p = 0; p < parts.length; p += 3) {
                    columns.push({ name: parts[p], type: parts[p + 1], count: parseInt(parts[p + 2]) || 1 });
                }
            }

            // Find species and pos column indices
            let colIdx = 0, speciesIdx = 0, posIdx = 1;
            for (let c = 0; c < columns.length; c++) {
                if (columns[c].name === 'species') speciesIdx = colIdx;
                if (columns[c].name === 'pos') posIdx = colIdx;
                colIdx += columns[c].count;
            }

            const atomData = [];
            const startLine = i + 2;

            for (let j = startLine; j < startLine + numAtoms && j < lines.length; j++) {
                const parts = lines[j].trim().split(/\s+/);
                if (parts.length < posIdx + 3) continue;

                const element = parts[speciesIdx];
                const x = parseFloat(parts[posIdx]);
                const y = parseFloat(parts[posIdx + 1]);
                const z = parseFloat(parts[posIdx + 2]);

                if (!isNaN(x) && !isNaN(y) && !isNaN(z)) {
                    atomData.push({ element, x, y, z });
                }
            }

            frames.push({ atomData, numAtoms: atomData.length });
            i = startLine + numAtoms;
        }

        window.xyzFrames = frames.length > 1 ? frames : null;
        window.frameEnergies = frameEnergies;

        window.updateEnergyChartButton?.();

        return frames.length > 0 ? frames[0] : { atomData: [], numAtoms: 0 };
    }

    parseMolToJson(molText) {
        const lines = molText.split("\n");
        const countsLine = lines[3]; // line 4
        const numAtoms = parseInt(countsLine.slice(0, 3));

        const atomData = [];

        for (let i = 4; i < 4 + numAtoms; i++) {
            const line = lines[i];
            const x = parseFloat(line.slice(0, 10).trim());
            const y = parseFloat(line.slice(10, 20).trim());
            const z = parseFloat(line.slice(20, 30).trim());
            const element = line.slice(31, 34).trim();

            atomData.push({ element, x, y, z });
        }

        return {
            atomData,
            numAtoms
        };
    }
    parsePdbToJson(pdbText) {
        const lines = pdbText.split(/\r?\n|\r/);
        const atomData = [];

        // RIBBON DATA STRUCTURES
        const backboneAtoms = [];
        const helices = [];
        const sheets = [];

        const AVAILABLE_ELEMENTS = new Set([
            'H', 'He', 'Li', 'Be', 'B', 'C', 'N', 'O', 'F', 'Ne',
            'Na', 'Mg', 'Al', 'Si', 'P', 'S', 'Cl', 'Ar', 'K', 'Ca',
            'Sc', 'Ti', 'V', 'Cr', 'Mn', 'Fe', 'Co', 'Ni', 'Cu', 'Zn',
            'Ga', 'Ge', 'As', 'Se', 'Br', 'Kr', 'Rb', 'Sr', 'Y', 'Zr',
            'Nb', 'Mo', 'Tc', 'Ru', 'Rh', 'Pd', 'Ag', 'Cd', 'In', 'Sn',
            'Sb', 'Te', 'I', 'Xe', 'Cs', 'Ba', 'La', 'Ce', 'Pr', 'Nd',
            'Pm', 'Sm', 'Eu', 'Gd', 'Tb', 'Dy', 'Ho', 'Er', 'Tm', 'Yb',
            'Lu', 'Hf', 'Ta', 'W', 'Re', 'Os', 'Ir', 'Pt', 'Au', 'Hg',
            'Tl', 'Pb', 'Bi', 'Po', 'At', 'Rn', 'Fr', 'Ra', 'Ac', 'Th',
            'Pa', 'U', 'Np', 'Pu', 'Am', 'Cm', 'Bk', 'Cf', 'Es', 'Fm',
            'Md', 'No', 'Lr', 'Rf', 'Db', 'Sg', 'Bh', 'Hs', 'Mt', 'Ds',
            'Rg', 'Cn', 'Nh', 'Fl', 'Mc', 'Lv', 'Ts', 'Og'
        ]);

        const CAPITALIZATION_MAP = {
            'D': 'H',
            'CA': 'Ca', 'MG': 'Mg', 'FE': 'Fe', 'CU': 'Cu', 'ZN': 'Zn',
            'MN': 'Mn', 'CO': 'Co', 'NI': 'Ni', 'BR': 'Br', 'CL': 'Cl',
            'SE': 'Se', 'AG': 'Ag', 'AU': 'Au', 'HG': 'Hg', 'PB': 'Pb'
        };

        const AMINO_ACIDS = new Set([
            'ALA', 'CYS', 'ASP', 'GLU', 'PHE', 'GLY', 'HIS', 'ILE', 'LYS', 'LEU',
            'MET', 'ASN', 'PRO', 'GLN', 'ARG', 'SER', 'THR', 'VAL', 'TRP', 'TYR'
        ]);

        // FIRST PASS: Parse HELIX and SHEET records
        for (let i = 0; i < lines.length; i++) {
            const line = lines[i];
            if (!line) continue;

            const recordType = line.substring(0, 6).trim();

            if (recordType === 'HELIX') {
                const chainId = line.charAt(19);
                const startRes = parseInt(line.substring(21, 25).trim());
                const endRes = parseInt(line.substring(33, 37).trim());
                if (!isNaN(startRes) && !isNaN(endRes)) {
                    helices.push({ chain: chainId, start: startRes, end: endRes });
                }
            } else if (recordType === 'SHEET') {
                const chainId = line.charAt(21);
                const startRes = parseInt(line.substring(22, 26).trim());
                const endRes = parseInt(line.substring(33, 37).trim());
                if (!isNaN(startRes) && !isNaN(endRes)) {
                    sheets.push({ chain: chainId, start: startRes, end: endRes });
                }
            }
        }

        // SECOND PASS: Parse atoms
        for (let i = 0; i < lines.length; i++) {
            const line = lines[i];

            if (!line || line.length < 54) continue;

            const recordType = line.substring(0, 6).trim();
            if (recordType !== 'ATOM' && recordType !== 'HETATM') continue;

            const x = parseFloat(line.substring(30, 38));
            const y = parseFloat(line.substring(38, 46));
            const z = parseFloat(line.substring(46, 54));

            if (isNaN(x) || isNaN(y) || isNaN(z)) continue;

            let element = null;

            // Extract atom metadata for CA detection and ribbon
            const fullAtomName = line.substring(12, 16);
            const atomName = fullAtomName.trim().toUpperCase();
            const chainId = line.charAt(21);
            const resSeq = parseInt(line.substring(22, 26).trim());
            const residueName = line.length >= 20 ? line.substring(17, 20).trim().toUpperCase() : '';

            // CAPTURE CA ATOMS FOR RIBBON
            if (atomName === 'CA' && fullAtomName.charAt(0) === ' ' && AMINO_ACIDS.has(residueName)) {
                backboneAtoms.push({
                    x: x,
                    y: y,
                    z: z,
                    chain: chainId,
                    resSeq: resSeq,
                    residue: residueName
                });
            }

            // Strategy 1: Try element column (77-78)
            if (line.length >= 78) {
                let elementField = line.substring(76, 78).trim();

                if (elementField) {
                    if (AVAILABLE_ELEMENTS.has(elementField)) {
                        element = elementField;
                    } else {
                        elementField = elementField.toUpperCase();
                        if (CAPITALIZATION_MAP[elementField]) {
                            element = CAPITALIZATION_MAP[elementField];
                        } else if (AVAILABLE_ELEMENTS.has(elementField)) {
                            element = elementField;
                        } else if (elementField.length === 2) {
                            const properCap = elementField.charAt(0) + elementField.charAt(1).toLowerCase();
                            if (AVAILABLE_ELEMENTS.has(properCap)) {
                                element = properCap;
                            }
                        }
                    }

                    if (element) {
                        atomData.push({ element, x, y, z });
                        continue;
                    }
                }
            }

            // Strategy 2: Parse from atom name
            if (!atomName) continue;

            if (/^\d/.test(atomName)) {
                element = atomName.charAt(1).toUpperCase();
                if (element === 'H') {
                    atomData.push({ element, x, y, z });
                    continue;
                }
            }

            if (atomName === 'CA') {
                if (fullAtomName.charAt(0) === ' ' && AMINO_ACIDS.has(residueName)) {
                    element = 'C';
                } else if (recordType === 'HETATM') {
                    element = 'Ca';
                } else if (AMINO_ACIDS.has(residueName)) {
                    element = 'C';
                } else {
                    element = 'Ca';
                }
                atomData.push({ element, x, y, z });
                continue;
            }

            if (atomName.length >= 2 && fullAtomName.charAt(0) !== ' ') {
                let twoChar = atomName.substring(0, 2);

                if (CAPITALIZATION_MAP[twoChar]) {
                    element = CAPITALIZATION_MAP[twoChar];
                } else {
                    const properCap = twoChar.charAt(0) + twoChar.charAt(1).toLowerCase();
                    if (AVAILABLE_ELEMENTS.has(properCap)) {
                        element = properCap;
                    }
                }

                if (element) {
                    atomData.push({ element, x, y, z });
                    continue;
                }
            }

            const firstChar = atomName.charAt(0);
            if (AVAILABLE_ELEMENTS.has(firstChar)) {
                element = firstChar;
                atomData.push({ element, x, y, z });
                continue;
            }

            if (atomName.startsWith('C')) element = 'C';
            else if (atomName.startsWith('N')) element = 'N';
            else if (atomName.startsWith('O')) element = 'O';
            else if (atomName.startsWith('S')) element = 'S';
            else if (atomName.startsWith('P')) element = 'P';
            else if (atomName.startsWith('H')) element = 'H';
            else element = 'C';

            atomData.push({ element, x, y, z });
        }

        const result = {
            atomData: atomData,
            numAtoms: atomData.length
        };

        // Add ribbon data if protein backbone found
        if (backboneAtoms.length > 0) {
            result.ribbonData = {
                backbone: backboneAtoms,
                helices: helices,
                sheets: sheets
            };
        }

        return result;
    }

    parseCifToJson(cifText) {
        const lines = cifText.split(/\r?\n|\r/);
        const atomData = [];
        const backboneAtoms = [];
        const helices = [];
        const sheets = [];

        const AVAILABLE_ELEMENTS = new Set([
            'H', 'He', 'Li', 'Be', 'B', 'C', 'N', 'O', 'F', 'Ne',
            'Na', 'Mg', 'Al', 'Si', 'P', 'S', 'Cl', 'Ar', 'K', 'Ca',
            'Sc', 'Ti', 'V', 'Cr', 'Mn', 'Fe', 'Co', 'Ni', 'Cu', 'Zn',
            'Ga', 'Ge', 'As', 'Se', 'Br', 'Kr', 'Rb', 'Sr', 'Y', 'Zr',
            'Nb', 'Mo', 'Tc', 'Ru', 'Rh', 'Pd', 'Ag', 'Cd', 'In', 'Sn',
            'Sb', 'Te', 'I', 'Xe', 'Cs', 'Ba', 'La', 'Ce', 'Pr', 'Nd',
            'Pm', 'Sm', 'Eu', 'Gd', 'Tb', 'Dy', 'Ho', 'Er', 'Tm', 'Yb',
            'Lu', 'Hf', 'Ta', 'W', 'Re', 'Os', 'Ir', 'Pt', 'Au', 'Hg',
            'Tl', 'Pb', 'Bi', 'Po', 'At', 'Rn', 'Fr', 'Ra', 'Ac', 'Th',
            'Pa', 'U', 'Np', 'Pu', 'Am', 'Cm', 'Bk', 'Cf', 'Es', 'Fm',
            'Md', 'No', 'Lr', 'Rf', 'Db', 'Sg', 'Bh', 'Hs', 'Mt', 'Ds',
            'Rg', 'Cn', 'Nh', 'Fl', 'Mc', 'Lv', 'Ts', 'Og'
        ]);

        const AMINO_ACIDS = new Set([
            'ALA', 'CYS', 'ASP', 'GLU', 'PHE', 'GLY', 'HIS', 'ILE', 'LYS', 'LEU',
            'MET', 'ASN', 'PRO', 'GLN', 'ARG', 'SER', 'THR', 'VAL', 'TRP', 'TYR'
        ]);

        // Find _atom_site loop
        let inAtomSite = false;
        let atomSiteHeaders = [];
        let atomSiteData = [];

        // Find secondary structure (struct_conf for helices, struct_sheet_range for sheets)
        let inStructConf = false;
        let structConfHeaders = [];
        let structConfData = [];

        let inSheetRange = false;
        let sheetRangeHeaders = [];
        let sheetRangeData = [];

        for (let i = 0; i < lines.length; i++) {
            const line = lines[i].trim();

            // Skip empty lines and comments
            if (!line || line.startsWith('#')) continue;

            // ATOM SITE PARSING
            if (line === 'loop_') {
                // Check if next section is _atom_site
                if (i + 1 < lines.length && lines[i + 1].trim().startsWith('_atom_site.')) {
                    inAtomSite = true;
                    atomSiteHeaders = [];
                    continue;
                } else if (i + 1 < lines.length && lines[i + 1].trim().startsWith('_struct_conf.')) {
                    inStructConf = true;
                    structConfHeaders = [];
                    continue;
                } else if (i + 1 < lines.length && lines[i + 1].trim().startsWith('_struct_sheet_range.')) {
                    inSheetRange = true;
                    sheetRangeHeaders = [];
                    continue;
                }
            }

            // Parse atom_site headers
            if (inAtomSite && line.startsWith('_atom_site.')) {
                atomSiteHeaders.push(line.substring(11)); // Remove '_atom_site.'
                continue;
            }

            // Parse struct_conf headers (helices)
            if (inStructConf && line.startsWith('_struct_conf.')) {
                structConfHeaders.push(line.substring(13));
                continue;
            }

            // Parse sheet range headers
            if (inSheetRange && line.startsWith('_struct_sheet_range.')) {
                sheetRangeHeaders.push(line.substring(20));
                continue;
            }

            // End of loops
            if (line.startsWith('_') && !line.startsWith('_atom_site.') && inAtomSite) {
                inAtomSite = false;
            }
            if (line.startsWith('_') && !line.startsWith('_struct_conf.') && inStructConf) {
                inStructConf = false;
            }
            if (line.startsWith('_') && !line.startsWith('_struct_sheet_range.') && inSheetRange) {
                inSheetRange = false;
            }

            // Parse atom data
            if (inAtomSite && atomSiteHeaders.length > 0 && !line.startsWith('_')) {
                // Parse the data line (handle quoted strings)
                const values = parseCifLine(line);
                if (values.length === atomSiteHeaders.length) {
                    atomSiteData.push(values);
                }
            }

            // Parse helix data
            if (inStructConf && structConfHeaders.length > 0 && !line.startsWith('_')) {
                const values = parseCifLine(line);
                if (values.length === structConfHeaders.length) {
                    structConfData.push(values);
                }
            }

            // Parse sheet data
            if (inSheetRange && sheetRangeHeaders.length > 0 && !line.startsWith('_')) {
                const values = parseCifLine(line);
                if (values.length === sheetRangeHeaders.length) {
                    sheetRangeData.push(values);
                }
            }
        }

        // Process helices
        if (structConfData.length > 0) {
            const confTypeIdx = structConfHeaders.indexOf('conf_type_id');
            const begChainIdx = structConfHeaders.indexOf('beg_label_asym_id');
            const begSeqIdx = structConfHeaders.indexOf('beg_label_seq_id');
            const endChainIdx = structConfHeaders.indexOf('end_label_asym_id');
            const endSeqIdx = structConfHeaders.indexOf('end_label_seq_id');

            structConfData.forEach(row => {
                const confType = row[confTypeIdx];
                if (confType && confType.includes('HELX')) {
                    const chain = row[begChainIdx] || 'A';
                    const start = parseInt(row[begSeqIdx]);
                    const end = parseInt(row[endSeqIdx]);
                    if (!isNaN(start) && !isNaN(end)) {
                        helices.push({ chain, start, end });
                    }
                }
            });
        }

        // Process sheets
        if (sheetRangeData.length > 0) {
            const begChainIdx = sheetRangeHeaders.indexOf('beg_label_asym_id');
            const begSeqIdx = sheetRangeHeaders.indexOf('beg_label_seq_id');
            const endChainIdx = sheetRangeHeaders.indexOf('end_label_asym_id');
            const endSeqIdx = sheetRangeHeaders.indexOf('end_label_seq_id');

            sheetRangeData.forEach(row => {
                const chain = row[begChainIdx] || 'A';
                const start = parseInt(row[begSeqIdx]);
                const end = parseInt(row[endSeqIdx]);
                if (!isNaN(start) && !isNaN(end)) {
                    sheets.push({ chain, start, end });
                }
            });
        }

        // Process atoms
        const groupIdx = atomSiteHeaders.indexOf('group_PDB');
        const atomNameIdx = atomSiteHeaders.indexOf('label_atom_id');
        const elementIdx = atomSiteHeaders.indexOf('type_symbol');
        const xIdx = atomSiteHeaders.indexOf('Cartn_x');
        const yIdx = atomSiteHeaders.indexOf('Cartn_y');
        const zIdx = atomSiteHeaders.indexOf('Cartn_z');
        const chainIdx = atomSiteHeaders.indexOf('label_asym_id');
        const resSeqIdx = atomSiteHeaders.indexOf('label_seq_id');
        const resNameIdx = atomSiteHeaders.indexOf('label_comp_id');

        atomSiteData.forEach(row => {
            const group = row[groupIdx];

            // Only process ATOM and HETATM
            if (group !== 'ATOM' && group !== 'HETATM') return;

            const x = parseFloat(row[xIdx]);
            const y = parseFloat(row[yIdx]);
            const z = parseFloat(row[zIdx]);

            if (isNaN(x) || isNaN(y) || isNaN(z)) return;

            let element = row[elementIdx];
            const atomName = row[atomNameIdx];
            const chainId = row[chainIdx] || 'A';
            const resSeq = parseInt(row[resSeqIdx]);
            const resName = row[resNameIdx];

            // Capture CA atoms for ribbon
            if (atomName === 'CA' && AMINO_ACIDS.has(resName)) {
                backboneAtoms.push({
                    x: x,
                    y: y,
                    z: z,
                    chain: chainId,
                    resSeq: resSeq,
                    residue: resName
                });
            }

            // Clean up element symbol
            if (element) {
                element = element.trim();
                // Ensure proper capitalization
                if (element.length === 2) {
                    element = element.charAt(0).toUpperCase() + element.charAt(1).toLowerCase();
                } else {
                    element = element.toUpperCase();
                }

                if (AVAILABLE_ELEMENTS.has(element)) {
                    atomData.push({ element, x, y, z });
                }
            }
        });

        const result = {
            atomData: atomData,
            numAtoms: atomData.length
        };

        // Add ribbon data if protein backbone found
        if (backboneAtoms.length > 0) {
            result.ribbonData = {
                backbone: backboneAtoms,
                helices: helices,
                sheets: sheets
            };
        }

        return result;
    }
    parseXYZ(text) {
        try {
            let jsonMol = {};
            const lines = text.trim().split(/\r?\n/);
            const numAtoms = parseInt(lines[0], 10);
            if (isNaN(numAtoms)) throw new Error("Invalid XYZ file format: First line must be a number.");

            const atomData = [];

            for (let i = 2; i < 2 + numAtoms; i++) {
                const parts = lines[i].trim().split(/\s+/);
                if (parts.length < 4) throw new Error(`Invalid line format at line ${i + 1}: ${lines[i]}`);

                const [element, x, y, z] = parts;
                atomData.push({
                    element,
                    x: parseFloat(x),
                    y: parseFloat(y),
                    z: parseFloat(z),
                });
            }

            return { numAtoms, atomData };
        } catch (error) {
            console.error("Error processing XYZ file:", error);
            return null;
        }
    }

    parseMol2ToJson(text) {
        const lines = text.split('\n');
        const atomData = [];
        let inAtomSection = false;

        for (const line of lines) {
            if (line.startsWith('@<TRIPOS>ATOM')) {
                inAtomSection = true;
                continue;
            }
            if (line.startsWith('@<TRIPOS>') && inAtomSection) {
                break;
            }
            if (inAtomSection && line.trim()) {
                const parts = line.trim().split(/\s+/);
                if (parts.length >= 6) {
                    const x = parseFloat(parts[2]);
                    const y = parseFloat(parts[3]);
                    const z = parseFloat(parts[4]);
                    const atomType = parts[5];
                    const element = atomType.split('.')[0];
                    atomData.push({ element, x, y, z });
                }
            }
        }
        return { atomData, numAtoms: atomData.length };
    }

    parsePqrToJson(text) {
        // PQR is like PDB but with charge and radius columns
        const lines = text.split(/\r?\n|\r/);
        const atomData = [];

        for (const line of lines) {
            if (line.startsWith('ATOM') || line.startsWith('HETATM')) {
                const x = parseFloat(line.substring(30, 38).trim());
                const y = parseFloat(line.substring(38, 46).trim());
                const z = parseFloat(line.substring(46, 54).trim());
                const element = line.substring(12, 16).trim().replace(/[0-9]/g, '');

                if (!isNaN(x) && !isNaN(y) && !isNaN(z) && element) {
                    atomData.push({ element, x, y, z });
                }
            }
        }
        return { atomData, numAtoms: atomData.length };
    }

    parseGroToJson(text) {
        // GROMACS format
        const lines = text.split('\n');
        const atomData = [];
        let numAtoms = 0;

        if (lines.length >= 2) {
            numAtoms = parseInt(lines[1].trim());
        }

        for (let i = 2; i < 2 + numAtoms && i < lines.length; i++) {
            const line = lines[i];
            if (line.length >= 44) {
                const atomName = line.substring(10, 15).trim();
                const element = atomName.replace(/[0-9]/g, '');
                const x = parseFloat(line.substring(20, 28).trim()) * 10; // nm to Å
                const y = parseFloat(line.substring(28, 36).trim()) * 10;
                const z = parseFloat(line.substring(36, 44).trim()) * 10;

                if (!isNaN(x) && !isNaN(y) && !isNaN(z) && element) {
                    atomData.push({ element, x, y, z });
                }
            }
        }
        return { atomData, numAtoms: atomData.length };
    }

    parseCmlToJson(text) {
        // Chemical Markup Language (XML-based)
        const parser = new DOMParser();
        const xml = parser.parseFromString(text, 'text/xml');
        const atomData = [];

        const atoms = xml.getElementsByTagName('atom');
        for (const atom of atoms) {
            const element = atom.getAttribute('elementType') ||
                atom.getAttribute('id')?.replace(/[0-9]/g, '') || 'C';
            const x = parseFloat(atom.getAttribute('x3') || atom.getAttribute('x2') || 0);
            const y = parseFloat(atom.getAttribute('y3') || atom.getAttribute('y2') || 0);
            const z = parseFloat(atom.getAttribute('z3') || 0);

            if (!isNaN(x) && !isNaN(y) && !isNaN(z)) {
                atomData.push({ element, x, y, z });
            }
        }
        return { atomData, numAtoms: atomData.length };
    }
    parseJSON() {
        return fetch('./utils/atomSettings.json')
            .then(response => {
                if (!response.ok) {
                    throw new Error(`Failed to load JSON: ${response.statusText}`);
                }
                return response.json();
            })
            .then(settings => {
                this.atomSettings = settings;
                console.log("Loaded Atom Settings:", this.atomSettings);
                return settings; // Return settings so it can be used elsewhere
            })
            .catch(error => {
                console.error("Error loading atom settings:", error);
                return null;
            });
    }

}
