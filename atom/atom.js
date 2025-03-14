import * as THREE from 'three';
export default class Atom {
    constructor(main, type, coordinates, id) {
        this.molecule = main.molecule;
        this.main = main;
        this.position = coordinates;
        this.x = coordinates.x;
        this.y = coordinates.y;
        this.z = coordinates.z;
        this.type = type;
        this.id = id;


    }
    drawAtom() {
        const geometry = new THREE.SphereGeometry(0.5,16,16);
        const material = new THREE.MeshNormalMaterial({ color: 0x00ff00 });

        const cube = new THREE.Mesh(geometry, material);
        cube.position.set(this.x, this.y, this.z);
        this.main.scene.add(cube);
    }
}