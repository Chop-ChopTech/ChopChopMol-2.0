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
        this.radius=this.molecule.atomSettings[this.type].radius
        this.color=new THREE.Color(this.molecule.atomSettings[this.type].color)



    }
    drawAtom() {
        
        console.log();
        const geometry = new THREE.SphereGeometry(this.radius,16,16);
        const material = new THREE.MeshStandardMaterial({ color: this.color });

        const cube = new THREE.Mesh(geometry, material);
        cube.position.set(this.x, this.y, this.z);
        this.main.scene.add(cube);
    }
}