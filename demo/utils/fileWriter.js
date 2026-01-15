// Comprehensive file format writer for molecular data
// Supports: XYZ, Extended XYZ, MOL/SDF, PDB, CIF, GRO, PQR, MOL2
// Auto-includes energy, forces, and other metadata when available

/**
 * Generates timestamp for filenames
 */
export function generateTimestamp() {
    return new Date().toISOString().replace(/[:.]/g, '-').slice(0, 19);
}

/**
 * Writes basic XYZ format
 * Supports optional forces in columns 4-6 and charges in column 7
 */
export function writeXYZ(data, options = {}) {
    const { includeForces = true, includeCharges = false, comment = null } = options;
    const frames = data.frames || [{ atomData: data.atomData, energy: data.energy }];

    let content = '';

    frames.forEach((frame, frameIdx) => {
        const atoms = frame.atomData || frame.atoms || [];
        content += `${atoms.length}\n`;

        // Comment line with energy if available
        let commentLine = comment || `ChopChopMol 2.0 - ${generateTimestamp()}`;
        const energy = frame.energy !== undefined && frame.energy !== null
            ? frame.energy
            : (data.energies && data.energies[frameIdx]);
        if (energy !== null && energy !== undefined) {
            commentLine += ` energy=${energy}`;
        }
        content += commentLine + '\n';

        // Atom lines
        atoms.forEach(atom => {
            const element = atom.element.padEnd(4);
            const x = atom.x.toFixed(8).padStart(14);
            const y = atom.y.toFixed(8).padStart(14);
            const z = atom.z.toFixed(8).padStart(14);

            let line = `${element}${x}${y}${z}`;

            // Add forces if requested and available
            if (includeForces && atom.fx !== undefined) {
                const fx = atom.fx.toFixed(8).padStart(14);
                const fy = atom.fy.toFixed(8).padStart(14);
                const fz = atom.fz.toFixed(8).padStart(14);
                line += `${fx}${fy}${fz}`;
            }

            // Add charge if requested and available
            if (includeCharges && atom.charge !== undefined) {
                const charge = atom.charge.toFixed(6).padStart(12);
                line += `${charge}`;
            }

            content += line + '\n';
        });
    });

    return content;
}

/**
 * Writes Extended XYZ format with full metadata support
 */
export function writeExtXYZ(data, options = {}) {
    const frames = data.frames || [{
        atomData: data.atomData,
        energy: data.energy,
        metadata: data.metadata
    }];

    let content = '';

    frames.forEach((frame, frameIdx) => {
        const atoms = frame.atomData || frame.atoms || [];
        const metadata = frame.metadata || data.metadata || {};

        content += `${atoms.length}\n`;

        // Build Properties string based on available data
        const hasForces = atoms.some(a => a.fx !== undefined);
        const hasVelocities = atoms.some(a => a.vx !== undefined);
        const hasCharges = atoms.some(a => a.charge !== undefined);
        const hasMasses = atoms.some(a => a.mass !== undefined);

        let properties = 'species:S:1:pos:R:3';
        if (hasForces) properties += ':forces:R:3';
        if (hasVelocities) properties += ':velocities:R:3';
        if (hasCharges) properties += ':charges:R:1';
        if (hasMasses) properties += ':masses:R:1';

        // Build comment line with all metadata
        let commentParts = [`Properties="${properties}"`];

        // Energy
        const energy = frame.energy !== undefined && frame.energy !== null
            ? frame.energy
            : (data.energies && data.energies[frameIdx]);
        if (energy !== null && energy !== undefined) {
            commentParts.push(`energy=${energy}`);
        }

        // Lattice
        if (metadata.lattice) {
            const lat = metadata.lattice;
            const latticeStr = `${lat.a.join(' ')} ${lat.b.join(' ')} ${lat.c.join(' ')}`;
            commentParts.push(`Lattice="${latticeStr}"`);
        }

        // PBC
        if (metadata.pbc) {
            const pbcStr = metadata.pbc.map(b => b ? 'T' : 'F').join(' ');
            commentParts.push(`pbc="${pbcStr}"`);
        } else {
            commentParts.push(`pbc="F F F"`); // Default: no periodic boundaries
        }

        // Virial
        if (metadata.virial) {
            const v = metadata.virial;
            const virialStr = `${v[0].join(' ')} ${v[1].join(' ')} ${v[2].join(' ')}`;
            commentParts.push(`virial="${virialStr}"`);
        }

        // Stress
        if (metadata.stress) {
            const s = metadata.stress;
            const stressStr = `${s[0].join(' ')} ${s[1].join(' ')} ${s[2].join(' ')}`;
            commentParts.push(`stress="${stressStr}"`);
        }

        // Config type
        if (metadata.configType) {
            commentParts.push(`config_type="${metadata.configType}"`);
        }

        content += commentParts.join(' ') + '\n';

        // Atom lines
        atoms.forEach(atom => {
            const element = atom.element.padEnd(4);
            const x = atom.x.toFixed(8).padStart(14);
            const y = atom.y.toFixed(8).padStart(14);
            const z = atom.z.toFixed(8).padStart(14);

            let line = `${element}${x}${y}${z}`;

            if (hasForces && atom.fx !== undefined) {
                line += ` ${atom.fx.toFixed(8).padStart(14)} ${atom.fy.toFixed(8).padStart(14)} ${atom.fz.toFixed(8).padStart(14)}`;
            }
            if (hasVelocities && atom.vx !== undefined) {
                line += ` ${atom.vx.toFixed(8).padStart(14)} ${atom.vy.toFixed(8).padStart(14)} ${atom.vz.toFixed(8).padStart(14)}`;
            }
            if (hasCharges && atom.charge !== undefined) {
                line += ` ${atom.charge.toFixed(6).padStart(12)}`;
            }
            if (hasMasses && atom.mass !== undefined) {
                line += ` ${atom.mass.toFixed(6).padStart(12)}`;
            }

            content += line + '\n';
        });
    });

    return content;
}

