import os
import traceback
from flask import Flask, request, jsonify
from flask_cors import CORS
from dotenv import load_dotenv
from google import genai
from google.genai import types

load_dotenv()

app = Flask(__name__)
# Enable CORS so the React app running on a different port can communicate with this API
CORS(app)

GEMINI_API_KEY = os.environ.get("GEMINI_API_KEY")

try:
    client = genai.Client(api_key=GEMINI_API_KEY) if GEMINI_API_KEY and GEMINI_API_KEY != "your_api_key_here" else None
except Exception as e:
    client = None
    print(f"Failed to initialize GenAI client: {e}")

system_instruction = """
You are a highly advanced Virtual Veterinary Assistant named Pet Care Buddy.
Your main job is to provide extremely helpful, knowledgeable, and reliable advice to pet owners about their dogs and pets.
You understand health, food habits, medicines, vaccines, daily activities, behavioral issues, and more.
Always maintain a helpful, warm, and professional tone. Use appropriate emojis 🐾🐶🐱.
When discussing health issues, provide reasoning, actionable steps, and a warning on when to consult a real human veterinarian.
You are not a replacement for an in-person vet exam, especially in emergencies, but you provide the absolute best online guidance possible.
Do not hallucinate fake medical treatments or give deadly advice. Provide very detailed responses, act like a full expert bot.
"""

@app.route("/api/chat", methods=["POST"])
def chat():
    if not client:
        return jsonify({"response": "I'm sorry, I couldn't configure the AI backend using the provided GEMINI_API_KEY."}), 500
        
    data = request.json
    user_message = data.get("message", "")
    history = data.get("history", []) 
    
    formatted_history = []
    
    # Process previous history
    for msg in history:
        if msg.get("id") == "welcome":
            continue
            
        role = "user" if msg.get("sender") == "user" else "model"
        msg_parts = []
                
        if msg.get("text"):
            msg_parts.append(types.Part.from_text(text=msg.get("text")))
            
        if msg_parts:
            formatted_history.append(
                types.Content(role=role, parts=msg_parts)
            )
        
    try:
        # Process the current incoming message
        current_msg_parts = []
            
        if user_message:
            current_msg_parts.append(types.Part.from_text(text=user_message))
        else:
            current_msg_parts.append(types.Part.from_text(text=" "))
            
        formatted_history.append(
            types.Content(role="user", parts=current_msg_parts)
        )
        
        # Generate using 'gemini-flash-latest' to bypass 2.0 ratelimits!
        response = client.models.generate_content(
            model='gemini-flash-latest',
            contents=formatted_history,
            config=types.GenerateContentConfig(
                system_instruction=system_instruction,
                temperature=0.6,
            )
        )
        return jsonify({"response": response.text})
        
    except Exception as e:
        print(f"Error generating content: {e}")
        traceback.print_exc()
        error_msg = str(e)
        if "429" in error_msg or "RESOURCE_EXHAUSTED" in error_msg:
            return jsonify({"response": "Whoops! Even after changing models, I'm hitting rate limits on Google AI Studio. Please wait a bit."})
        return jsonify({"response": f"Server Error Details: {error_msg}"}), 500

if __name__ == "__main__":
    app.run(debug=True, port=5000)
