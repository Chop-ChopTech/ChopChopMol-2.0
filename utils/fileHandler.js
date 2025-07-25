export default class FileHandler {
    constructor(main) {
        this.main = main;
        this.data = null;
        this.handleFile = this.handleFile.bind(this);

    }

    handleFile(event, overlayOn) {
        const file = event.target.files[0];
        const overlay = overlayOn
        let rotation = { x: 0, y: 0, z: 0 }
        let translation = { x: 0, y: 0, z: 0 }
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
                    console.log(rotation, translation);

                }
                if (parsedData.numAtoms <= 800) {
                    this.main.setNewMode(true);
                    document.getElementById("toggleStyleChanges").checked = true;
                } else {
                    this.main.setNewMode();
                    document.getElementById("toggleStyleChanges").checked = false;

                }
                this.main.createNewMoleculeFromJSON((JSON.stringify(parsedData)), overlay, rotation, translation);


            } catch (error) {
                console.error("Error parsing XYZ file:", error);
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
        const lines = pdbText.split('\n');
        const atomData = [];

        for (const line of lines) {
            if (line.startsWith('ATOM') || line.startsWith('HETATM')) {
                const x = parseFloat(line.slice(30, 38).trim());
                const y = parseFloat(line.slice(38, 46).trim());
                const z = parseFloat(line.slice(46, 54).trim());

                let element = line.slice(76, 78).trim();
                if (!element) {
                    // Fallback: try getting element from atom name
                    element = line.slice(12, 14).trim().replace(/[0-9]/g, '');
                }

                atomData.push({ element, x, y, z });
            }
        }

        return {
            atomData,
            numAtoms: atomData.length
        };
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
