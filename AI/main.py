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


def smiles_to_json(smiles):

    # Step 1: Parse SMILES string (10%)
    mol = Chem.MolFromSmiles(smiles, sanitize=False)
    if mol is None:
        return {"error": "Invalid SMILES string"}

    # Step 2: Sanitize molecule (30%)
    try:
        Chem.SanitizeMol(mol, sanitizeOps=Chem.SanitizeFlags.SANITIZE_ALL)
    except Exception as e:
        return {"error": f"Sanitization failed: {str(e)}"}

    # Step 3: Kekulize (40%)
    Chem.Kekulize(mol, clearAromaticFlags=True)

    # Step 4: Add hydrogens (60%)
    mol = Chem.AddHs(mol, explicitOnly=False)

    # Step 5: Generate 3D coordinates (90%)
    AllChem.EmbedMolecule(mol, randomSeed=42)
    if mol.GetNumConformers() == 0:
        return {"error": "Failed to generate 3D coordinates"}

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

    return molecule_data


@app.route("/tosmiles", methods=["POST"])
def tosmiles():
    user_message = request.json.get("message")
    try:
        smiles_string = str(user_message)
        smiles_json = smiles_to_json(smiles_string)
        return jsonify({"reply": smiles_json})
    except Exception as e:
        return jsonify({"error": str(e)}), 500


@app.route("/analysis", methods=["POST"])
def analysis():
    img = request.json.get("message")
    try:
        # Step 1: OpenAI API call (0% to 50%)
        response = client.responses.create(
            model="gpt-4.1",
            input=[
                {
                    "role": "system",
                    "content": [
                        {
                            "type": "input_text",
                            "text": "You a the smartest, state-of-the art AI molecule analyzer! You accept an image of a molecule and give facts about the molecule in the image. Give its name, properties, origin, and uses",
                        },
                    ],
                },
                {
                    "role": "user",
                    "content": [
                        {"type": "input_text", "text": "Analyze this molecule:"},
                        {
                            "type": "input_image",
                            "image_url": str(img),
                        },
                    ],
                },
            ],
        )

        bot_reply = response.output_text
        return jsonify({"reply": bot_reply})
    except Exception as e:
        return jsonify({"error": str(e)}), 500


@app.route("/chat", methods=["POST"])
def chat():
    user_message = request.json.get("message")
    try:
        # Step 1: OpenAI API call (0% to 50%)
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
        json_data = smiles_to_json(bot_reply)  # Remaining 50% handled in smiles_to_json
        return jsonify({"reply": json_data})
    except Exception as e:
        return jsonify({"error": str(e)}), 500


if __name__ == "__main__":
    app.run(debug=True, port=5000)
