/**
 * Orbital Visualization Utilities
 * Implements Marching Cubes algorithm for isosurface generation
 * from volumetric data (cube files, electron density, etc.)
 */

import * as THREE from 'three';

// Marching Cubes lookup tables
// Edge table: which edges are intersected for each cube configuration
const EDGE_TABLE = new Uint16Array([
    0x0, 0x109, 0x203, 0x30a, 0x406, 0x50f, 0x605, 0x70c,
    0x80c, 0x905, 0xa0f, 0xb06, 0xc0a, 0xd03, 0xe09, 0xf00,
    0x190, 0x99, 0x393, 0x29a, 0x596, 0x49f, 0x795, 0x69c,
    0x99c, 0x895, 0xb9f, 0xa96, 0xd9a, 0xc93, 0xf99, 0xe90,
    0x230, 0x339, 0x33, 0x13a, 0x636, 0x73f, 0x435, 0x53c,
    0xa3c, 0xb35, 0x83f, 0x936, 0xe3a, 0xf33, 0xc39, 0xd30,
    0x3a0, 0x2a9, 0x1a3, 0xaa, 0x7a6, 0x6af, 0x5a5, 0x4ac,
    0xbac, 0xaa5, 0x9af, 0x8a6, 0xfaa, 0xea3, 0xda9, 0xca0,
    0x460, 0x569, 0x663, 0x76a, 0x66, 0x16f, 0x265, 0x36c,
    0xc6c, 0xd65, 0xe6f, 0xf66, 0x86a, 0x963, 0xa69, 0xb60,
    0x5f0, 0x4f9, 0x7f3, 0x6fa, 0x1f6, 0xff, 0x3f5, 0x2fc,
    0xdfc, 0xcf5, 0xfff, 0xef6, 0x9fa, 0x8f3, 0xbf9, 0xaf0,
    0x650, 0x759, 0x453, 0x55a, 0x256, 0x35f, 0x55, 0x15c,
    0xe5c, 0xf55, 0xc5f, 0xd56, 0xa5a, 0xb53, 0x859, 0x950,
    0x7c0, 0x6c9, 0x5c3, 0x4ca, 0x3c6, 0x2cf, 0x1c5, 0xcc,
    0xfcc, 0xec5, 0xdcf, 0xcc6, 0xbca, 0xac3, 0x9c9, 0x8c0,
    0x8c0, 0x9c9, 0xac3, 0xbca, 0xcc6, 0xdcf, 0xec5, 0xfcc,
    0xcc, 0x1c5, 0x2cf, 0x3c6, 0x4ca, 0x5c3, 0x6c9, 0x7c0,
    0x950, 0x859, 0xb53, 0xa5a, 0xd56, 0xc5f, 0xf55, 0xe5c,
    0x15c, 0x55, 0x35f, 0x256, 0x55a, 0x453, 0x759, 0x650,
    0xaf0, 0xbf9, 0x8f3, 0x9fa, 0xef6, 0xfff, 0xcf5, 0xdfc,
    0x2fc, 0x3f5, 0xff, 0x1f6, 0x6fa, 0x7f3, 0x4f9, 0x5f0,
    0xb60, 0xa69, 0x963, 0x86a, 0xf66, 0xe6f, 0xd65, 0xc6c,
    0x36c, 0x265, 0x16f, 0x66, 0x76a, 0x663, 0x569, 0x460,
    0xca0, 0xda9, 0xea3, 0xfaa, 0x8a6, 0x9af, 0xaa5, 0xbac,
    0x4ac, 0x5a5, 0x6af, 0x7a6, 0xaa, 0x1a3, 0x2a9, 0x3a0,
    0xd30, 0xc39, 0xf33, 0xe3a, 0x936, 0x83f, 0xb35, 0xa3c,
    0x53c, 0x435, 0x73f, 0x636, 0x13a, 0x33, 0x339, 0x230,
    0xe90, 0xf99, 0xc93, 0xd9a, 0xa96, 0xb9f, 0x895, 0x99c,
    0x69c, 0x795, 0x49f, 0x596, 0x29a, 0x393, 0x99, 0x190,
    0xf00, 0xe09, 0xd03, 0xc0a, 0xb06, 0xa0f, 0x905, 0x80c,
    0x70c, 0x605, 0x50f, 0x406, 0x30a, 0x203, 0x109, 0x0
]);

