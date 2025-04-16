import os
from flask import Flask, request, jsonify
from openai import OpenAI
from flask_cors import CORS

app = Flask(__name__)
CORS(app)  # Enable CORS for front-end access

# Initialize OpenAI client
client = OpenAI(api_key=os.getenv('OPENAI_API_KEY'))

@app.route('/chat', methods=['POST'])
def chat():
    user_message = request.json.get('message')
    try:
        response = client.chat.completions.create(
            model='gpt-4o',
            messages=[
                {
                    'role': 'system',
                    'content': 'You are a molecule generator. You generate the molecule the prompt asks with the greatest accuracy. You will generate a JSON file that contains the molecule data. Put it in this exact format DO NO CHANGE ANTYHING ABOUT THE FORMAT: {"atomData": [{"element": "C", "x": 0.000, "y": 1.396, "z": 0.000},{"element": "H", "x": 1.209, "y": 0.698, "z": 0.000},{"element": "O", "x": 1.209, "y": -0.698, "z": 0.000}],"numAtoms": 3}.  ONLY GENERATE THE MOLECULE NOTHING ELSE'
                },
                {'role': 'user', 'content': user_message},
            ],
            temperature=0.2,
            max_tokens=1024
        )
        bot_reply = response.choices[0].message.content
        return jsonify({"reply": bot_reply})
    except Exception as e:
        return jsonify({"error": str(e)}), 500

if __name__ == '__main__':
    app.run(debug=True, port=5000)