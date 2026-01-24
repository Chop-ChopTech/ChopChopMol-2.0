export default class FileHandler {
    constructor(main) {
        this.main = main;
        this.data = null;
        this.handleFile = this.handleFile.bind(this);

    }

    handleFile(event, overlayOn) {
        const file = event.target.files[0];
        const fileName = file.name;
        window.fileName = fileName || "";
        const overlay = overlayOn;
        let rotation = { x: 0, y: 0, z: 0 };
        let translation = { x: 0, y: 0, z: 0 };
        if (!file) return;
        window.xyzFrames = null;

        // Clear previous orbital data
        window.orbitalData = null;
        window.moldenData = null;
        window.orcaMetadata = null;

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
                } else if (fileType === 'out') {
                    parsedData = this.parseOutToJson(text);
                } else if (fileType === 'cube') {
                    parsedData = this.parseCubeToJson(text);
                } else if (fileType === 'molden') {
                    parsedData = this.parseMoldenToJson(text);
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

                // Update force arrow controls and auto-enable if force data exists
                if (window.updateForceArrowControls) {
                    window.updateForceArrowControls();

                    // Auto-enable force arrows if force data is present
                    if (this.main.molecule && this.main.molecule.hasForceData()) {
                        const checkbox = document.getElementById('toggleForceArrows');
                        if (checkbox && !checkbox.checked) {
                            checkbox.checked = true;
                            this.main.molecule.toggleForceArrows(true, window.forceArrowScale || 1.0);
                        }
                    }
                }

                if (window.updateChargeControls) {
                    window.updateChargeControls();
                }

                // Update orbital controls and enable if orbital data exists
                if (window.updateOrbitalControls) {
                    window.updateOrbitalControls();
                }

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
        const frameEnergies = [];
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

            // Comment line - try to extract energy and other metadata if present
            const comment = lines[i + 1] ? lines[i + 1].trim() : '';
            let energy = null;
            const metadata = {};

            // Try to extract energy from comment line (various formats)
            // Format 1: "energy=-123.456" or "Energy = -123.456"
            // Format 2: Just a number "-123.456"
            // Format 3: "E = -123.456"
            // Format 4: "Total energy: -123.456"
            const energyPatterns = [
                /energy\s*[:=]\s*(-?[\d.eE+-]+)/i,
                /^(-?[\d.eE+-]+)$/,
                /\bE\s*[:=]\s*(-?[\d.eE+-]+)/,
                /total\s+energy\s*[:=]?\s*(-?[\d.eE+-]+)/i,
                /potential\s+energy\s*[:=]?\s*(-?[\d.eE+-]+)/i
            ];
            for (const pattern of energyPatterns) {
                const match = comment.match(pattern);
                if (match) {
                    energy = parseFloat(match[1]);
                    break;
                }
            }
            frameEnergies.push(energy);

            // Try to extract lattice from comment (some XYZ variants include this)
            const latticeMatch = comment.match(/Lattice\s*=\s*"([^"]+)"/i);
            if (latticeMatch) {
                const vals = latticeMatch[1].trim().split(/\s+/).map(parseFloat);
                if (vals.length === 9 && vals.every(v => !isNaN(v))) {
                    metadata.lattice = {
                        a: [vals[0], vals[1], vals[2]],
                        b: [vals[3], vals[4], vals[5]],
                        c: [vals[6], vals[7], vals[8]]
                    };
                }
            }

            const atomData = [];
            const startLine = i + 2;

            if (lines.length < startLine + numAtoms) {
                throw new Error('Invalid XYZ format: Insufficient atom lines');
            }

            // Detect number of columns from first atom line to determine what extra data might be present
            const firstAtomLine = lines[startLine] ? lines[startLine].trim().split(/\s+/) : [];
            const numCols = firstAtomLine.length;

            // Common column layouts:
            // 4 cols: element x y z
            // 5 cols: element x y z charge OR element x y z label
            // 6 cols: element x y z charge label OR element x y z vx vy vz (rarely)
            // 7 cols: element x y z fx fy fz
            // 8 cols: element x y z fx fy fz charge
            // 9+ cols: various combinations

            for (let j = startLine; j < startLine + numAtoms; j++) {
                const parts = lines[j].trim().split(/\s+/);
                if (parts.length < 4) continue;

                const element = parts[0].trim();
                const x = parseFloat(parts[1]);
                const y = parseFloat(parts[2]);
                const z = parseFloat(parts[3]);

                if (isNaN(x) || isNaN(y) || isNaN(z)) continue;

                const atom = { element, x, y, z };

                // Handle extra columns based on count
                if (numCols >= 7) {
                    // Likely forces in columns 4-6 (0-indexed: parts[4], parts[5], parts[6])
                    const fx = parseFloat(parts[4]);
                    const fy = parseFloat(parts[5]);
                    const fz = parseFloat(parts[6]);
                    if (!isNaN(fx) && !isNaN(fy) && !isNaN(fz)) {
                        atom.fx = fx;
                        atom.fy = fy;
                        atom.fz = fz;
                    }
                    // Check for charge in column 7
                    if (numCols >= 8) {
                        const charge = parseFloat(parts[7]);
                        if (!isNaN(charge)) {
                            atom.charge = charge;
                        }
                    }
                } else if (numCols === 5) {
                    // Could be charge or label - try parsing as number
                    const val = parseFloat(parts[4]);
                    if (!isNaN(val)) {
                        // Likely a charge if it's a small number
                        if (Math.abs(val) <= 10) {
                            atom.charge = val;
                        }
                    }
                } else if (numCols === 6) {
                    // Could be charge + something else, or velocities
                    const v1 = parseFloat(parts[4]);
                    const v2 = parseFloat(parts[5]);
                    if (!isNaN(v1) && !isNaN(v2)) {
                        // If both are numbers, assume charge is first
                        if (Math.abs(v1) <= 10) {
                            atom.charge = v1;
                        }
                    }
                }

                atomData.push(atom);
            }

            const frameData = { atomData, numAtoms: atomData.length, comment };
            if (Object.keys(metadata).length > 0) {
                frameData.metadata = metadata;
            }
            frames.push(frameData);
            i = startLine + numAtoms;
        }

        // Store frames and energies globally for slider access
        window.xyzFrames = frames.length > 1 ? frames : null;
        window.frameEnergies = frameEnergies;
        window._pendingChartData = null; // Clear AI chart when loading new molecule

        // Update energy chart button if available
        window.updateEnergyChartButton?.();

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
        const frameMetadata = []; // Store per-frame metadata (lattice, virial, stress, pbc, etc.)
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

            // Parse frame-level metadata from comment line
            const metadata = {};

            // Parse Lattice (3x3 cell matrix in Fortran column-major order)
            // Format: Lattice="ax ay az bx by bz cx cy cz"
            const latticeMatch = commentLine.match(/Lattice\s*=\s*"([^"]+)"/i);
            if (latticeMatch) {
                const vals = latticeMatch[1].trim().split(/\s+/).map(parseFloat);
                if (vals.length === 9 && vals.every(v => !isNaN(v))) {
                    // Fortran column-major: a=(0,1,2), b=(3,4,5), c=(6,7,8)
                    metadata.lattice = {
                        a: [vals[0], vals[1], vals[2]],
                        b: [vals[3], vals[4], vals[5]],
                        c: [vals[6], vals[7], vals[8]]
                    };
                }
            }

            // Parse virial tensor (3x3 in eV, Fortran order)
            // Format: virial="vxx vxy vxz vyx vyy vyz vzx vzy vzz"
            const virialMatch = commentLine.match(/virial\s*=\s*"([^"]+)"/i);
            if (virialMatch) {
                const vals = virialMatch[1].trim().split(/\s+/).map(parseFloat);
                if (vals.length === 9 && vals.every(v => !isNaN(v))) {
                    metadata.virial = [
                        [vals[0], vals[1], vals[2]],
                        [vals[3], vals[4], vals[5]],
                        [vals[6], vals[7], vals[8]]
                    ];
                }
            }

            // Parse stress tensor (3x3 in eV/Å³, Fortran order)
            // Format: stress="sxx sxy sxz syx syy syz szx szy szz"
            const stressMatch = commentLine.match(/stress\s*=\s*"([^"]+)"/i);
            if (stressMatch) {
                const vals = stressMatch[1].trim().split(/\s+/).map(parseFloat);
                if (vals.length === 9 && vals.every(v => !isNaN(v))) {
                    metadata.stress = [
                        [vals[0], vals[1], vals[2]],
                        [vals[3], vals[4], vals[5]],
                        [vals[6], vals[7], vals[8]]
                    ];
                }
            }

            // Parse periodic boundary conditions
            // Format: pbc="T T T" or pbc="T T F" etc.
            const pbcMatch = commentLine.match(/pbc\s*=\s*"([^"]+)"/i);
            if (pbcMatch) {
                const pbcVals = pbcMatch[1].trim().split(/\s+/);
                metadata.pbc = pbcVals.map(v => v.toUpperCase() === 'T' || v === '1' || v.toLowerCase() === 'true');
            }

            // Parse free energy if available
            const freeEnergyMatch = commentLine.match(/free_energy\s*=\s*(-?[\d.eE+-]+)/i);
            if (freeEnergyMatch) {
                metadata.freeEnergy = parseFloat(freeEnergyMatch[1]);
            }

            // Parse config_type if available (e.g., "bulk", "surface", "isolated")
            const configTypeMatch = commentLine.match(/config_type\s*=\s*"?([^"\s]+)"?/i);
            if (configTypeMatch) {
                metadata.configType = configTypeMatch[1];
            }

            // Parse cutoff if available
            const cutoffMatch = commentLine.match(/cutoff\s*=\s*(-?[\d.eE+-]+)/i);
            if (cutoffMatch) {
                metadata.cutoff = parseFloat(cutoffMatch[1]);
            }

            frameMetadata.push(metadata);

            // Parse Properties to find column layout (default: species:S:1:pos:R:3)
            let columns = [{ name: 'species', type: 'S', count: 1 }, { name: 'pos', type: 'R', count: 3 }];
            const propsMatch = commentLine.match(/Properties\s*=\s*"?([^"\s]+)"?/i);
            if (propsMatch) {
                columns = [];
                const parts = propsMatch[1].split(':');
                for (let p = 0; p < parts.length; p += 3) {
                    if (parts[p] && parts[p + 1] && parts[p + 2]) {
                        columns.push({ name: parts[p], type: parts[p + 1], count: parseInt(parts[p + 2]) || 1 });
                    }
                }
            }

            // Build column index map for all properties
            const columnMap = {};
            let colIdx = 0;
            for (let c = 0; c < columns.length; c++) {
                columnMap[columns[c].name.toLowerCase()] = { idx: colIdx, count: columns[c].count, type: columns[c].type };
                colIdx += columns[c].count;
            }

            // Find essential column indices
            const speciesCol = columnMap['species'] || columnMap['element'] || columnMap['symbol'] || { idx: 0, count: 1 };
            const posCol = columnMap['pos'] || columnMap['position'] || columnMap['positions'] || { idx: 1, count: 3 };
            const forcesCol = columnMap['forces'] || columnMap['force'] || columnMap['frc'] || null;
            const velCol = columnMap['velocities'] || columnMap['velocity'] || columnMap['vel'] || null;
            const chargeCol = columnMap['charges'] || columnMap['charge'] || columnMap['q'] || null;
            const massCol = columnMap['masses'] || columnMap['mass'] || null;
            const magmomCol = columnMap['magmoms'] || columnMap['magmom'] || columnMap['magnetic_moments'] || null;
            const tagCol = columnMap['tags'] || columnMap['tag'] || null;

            const atomData = [];
            const startLine = i + 2;

            for (let j = startLine; j < startLine + numAtoms && j < lines.length; j++) {
                const parts = lines[j].trim().split(/\s+/);
                if (parts.length < posCol.idx + 3) continue;

                const element = parts[speciesCol.idx];
                const x = parseFloat(parts[posCol.idx]);
                const y = parseFloat(parts[posCol.idx + 1]);
                const z = parseFloat(parts[posCol.idx + 2]);

                const atom = { element, x, y, z };

                // Extract forces if available
                if (forcesCol && parts.length >= forcesCol.idx + 3) {
                    atom.fx = parseFloat(parts[forcesCol.idx]);
                    atom.fy = parseFloat(parts[forcesCol.idx + 1]);
                    atom.fz = parseFloat(parts[forcesCol.idx + 2]);
                }

                // Extract velocities if available
                if (velCol && parts.length >= velCol.idx + 3) {
                    atom.vx = parseFloat(parts[velCol.idx]);
                    atom.vy = parseFloat(parts[velCol.idx + 1]);
                    atom.vz = parseFloat(parts[velCol.idx + 2]);
                }

                // Extract charge if available
                if (chargeCol && parts.length >= chargeCol.idx + 1) {
                    atom.charge = parseFloat(parts[chargeCol.idx]);
                }

                // Extract mass if available
                if (massCol && parts.length >= massCol.idx + 1) {
                    atom.mass = parseFloat(parts[massCol.idx]);
                }

                // Extract magnetic moment if available
                if (magmomCol && parts.length >= magmomCol.idx + 1) {
                    atom.magmom = parseFloat(parts[magmomCol.idx]);
                }

                // Extract tag if available
                if (tagCol && parts.length >= tagCol.idx + 1) {
                    atom.tag = parseInt(parts[tagCol.idx]);
                }

                if (!isNaN(x) && !isNaN(y) && !isNaN(z)) {
                    atomData.push(atom);
                }
            }

            frames.push({ atomData, numAtoms: atomData.length, metadata });
            i = startLine + numAtoms;
        }

        window.xyzFrames = frames.length > 1 ? frames : null;
        window.frameEnergies = frameEnergies;
        window.frameMetadata = frameMetadata; // Store metadata globally
        window._pendingChartData = null; // Clear AI chart when loading new molecule

        window.updateEnergyChartButton?.();

        const result = frames.length > 0 ? { atomData: frames[0].atomData, numAtoms: frames[0].numAtoms } : { atomData: [], numAtoms: 0 };
        if (frames.length > 0 && frames[0].metadata) {
            result.metadata = frames[0].metadata;
        }
        return result;
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

        // Global metadata
        let cellParams = null;  // CRYST1 unit cell
        const helices = [];
        const sheets = [];
        const conectRecords = []; // Connectivity records
        const anisouData = {};   // ANISOU keyed by atom serial
        let energy = null;

        // Multi-model support
        const models = [];
        let currentModelAtoms = [];
        let currentModelBackbone = [];
        let inModel = false;
        let modelNumber = 0;

        // Helper to parse element from atom record
        const parseElement = (line, atomName, fullAtomName, residueName, recordType) => {
            let element = null;

            // Strategy 1: Try element column (77-78)
            if (line.length >= 78) {
                let elementField = line.substring(76, 78).trim();
                if (elementField) {
                    if (AVAILABLE_ELEMENTS.has(elementField)) {
                        return elementField;
                    }
                    elementField = elementField.toUpperCase();
                    if (CAPITALIZATION_MAP[elementField]) {
                        return CAPITALIZATION_MAP[elementField];
                    }
                    if (AVAILABLE_ELEMENTS.has(elementField)) {
                        return elementField;
                    }
                    if (elementField.length === 2) {
                        const properCap = elementField.charAt(0) + elementField.charAt(1).toLowerCase();
                        if (AVAILABLE_ELEMENTS.has(properCap)) {
                            return properCap;
                        }
                    }
                }
            }

            // Strategy 2: Parse from atom name
            if (!atomName) return 'C';

            if (/^\d/.test(atomName)) {
                element = atomName.charAt(1).toUpperCase();
                if (element === 'H') return 'H';
            }

            if (atomName === 'CA') {
                if (fullAtomName.charAt(0) === ' ' && AMINO_ACIDS.has(residueName)) {
                    return 'C';
                } else if (recordType === 'HETATM') {
                    return 'Ca';
                } else if (AMINO_ACIDS.has(residueName)) {
                    return 'C';
                }
                return 'Ca';
            }

            if (atomName.length >= 2 && fullAtomName.charAt(0) !== ' ') {
                let twoChar = atomName.substring(0, 2);
                if (CAPITALIZATION_MAP[twoChar]) {
                    return CAPITALIZATION_MAP[twoChar];
                }
                const properCap = twoChar.charAt(0) + twoChar.charAt(1).toLowerCase();
                if (AVAILABLE_ELEMENTS.has(properCap)) {
                    return properCap;
                }
            }

            const firstChar = atomName.charAt(0);
            if (AVAILABLE_ELEMENTS.has(firstChar)) {
                return firstChar;
            }

            if (atomName.startsWith('C')) return 'C';
            if (atomName.startsWith('N')) return 'N';
            if (atomName.startsWith('O')) return 'O';
            if (atomName.startsWith('S')) return 'S';
            if (atomName.startsWith('P')) return 'P';
            if (atomName.startsWith('H')) return 'H';
            return 'C';
        };

        // Single pass through all lines
        for (let i = 0; i < lines.length; i++) {
            const line = lines[i];
            if (!line) continue;

            const recordType = line.substring(0, 6).trim();

            // CRYST1 - Unit cell parameters
            // Format: CRYST1    a      b      c     alpha  beta   gamma sGroup Z
            if (recordType === 'CRYST1' && line.length >= 54) {
                const a = parseFloat(line.substring(6, 15).trim());
                const b = parseFloat(line.substring(15, 24).trim());
                const c = parseFloat(line.substring(24, 33).trim());
                const alpha = parseFloat(line.substring(33, 40).trim());
                const beta = parseFloat(line.substring(40, 47).trim());
                const gamma = parseFloat(line.substring(47, 54).trim());
                const spaceGroup = line.length >= 66 ? line.substring(55, 66).trim() : '';
                const z = line.length >= 70 ? parseInt(line.substring(66, 70).trim()) : null;

                if (!isNaN(a) && !isNaN(b) && !isNaN(c)) {
                    cellParams = { a, b, c, alpha, beta, gamma, spaceGroup, z };
                }
            }

            // MODEL - Start of a new model (multi-frame)
            else if (recordType === 'MODEL') {
                inModel = true;
                modelNumber = parseInt(line.substring(10, 14).trim()) || models.length + 1;
                currentModelAtoms = [];
                currentModelBackbone = [];
            }

            // ENDMDL - End of current model
            else if (recordType === 'ENDMDL') {
                if (currentModelAtoms.length > 0) {
                    models.push({
                        atomData: currentModelAtoms,
                        numAtoms: currentModelAtoms.length,
                        backbone: currentModelBackbone,
                        modelNumber
                    });
                }
                currentModelAtoms = [];
                currentModelBackbone = [];
                inModel = false;
            }

            // HELIX record
            else if (recordType === 'HELIX') {
                const chainId = line.charAt(19);
                const startRes = parseInt(line.substring(21, 25).trim());
                const endRes = parseInt(line.substring(33, 37).trim());
                const helixClass = line.length >= 40 ? parseInt(line.substring(38, 40).trim()) : 1;
                if (!isNaN(startRes) && !isNaN(endRes)) {
                    helices.push({ chain: chainId, start: startRes, end: endRes, helixClass });
                }
            }

            // SHEET record
            else if (recordType === 'SHEET') {
                const chainId = line.charAt(21);
                const startRes = parseInt(line.substring(22, 26).trim());
                const endRes = parseInt(line.substring(33, 37).trim());
                const sense = line.length >= 39 ? parseInt(line.substring(38, 39).trim()) : 0;
                if (!isNaN(startRes) && !isNaN(endRes)) {
                    sheets.push({ chain: chainId, start: startRes, end: endRes, sense });
                }
            }

            // CONECT - Connectivity records
            else if (recordType === 'CONECT') {
                const serialNum = parseInt(line.substring(6, 11).trim());
                const bonded = [];
                // Up to 4 bonded atoms per CONECT record
                for (let col = 11; col < 31 && col + 5 <= line.length; col += 5) {
                    const bondedSerial = parseInt(line.substring(col, col + 5).trim());
                    if (!isNaN(bondedSerial) && bondedSerial > 0) {
                        bonded.push(bondedSerial);
                    }
                }
                if (!isNaN(serialNum) && bonded.length > 0) {
                    conectRecords.push({ serial: serialNum, bonded });
                }
            }

            // ANISOU - Anisotropic temperature factors
            else if (recordType === 'ANISOU' && line.length >= 70) {
                const serial = parseInt(line.substring(6, 11).trim());
                const u11 = parseInt(line.substring(28, 35).trim());
                const u22 = parseInt(line.substring(35, 42).trim());
                const u33 = parseInt(line.substring(42, 49).trim());
                const u12 = parseInt(line.substring(49, 56).trim());
                const u13 = parseInt(line.substring(56, 63).trim());
                const u23 = parseInt(line.substring(63, 70).trim());
                if (!isNaN(serial)) {
                    // ANISOU values are in units of 10^-4 Å²
                    anisouData[serial] = {
                        u11: u11 / 10000, u22: u22 / 10000, u33: u33 / 10000,
                        u12: u12 / 10000, u13: u13 / 10000, u23: u23 / 10000
                    };
                }
            }

            // REMARK - Extract energy and other info
            else if (recordType === 'REMARK' && energy === null) {
                const energyMatch = line.match(/energy\s*[:=]\s*(-?[\d.eE+-]+)/i) ||
                    line.match(/total\s+energy\s*[:=]?\s*(-?[\d.eE+-]+)/i) ||
                    line.match(/potential\s+energy\s*[:=]?\s*(-?[\d.eE+-]+)/i);
                if (energyMatch) {
                    energy = parseFloat(energyMatch[1]);
                }
            }

            // ATOM and HETATM records
            else if ((recordType === 'ATOM' || recordType === 'HETATM') && line.length >= 54) {
                const serial = parseInt(line.substring(6, 11).trim());
                const fullAtomName = line.substring(12, 16);
                const atomName = fullAtomName.trim().toUpperCase();
                const altLoc = line.charAt(16);
                const residueName = line.substring(17, 20).trim().toUpperCase();
                const chainId = line.charAt(21);
                const resSeq = parseInt(line.substring(22, 26).trim());
                const iCode = line.charAt(26);
                const x = parseFloat(line.substring(30, 38));
                const y = parseFloat(line.substring(38, 46));
                const z = parseFloat(line.substring(46, 54));

                // Occupancy (columns 55-60) and B-factor/tempFactor (columns 61-66)
                const occupancy = line.length >= 60 ? parseFloat(line.substring(54, 60).trim()) : 1.0;
                const bFactor = line.length >= 66 ? parseFloat(line.substring(60, 66).trim()) : 0.0;

                // Charge (columns 79-80, format like "2+" or "1-")
                let charge = null;
                if (line.length >= 80) {
                    const chargeStr = line.substring(78, 80).trim();
                    if (chargeStr) {
                        const chargeMatch = chargeStr.match(/(\d)([+-])/);
                        if (chargeMatch) {
                            charge = parseInt(chargeMatch[1]) * (chargeMatch[2] === '+' ? 1 : -1);
                        }
                    }
                }

                if (isNaN(x) || isNaN(y) || isNaN(z)) continue;

                const element = parseElement(line, atomName, fullAtomName, residueName, recordType);

                const atom = {
                    element, x, y, z,
                    serial,
                    atomName: atomName,
                    residueName,
                    chainId,
                    resSeq,
                    occupancy: isNaN(occupancy) ? 1.0 : occupancy,
                    bFactor: isNaN(bFactor) ? 0.0 : bFactor
                };

                if (charge !== null) {
                    atom.charge = charge;
                }

                // Check for anisotropic data
                if (anisouData[serial]) {
                    atom.anisou = anisouData[serial];
                }

                // Capture CA atoms for ribbon
                if (atomName === 'CA' && fullAtomName.charAt(0) === ' ' && AMINO_ACIDS.has(residueName)) {
                    const backboneAtom = {
                        x, y, z,
                        chain: chainId,
                        resSeq,
                        residue: residueName
                    };
                    if (inModel) {
                        currentModelBackbone.push(backboneAtom);
                    } else {
                        currentModelBackbone.push(backboneAtom);
                    }
                }

                if (inModel) {
                    currentModelAtoms.push(atom);
                } else {
                    currentModelAtoms.push(atom);
                }
            }
        }

        // If we never saw MODEL/ENDMDL, treat all atoms as one model
        if (models.length === 0 && currentModelAtoms.length > 0) {
            models.push({
                atomData: currentModelAtoms,
                numAtoms: currentModelAtoms.length,
                backbone: currentModelBackbone,
                modelNumber: 1
            });
        }

        // Handle multi-model as frames
        if (models.length > 1) {
            window.xyzFrames = models.map((m, idx) => ({
                atomData: m.atomData,
                numAtoms: m.numAtoms,
                comment: `PDB Model ${m.modelNumber}`
            }));
            window.frameEnergies = models.map(() => energy); // Same energy for all if only one given
        } else {
            window.xyzFrames = null;
            window.frameEnergies = energy !== null ? [energy] : [null];
        }
        window._pendingChartData = null;
        window.updateEnergyChartButton?.();

        // Build result from first model
        const firstModel = models[0] || { atomData: [], numAtoms: 0, backbone: [] };

        const result = {
            atomData: firstModel.atomData,
            numAtoms: firstModel.numAtoms
        };

        // Add metadata
        const metadata = {};
        if (cellParams) {
            metadata.cell = cellParams;
        }
        if (conectRecords.length > 0) {
            metadata.conect = conectRecords;
        }
        if (Object.keys(metadata).length > 0) {
            result.metadata = metadata;
        }

        // Add ribbon data if protein backbone found
        if (firstModel.backbone && firstModel.backbone.length > 0) {
            result.ribbonData = {
                backbone: firstModel.backbone,
                helices,
                sheets
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

        // Set frameEnergies for consistency (CIF typically doesn't have energy data)
        window.frameEnergies = [null];
        window._pendingChartData = null;

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

        // Set frameEnergies for consistency (MOL2 typically doesn't have energy data)
        window.frameEnergies = [null];
        window._pendingChartData = null;

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

        // Set frameEnergies for consistency (PQR typically doesn't have energy data)
        window.frameEnergies = [null];
        window._pendingChartData = null;

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

        // Set frameEnergies for consistency (GRO typically doesn't have energy data)
        window.frameEnergies = [null];
        window._pendingChartData = null;

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

        // Set frameEnergies for consistency (CML typically doesn't have energy data)
        window.frameEnergies = [null];
        window._pendingChartData = null;

        return { atomData, numAtoms: atomData.length };
    }

    parseOutToJson(text) {
        // Enhanced parser for ORCA output files (.out)
        // Handles: coordinates, energy, forces, frequencies, dipole, charges, thermodynamics
        const lines = text.split(/\r?\n|\r/);
        const frames = [];
        const frameEnergies = [];
        let frameNumber = 0;

        // Global metadata to be parsed from anywhere in the file
        const metadata = {
            vibrations: [],       // Vibrational frequencies
            dipole: null,         // Dipole moment (x, y, z, total)
            mullikenCharges: [],  // Per-atom Mulliken charges
            loewdinCharges: [],   // Per-atom Loewdin charges
            thermodynamics: null, // Thermodynamic data
            orbitalEnergies: null, // HOMO/LUMO energies
            scfEnergies: [],      // SCF energies for convergence tracking
            multiplicity: null,
            charge: null
        };

        // First pass: Extract global metadata
        for (let i = 0; i < lines.length; i++) {
            const line = lines[i];

            // Multiplicity and charge
            if (line.includes('Multiplicity') && line.includes('Mult')) {
                const multMatch = line.match(/Mult\s*\.+\s*(\d+)/);
                if (multMatch) metadata.multiplicity = parseInt(multMatch[1]);
            }
            if (line.includes('Total Charge') && line.includes('Charge')) {
                const chargeMatch = line.match(/Charge\s*\.+\s*(-?\d+)/);
                if (chargeMatch) metadata.charge = parseInt(chargeMatch[1]);
            }

            // Dipole moment
            if (line.includes('DIPOLE MOMENT') && !line.includes('RELAXED')) {
                // Skip to the magnitude line
                for (let j = i + 1; j < Math.min(i + 10, lines.length); j++) {
                    if (lines[j].includes('Magnitude (Debye)')) {
                        const dipoleMatch = lines[j].match(/Magnitude \(Debye\)\s*:\s*(-?[\d.]+)/);
                        if (dipoleMatch) {
                            metadata.dipole = { total: parseFloat(dipoleMatch[1]) };
                        }
                    }
                    if (lines[j].includes('X') && lines[j].includes('Y') && lines[j].includes('Z') && !metadata.dipole?.x) {
                        const parts = lines[j].trim().split(/\s+/);
                        if (parts.length >= 6) {
                            metadata.dipole = {
                                ...metadata.dipole,
                                x: parseFloat(parts[1]),
                                y: parseFloat(parts[3]),
                                z: parseFloat(parts[5])
                            };
                        }
                    }
                }
            }

            // Vibrational frequencies
            if (line.includes('VIBRATIONAL FREQUENCIES')) {
                // Skip header lines
                let j = i + 2;
                while (j < lines.length) {
                    const freqLine = lines[j].trim();
                    if (freqLine === '' || freqLine.startsWith('---') || freqLine.includes('NORMAL MODES')) {
                        break;
                    }
                    // Format: index: frequency cm**-1
                    const freqMatch = freqLine.match(/^\s*(\d+):\s+(-?[\d.]+)\s+cm\*\*-1/);
                    if (freqMatch) {
                        const freq = parseFloat(freqMatch[2]);
                        if (!isNaN(freq) && Math.abs(freq) > 0.01) { // Skip near-zero frequencies
                            metadata.vibrations.push({
                                mode: parseInt(freqMatch[1]),
                                frequency: freq,
                                unit: 'cm^-1'
                            });
                        }
                    }
                    j++;
                }
            }

            // IR intensities (if available, associate with frequencies)
            if (line.includes('IR SPECTRUM')) {
                let j = i + 3; // Skip headers
                while (j < lines.length && metadata.vibrations.length > 0) {
                    const irLine = lines[j].trim();
                    if (irLine === '' || irLine.startsWith('---')) break;
                    // Format: mode freq intensity
                    const irMatch = irLine.match(/^\s*(\d+):\s+([\d.]+)\s+([\d.]+)/);
                    if (irMatch) {
                        const mode = parseInt(irMatch[1]);
                        const intensity = parseFloat(irMatch[3]);
                        const vib = metadata.vibrations.find(v => v.mode === mode);
                        if (vib) {
                            vib.irIntensity = intensity;
                        }
                    }
                    j++;
                }
            }

            // Mulliken charges
            if (line.includes('MULLIKEN ATOMIC CHARGES')) {
                let j = i + 2;
                while (j < lines.length) {
                    const chargeLine = lines[j].trim();
                    if (chargeLine === '' || chargeLine.includes('Sum of atomic charges')) break;
                    // Format: atom_idx: element charge
                    const chargeMatch = chargeLine.match(/^\s*(\d+)\s+([A-Za-z]+)\s*:\s*(-?[\d.]+)/);
                    if (chargeMatch) {
                        metadata.mullikenCharges.push({
                            index: parseInt(chargeMatch[1]),
                            element: chargeMatch[2],
                            charge: parseFloat(chargeMatch[3])
                        });
                    }
                    j++;
                }
            }

            // Loewdin charges
            if (line.includes('LOEWDIN ATOMIC CHARGES')) {
                let j = i + 2;
                while (j < lines.length) {
                    const chargeLine = lines[j].trim();
                    if (chargeLine === '' || chargeLine.includes('---')) break;
                    const chargeMatch = chargeLine.match(/^\s*(\d+)\s+([A-Za-z]+)\s*:\s*(-?[\d.]+)/);
                    if (chargeMatch) {
                        metadata.loewdinCharges.push({
                            index: parseInt(chargeMatch[1]),
                            element: chargeMatch[2],
                            charge: parseFloat(chargeMatch[3])
                        });
                    }
                    j++;
                }
            }

            // Orbital energies (HOMO/LUMO)
            if (line.includes('ORBITAL ENERGIES')) {
                let homoEnergy = null, lumoEnergy = null;
                let lastOccupied = null;
                let j = i + 4; // Skip headers
                while (j < lines.length) {
                    const orbLine = lines[j].trim();
                    if (orbLine === '' || orbLine.includes('---')) break;
                    // Format: NO OCC E(Eh) E(eV)
                    const orbMatch = orbLine.match(/^\s*(\d+)\s+([\d.]+)\s+(-?[\d.]+)\s+(-?[\d.]+)/);
                    if (orbMatch) {
                        const occ = parseFloat(orbMatch[2]);
                        const energyEv = parseFloat(orbMatch[4]);
                        if (occ > 0.5) {
                            lastOccupied = energyEv;
                        } else if (lastOccupied !== null && lumoEnergy === null) {
                            homoEnergy = lastOccupied;
                            lumoEnergy = energyEv;
                        }
                    }
                    j++;
                }
                if (homoEnergy !== null && lumoEnergy !== null) {
                    metadata.orbitalEnergies = {
                        homo: homoEnergy,
                        lumo: lumoEnergy,
                        gap: lumoEnergy - homoEnergy,
                        unit: 'eV'
                    };
                }
            }

            // Thermodynamics
            if (line.includes('THERMOCHEMISTRY')) {
                metadata.thermodynamics = {};
                for (let j = i; j < Math.min(i + 50, lines.length); j++) {
                    const thermLine = lines[j];
                    if (thermLine.includes('Temperature')) {
                        const tempMatch = thermLine.match(/Temperature\s*\.+\s*([\d.]+)\s*K/);
                        if (tempMatch) metadata.thermodynamics.temperature = parseFloat(tempMatch[1]);
                    }
                    if (thermLine.includes('Total enthalpy')) {
                        const hMatch = thermLine.match(/Total enthalpy\s*\.+\s*(-?[\d.]+)\s*Eh/);
                        if (hMatch) metadata.thermodynamics.enthalpy = parseFloat(hMatch[1]);
                    }
                    if (thermLine.includes('Total entropy correction')) {
                        const sMatch = thermLine.match(/Total entropy correction\s*\.+\s*(-?[\d.]+)\s*Eh/);
                        if (sMatch) metadata.thermodynamics.entropyCorrection = parseFloat(sMatch[1]);
                    }
                    if (thermLine.includes('Final Gibbs free energy')) {
                        const gMatch = thermLine.match(/Final Gibbs free energy\s*\.+\s*(-?[\d.]+)\s*Eh/);
                        if (gMatch) metadata.thermodynamics.gibbsFreeEnergy = parseFloat(gMatch[1]);
                    }
                    if (thermLine.includes('Zero point energy')) {
                        const zpeMatch = thermLine.match(/Zero point energy\s*\.+\s*(-?[\d.]+)\s*Eh/);
                        if (zpeMatch) metadata.thermodynamics.zeroPointEnergy = parseFloat(zpeMatch[1]);
                    }
                }
            }

            // SCF energies for convergence tracking
            if (line.includes('TOTAL SCF ENERGY')) {
                const scfMatch = line.match(/TOTAL SCF ENERGY\s+=\s+(-?[\d.]+)/);
                if (scfMatch) {
                    metadata.scfEnergies.push(parseFloat(scfMatch[1]));
                }
            }
        }

        // Second pass: Extract coordinates and per-frame data
        for (let i = 0; i < lines.length; i++) {
            const line = lines[i];

            // Look for the Cartesian coordinates section
            if (line.includes('CARTESIAN COORDINATES (ANGSTROEM)')) {
                frameNumber++;
                const atomData = [];
                i++; // Skip the dashes line

                // Parse coordinate lines until we hit the next section
                while (i < lines.length) {
                    i++;
                    const coordLine = lines[i];

                    // Stop at the next section (dashes or blank line)
                    if (!coordLine || coordLine.trim() === '' || coordLine.match(/^-{3,}/)) {
                        break;
                    }

                    // Parse coordinate line: Element X Y Z
                    const parts = coordLine.trim().split(/\s+/);
                    if (parts.length >= 4) {
                        const element = parts[0];
                        const x = parseFloat(parts[1]);
                        const y = parseFloat(parts[2]);
                        const z = parseFloat(parts[3]);

                        // Validate element symbol (should start with a letter)
                        if (/^[A-Z][a-z]?$/.test(element) && !isNaN(x) && !isNaN(y) && !isNaN(z)) {
                            const atom = { element, x, y, z };

                            // Add Mulliken charge if available for this atom
                            const atomIdx = atomData.length;
                            if (metadata.mullikenCharges[atomIdx]) {
                                atom.charge = metadata.mullikenCharges[atomIdx].charge;
                            }

                            atomData.push(atom);
                        }
                    }
                }

                // Now look ahead for energy and forces for this frame
                let energy = null;
                let j = i;

                // Search for the next FINAL SINGLE POINT ENERGY
                while (j < lines.length && j < i + 500) {
                    if (lines[j].includes('FINAL SINGLE POINT ENERGY')) {
                        const energyMatch = lines[j].match(/FINAL SINGLE POINT ENERGY\s+(-?[\d.]+)/);
                        if (energyMatch) {
                            energy = parseFloat(energyMatch[1]);
                        }
                        break;
                    }
                    j++;
                }
                frameEnergies.push(energy);

                // Search for the next CARTESIAN GRADIENT section to extract forces
                j = i;
                while (j < lines.length && j < i + 500) {
                    if (lines[j].includes('CARTESIAN GRADIENT')) {
                        j += 2; // Skip header and dashes

                        // Parse gradient lines (note: gradients are negative forces)
                        for (let atomIdx = 0; atomIdx < atomData.length && j < lines.length; atomIdx++) {
                            const gradLine = lines[j];
                            if (!gradLine || gradLine.trim() === '' || gradLine.includes('Difference')) {
                                break;
                            }

                            // Format: atom_number element : fx fy fz
                            const gradParts = gradLine.trim().split(/\s+/);
                            if (gradParts.length >= 5 && gradParts[2] === ':') {
                                // Gradients are negative forces, so negate them
                                atomData[atomIdx].fx = -parseFloat(gradParts[3]);
                                atomData[atomIdx].fy = -parseFloat(gradParts[4]);
                                atomData[atomIdx].fz = -parseFloat(gradParts[5]);
                            }
                            j++;
                        }
                        break;
                    }
                    j++;
                }

                // Add this frame if it has atoms
                if (atomData.length > 0) {
                    frames.push({
                        atomData,
                        numAtoms: atomData.length,
                        comment: `ORCA Frame ${frameNumber}`
                    });
                }
            }
        }

        if (frames.length === 0) {
            throw new Error('No valid coordinates found in ORCA output file');
        }

        // Store frames and energies globally (consistent with extxyz parser)
        window.xyzFrames = frames.length > 1 ? frames : null;
        window.frameEnergies = frameEnergies;
        window._pendingChartData = null;

        // Store metadata globally
        window.orcaMetadata = metadata;

        // Update energy chart button if available
        window.updateEnergyChartButton?.();

        // Return first frame data with metadata
        const result = {
            atomData: frames[0].atomData,
            numAtoms: frames[0].numAtoms
        };

        // Clean up metadata - only include non-empty fields
        const cleanMetadata = {};
        if (metadata.vibrations.length > 0) cleanMetadata.vibrations = metadata.vibrations;
        if (metadata.dipole) cleanMetadata.dipole = metadata.dipole;
        if (metadata.mullikenCharges.length > 0) cleanMetadata.mullikenCharges = metadata.mullikenCharges;
        if (metadata.loewdinCharges.length > 0) cleanMetadata.loewdinCharges = metadata.loewdinCharges;
        if (metadata.thermodynamics) cleanMetadata.thermodynamics = metadata.thermodynamics;
        if (metadata.orbitalEnergies) cleanMetadata.orbitalEnergies = metadata.orbitalEnergies;
        if (metadata.multiplicity !== null) cleanMetadata.multiplicity = metadata.multiplicity;
        if (metadata.charge !== null) cleanMetadata.charge = metadata.charge;

        if (Object.keys(cleanMetadata).length > 0) {
            result.metadata = cleanMetadata;
        }

        return result;
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

    /**
     * Parse Gaussian Cube file format for electron density / orbital visualization.
     * Cube files contain:
     * - Lines 1-2: Comment lines
     * - Line 3: Number of atoms (negative if multiple orbitals), origin (x, y, z) in Bohrs
     * - Lines 4-6: Voxel count and spanning vectors for X, Y, Z axes
     * - Atom lines: atomic number, nuclear charge, x, y, z position
     * - (Optional) Dataset identifiers line if NATOMS is negative
     * - Volumetric data: up to 6 values per line
     */
    parseCubeToJson(text) {
        const lines = text.split(/\r?\n|\r/);
        const BOHR_TO_ANGSTROM = 0.529177249;

        // Atomic numbers to element symbols
        const ATOMIC_SYMBOLS = {
            1: 'H', 2: 'He', 3: 'Li', 4: 'Be', 5: 'B', 6: 'C', 7: 'N', 8: 'O', 9: 'F', 10: 'Ne',
            11: 'Na', 12: 'Mg', 13: 'Al', 14: 'Si', 15: 'P', 16: 'S', 17: 'Cl', 18: 'Ar', 19: 'K', 20: 'Ca',
            21: 'Sc', 22: 'Ti', 23: 'V', 24: 'Cr', 25: 'Mn', 26: 'Fe', 27: 'Co', 28: 'Ni', 29: 'Cu', 30: 'Zn',
            31: 'Ga', 32: 'Ge', 33: 'As', 34: 'Se', 35: 'Br', 36: 'Kr', 37: 'Rb', 38: 'Sr', 39: 'Y', 40: 'Zr',
            41: 'Nb', 42: 'Mo', 43: 'Tc', 44: 'Ru', 45: 'Rh', 46: 'Pd', 47: 'Ag', 48: 'Cd', 49: 'In', 50: 'Sn',
            51: 'Sb', 52: 'Te', 53: 'I', 54: 'Xe', 55: 'Cs', 56: 'Ba', 57: 'La', 58: 'Ce', 59: 'Pr', 60: 'Nd',
            79: 'Au', 80: 'Hg', 82: 'Pb', 92: 'U'
        };

        if (lines.length < 6) {
            throw new Error('Invalid cube file: insufficient header lines');
        }

        // Lines 1-2: Comment lines
        const comment1 = lines[0].trim();
        const comment2 = lines[1].trim();

        // Line 3: Number of atoms, origin (x, y, z)
        const line3Parts = lines[2].trim().split(/\s+/).map(v => parseFloat(v));
        let numAtoms = Math.round(line3Parts[0]);
        const hasMultipleOrbitals = numAtoms < 0;
        numAtoms = Math.abs(numAtoms);
        const origin = {
            x: line3Parts[1] * BOHR_TO_ANGSTROM,
            y: line3Parts[2] * BOHR_TO_ANGSTROM,
            z: line3Parts[3] * BOHR_TO_ANGSTROM
        };

        // Lines 4-6: Voxel counts and spanning vectors
        // Positive voxel count = data in Bohrs, negative = Angstroms
        const parseAxisLine = (line) => {
            const parts = line.trim().split(/\s+/).map(v => parseFloat(v));
            const n = Math.abs(Math.round(parts[0]));
            const isAngstrom = parts[0] < 0;
            const scale = isAngstrom ? 1 : BOHR_TO_ANGSTROM;
            return {
                n: n,
                vector: [parts[1] * scale, parts[2] * scale, parts[3] * scale]
            };
        };

        const xAxis = parseAxisLine(lines[3]);
        const yAxis = parseAxisLine(lines[4]);
        const zAxis = parseAxisLine(lines[5]);

        // Parse atom lines
        const atomData = [];
        let lineIdx = 6;

        for (let i = 0; i < numAtoms && lineIdx < lines.length; i++, lineIdx++) {
            const parts = lines[lineIdx].trim().split(/\s+/).map(v => parseFloat(v));
            if (parts.length < 5) continue;

            const atomicNumber = Math.abs(Math.round(parts[0]));
            const element = ATOMIC_SYMBOLS[atomicNumber] || 'X';
            const charge = parts[1]; // Nuclear charge (may differ for ECPs)

            atomData.push({
                element: element,
                x: parts[2] * BOHR_TO_ANGSTROM,
                y: parts[3] * BOHR_TO_ANGSTROM,
                z: parts[4] * BOHR_TO_ANGSTROM,
                atomicNumber: atomicNumber,
                nuclearCharge: charge
            });
        }

        // Parse orbital indices if multiple orbitals
        let orbitalIndices = [];
        let numOrbitals = 1;
        if (hasMultipleOrbitals && lineIdx < lines.length) {
            const orbitalLine = lines[lineIdx].trim().split(/\s+/).map(v => parseInt(v));
            numOrbitals = orbitalLine[0] || 1;
            orbitalIndices = orbitalLine.slice(1, 1 + numOrbitals);
            lineIdx++;
        }

        // Parse volumetric data
        const totalVoxels = xAxis.n * yAxis.n * zAxis.n * numOrbitals;
        const volumeData = new Float32Array(totalVoxels);
        let dataIdx = 0;

        for (; lineIdx < lines.length && dataIdx < totalVoxels; lineIdx++) {
            const line = lines[lineIdx].trim();
            if (!line) continue;
            const values = line.split(/\s+/).map(v => parseFloat(v));
            for (const val of values) {
                if (!isNaN(val) && dataIdx < totalVoxels) {
                    volumeData[dataIdx++] = val;
                }
            }
        }

        // Store volumetric data globally for visualization
        const gridInfo = {
            origin: origin,
            dimensions: [xAxis.n, yAxis.n, zAxis.n],
            spacing: [
                Math.sqrt(xAxis.vector[0]**2 + xAxis.vector[1]**2 + xAxis.vector[2]**2),
                Math.sqrt(yAxis.vector[0]**2 + yAxis.vector[1]**2 + yAxis.vector[2]**2),
                Math.sqrt(zAxis.vector[0]**2 + zAxis.vector[1]**2 + zAxis.vector[2]**2)
            ],
            vectors: {
                x: xAxis.vector,
                y: yAxis.vector,
                z: zAxis.vector
            },
            numOrbitals: numOrbitals,
            orbitalIndices: orbitalIndices
        };

        // Calculate min/max values for adaptive isosurface defaults
        let minVal = Infinity, maxVal = -Infinity;
        for (let i = 0; i < volumeData.length; i++) {
            if (volumeData[i] < minVal) minVal = volumeData[i];
            if (volumeData[i] > maxVal) maxVal = volumeData[i];
        }

        // Store orbital data globally
        window.orbitalData = {
            volumeData: volumeData,
            gridInfo: gridInfo,
            minValue: minVal,
            maxValue: maxVal,
            comment: comment1 + ' ' + comment2,
            fileType: 'cube'
        };

        // Set frameEnergies for consistency
        window.frameEnergies = [null];
        window._pendingChartData = null;

        console.log('Parsed cube file:', {
            atoms: numAtoms,
            grid: `${xAxis.n}x${yAxis.n}x${zAxis.n}`,
            orbitals: numOrbitals,
            valueRange: [minVal, maxVal]
        });

        return {
            atomData: atomData,
            numAtoms: atomData.length,
            metadata: {
                type: 'cube',
                gridInfo: gridInfo,
                hasOrbital: true
            }
        };
    }

    /**
     * Parse Molden file format for molecular orbitals.
     * Molden files contain:
     * - [ATOMS] section: atomic coordinates
     * - [GTO] section: Gaussian basis functions
     * - [MO] section: molecular orbital coefficients
     *
     * Reference: https://www.theochem.ru.nl/molden/molden_format.html
     *
     * Note: Different quantum chemistry programs produce Molden files with different conventions:
     * - ORCA: Contraction coefficients include normalization factors (don't renormalize)
     * - Gaussian: Contraction coefficients are raw (need normalization)
     * - Psi4, GAMESS, etc.: Various conventions
     */
    parseMoldenToJson(text) {
        const lines = text.split(/\r?\n|\r/);
        const atomData = [];
        const orbitals = [];
        const basisFunctions = [];
        let coordUnit = 'angstrom'; // Default to Angstrom

        // Detect source program (affects normalization conventions)
        let sourceProgram = 'unknown';
        const textLower = text.toLowerCase();
        if (textLower.includes('orca') || textLower.includes('orca_2mkl')) {
            sourceProgram = 'orca';
        } else if (textLower.includes('gaussian') || textLower.includes('g09') || textLower.includes('g16')) {
            sourceProgram = 'gaussian';
        } else if (textLower.includes('psi4')) {
            sourceProgram = 'psi4';
        } else if (textLower.includes('gamess')) {
            sourceProgram = 'gamess';
        } else if (textLower.includes('nwchem')) {
            sourceProgram = 'nwchem';
        } else if (textLower.includes('qchem') || textLower.includes('q-chem')) {
            sourceProgram = 'qchem';
        } else if (textLower.includes('molpro')) {
            sourceProgram = 'molpro';
        } else if (textLower.includes('turbomole')) {
            sourceProgram = 'turbomole';
        }

        // Spherical harmonics flags (default is Cartesian)
        let useSphericalD = false; // [5D] - 5 spherical D instead of 6 Cartesian
        let useSphericalF = false; // [7F] - 7 spherical F instead of 10 Cartesian
        let useSphericalG = false; // [9G] - 9 spherical G instead of 15 Cartesian

        // State tracking
        let currentSection = null;
        let currentAtomGTO = null;
        let currentShell = null;
        let currentMO = null;

        // Parse [ATOMS] section
        // Format: [Atoms] (Angs|AU)
        //         element_name number atomic_number x y z
        const parseAtomLine = (line) => {
            const parts = line.trim().split(/\s+/);
            if (parts.length < 6) return null;

            const element = parts[0];
            // Skip if it looks like a keyword
            if (element.startsWith('[') || element.startsWith('_')) return null;

            const atomNumber = parseInt(parts[1]);
            const atomicNumber = parseInt(parts[2]);
            let x = parseFloat(parts[3]);
            let y = parseFloat(parts[4]);
            let z = parseFloat(parts[5]);

            // Convert Bohr to Angstrom if needed
            if (coordUnit === 'au' || coordUnit === 'bohr') {
                const BOHR_TO_ANG = 0.529177249;
                x *= BOHR_TO_ANG;
                y *= BOHR_TO_ANG;
                z *= BOHR_TO_ANG;
            }

            if (isNaN(x) || isNaN(y) || isNaN(z)) return null;

            return {
                element: element,
                x: x,
                y: y,
                z: z,
                atomNumber: atomNumber,
                atomicNumber: atomicNumber
            };
        };

        for (let i = 0; i < lines.length; i++) {
            const line = lines[i];
            const trimmed = line.trim();

            // Skip empty lines
            if (!trimmed) continue;

            // Detect section headers
            if (trimmed.startsWith('[')) {
                const sectionMatch = trimmed.match(/\[(\w+)\]\s*(.*)/i);
                if (sectionMatch) {
                    currentSection = sectionMatch[1].toLowerCase();
                    const sectionArg = sectionMatch[2].toLowerCase();

                    // Check for coordinate units in [ATOMS] section
                    if (currentSection === 'atoms') {
                        if (sectionArg.includes('au') || sectionArg.includes('bohr')) {
                            coordUnit = 'au';
                        } else {
                            coordUnit = 'angstrom';
                        }
                    }
                    continue;
                }
            }

            // Handle spherical harmonics keywords
            // Default is Cartesian (6D, 10F, 15G)
            // These keywords switch to spherical harmonics
            if (trimmed === '[5D]' || trimmed === '[5D7F]' || trimmed === '[5D10F]') {
                useSphericalD = true;
                if (trimmed === '[5D7F]') {
                    useSphericalF = true;
                }
                continue;
            }
            if (trimmed === '[7F]') {
                useSphericalF = true;
                continue;
            }
            if (trimmed === '[9G]') {
                useSphericalG = true;
                continue;
            }

            // Parse based on current section
            if (currentSection === 'atoms') {
                const atom = parseAtomLine(line);
                if (atom) {
                    atomData.push(atom);
                }
            }
            else if (currentSection === 'gto') {
                // GTO format:
                // atom_number 0
                // shell_type num_primitives 1.00
                // exponent coefficient [coefficient2 for sp]
                const parts = trimmed.split(/\s+/);

                if (parts.length === 2 && parts[1] === '0') {
                    // New atom definition
                    currentAtomGTO = parseInt(parts[0]);
                    currentShell = null;
                } else if (parts.length >= 3 && /^[spdfg]/i.test(parts[0])) {
                    // Shell definition
                    currentShell = {
                        type: parts[0].toLowerCase(),
                        numPrimitives: parseInt(parts[1]),
                        primitives: [],
                        atomNumber: currentAtomGTO
                    };
                    basisFunctions.push(currentShell);
                } else if (currentShell && parts.length >= 2) {
                    // Primitive exponent and coefficient(s)
                    const exp = parseFloat(parts[0].replace('D', 'E').replace('d', 'e'));
                    const coef = parseFloat(parts[1].replace('D', 'E').replace('d', 'e'));
                    let coef2 = null;
                    if (parts.length >= 3 && currentShell.type === 'sp') {
                        coef2 = parseFloat(parts[2].replace('D', 'E').replace('d', 'e'));
                    }
                    if (!isNaN(exp) && !isNaN(coef)) {
                        currentShell.primitives.push({
                            exponent: exp,
                            coefficient: coef,
                            coefficient2: coef2
                        });
                    }
                }
            }
            else if (currentSection === 'mo') {
                // MO format:
                // Sym= symmetry_label
                // Ene= energy
                // Spin= Alpha|Beta
                // Occup= occupation
                // ao_index coefficient
                if (trimmed.startsWith('Sym=') || trimmed.startsWith('sym=')) {
                    // Start of new MO
                    if (currentMO && currentMO.coefficients.length > 0) {
                        orbitals.push(currentMO);
                    }
                    currentMO = {
                        symmetry: trimmed.split('=')[1].trim(),
                        energy: null,
                        spin: 'Alpha',
                        occupation: 0,
                        coefficients: []
                    };
                } else if (trimmed.startsWith('Ene=') || trimmed.startsWith('ene=')) {
                    if (currentMO) {
                        currentMO.energy = parseFloat(trimmed.split('=')[1].trim());
                    }
                } else if (trimmed.startsWith('Spin=') || trimmed.startsWith('spin=')) {
                    if (currentMO) {
                        currentMO.spin = trimmed.split('=')[1].trim();
                    }
                } else if (trimmed.startsWith('Occup=') || trimmed.startsWith('occup=')) {
                    if (currentMO) {
                        currentMO.occupation = parseFloat(trimmed.split('=')[1].trim());
                    }
                } else if (currentMO) {
                    // AO coefficient line
                    const parts = trimmed.split(/\s+/);
                    if (parts.length >= 2) {
                        const aoIdx = parseInt(parts[0]);
                        // Handle Fortran D-notation in scientific numbers (e.g., 1.234D-05)
                        const coef = parseFloat(parts[1].replace(/[Dd]/g, 'E'));
                        if (!isNaN(aoIdx) && !isNaN(coef)) {
                            currentMO.coefficients.push({
                                aoIndex: aoIdx,
                                coefficient: coef
                            });
                        }
                    }
                }
            }
        }

        // Don't forget the last MO
        if (currentMO && currentMO.coefficients.length > 0) {
            orbitals.push(currentMO);
        }

        // Find HOMO and LUMO
        let homoIdx = -1, lumoIdx = -1;
        for (let i = 0; i < orbitals.length; i++) {
            if (orbitals[i].occupation > 0.5) {
                homoIdx = i;
            } else if (lumoIdx === -1 && orbitals[i].occupation <= 0.5) {
                lumoIdx = i;
            }
        }

        // Store orbital data globally
        window.moldenData = {
            orbitals: orbitals,
            basisFunctions: basisFunctions,
            homoIndex: homoIdx,
            lumoIndex: lumoIdx,
            fileType: 'molden',
            // Spherical harmonics flags
            useSphericalD: useSphericalD,
            useSphericalF: useSphericalF,
            useSphericalG: useSphericalG,
            // Source program (affects normalization)
            sourceProgram: sourceProgram
        };

        // Set frameEnergies for consistency
        window.frameEnergies = [null];
        window._pendingChartData = null;

        // Warn about spherical harmonics (not yet fully supported)
        if (useSphericalD || useSphericalF || useSphericalG) {
            const sphericalTypes = [];
            if (useSphericalD) sphericalTypes.push('5D');
            if (useSphericalF) sphericalTypes.push('7F');
            if (useSphericalG) sphericalTypes.push('9G');
            console.warn(`Molden file uses spherical harmonics (${sphericalTypes.join(', ')}). ` +
                'Orbital visualization may be incorrect for orbitals with D, F, or G character. ' +
                'Cartesian basis functions are fully supported.');
        }

        // Log source program detection
        if (sourceProgram !== 'unknown') {
            console.log(`Detected Molden file from: ${sourceProgram.toUpperCase()}`);
        }

        console.log('Parsed Molden file:', {
            atoms: atomData.length,
            orbitals: orbitals.length,
            basisFunctions: basisFunctions.length,
            homo: homoIdx >= 0 ? homoIdx + 1 : 'N/A',
            lumo: lumoIdx >= 0 ? lumoIdx + 1 : 'N/A',
            spherical: { D: useSphericalD, F: useSphericalF, G: useSphericalG },
            source: sourceProgram
        });

        return {
            atomData: atomData,
            numAtoms: atomData.length,
            metadata: {
                type: 'molden',
                numOrbitals: orbitals.length,
                homoIndex: homoIdx,
                lumoIndex: lumoIdx,
                hasOrbital: orbitals.length > 0
            }
        };
    }

}