// Triangle table: which triangles to create for each cube configuration
// -1 indicates end of triangle list
const TRI_TABLE = [
    [-1],
    [0, 8, 3, -1],
    [0, 1, 9, -1],
    [1, 8, 3, 9, 8, 1, -1],
    [1, 2, 10, -1],
    [0, 8, 3, 1, 2, 10, -1],
    [9, 2, 10, 0, 2, 9, -1],
    [2, 8, 3, 2, 10, 8, 10, 9, 8, -1],
    [3, 11, 2, -1],
    [0, 11, 2, 8, 11, 0, -1],
    [1, 9, 0, 2, 3, 11, -1],
    [1, 11, 2, 1, 9, 11, 9, 8, 11, -1],
    [3, 10, 1, 11, 10, 3, -1],
    [0, 10, 1, 0, 8, 10, 8, 11, 10, -1],
    [3, 9, 0, 3, 11, 9, 11, 10, 9, -1],
    [9, 8, 10, 10, 8, 11, -1],
    [4, 7, 8, -1],
    [4, 3, 0, 7, 3, 4, -1],
    [0, 1, 9, 8, 4, 7, -1],
    [4, 1, 9, 4, 7, 1, 7, 3, 1, -1],
    [1, 2, 10, 8, 4, 7, -1],
    [3, 4, 7, 3, 0, 4, 1, 2, 10, -1],
    [9, 2, 10, 9, 0, 2, 8, 4, 7, -1],
    [2, 10, 9, 2, 9, 7, 2, 7, 3, 7, 9, 4, -1],
    [8, 4, 7, 3, 11, 2, -1],
    [11, 4, 7, 11, 2, 4, 2, 0, 4, -1],
    [9, 0, 1, 8, 4, 7, 2, 3, 11, -1],
    [4, 7, 11, 9, 4, 11, 9, 11, 2, 9, 2, 1, -1],
    [3, 10, 1, 3, 11, 10, 7, 8, 4, -1],
    [1, 11, 10, 1, 4, 11, 1, 0, 4, 7, 11, 4, -1],
    [4, 7, 8, 9, 0, 11, 9, 11, 10, 11, 0, 3, -1],
    [4, 7, 11, 4, 11, 9, 9, 11, 10, -1],
    [9, 5, 4, -1],
    [9, 5, 4, 0, 8, 3, -1],
    [0, 5, 4, 1, 5, 0, -1],
    [8, 5, 4, 8, 3, 5, 3, 1, 5, -1],
    [1, 2, 10, 9, 5, 4, -1],
    [3, 0, 8, 1, 2, 10, 4, 9, 5, -1],
    [5, 2, 10, 5, 4, 2, 4, 0, 2, -1],
    [2, 10, 5, 3, 2, 5, 3, 5, 4, 3, 4, 8, -1],
    [9, 5, 4, 2, 3, 11, -1],
    [0, 11, 2, 0, 8, 11, 4, 9, 5, -1],
    [0, 5, 4, 0, 1, 5, 2, 3, 11, -1],
    [2, 1, 5, 2, 5, 8, 2, 8, 11, 4, 8, 5, -1],
    [10, 3, 11, 10, 1, 3, 9, 5, 4, -1],
    [4, 9, 5, 0, 8, 1, 8, 10, 1, 8, 11, 10, -1],
    [5, 4, 0, 5, 0, 11, 5, 11, 10, 11, 0, 3, -1],
    [5, 4, 8, 5, 8, 10, 10, 8, 11, -1],
    [9, 7, 8, 5, 7, 9, -1],
    [9, 3, 0, 9, 5, 3, 5, 7, 3, -1],
    [0, 7, 8, 0, 1, 7, 1, 5, 7, -1],
    [1, 5, 3, 3, 5, 7, -1],
    [9, 7, 8, 9, 5, 7, 10, 1, 2, -1],
    [10, 1, 2, 9, 5, 0, 5, 3, 0, 5, 7, 3, -1],
    [8, 0, 2, 8, 2, 5, 8, 5, 7, 10, 5, 2, -1],
    [2, 10, 5, 2, 5, 3, 3, 5, 7, -1],
    [7, 9, 5, 7, 8, 9, 3, 11, 2, -1],
    [9, 5, 7, 9, 7, 2, 9, 2, 0, 2, 7, 11, -1],
    [2, 3, 11, 0, 1, 8, 1, 7, 8, 1, 5, 7, -1],
    [11, 2, 1, 11, 1, 7, 7, 1, 5, -1],
    [9, 5, 8, 8, 5, 7, 10, 1, 3, 10, 3, 11, -1],
    [5, 7, 0, 5, 0, 9, 7, 11, 0, 1, 0, 10, 11, 10, 0, -1],
    [11, 10, 0, 11, 0, 3, 10, 5, 0, 8, 0, 7, 5, 7, 0, -1],
    [11, 10, 5, 7, 11, 5, -1],
    [10, 6, 5, -1],
    [0, 8, 3, 5, 10, 6, -1],
    [9, 0, 1, 5, 10, 6, -1],
    [1, 8, 3, 1, 9, 8, 5, 10, 6, -1],
    [1, 6, 5, 2, 6, 1, -1],
    [1, 6, 5, 1, 2, 6, 3, 0, 8, -1],
    [9, 6, 5, 9, 0, 6, 0, 2, 6, -1],
    [5, 9, 8, 5, 8, 2, 5, 2, 6, 3, 2, 8, -1],
    [2, 3, 11, 10, 6, 5, -1],
    [11, 0, 8, 11, 2, 0, 10, 6, 5, -1],
    [0, 1, 9, 2, 3, 11, 5, 10, 6, -1],
    [5, 10, 6, 1, 9, 2, 9, 11, 2, 9, 8, 11, -1],
    [6, 3, 11, 6, 5, 3, 5, 1, 3, -1],
    [0, 8, 11, 0, 11, 5, 0, 5, 1, 5, 11, 6, -1],
    [3, 11, 6, 0, 3, 6, 0, 6, 5, 0, 5, 9, -1],
    [6, 5, 9, 6, 9, 11, 11, 9, 8, -1],
    [5, 10, 6, 4, 7, 8, -1],
    [4, 3, 0, 4, 7, 3, 6, 5, 10, -1],
    [1, 9, 0, 5, 10, 6, 8, 4, 7, -1],
    [10, 6, 5, 1, 9, 7, 1, 7, 3, 7, 9, 4, -1],
    [6, 1, 2, 6, 5, 1, 4, 7, 8, -1],
    [1, 2, 5, 5, 2, 6, 3, 0, 4, 3, 4, 7, -1],
    [8, 4, 7, 9, 0, 5, 0, 6, 5, 0, 2, 6, -1],
    [7, 3, 9, 7, 9, 4, 3, 2, 9, 5, 9, 6, 2, 6, 9, -1],
    [3, 11, 2, 7, 8, 4, 10, 6, 5, -1],
    [5, 10, 6, 4, 7, 2, 4, 2, 0, 2, 7, 11, -1],
    [0, 1, 9, 4, 7, 8, 2, 3, 11, 5, 10, 6, -1],
    [9, 2, 1, 9, 11, 2, 9, 4, 11, 7, 11, 4, 5, 10, 6, -1],
    [8, 4, 7, 3, 11, 5, 3, 5, 1, 5, 11, 6, -1],
    [5, 1, 11, 5, 11, 6, 1, 0, 11, 7, 11, 4, 0, 4, 11, -1],
    [0, 5, 9, 0, 6, 5, 0, 3, 6, 11, 6, 3, 8, 4, 7, -1],
    [6, 5, 9, 6, 9, 11, 4, 7, 9, 7, 11, 9, -1],
    [10, 4, 9, 6, 4, 10, -1],
    [4, 10, 6, 4, 9, 10, 0, 8, 3, -1],
    [10, 0, 1, 10, 6, 0, 6, 4, 0, -1],
    [8, 3, 1, 8, 1, 6, 8, 6, 4, 6, 1, 10, -1],
    [1, 4, 9, 1, 2, 4, 2, 6, 4, -1],
    [3, 0, 8, 1, 2, 9, 2, 4, 9, 2, 6, 4, -1],
    [0, 2, 4, 4, 2, 6, -1],
    [8, 3, 2, 8, 2, 4, 4, 2, 6, -1],
    [10, 4, 9, 10, 6, 4, 11, 2, 3, -1],
    [0, 8, 2, 2, 8, 11, 4, 9, 10, 4, 10, 6, -1],
    [3, 11, 2, 0, 1, 6, 0, 6, 4, 6, 1, 10, -1],
    [6, 4, 1, 6, 1, 10, 4, 8, 1, 2, 1, 11, 8, 11, 1, -1],
    [9, 6, 4, 9, 3, 6, 9, 1, 3, 11, 6, 3, -1],
    [8, 11, 1, 8, 1, 0, 11, 6, 1, 9, 1, 4, 6, 4, 1, -1],
    [3, 11, 6, 3, 6, 0, 0, 6, 4, -1],
    [6, 4, 8, 11, 6, 8, -1],
    [7, 10, 6, 7, 8, 10, 8, 9, 10, -1],
    [0, 7, 3, 0, 10, 7, 0, 9, 10, 6, 7, 10, -1],
    [10, 6, 7, 1, 10, 7, 1, 7, 8, 1, 8, 0, -1],
    [10, 6, 7, 10, 7, 1, 1, 7, 3, -1],
    [1, 2, 6, 1, 6, 8, 1, 8, 9, 8, 6, 7, -1],
    [2, 6, 9, 2, 9, 1, 6, 7, 9, 0, 9, 3, 7, 3, 9, -1],
    [7, 8, 0, 7, 0, 6, 6, 0, 2, -1],
    [7, 3, 2, 6, 7, 2, -1],
    [2, 3, 11, 10, 6, 8, 10, 8, 9, 8, 6, 7, -1],
    [2, 0, 7, 2, 7, 11, 0, 9, 7, 6, 7, 10, 9, 10, 7, -1],
    [1, 8, 0, 1, 7, 8, 1, 10, 7, 6, 7, 10, 2, 3, 11, -1],
    [11, 2, 1, 11, 1, 7, 10, 6, 1, 6, 7, 1, -1],
    [8, 9, 6, 8, 6, 7, 9, 1, 6, 11, 6, 3, 1, 3, 6, -1],
    [0, 9, 1, 11, 6, 7, -1],
    [7, 8, 0, 7, 0, 6, 3, 11, 0, 11, 6, 0, -1],
    [7, 11, 6, -1],
    [7, 6, 11, -1],
    [3, 0, 8, 11, 7, 6, -1],
    [0, 1, 9, 11, 7, 6, -1],
    [8, 1, 9, 8, 3, 1, 11, 7, 6, -1],
    [10, 1, 2, 6, 11, 7, -1],
    [1, 2, 10, 3, 0, 8, 6, 11, 7, -1],
    [2, 9, 0, 2, 10, 9, 6, 11, 7, -1],
    [6, 11, 7, 2, 10, 3, 10, 8, 3, 10, 9, 8, -1],
    [7, 2, 3, 6, 2, 7, -1],
    [7, 0, 8, 7, 6, 0, 6, 2, 0, -1],
    [2, 7, 6, 2, 3, 7, 0, 1, 9, -1],
    [1, 6, 2, 1, 8, 6, 1, 9, 8, 8, 7, 6, -1],
    [10, 7, 6, 10, 1, 7, 1, 3, 7, -1],
    [10, 7, 6, 1, 7, 10, 1, 8, 7, 1, 0, 8, -1],
    [0, 3, 7, 0, 7, 10, 0, 10, 9, 6, 10, 7, -1],
    [7, 6, 10, 7, 10, 8, 8, 10, 9, -1],
    [6, 8, 4, 11, 8, 6, -1],
    [3, 6, 11, 3, 0, 6, 0, 4, 6, -1],
    [8, 6, 11, 8, 4, 6, 9, 0, 1, -1],
    [9, 4, 6, 9, 6, 3, 9, 3, 1, 11, 3, 6, -1],
    [6, 8, 4, 6, 11, 8, 2, 10, 1, -1],
    [1, 2, 10, 3, 0, 11, 0, 6, 11, 0, 4, 6, -1],
    [4, 11, 8, 4, 6, 11, 0, 2, 9, 2, 10, 9, -1],
    [10, 9, 3, 10, 3, 2, 9, 4, 3, 11, 3, 6, 4, 6, 3, -1],
    [8, 2, 3, 8, 4, 2, 4, 6, 2, -1],
    [0, 4, 2, 4, 6, 2, -1],
    [1, 9, 0, 2, 3, 4, 2, 4, 6, 4, 3, 8, -1],
    [1, 9, 4, 1, 4, 2, 2, 4, 6, -1],
    [8, 1, 3, 8, 6, 1, 8, 4, 6, 6, 10, 1, -1],
    [10, 1, 0, 10, 0, 6, 6, 0, 4, -1],
    [4, 6, 3, 4, 3, 8, 6, 10, 3, 0, 3, 9, 10, 9, 3, -1],
    [10, 9, 4, 6, 10, 4, -1],
    [4, 9, 5, 7, 6, 11, -1],
    [0, 8, 3, 4, 9, 5, 11, 7, 6, -1],
    [5, 0, 1, 5, 4, 0, 7, 6, 11, -1],
    [11, 7, 6, 8, 3, 4, 3, 5, 4, 3, 1, 5, -1],
    [9, 5, 4, 10, 1, 2, 7, 6, 11, -1],
    [6, 11, 7, 1, 2, 10, 0, 8, 3, 4, 9, 5, -1],
    [7, 6, 11, 5, 4, 10, 4, 2, 10, 4, 0, 2, -1],
    [3, 4, 8, 3, 5, 4, 3, 2, 5, 10, 5, 2, 11, 7, 6, -1],
    [7, 2, 3, 7, 6, 2, 5, 4, 9, -1],
    [9, 5, 4, 0, 8, 6, 0, 6, 2, 6, 8, 7, -1],
    [3, 6, 2, 3, 7, 6, 1, 5, 0, 5, 4, 0, -1],
    [6, 2, 8, 6, 8, 7, 2, 1, 8, 4, 8, 5, 1, 5, 8, -1],
    [9, 5, 4, 10, 1, 6, 1, 7, 6, 1, 3, 7, -1],
    [1, 6, 10, 1, 7, 6, 1, 0, 7, 8, 7, 0, 9, 5, 4, -1],
    [4, 0, 10, 4, 10, 5, 0, 3, 10, 6, 10, 7, 3, 7, 10, -1],
    [7, 6, 10, 7, 10, 8, 5, 4, 10, 4, 8, 10, -1],
    [6, 9, 5, 6, 11, 9, 11, 8, 9, -1],
    [3, 6, 11, 0, 6, 3, 0, 5, 6, 0, 9, 5, -1],
    [0, 11, 8, 0, 5, 11, 0, 1, 5, 5, 6, 11, -1],
    [6, 11, 3, 6, 3, 5, 5, 3, 1, -1],
    [1, 2, 10, 9, 5, 11, 9, 11, 8, 11, 5, 6, -1],
    [0, 11, 3, 0, 6, 11, 0, 9, 6, 5, 6, 9, 1, 2, 10, -1],
    [11, 8, 5, 11, 5, 6, 8, 0, 5, 10, 5, 2, 0, 2, 5, -1],
    [6, 11, 3, 6, 3, 5, 2, 10, 3, 10, 5, 3, -1],
    [5, 8, 9, 5, 2, 8, 5, 6, 2, 3, 8, 2, -1],
    [9, 5, 6, 9, 6, 0, 0, 6, 2, -1],
    [1, 5, 8, 1, 8, 0, 5, 6, 8, 3, 8, 2, 6, 2, 8, -1],
    [1, 5, 6, 2, 1, 6, -1],
    [1, 3, 6, 1, 6, 10, 3, 8, 6, 5, 6, 9, 8, 9, 6, -1],
    [10, 1, 0, 10, 0, 6, 9, 5, 0, 5, 6, 0, -1],
    [0, 3, 8, 5, 6, 10, -1],
    [10, 5, 6, -1],
    [11, 5, 10, 7, 5, 11, -1],
    [11, 5, 10, 11, 7, 5, 8, 3, 0, -1],
    [5, 11, 7, 5, 10, 11, 1, 9, 0, -1],
    [10, 7, 5, 10, 11, 7, 9, 8, 1, 8, 3, 1, -1],
    [11, 1, 2, 11, 7, 1, 7, 5, 1, -1],
    [0, 8, 3, 1, 2, 7, 1, 7, 5, 7, 2, 11, -1],
    [9, 7, 5, 9, 2, 7, 9, 0, 2, 2, 11, 7, -1],
    [7, 5, 2, 7, 2, 11, 5, 9, 2, 3, 2, 8, 9, 8, 2, -1],
    [2, 5, 10, 2, 3, 5, 3, 7, 5, -1],
    [8, 2, 0, 8, 5, 2, 8, 7, 5, 10, 2, 5, -1],
    [9, 0, 1, 5, 10, 3, 5, 3, 7, 3, 10, 2, -1],
    [9, 8, 2, 9, 2, 1, 8, 7, 2, 10, 2, 5, 7, 5, 2, -1],
    [1, 3, 5, 3, 7, 5, -1],
    [0, 8, 7, 0, 7, 1, 1, 7, 5, -1],
    [9, 0, 3, 9, 3, 5, 5, 3, 7, -1],
    [9, 8, 7, 5, 9, 7, -1],
    [5, 8, 4, 5, 10, 8, 10, 11, 8, -1],
    [5, 0, 4, 5, 11, 0, 5, 10, 11, 11, 3, 0, -1],
    [0, 1, 9, 8, 4, 10, 8, 10, 11, 10, 4, 5, -1],
    [10, 11, 4, 10, 4, 5, 11, 3, 4, 9, 4, 1, 3, 1, 4, -1],
    [2, 5, 1, 2, 8, 5, 2, 11, 8, 4, 5, 8, -1],
    [0, 4, 11, 0, 11, 3, 4, 5, 11, 2, 11, 1, 5, 1, 11, -1],
    [0, 2, 5, 0, 5, 9, 2, 11, 5, 4, 5, 8, 11, 8, 5, -1],
    [9, 4, 5, 2, 11, 3, -1],
    [2, 5, 10, 3, 5, 2, 3, 4, 5, 3, 8, 4, -1],
    [5, 10, 2, 5, 2, 4, 4, 2, 0, -1],
    [3, 10, 2, 3, 5, 10, 3, 8, 5, 4, 5, 8, 0, 1, 9, -1],
    [5, 10, 2, 5, 2, 4, 1, 9, 2, 9, 4, 2, -1],
    [8, 4, 5, 8, 5, 3, 3, 5, 1, -1],
    [0, 4, 5, 1, 0, 5, -1],
    [8, 4, 5, 8, 5, 3, 9, 0, 5, 0, 3, 5, -1],
    [9, 4, 5, -1],
    [4, 11, 7, 4, 9, 11, 9, 10, 11, -1],
    [0, 8, 3, 4, 9, 7, 9, 11, 7, 9, 10, 11, -1],
    [1, 10, 11, 1, 11, 4, 1, 4, 0, 7, 4, 11, -1],
    [3, 1, 4, 3, 4, 8, 1, 10, 4, 7, 4, 11, 10, 11, 4, -1],
    [4, 11, 7, 9, 11, 4, 9, 2, 11, 9, 1, 2, -1],
    [9, 7, 4, 9, 11, 7, 9, 1, 11, 2, 11, 1, 0, 8, 3, -1],
    [11, 7, 4, 11, 4, 2, 2, 4, 0, -1],
    [11, 7, 4, 11, 4, 2, 8, 3, 4, 3, 2, 4, -1],
    [2, 9, 10, 2, 7, 9, 2, 3, 7, 7, 4, 9, -1],
    [9, 10, 7, 9, 7, 4, 10, 2, 7, 8, 7, 0, 2, 0, 7, -1],
    [3, 7, 10, 3, 10, 2, 7, 4, 10, 1, 10, 0, 4, 0, 10, -1],
    [1, 10, 2, 8, 7, 4, -1],
    [4, 9, 1, 4, 1, 7, 7, 1, 3, -1],
    [4, 9, 1, 4, 1, 7, 0, 8, 1, 8, 7, 1, -1],
    [4, 0, 3, 7, 4, 3, -1],
    [4, 8, 7, -1],
    [9, 10, 8, 10, 11, 8, -1],
    [3, 0, 9, 3, 9, 11, 11, 9, 10, -1],
    [0, 1, 10, 0, 10, 8, 8, 10, 11, -1],
    [3, 1, 10, 11, 3, 10, -1],
    [1, 2, 11, 1, 11, 9, 9, 11, 8, -1],
    [3, 0, 9, 3, 9, 11, 1, 2, 9, 2, 11, 9, -1],
    [0, 2, 11, 8, 0, 11, -1],
    [3, 2, 11, -1],
    [2, 3, 8, 2, 8, 10, 10, 8, 9, -1],
    [9, 10, 2, 0, 9, 2, -1],
    [2, 3, 8, 2, 8, 10, 0, 1, 8, 1, 10, 8, -1],
    [1, 10, 2, -1],
    [1, 3, 8, 9, 1, 8, -1],
    [0, 9, 1, -1],
    [0, 3, 8, -1],
    [-1]
];

