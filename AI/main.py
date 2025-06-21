import os
from flask import Flask, request, jsonify
from openai import OpenAI
from flask_cors import CORS

app = Flask(__name__)
CORS(app)  # Enable CORS for front-end access

# Initialize OpenAI client
# client = OpenAI(
#     api_key=os.getenv("XAI_API_KEY"),
#     base_url="https://api.x.ai/v1",
# )
client = OpenAI()


@app.route("/chat", methods=["POST"])
def chat():
    user_message = request.json.get("message")
    try:
        # response = client.chat.completions.create(
        #     # model="grok-3-latest",
        #     model="gpt-4.1",
        #     messages=[
        #         {
        #             "role": "system",
        #             "content": 'You are the worlds greatest and most accurate molecule generator. You generate the molecule the prompt asks with the greatest accuracy. You will generate a JSON file that contains the molecule data. Put it in this exact format: (DO NO CHANGE ANTYHING ABOUT THE FORMAT). Example 1: {"atomData": [{"element": "C", "x": 0.000, "y": 1.396, "z": 0.000},{"element": "H", "x": 1.209, "y": 0.698, "z": 0.000},{"element": "O", "x": 1.209, "y": -0.698, "z": 0.000}],"numAtoms": 3} Example 2: {"atomData": [{"element": "C", "x": 0.000, "y": 1.396, "z": 0.000},{"element": "C", "x": 1.309, "y": 0.498, "z": 0.200},{"element": "O", "x": 1.209, "y": -0.698, "z": 2.014},{"element": "N", "x": 0.209, "y": -0.633, "z": 1.020},{"element": "S", "x": 1.119, "y": -0.491, "z": 6.025}],"numAtoms": 5} Bonds are created via the covalent radius system so keep that in mind. ONLY GENERATE THE MOLECULE JSON FILE IN THE GIVEN EXAMPLE FORMATS AND NOTHING ELSE',
        #         },
        #         {"role": "user", "content": user_message},
        #     ],
        #     temperature=0.2,
        #     max_tokens=20000,
        # )
        # bot_reply = response.choices[0].message.content
        # return jsonify({"reply": bot_reply})
        response = client.responses.create(
            model="gpt-4.1-2025-04-14",
            prompt={
                "id": "pmpt_6855b624611c8193b777e4b66d554e520a9dd9578464de07",
                "version": "3",
            },
            input=user_message,
        )
        bot_reply = response.output[0].content[0].text
        return jsonify({"reply": bot_reply})
    except Exception as e:
        return jsonify({"error": str(e)}), 500


if __name__ == "__main__":
    app.run(debug=True, port=5000)


# response = client.responses.create(
#     model="gpt-4.1-2025-04-14",
#     prompt={
#         "id": "pmpt_6855b624611c8193b777e4b66d554e520a9dd9578464de07",
#         "version": "3",
#     },
#     input="generate dopamine molecule",
# )

# print(response.output[0].content[0].text)
