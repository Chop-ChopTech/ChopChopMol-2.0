export default class FileHandler {
    constructor(main) {
        this.main = main;
        this.data = null;
        this.handleFile = this.handleFile.bind(this);
        this.json={
            "O": { "color": "red", "radius": 1, "realRadius": 0.24 },
            "C": { "color": "gray", "radius": 1.25, "realRadius": 0.28 },
            "H": { "color": "lightgray", "radius": 0.5, "realRadius": 0.1 },
            "Si": { "color": "darkgray", "radius": 1.75, "realRadius": 0.34 },
            "N": { "color": "blue", "radius": 0.65, "realRadius": 0.26 },
            "S": { "color": "yellow", "radius": 1.5, "realRadius": 0.45 }
        }
    }

    handleFile(event) {
        const file = event.target.files[0];
        if (!file) return;

        const reader = new FileReader();
        reader.onload = (e) => {
            try {
                const text = e.target.result;
                const parsedData = this.parseXYZ(text);
                this.data = parsedData;
                this.main.data = parsedData; // Now correctly updates `main.data`

                // Initialize molecule rendering *after* data is available
                this.main.init();
            } catch (error) {
                console.error("Error parsing XYZ file:", error);
            }
        };
        reader.readAsText(file);
    }

    parseXYZ(text) {
        try {
            let jsonMol={};
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
            console.log(atomData)

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