/**
 * Generate isosurface mesh from volumetric data using Marching Cubes algorithm.
 * Uses gradient-based normals for smooth shading.
 * @param {Object} orbitalData - The orbital data containing volumeData and gridInfo
 * @param {number} isoValue - The isosurface threshold value
 * @param {boolean} showPositive - Show positive phase
 * @param {boolean} showNegative - Show negative phase
 * @returns {THREE.BufferGeometry} The generated isosurface geometry
 */
export function generateIsosurface(orbitalData, isoValue, showPositive = true, showNegative = true) {
    if (!orbitalData || !orbitalData.volumeData || !orbitalData.gridInfo) {
        console.error('Invalid orbital data for isosurface generation');
        return null;
    }

    const { volumeData, gridInfo } = orbitalData;
    const [nx, ny, nz] = gridInfo.dimensions;
    const origin = gridInfo.origin;
    const vectors = gridInfo.vectors;

    const vertices = [];
    const normals = [];

    // Helper to get voxel value
    const getValue = (ix, iy, iz) => {
        if (ix < 0 || ix >= nx || iy < 0 || iy >= ny || iz < 0 || iz >= nz) {
            return 0;
        }
        return volumeData[ix * ny * nz + iy * nz + iz];
    };

    // Calculate gradient at a grid point using central differences
    const getGradient = (ix, iy, iz) => {
        const gx = (getValue(Math.min(ix + 1, nx - 1), iy, iz) - getValue(Math.max(ix - 1, 0), iy, iz)) /
            (ix === 0 || ix === nx - 1 ? 1 : 2);
        const gy = (getValue(ix, Math.min(iy + 1, ny - 1), iz) - getValue(ix, Math.max(iy - 1, 0), iz)) /
            (iy === 0 || iy === ny - 1 ? 1 : 2);
        const gz = (getValue(ix, iy, Math.min(iz + 1, nz - 1)) - getValue(ix, iy, Math.max(iz - 1, 0))) /
            (iz === 0 || iz === nz - 1 ? 1 : 2);

        const len = Math.sqrt(gx * gx + gy * gy + gz * gz);
        if (len < 1e-10) return [0, 0, 1];
        return [gx / len, gy / len, gz / len];
    };

    // Interpolate position and normal between two vertices
    const interpolateWithNormal = (p1, p2, v1, v2, n1, n2, iso) => {
        if (Math.abs(iso - v1) < 1e-10) return { pos: p1.slice(), normal: n1.slice() };
        if (Math.abs(iso - v2) < 1e-10) return { pos: p2.slice(), normal: n2.slice() };
        if (Math.abs(v1 - v2) < 1e-10) return { pos: p1.slice(), normal: n1.slice() };

        const t = (iso - v1) / (v2 - v1);
        const pos = [
            p1[0] + t * (p2[0] - p1[0]),
            p1[1] + t * (p2[1] - p1[1]),
            p1[2] + t * (p2[2] - p1[2])
        ];
        let normal = [
            n1[0] + t * (n2[0] - n1[0]),
            n1[1] + t * (n2[1] - n1[1]),
            n1[2] + t * (n2[2] - n1[2])
        ];
        const len = Math.sqrt(normal[0] ** 2 + normal[1] ** 2 + normal[2] ** 2);
        if (len > 1e-10) normal = [normal[0] / len, normal[1] / len, normal[2] / len];
        return { pos, normal };
    };

    const getPosition = (ix, iy, iz) => [
        origin.x + ix * vectors.x[0] + iy * vectors.y[0] + iz * vectors.z[0],
        origin.y + ix * vectors.x[1] + iy * vectors.y[1] + iz * vectors.z[1],
        origin.z + ix * vectors.x[2] + iy * vectors.y[2] + iz * vectors.z[2]
    ];

    const edgeVertices = [
        [0, 1], [1, 2], [2, 3], [3, 0],
        [4, 5], [5, 6], [6, 7], [7, 4],
        [0, 4], [1, 5], [2, 6], [3, 7]
    ];

    // Process isosurfaces
    const isoValues = [];
    if (showPositive) isoValues.push({ iso: isoValue, flip: false });
    if (showNegative) isoValues.push({ iso: -isoValue, flip: true });

    for (const { iso, flip } of isoValues) {
        for (let ix = 0; ix < nx - 1; ix++) {
            for (let iy = 0; iy < ny - 1; iy++) {
                for (let iz = 0; iz < nz - 1; iz++) {
                    const vals = [
                        getValue(ix, iy, iz),
                        getValue(ix + 1, iy, iz),
                        getValue(ix + 1, iy + 1, iz),
                        getValue(ix, iy + 1, iz),
                        getValue(ix, iy, iz + 1),
                        getValue(ix + 1, iy, iz + 1),
                        getValue(ix + 1, iy + 1, iz + 1),
                        getValue(ix, iy + 1, iz + 1)
                    ];

                    let cubeIndex = 0;
                    for (let i = 0; i < 8; i++) {
                        if (vals[i] < iso) cubeIndex |= (1 << i);
                    }

                    if (EDGE_TABLE[cubeIndex] === 0) continue;

                    const positions = [
                        getPosition(ix, iy, iz),
                        getPosition(ix + 1, iy, iz),
                        getPosition(ix + 1, iy + 1, iz),
                        getPosition(ix, iy + 1, iz),
                        getPosition(ix, iy, iz + 1),
                        getPosition(ix + 1, iy, iz + 1),
                        getPosition(ix + 1, iy + 1, iz + 1),
                        getPosition(ix, iy + 1, iz + 1)
                    ];

                    const grads = [
                        getGradient(ix, iy, iz),
                        getGradient(ix + 1, iy, iz),
                        getGradient(ix + 1, iy + 1, iz),
                        getGradient(ix, iy + 1, iz),
                        getGradient(ix, iy, iz + 1),
                        getGradient(ix + 1, iy, iz + 1),
                        getGradient(ix + 1, iy + 1, iz + 1),
                        getGradient(ix, iy + 1, iz + 1)
                    ];

                    const edgeData = new Array(12);
                    const edges = EDGE_TABLE[cubeIndex];

                    for (let e = 0; e < 12; e++) {
                        if (edges & (1 << e)) {
                            const [v1i, v2i] = edgeVertices[e];
                            edgeData[e] = interpolateWithNormal(
                                positions[v1i], positions[v2i],
                                vals[v1i], vals[v2i],
                                grads[v1i], grads[v2i],
                                iso
                            );
                        }
                    }

                    const triList = TRI_TABLE[cubeIndex];
                    for (let i = 0; triList[i] !== -1; i += 3) {
                        const e1 = edgeData[triList[i]];
                        const e2 = edgeData[triList[i + 1]];
                        const e3 = edgeData[triList[i + 2]];

                        if (!e1 || !e2 || !e3) continue;

                        vertices.push(...e1.pos, ...e2.pos, ...e3.pos);

                        if (flip) {
                            normals.push(
                                -e1.normal[0], -e1.normal[1], -e1.normal[2],
                                -e2.normal[0], -e2.normal[1], -e2.normal[2],
                                -e3.normal[0], -e3.normal[1], -e3.normal[2]
                            );
                        } else {
                            normals.push(...e1.normal, ...e2.normal, ...e3.normal);
                        }
                    }
                }
            }
        }
    }

    if (vertices.length === 0) {
        console.warn('No isosurface generated at isovalue:', isoValue);
        return null;
    }

    const geometry = new THREE.BufferGeometry();
    geometry.setAttribute('position', new THREE.Float32BufferAttribute(vertices, 3));
    geometry.setAttribute('normal', new THREE.Float32BufferAttribute(normals, 3));

    console.log(`Generated isosurface with ${vertices.length / 3} vertices`);
    return geometry;
}

