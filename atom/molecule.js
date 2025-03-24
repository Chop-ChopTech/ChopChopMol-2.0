import * as THREE from 'three';
import Atom from './atom.js';
export default class Molecule {
    constructor(main,atomSettings) {
        this.main = main;
        this.atoms = [];
        this.bonds = [];
        this.atomSettings = atomSettings;
        console.log(this.atomSettings);
    }
    init(data){
        console.log(data.numAtoms);

        for (let i=0; i<data.numAtoms; i++) {
            const x = data.atomData[i].x*4;
            const y = data.atomData[i].y*4;
            const z = data.atomData[i].z*4;
            const element = data.atomData[i].element;
            const coordinates = new THREE.Vector3(x, y, z);
            const id =getRandomArbitrary(0, 1000);
            this.atoms.push(new Atom(this.main, element, coordinates, id));

        }

        this.drawMolecule();
    }
    drawMolecule() {
        this.atoms.forEach(atom => atom.drawAtom());
    }
}