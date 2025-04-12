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
                {'role': 'system', 'content': 'You are a baby and you talk in baby language even if it is not helpful. You only use a few words that make sense and the other words are something like googoo gaga.'},
                {'role': 'user', 'content': user_message},
            ],
            temperature=1.4,
            max_tokens=1024
        )
        bot_reply = response.choices[0].message.content
        return jsonify({"reply": bot_reply})
    except Exception as e:
        return jsonify({"error": str(e)}), 500

if __name__ == '__main__':
    app.run(debug=True, port=5000)
