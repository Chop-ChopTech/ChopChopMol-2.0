import * as THREE from 'three';
import Atom from './atom.js';
export default class Molecule {
    constructor(main) {
        this.main = main;
        this.atoms = [];
        this.bonds = [];
    }
    init(){
        

        this.atoms.push(new Atom(this.main,0, 0, 1));
        this.atoms.push(new Atom(this.main,1, 0));

        this.drawMolecule();
    }
    drawMolecule() {
        this.atoms.forEach(atom => atom.drawAtom());
    }
}