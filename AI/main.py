from flask import Flask, request, jsonify
from openai import OpenAI
from flask_cors import CORS

app = Flask(__name__)
CORS(app)  # Enable CORS for front-end access

# Initialize OpenAI client
client = OpenAI(api_key="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")  # Use environment variable in production

@app.route('/chat', methods=['POST'])
def chat():
    user_message = request.json.get('message')
    try:
        response = client.chat.completions.create(
            model='gpt-4o',
            messages=[
                {
                    'role': 'system',
                    'content': 'You are a molecule generator. You generate the molecule the prompt asks with the greatest accuracy. You will generate a JSON file that contains the molecule data. Put it in this exact format DO NO CHANGE ANTYHING ABOUT THE FORMAT: { atomData: [0: {element: \"O\", x: 104.008, y: 103.223, z: 106.729}, 1: {element: \"H\", x: 14.018, y: 63.200, z: 106.729}] numAtoms: 2} Use double quotes for the element names.  ONLY GENERATE THE MOLECULE NOTHING ELSE'
                },
                {'role': 'user', 'content': user_message},
            ],
            temperature=0.5,
            max_tokens=1024
        )
        bot_reply = response.choices[0].message.content
        return jsonify({"reply": bot_reply})
    except Exception as e:
        return jsonify({"error": str(e)}), 500

if __name__ == '__main__':
    app.run(debug=True, port=5000)