/**
 * Generate separate positive and negative phase geometries.
 * @param {Object} orbitalData - The orbital data
 * @param {number} isoValue - The isosurface threshold (positive)
 * @returns {Object} { positive: geometry, negative: geometry }
 */
export function generatePhaseSeparatedIsosurface(orbitalData, isoValue) {
    if (!orbitalData || !orbitalData.volumeData || !orbitalData.gridInfo) {
        return { positive: null, negative: null };
    }

    const { volumeData, gridInfo } = orbitalData;
    const [nx, ny, nz] = gridInfo.dimensions;
    const origin = gridInfo.origin;
    const vectors = gridInfo.vectors;

    const positiveVerts = [];
    const positiveNormals = [];
    const negativeVerts = [];
    const negativeNormals = [];

    // Get value at grid point, clamped to boundaries
    const getValue = (ix, iy, iz) => {
        if (ix < 0 || ix >= nx || iy < 0 || iy >= ny || iz < 0 || iz >= nz) return 0;
        return volumeData[ix * ny * nz + iy * nz + iz];
    };

    // Calculate gradient at a grid point using central differences
    // Returns normalized gradient vector (points toward increasing values)
    const getGradient = (ix, iy, iz) => {
        // Central differences for interior points, forward/backward at boundaries
        const gx = (getValue(Math.min(ix + 1, nx - 1), iy, iz) - getValue(Math.max(ix - 1, 0), iy, iz)) /
            (ix === 0 || ix === nx - 1 ? 1 : 2);
        const gy = (getValue(ix, Math.min(iy + 1, ny - 1), iz) - getValue(ix, Math.max(iy - 1, 0), iz)) /
            (iy === 0 || iy === ny - 1 ? 1 : 2);
        const gz = (getValue(ix, iy, Math.min(iz + 1, nz - 1)) - getValue(ix, iy, Math.max(iz - 1, 0))) /
            (iz === 0 || iz === nz - 1 ? 1 : 2);

        const len = Math.sqrt(gx * gx + gy * gy + gz * gz);
        if (len < 1e-10) return [0, 0, 1]; // Default normal if gradient is zero

        return [gx / len, gy / len, gz / len];
    };

    // Interpolate position and normal between two vertices
    const interpolateWithNormal = (p1, p2, v1, v2, n1, n2, iso) => {
        if (Math.abs(iso - v1) < 1e-10) return { pos: p1.slice(), normal: n1.slice() };
        if (Math.abs(iso - v2) < 1e-10) return { pos: p2.slice(), normal: n2.slice() };
        if (Math.abs(v1 - v2) < 1e-10) return { pos: p1.slice(), normal: n1.slice() };

        const t = (iso - v1) / (v2 - v1);
        const pos = [
            p1[0] + t * (p2[0] - p1[0]),
            p1[1] + t * (p2[1] - p1[1]),
            p1[2] + t * (p2[2] - p1[2])
        ];
        // Interpolate and normalize the normal
        let normal = [
            n1[0] + t * (n2[0] - n1[0]),
            n1[1] + t * (n2[1] - n1[1]),
            n1[2] + t * (n2[2] - n1[2])
        ];
        const len = Math.sqrt(normal[0] ** 2 + normal[1] ** 2 + normal[2] ** 2);
        if (len > 1e-10) normal = [normal[0] / len, normal[1] / len, normal[2] / len];

        return { pos, normal };
    };

    const getPosition = (ix, iy, iz) => [
        origin.x + ix * vectors.x[0] + iy * vectors.y[0] + iz * vectors.z[0],
        origin.y + ix * vectors.x[1] + iy * vectors.y[1] + iz * vectors.z[1],
        origin.z + ix * vectors.x[2] + iy * vectors.y[2] + iz * vectors.z[2]
    ];

    // Edge to vertex index mapping for gradient interpolation
    const edgeVertices = [
        [0, 1], [1, 2], [2, 3], [3, 0],
        [4, 5], [5, 6], [6, 7], [7, 4],
        [0, 4], [1, 5], [2, 6], [3, 7]
    ];

    const processIsosurface = (iso, vertices, normals, flipNormals) => {
        for (let ix = 0; ix < nx - 1; ix++) {
            for (let iy = 0; iy < ny - 1; iy++) {
                for (let iz = 0; iz < nz - 1; iz++) {
                    // Get 8 corner values
                    const vals = [
                        getValue(ix, iy, iz),
                        getValue(ix + 1, iy, iz),
                        getValue(ix + 1, iy + 1, iz),
                        getValue(ix, iy + 1, iz),
                        getValue(ix, iy, iz + 1),
                        getValue(ix + 1, iy, iz + 1),
                        getValue(ix + 1, iy + 1, iz + 1),
                        getValue(ix, iy + 1, iz + 1)
                    ];

                    // Determine cube configuration
                    let cubeIndex = 0;
                    for (let i = 0; i < 8; i++) {
                        if (vals[i] < iso) cubeIndex |= (1 << i);
                    }

                    if (EDGE_TABLE[cubeIndex] === 0) continue;

                    // Get 8 corner positions
                    const positions = [
                        getPosition(ix, iy, iz),
                        getPosition(ix + 1, iy, iz),
                        getPosition(ix + 1, iy + 1, iz),
                        getPosition(ix, iy + 1, iz),
                        getPosition(ix, iy, iz + 1),
                        getPosition(ix + 1, iy, iz + 1),
                        getPosition(ix + 1, iy + 1, iz + 1),
                        getPosition(ix, iy + 1, iz + 1)
                    ];

                    // Get gradients at 8 corners for smooth normals
                    const grads = [
                        getGradient(ix, iy, iz),
                        getGradient(ix + 1, iy, iz),
                        getGradient(ix + 1, iy + 1, iz),
                        getGradient(ix, iy + 1, iz),
                        getGradient(ix, iy, iz + 1),
                        getGradient(ix + 1, iy, iz + 1),
                        getGradient(ix + 1, iy + 1, iz + 1),
                        getGradient(ix, iy + 1, iz + 1)
                    ];

                    // Calculate edge intersections with interpolated normals
                    const edgeData = new Array(12);
                    const edges = EDGE_TABLE[cubeIndex];

                    for (let e = 0; e < 12; e++) {
                        if (edges & (1 << e)) {
                            const [v1i, v2i] = edgeVertices[e];
                            edgeData[e] = interpolateWithNormal(
                                positions[v1i], positions[v2i],
                                vals[v1i], vals[v2i],
                                grads[v1i], grads[v2i],
                                iso
                            );
                        }
                    }

                    // Generate triangles
                    const triList = TRI_TABLE[cubeIndex];
                    for (let i = 0; triList[i] !== -1; i += 3) {
                        const e1 = edgeData[triList[i]];
                        const e2 = edgeData[triList[i + 1]];
                        const e3 = edgeData[triList[i + 2]];

                        if (!e1 || !e2 || !e3) continue;

                        // Add vertices
                        vertices.push(...e1.pos, ...e2.pos, ...e3.pos);

                        // Add normals (flip for negative phase so they point outward)
                        if (flipNormals) {
                            normals.push(
                                -e1.normal[0], -e1.normal[1], -e1.normal[2],
                                -e2.normal[0], -e2.normal[1], -e2.normal[2],
                                -e3.normal[0], -e3.normal[1], -e3.normal[2]
                            );
                        } else {
                            normals.push(...e1.normal, ...e2.normal, ...e3.normal);
                        }
                    }
                }
            }
        }
    };

    // Process positive and negative phases
    // For positive iso: gradient points outward (toward higher values)
    // For negative iso: we want normals pointing outward from the negative region
    processIsosurface(isoValue, positiveVerts, positiveNormals, false);
    processIsosurface(-isoValue, negativeVerts, negativeNormals, true);

    const result = { positive: null, negative: null };

    if (positiveVerts.length > 0) {
        const posGeom = new THREE.BufferGeometry();
        posGeom.setAttribute('position', new THREE.Float32BufferAttribute(positiveVerts, 3));
        posGeom.setAttribute('normal', new THREE.Float32BufferAttribute(positiveNormals, 3));
        result.positive = posGeom;
    }

    if (negativeVerts.length > 0) {
        const negGeom = new THREE.BufferGeometry();
        negGeom.setAttribute('position', new THREE.Float32BufferAttribute(negativeVerts, 3));
        negGeom.setAttribute('normal', new THREE.Float32BufferAttribute(negativeNormals, 3));
        result.negative = negGeom;
    }

    console.log(`Generated isosurface: positive=${positiveVerts.length / 9} tris, negative=${negativeVerts.length / 9} tris`);
    return result;
}

