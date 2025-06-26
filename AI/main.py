import os
from flask import Flask, request, jsonify
from openai import OpenAI
from flask_cors import CORS
from rdkit import Chem
from rdkit.Chem import AllChem, MolToSmiles
from decimer import predict_SMILES
import json

app = Flask(__name__)
CORS(app)
client = OpenAI()


def smiles_to_json(smiles):
    # Parse SMILES string into a molecule object
    mol = Chem.MolFromSmiles(smiles, sanitize=False)  # Disable initial sanitization
    if mol is None:
        return {"error": "Invalid SMILES string"}

    # Sanitize the molecule manually
    try:
        Chem.SanitizeMol(mol, sanitizeOps=Chem.SanitizeFlags.SANITIZE_ALL)
    except Exception as e:
        return {"error": f"Sanitization failed: {str(e)}"}

    # Kekulize if aromatic (optional, helps with hydrogen assignment)
    Chem.Kekulize(mol, clearAromaticFlags=True)

    # Add hydrogens explicitly
    mol = Chem.AddHs(mol, explicitOnly=False)

    # Verify molecular formula for debugging
    formula = Chem.rdMolDescriptors.CalcMolFormula(mol)
    print(f"Molecular formula: {formula}")
    print(f"Total atoms: {mol.GetNumAtoms()}")

    # Generate 3D coordinates
    AllChem.EmbedMolecule(mol, randomSeed=42)  # Fixed seed for reproducibility
    if mol.GetNumConformers() == 0:
        return {"error": "Failed to generate 3D coordinates"}

    # Get the first conformer (3D coordinates)
    conf = mol.GetConformer()

    # Initialize data structure for JSON
    molecule_data = {"atomData": [], "numAtoms": mol.GetNumAtoms()}

    # Extract atoms and their coordinates
    for atom in mol.GetAtoms():
        pos = conf.GetAtomPosition(atom.GetIdx())
        atom_info = {
            "element": atom.GetSymbol(),
            "x": round(pos.x, 3),
            "y": round(pos.y, 3),
            "z": round(pos.z, 3),
        }
        molecule_data["atomData"].append(atom_info)

    # Convert to JSON
    json_output = molecule_data
    return json_output


@app.route("/analysis", methods=["POST"])
def analysis():
    user_img = request.json.get("message")
    try:


        image_path = str(user_img)
        SMILES = predict_SMILES(image_path)
        print(f"Decoded SMILES: {SMILES}")
        smiles_json=smiles_to_json(str(SMILES))
        return str(smiles_json)

    except Exception as e:
        return jsonify({"error": str(e)}), 500


@app.route("/chat", methods=["POST"])
def chat():
    user_message = request.json.get("message")
    try:
        response = client.responses.create(
            prompt={
                "id": "pmpt_685846a14e408190b05deaa4c8dfe2c5095b9f1f3307fa01",
                "version": "1",
            },
            input=user_message,
            reasoning={},
            max_output_tokens=32768,
            store=False,
        )
        bot_reply = response.output_text
        json_data = smiles_to_json(bot_reply)
        return jsonify({"reply": json_data})

    except Exception as e:
        return jsonify({"error": str(e)}), 500


# Example usage


if __name__ == "__main__":
    app.run(debug=True, port=5000)
