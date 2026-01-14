// Graph utility functions for molecular connectivity

/**
 * Builds an adjacency list from atoms and bonds
 * @param {Array} atoms - Array of atom objects
 * @param {Array} bonds - Array of bond objects
 * @returns {Map} Adjacency list mapping atom index to connected atom indices
 */
export function buildAdjacencyList(atoms, bonds) {
    const adj = new Map();
    for (let i = 0; i < atoms.length; i++) {
        adj.set(i, []);
    }

    bonds.forEach(bond => {
        const i1 = atoms.indexOf(bond.atom1);
        const i2 = atoms.indexOf(bond.atom2);
        if (i1 !== -1 && i2 !== -1) {
            adj.get(i1).push(i2);
            adj.get(i2).push(i1);
        }
    });

    return adj;
}

/**
 * Finds all atoms connected to a start atom, optionally excluding a specific atom
 * @param {number} start - Starting atom index
 * @param {number|null} exclude - Atom index to exclude from traversal
 * @param {Map} adjacencyList - Adjacency list
 * @returns {Array} Array of connected atom indices
 */
export function findConnectedFragment(start, exclude, adjacencyList) {
    const visited = new Set([start]);
    const queue = [start];

    while (queue.length > 0) {
        const current = queue.shift();
        for (const neighbor of (adjacencyList.get(current) || [])) {
            // Don't traverse through the excluded atom
            if (current === start && neighbor === exclude) continue;
            if (neighbor === exclude) continue;

            if (!visited.has(neighbor)) {
                visited.add(neighbor);
                queue.push(neighbor);
            }
        }
    }

    return Array.from(visited);
}

/**
 * Finds fragment connected to atom without crossing through a vertex
 * @param {number} start - Starting atom index
 * @param {number} vertex - Vertex atom that should not be crossed
 * @param {Map} adjacencyList - Adjacency list
 * @returns {Array} Array of connected atom indices
 */
export function findFragmentAvoidingVertex(start, vertex, adjacencyList) {
    const visited = new Set([start]);
    const queue = [start];

    while (queue.length > 0) {
        const current = queue.shift();
        for (const neighbor of (adjacencyList.get(current) || [])) {
            if (neighbor === vertex) continue;
            if (!visited.has(neighbor)) {
                visited.add(neighbor);
                queue.push(neighbor);
            }
        }
    }

    return Array.from(visited);
}

/**
 * Setup for rotating/transforming a molecular fragment
 * @param {Object} params - Parameters
 * @param {Array} params.atoms - All atoms
 * @param {Array} params.bonds - All bonds
 * @param {number} params.atom1 - First atom index
 * @param {number} params.atom2 - Second atom index (pivot/exclude point)
 * @returns {Object} Object with adjacencyList and helper function
 */
export function setupFragmentTransform(atoms, bonds, atom1, atom2) {
    const adj = buildAdjacencyList(atoms, bonds);

    return {
        adjacencyList: adj,
        findMovableAtoms: () => findConnectedFragment(atom1, atom2, adj)
    };
}
