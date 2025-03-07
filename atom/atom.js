import * as THREE from 'three';
export default class Atom {
    constructor(main,x, y,z) {
        this.molecule = main.molecule;
        this.main = main;
        this.x = x;
        this.y = y;
        this.z = z;

    }
    drawAtom() {
        const geometry = new THREE.SphereGeometry(1,16,16);
        const material = new THREE.MeshNormalMaterial({ color: 0x00ff00 });

        const cube = new THREE.Mesh(geometry, material);
        cube.position.set(this.x, this.y, this.z);
        this.main.scene.add(cube);
    }
}