import { useState } from "react";
import { db } from "./firebase";
import { collection, addDoc, serverTimestamp } from "firebase/firestore";
import { callGemini } from "./callGemini";
import "./App.css";

const REQUIRED_FIELDS = [
  "name",
  "phone",
  "email",
  "address",
  "investment_type",
  "loan_amount",
  "loan_purpose",
  "term_months"
];

function buildChatPrompt(messages, extracted) {
  const filled = Object.keys(extracted);
  const remaining = REQUIRED_FIELDS.filter((f) => !filled.includes(f));

  const conversation = messages
    .map((m) => `${m.sender === "user" ? "User" : "Assistant"}: ${m.text}`)
    .join("\n");

  if (remaining.length === 0) {
    return `You're a friendly AI loan officer. The user has provided all required information. Thank them and stop asking more questions.`;
  }

  return `You're a friendly AI loan officer. Your job is to gather the following loan application fields:

- Full Name
- Phone Number
- Email Address
- Property Address
- Investment Type (e.g., single-family, multi-family, commercial, primary residence, fix and flip)
- Loan Amount
- Loan Purpose (purchase, refinance, renovation)
- Loan Term (in months)

Conversation so far:
${conversation}

Fields already collected: ${filled.join(", ") || "none"}
Remaining fields: ${remaining.join(", ")}

Ask ONE conversational question at a time to collect ONE missing field. DO NOT repeat questions. DO NOT confirm again. Once everything is collected, thank the user and STOP.`;
}

export default function App() {
  const [messages, setMessages] = useState([
    { text: "Hi! I’m the Temple View AI assistant. What can I help you with today?", sender: "bot" }
  ]);
  const [input, setInput] = useState("");
  const [submitted, setSubmitted] = useState(false);

  const handleSubmit = async (text) => {
    if (!text.trim()) return;

    const userMsg = { text, sender: "user" };
    const updatedMessages = [...messages, userMsg];
    setMessages(updatedMessages);
    setInput("");

    if (submitted) {
      setMessages((prev) => [
        ...prev,
        { text: "Your application has already been submitted. Let me know if you need anything else!", sender: "bot" }
      ]);
      return;
    }

    const extracted = extractResponses(updatedMessages);
    const hasAllData = REQUIRED_FIELDS.every((field) => extracted[field]);

    if (hasAllData) {
      const log = updatedMessages.map((m) => `${m.sender === "user" ? "User" : "Assistant"}: ${m.text}`);

      await addDoc(collection(db, "loan_applications"), {
        applicant_info: {
          name: extracted.name,
          phone: extracted.phone,
          email: extracted.email
        },
        property_info: {
          address: extracted.address
        },
        loan_details: {
          investment_type: extracted.investment_type,
          loan_amount: Number(extracted.loan_amount),
          loan_purpose: extracted.loan_purpose
        },
        requested_terms: {
          term_months: Number(extracted.term_months)
        },
        conversation_log: log,
        created_at: serverTimestamp()
      });

      const estimate = Number(extracted.loan_amount) * 0.8;
      setMessages((prev) => [
        ...prev,
        { text: "Thanks! Submitting your application...", sender: "bot" },
        {
          text: `You're pre-approved for $${estimate.toLocaleString()} at 10% over ${extracted.term_months} months.`,
          sender: "bot"
        },
        { text: "Is there anything else I can help you with today?", sender: "bot" }
      ]);
      setSubmitted(true);
      return; // ✅ stop here
    }

    const prompt = buildChatPrompt(updatedMessages, extracted);
    const aiResponse = await callGemini(prompt);

    if (aiResponse) {
      setMessages((prev) => [...prev, { text: aiResponse, sender: "bot" }]);
    }
  };

  const extractResponses = (messages) => {
    const data = {};
    const userMessages = messages.filter((m) => m.sender === "user");

    for (let i = 0; i < userMessages.length; i++) {
      const text = userMessages[i].text.trim();
      const lower = text.toLowerCase();

      if (!data.name && /^[a-z]+ [a-z]+$/i.test(text)) {
        data.name = text;
      }

      if (!data.phone && /\d{3}[-.\s]?\d{3}[-.\s]?\d{4}/.test(text)) {
        data.phone = text;
      }

      if (!data.email && /\S+@\S+\.\S+/.test(text)) {
        data.email = text;
      }

      if (
        !data.address &&
        /(street|avenue|road|lane|boulevard|drive|court|circle|way)/i.test(lower) &&
        /\d{2,5}/.test(lower)
      ) {
        data.address = text;
      }

      if (
        !data.loan_amount &&
        /\d{4,7}/.test(lower) &&
        /(borrow|amount|loan|need|request|financ|looking)/i.test(messages[i - 1]?.text || "")
      ) {
        const amt = parseInt(text.replace(/[^0-9]/g, ""), 10);
        if (amt > 5000 && amt < 10000000) {
          data.loan_amount = amt;
        }
      }

      if (
        !data.loan_purpose &&
        /(purchase|refinance|renovation|renovate|construction)/i.test(lower)
      ) {
        data.loan_purpose = lower.match(/purchase|refinance|renovation|renovate|construction/i)[0];
      }

      if (
        !data.investment_type &&
        /(rental|primary|investment|fix and flip|flip|multi-family|single-family|commercial)/i.test(lower)
      ) {
        data.investment_type = lower;
      }

      if (!data.term_months) {
        const match = text.match(/\d{1,3}/);
        if (match) {
          const months = parseInt(match[0]);
          if (months >= 6 && months <= 480) {
            data.term_months = months;
          }
        }
      }
    }

    return data;
  };

  return (
    <div className="chat-container">
      {messages.map((m, i) => (
        <div key={i} className={`message ${m.sender}`}>{m.text}</div>
      ))}
      <input
        className="chat-input"
        value={input}
        onChange={(e) => setInput(e.target.value)}
        onKeyDown={(e) => e.key === "Enter" && handleSubmit(input)}
        placeholder="Type your response..."
      />
    </div>
  );
}
