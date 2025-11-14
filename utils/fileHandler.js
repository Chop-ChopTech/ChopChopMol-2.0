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

        const reader = new FileReader();
        reader.onload = (e) => {
            try {
                const text = e.target.result;
                const fileType = findFileType(file);
                let parsedData = null;

                if (fileType === 'mol') {
                    parsedData = this.parseMolToJson(text);
                } else if (fileType === 'pdb') {
                    parsedData = this.parsePdbToJson(text);
                } else if (fileType === 'xyz') {
                    parsedData = this.parseXyzToJson(text);
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

                this.main.createNewMoleculeFromJSON(JSON.stringify(parsedData), overlay, rotation, translation, true, false);
                this.main.zoomCameraToFitMolecule();


            } catch (error) {
                console.error("Error parsing file:", error);
            }
        };
        reader.readAsText(file);
    }

    parseXyzToJson(content) {
        const lines = content.trim().split('\n');
        if (lines.length < 2) {
            throw new Error('Invalid XYZ format: Too few lines');
        }

        const numAtoms = parseInt(lines[0].trim(), 10);
        if (isNaN(numAtoms) || numAtoms <= 0) {
            throw new Error('Invalid XYZ format: Invalid number of atoms');
        }

        // Skip the comment line (lines[1])

        const atomData = [];
        const startLine = 2;
        if (lines.length < startLine + numAtoms) {
            throw new Error('Invalid XYZ format: Insufficient atom lines');
        }

        for (let i = startLine; i < startLine + numAtoms; i++) {
            const parts = lines[i].trim().split(/\s+/);
            if (parts.length !== 4) {
                throw new Error(`Invalid XYZ format: Incorrect number of fields in line ${i + 1}`);
            }

            const element = parts[0].trim();
            const x = parseFloat(parts[1]);
            const y = parseFloat(parts[2]);
            const z = parseFloat(parts[3]);

            if (isNaN(x) || isNaN(y) || isNaN(z)) {
                throw new Error(`Invalid XYZ format: Non-numeric coordinates in line ${i + 1}`);
            }

            atomData.push({ element, x, y, z });
        }

        return { atomData, numAtoms };
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