/**
 * Writes MOL/SDF format (V2000)
 */
export function writeMOL(data, options = {}) {
    const atoms = data.atomData || data.atoms || [];
    const timestamp = generateTimestamp();

    let content = '';

    // Header block (3 lines)
    content += (options.title || `ChopChopMol ${timestamp}`) + '\n';
    content += '  Generated by ChopChopMol 2.0\n';
    content += `  ${timestamp}\n`;

    // Counts line: aaabbblllfffcccsssxxxrrrpppiiimmmvvvvvv
    const numAtoms = atoms.length;
    const numBonds = 0; // We don't have bond info by default
    content += numAtoms.toString().padStart(3) + numBonds.toString().padStart(3) + '  0  0  0  0  0  0  0  0999 V2000\n';

    // Atom block
    atoms.forEach(atom => {
        const x = atom.x.toFixed(4).padStart(10);
        const y = atom.y.toFixed(4).padStart(10);
        const z = atom.z.toFixed(4).padStart(10);
        const element = atom.element.padEnd(3);
        const massDiff = ' 0';
        const charge = '  0';

        content += `${x}${y}${z} ${element}${massDiff}${charge}  0  0  0  0  0  0  0  0  0  0\n`;
    });

    // Bond block (empty for now)

    content += 'M  END\n';

    return content;
}

/**
 * Writes PDB format
 */
