import axios from "axios";

const GEMINI_API_URL = "https://generativelanguage.googleapis.com/v1/models/gemini-1.5-pro:generateContent";
const API_KEY = import.meta.env.VITE_GEMINI_API_KEY

export const callGemini = async (userPrompt) => {
  try {
    const res = await axios.post(
      `${GEMINI_API_URL}?key=${API_KEY}`,
      {
        contents: [{ parts: [{ text: userPrompt }] }]
      },
      {
        headers: {
          "Content-Type": "application/json"
        }
      }
    );

    const reply = res.data?.candidates?.[0]?.content?.parts?.[0]?.text;
    return reply || "Sorry, I couldn't come up with a response.";
  } catch (err) {
    console.error("Gemini API error:", err);
    return "Sorry, there was an issue reaching the AI.";
  }
};