/**
 * Calculate a good default isosurface value based on the data range.
 * @param {Object} orbitalData - The orbital data
 * @returns {number} Suggested isosurface value
 */
export function calculateDefaultIsovalue(orbitalData) {
    if (!orbitalData) return 0.02;

    const { minValue, maxValue } = orbitalData;
    const maxAbs = Math.max(Math.abs(minValue), Math.abs(maxValue));

    if (!Number.isFinite(maxAbs) || maxAbs === 0) {
        return 0.02;
    }

    return Math.max(0.02, Math.min(maxAbs * 0.1, 0.05));
}

/**
 * Create orbital visualization materials.
 * @param {number} opacity - Material opacity (0-1)
 * @param {number} positiveColor - Color for positive phase (hex)
 * @param {number} negativeColor - Color for negative phase (hex)
 * @returns {Object} { positive: material, negative: material }
 */
export function createOrbitalMaterials(opacity = 0.7, positiveColor = 0xff0000, negativeColor = 0x0066ff) {
    const positive = new THREE.MeshStandardMaterial({
        color: positiveColor,
        opacity: opacity,
        transparent: true,
        side: THREE.DoubleSide,
        roughness: 0.3,
        metalness: 0.1,
        depthWrite: false
    });

    const negative = new THREE.MeshStandardMaterial({
        color: negativeColor,
        opacity: opacity,
        transparent: true,
        side: THREE.DoubleSide,
        roughness: 0.3,
        metalness: 0.1,
        depthWrite: false
    });

    return { positive, negative };
}