export function writePDB(data, options = {}) {
    const atoms = data.atomData || data.atoms || [];
    const metadata = data.metadata || {};

    let content = '';

    // HEADER
    content += 'HEADER    MOLECULE GENERATED BY CHOPCHHOPMOL 2.0\n';
    content += `TITLE     ${options.title || 'MOLECULE'}\n`;

    // CRYST1 (crystal parameters) if available
    if (metadata.cell) {
        const c = metadata.cell;
        content += 'CRYST1';
        content += c.a.toFixed(3).padStart(9);
        content += c.b.toFixed(3).padStart(9);
        content += c.c.toFixed(3).padStart(9);
        content += c.alpha.toFixed(2).padStart(7);
        content += c.beta.toFixed(2).padStart(7);
        content += c.gamma.toFixed(2).padStart(7);
        content += ` ${(c.spaceGroup || 'P 1').padEnd(11)}`;
        if (c.z) content += c.z.toString().padStart(4);
        content += '\n';
    }

    // REMARK with energy if available
    if (data.energy !== null && data.energy !== undefined) {
        content += `REMARK   1 ENERGY = ${data.energy}\n`;
    }

    // ATOM records
    atoms.forEach((atom, i) => {
        const serial = (i + 1).toString().padStart(5);
        const atomName = atom.atomName || atom.element.padEnd(4);
        const resName = atom.residueName || 'MOL';
        const chainId = atom.chainId || 'A';
        const resSeq = (atom.resSeq || 1).toString().padStart(4);
        const x = atom.x.toFixed(3).padStart(8);
        const y = atom.y.toFixed(3).padStart(8);
        const z = atom.z.toFixed(3).padStart(8);
        const occupancy = (atom.occupancy !== undefined ? atom.occupancy : 1.00).toFixed(2).padStart(6);
        const bFactor = (atom.bFactor !== undefined ? atom.bFactor : 0.00).toFixed(2).padStart(6);
        const element = atom.element.padStart(2);

        content += `ATOM  ${serial} ${atomName.padEnd(4)} ${resName.padEnd(3)} ${chainId}${resSeq}    ${x}${y}${z}${occupancy}${bFactor}          ${element}\n`;

        // ANISOU if available
        if (atom.anisou) {
            const a = atom.anisou;
            const u11 = Math.round(a.u11 * 10000).toString().padStart(7);
            const u22 = Math.round(a.u22 * 10000).toString().padStart(7);
            const u33 = Math.round(a.u33 * 10000).toString().padStart(7);
            const u12 = Math.round(a.u12 * 10000).toString().padStart(7);
            const u13 = Math.round(a.u13 * 10000).toString().padStart(7);
            const u23 = Math.round(a.u23 * 10000).toString().padStart(7);
            content += `ANISOU${serial} ${atomName.padEnd(4)} ${resName.padEnd(3)} ${chainId}${resSeq}   ${u11}${u22}${u33}${u12}${u13}${u23}      ${element}\n`;
        }
    });

    // CONECT records if available
    if (metadata.conect && Array.isArray(metadata.conect)) {
        metadata.conect.forEach(conn => {
            content += `CONECT${conn.serial.toString().padStart(5)}`;
            conn.bonded.forEach(b => {
                content += b.toString().padStart(5);
            });
            content += '\n';
        });
    }

    content += 'END\n';

    return content;
}

/**
 * Writes PQR format (PDB with charge and radius)
 */
export function writePQR(data, options = {}) {
    const atoms = data.atomData || data.atoms || [];

    let content = '';
    content += 'REMARK   Generated by ChopChopMol 2.0\n';

    atoms.forEach((atom, i) => {
        const serial = (i + 1).toString().padStart(5);
        const atomName = atom.element.padEnd(4);
        const resName = 'MOL';
        const chainId = 'A';
        const resSeq = '   1';
        const x = atom.x.toFixed(3).padStart(8);
        const y = atom.y.toFixed(3).padStart(8);
        const z = atom.z.toFixed(3).padStart(8);
        const charge = (atom.charge !== undefined ? atom.charge : 0.0).toFixed(4).padStart(8);
        const radius = (atom.radius !== undefined ? atom.radius : 1.5).toFixed(4).padStart(7);

        content += `ATOM  ${serial} ${atomName} ${resName} ${chainId}${resSeq}    ${x}${y}${z}${charge}${radius}\n`;
    });

    content += 'END\n';

    return content;
}

/**
 * Writes GROMACS GRO format
 */
export function writeGRO(data, options = {}) {
    const atoms = data.atomData || data.atoms || [];

    let content = '';

    // Title line
    content += `ChopChopMol 2.0 - ${generateTimestamp()}\n`;

    // Number of atoms
    content += atoms.length.toString().padStart(5) + '\n';

    // Atom lines
    atoms.forEach((atom, i) => {
        const resNum = '    1';
        const resName = 'MOL'.padEnd(5);
        const atomName = atom.element.padStart(5);
        const atomNum = ((i + 1) % 100000).toString().padStart(5);
        const x = (atom.x / 10).toFixed(3).padStart(8); // Å to nm
        const y = (atom.y / 10).toFixed(3).padStart(8);
        const z = (atom.z / 10).toFixed(3).padStart(8);

        let line = `${resNum}${resName}${atomName}${atomNum}${x}${y}${z}`;

        // Velocities if available (in nm/ps)
        if (atom.vx !== undefined) {
            const vx = (atom.vx / 10).toFixed(4).padStart(8);
            const vy = (atom.vy / 10).toFixed(4).padStart(8);
            const vz = (atom.vz / 10).toFixed(4).padStart(8);
            line += `${vx}${vy}${vz}`;
        }

        content += line + '\n';
    });

    // Box vectors (default: large cubic box)
    content += '  10.00000  10.00000  10.00000\n';

    return content;
}

