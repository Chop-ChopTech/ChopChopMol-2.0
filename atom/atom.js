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
        this.realRadius = this.molecule.atomSettings[this.type].realRadius;

        this.radius = this.molecule.atomSettings[this.type].radius;
        this.radius = this.realRadius * 9
        this.color = new THREE.Color(this.molecule.atomSettings[this.type].color);
        this.displayColor = this.color;
    }
}