// ========== Web Worker-based Isosurface Generation ==========

// Singleton worker instance
let marchingCubesWorker = null;
let workerPending = null;

/**
 * Get or create the marching cubes web worker.
 * @returns {Worker} The worker instance
 */
function getMarchingCubesWorker() {
    if (!marchingCubesWorker) {
        try {
            marchingCubesWorker = new Worker('/demo/utils/marchingCubesWorker.js');
        } catch (e) {
            console.warn('[Orbitals] Failed to create web worker, falling back to main thread:', e);
            return null;
        }
    }
    return marchingCubesWorker;
}

/**
 * Generate isosurface using Web Worker (non-blocking).
 * Falls back to main-thread computation if worker unavailable.
 *
 * @param {Object} orbitalData - The orbital data containing volumeData and gridInfo
 * @param {number} isoValue - The isosurface threshold value
 * @param {boolean} showPositive - Show positive phase
 * @param {boolean} showNegative - Show negative phase
 * @returns {Promise<{positive: THREE.BufferGeometry, negative: THREE.BufferGeometry}>}
 */
export async function generateIsosurfaceAsync(orbitalData, isoValue, showPositive = true, showNegative = true) {
    if (!orbitalData || !orbitalData.volumeData || !orbitalData.gridInfo) {
        console.error('Invalid orbital data for isosurface generation');
        return { positive: null, negative: null };
    }

    const worker = getMarchingCubesWorker();

    // Fall back to synchronous if worker unavailable
    if (!worker) {
        console.log('[Orbitals] Using synchronous marching cubes (no worker)');
        return generatePhaseSeparatedIsosurface(orbitalData, isoValue);
    }

    // Cancel any pending worker operation
    if (workerPending) {
        workerPending.reject(new Error('Cancelled'));
        workerPending = null;
    }

    return new Promise((resolve, reject) => {
        const t0 = performance.now();

        workerPending = { resolve, reject };

        worker.onmessage = (e) => {
            workerPending = null;
            const { positive, negative, elapsed } = e.data;

            const totalTime = performance.now() - t0;
            console.log(`[Orbitals] Worker marching cubes: ${elapsed.toFixed(0)}ms compute, ${totalTime.toFixed(0)}ms total`);

            const result = { positive: null, negative: null };

            // Convert Float32Arrays to Three.js geometries
            if (positive && positive.vertices.length > 0) {
                const geom = new THREE.BufferGeometry();
                geom.setAttribute('position', new THREE.BufferAttribute(positive.vertices, 3));
                geom.setAttribute('normal', new THREE.BufferAttribute(positive.normals, 3));
                result.positive = geom;
            }

            if (negative && negative.vertices.length > 0) {
                const geom = new THREE.BufferGeometry();
                geom.setAttribute('position', new THREE.BufferAttribute(negative.vertices, 3));
                geom.setAttribute('normal', new THREE.BufferAttribute(negative.normals, 3));
                result.negative = geom;
            }

            resolve(result);
        };

        worker.onerror = (e) => {
            workerPending = null;
            console.error('[Orbitals] Worker error:', e);
            // Fall back to synchronous
            resolve(generatePhaseSeparatedIsosurface(orbitalData, isoValue));
        };

        // Send data to worker (transfer volumeData buffer for zero-copy)
        const volumeData = orbitalData.volumeData;
        const volumeBuffer = volumeData.buffer.slice(0);  // Clone buffer for transfer

        worker.postMessage({
            volumeData: new Float32Array(volumeBuffer),
            gridInfo: orbitalData.gridInfo,
            isoValue,
            showPositive,
            showNegative
        }, [volumeBuffer]);
    });
}

/**
 * Terminate the marching cubes worker to free resources.
 */
export function terminateMarchingCubesWorker() {
    if (marchingCubesWorker) {
        marchingCubesWorker.terminate();
        marchingCubesWorker = null;
    }
    workerPending = null;
}

// Export for use in other modules
window.generateIsosurface = generateIsosurface;
window.generatePhaseSeparatedIsosurface = generatePhaseSeparatedIsosurface;
window.generateIsosurfaceAsync = generateIsosurfaceAsync;
window.terminateMarchingCubesWorker = terminateMarchingCubesWorker;
window.calculateDefaultIsovalue = calculateDefaultIsovalue;
window.createOrbitalMaterials = createOrbitalMaterials;