/**
 * Writes MOL2 format
 */
export function writeMOL2(data, options = {}) {
    const atoms = data.atomData || data.atoms || [];

    let content = '';

    // Molecule section
    content += '@<TRIPOS>MOLECULE\n';
    content += (options.title || 'ChopChopMol Molecule') + '\n';
    content += `${atoms.length} 0 0 0 0\n`;
    content += 'SMALL\n';
    content += 'NO_CHARGES\n\n';

    // Atom section
    content += '@<TRIPOS>ATOM\n';
    atoms.forEach((atom, i) => {
        const id = (i + 1).toString().padStart(7);
        const name = atom.element + (i + 1);
        const x = atom.x.toFixed(4).padStart(10);
        const y = atom.y.toFixed(4).padStart(10);
        const z = atom.z.toFixed(4).padStart(10);
        const type = atom.element;
        const subst = '1';
        const substName = 'MOL';
        const charge = (atom.charge !== undefined ? atom.charge : 0.0).toFixed(4).padStart(10);

        content += `${id} ${name.padEnd(8)}${x}${y}${z} ${type.padEnd(8)} ${subst.padStart(5)} ${substName.padEnd(8)}${charge}\n`;
    });

    return content;
}

/**
 * Auto-detects format from filename extension
 */
export function detectFormat(filename) {
    const ext = filename.toLowerCase().split('.').pop();
    const formatMap = {
        'xyz': 'xyz',
        'extxyz': 'extxyz',
        'mol': 'mol',
        'sdf': 'mol',
        'pdb': 'pdb',
        'ent': 'pdb',
        'pqr': 'pqr',
        'gro': 'gro',
        'mol2': 'mol2'
    };
    return formatMap[ext] || 'xyz';
}

/**
 * Main save function - auto-selects writer based on format
 */
export function saveFile(data, filename, format = null) {
    // Auto-detect format if not specified
    if (!format) {
        format = detectFormat(filename);
    }

    // Prepare data structure
    const saveData = {
        atomData: data.atomData || data.atoms,
        energy: data.energy,
        metadata: data.metadata,
        frames: data.frames,
        energies: data.energies
    };

    // Call appropriate writer
    let content;
    switch (format.toLowerCase()) {
        case 'extxyz':
            content = writeExtXYZ(saveData);
            break;
        case 'mol':
        case 'sdf':
            content = writeMOL(saveData);
            break;
        case 'pdb':
            content = writePDB(saveData);
            break;
        case 'pqr':
            content = writePQR(saveData);
            break;
        case 'gro':
            content = writeGRO(saveData);
            break;
        case 'mol2':
            content = writeMOL2(saveData);
            break;
        case 'xyz':
        default:
            content = writeXYZ(saveData);
            break;
    }

    return content;
}

/**
 * Saves file with browser download
 */
export function downloadFile(content, filename) {
    const blob = new Blob([content], { type: 'text/plain' });
    const url = URL.createObjectURL(blob);

    const link = document.createElement('a');
    link.href = url;
    link.download = filename;

    document.body.appendChild(link);
    link.click();

    document.body.removeChild(link);
    URL.revokeObjectURL(url);
}

/**
 * Saves file to file explorer if available
 */
export async function saveToFileExplorer(filename, content) {
    if (!window.fileExplorer?.directoryHandle) {
        return false;
    }

    try {
        await window.fileExplorer.createFile(filename, content);
        return true;
    } catch (error) {
        console.error('Error saving file to explorer:', error);
        return false;
    }
}
