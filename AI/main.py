import os
from flask import Flask, request, jsonify
from openai import OpenAI
from flask_cors import CORS
from rdkit import Chem
from rdkit.Chem import AllChem, MolToSmiles
import json
import time

app = Flask(__name__)
CORS(app)
client = OpenAI()

# Global progress variable (simple for demo; use sessions or DB for production)
progress = 0


def smiles_to_json(smiles):
    global progress
    progress = 0  # Reset progress at the start

    # Step 1: Parse SMILES string (10%)
    mol = Chem.MolFromSmiles(smiles, sanitize=False)
    if mol is None:
        return {"error": "Invalid SMILES string"}
    progress = 10

    # Step 2: Sanitize molecule (30%)
    try:
        Chem.SanitizeMol(mol, sanitizeOps=Chem.SanitizeFlags.SANITIZE_ALL)
    except Exception as e:
        return {"error": f"Sanitization failed: {str(e)}"}
    progress = 30

    # Step 3: Kekulize (40%)
    Chem.Kekulize(mol, clearAromaticFlags=True)
    progress = 40

    # Step 4: Add hydrogens (60%)
    mol = Chem.AddHs(mol, explicitOnly=False)
    progress = 60

    # Step 5: Generate 3D coordinates (90%)
    AllChem.EmbedMolecule(mol, randomSeed=42)
    if mol.GetNumConformers() == 0:
        return {"error": "Failed to generate 3D coordinates"}
    progress = 90

    # Step 6: Extract atom data (100%)
    conf = mol.GetConformer()
    molecule_data = {"atomData": [], "numAtoms": mol.GetNumAtoms()}
    for atom in mol.GetAtoms():
        pos = conf.GetAtomPosition(atom.GetIdx())
        atom_info = {
            "element": atom.GetSymbol(),
            "x": round(pos.x, 3),
            "y": round(pos.y, 3),
            "z": round(pos.z, 3),
        }
        molecule_data["atomData"].append(atom_info)
    progress = 100

    return molecule_data


@app.route("/progress", methods=["GET"])
def get_progress():
    global progress
    return jsonify({"progress": progress})


@app.route("/tosmiles", methods=["POST"])
def tosmiles():
    global progress
    progress = 0  # Reset progress
    user_message = request.json.get("message")
    try:
        smiles_string = str(user_message)
        smiles_json = smiles_to_json(smiles_string)
        return jsonify({"reply": smiles_json})
    except Exception as e:
        return jsonify({"error": str(e)}), 500


@app.route("/chat", methods=["POST"])
def chat():
    global progress
    progress = 0  # Reset progress
    user_message = request.json.get("message")
    try:
        # Step 1: OpenAI API call (0% to 50%)
        progress = 10  # Start of API call
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
        progress = 50  # API call complete
        bot_reply = response.output_text
        json_data = smiles_to_json(bot_reply)  # Remaining 50% handled in smiles_to_json
        return jsonify({"reply": json_data})
    except Exception as e:
        return jsonify({"error": str(e)}), 500


if __name__ == "__main__":
    app.run(debug=True, port=5000)
