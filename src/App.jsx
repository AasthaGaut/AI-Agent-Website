import { useEffect, useState } from "react";
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

function buildPrompt(messages, extracted) {
  const filled = Object.keys(extracted);
  const missing = REQUIRED_FIELDS.filter(f => !filled.includes(f));

  const conversation = messages
    .map(m => `${m.sender === "user" ? "User" : "Assistant"}: ${m.text}`)
    .join("\n");

  if (missing.length === 0) {
    return `You're a professional and friendly AI loan officer. The user has now provided all required information. Politely thank them and confirm the loan application is being submitted. Do not ask for anything else.`;
  }

  return `You are a professional and friendly AI loan officer. Your job is to collect the following loan application fields:

- Full Name
- Phone Number
- Email Address
- Property Address
- Investment Type (e.g., single-family, multi-family, commercial, primary residence, fix and flip)
- Loan Amount
- Loan Purpose (purchase, refinance, renovation)
- Loan Term in months (e.g., 120 months for a 10-year loan)

Ask for only one missing field at a time in a conversational, natural way. Do not repeat or confirm previously collected information. Do not loop or re-ask anything that’s been answered.

Conversation so far:
${conversation}

Fields already collected: ${filled.join(", ") || "none"}
Remaining fields: ${missing.join(", ")}

Ask your next question to collect one missing field.`;
}

export default function App() {
  const [messages, setMessages] = useState([
    { text: "Hi! I’m the Temple View AI assistant. What can I help you with today?", sender: "bot" }
  ]);
  const [input, setInput] = useState("");
  const [submitted, setSubmitted] = useState(false);
  const [extracted, setExtracted] = useState({});

  const handleUserInput = async (text) => {
    const newMessages = [...messages, { text, sender: "user" }];
    setMessages(newMessages);
    setInput("");

    const newExtracted = extractFields(newMessages);
    setExtracted(newExtracted);

    const allCollected = REQUIRED_FIELDS.every(f => newExtracted[f]);

    if (allCollected && !submitted) {
      await submitToFirestore(newExtracted, newMessages);
      setSubmitted(true);
      return;
    }

    const prompt = buildPrompt(newMessages, newExtracted);
    const aiReply = await callGemini(prompt);
    if (aiReply) {
      setMessages(prev => [...prev, { text: aiReply, sender: "bot" }]);
    }
  };

  useEffect(() => {
    const autoSubmit = async () => {
      if (!submitted && REQUIRED_FIELDS.every(f => extracted[f])) {
        await submitToFirestore(extracted, messages);
        setSubmitted(true);
        setMessages(prev => [
          ...prev,
          { text: "Thanks! Submitting your application...", sender: "bot" },
          {
            text: `You're pre-approved for $${(extracted.loan_amount * 0.8).toLocaleString()} at 10% over ${extracted.term_months} months.`,
            sender: "bot"
          },
          { text: "Is there anything else I can help you with today?", sender: "bot" }
        ]);
      }
    };
    autoSubmit();
  }, [extracted, messages, submitted]);

  const submitToFirestore = async (data, logMessages) => {
    const log = logMessages.map(m => `${m.sender === "user" ? "User" : "Assistant"}: ${m.text}`);
    await addDoc(collection(db, "loan_applications"), {
      applicant_info: {
        name: data.name,
        phone: data.phone,
        email: data.email
      },
      property_info: {
        address: data.address
      },
      loan_details: {
        investment_type: data.investment_type,
        loan_amount: Number(data.loan_amount),
        loan_purpose: data.loan_purpose
      },
      requested_terms: {
        term_months: Number(data.term_months)
      },
      conversation_log: log,
      created_at: serverTimestamp()
    });
  };

  const extractFields = (messages) => {
    const fields = {};
    const userMsgs = messages.filter(m => m.sender === "user");
    for (let m of userMsgs) {
      const text = m.text.toLowerCase();

      if (!fields.name && /^[a-z]+ [a-z]+$/i.test(m.text)) fields.name = m.text;
      if (!fields.phone && /\d{10}/.test(text.replace(/\D/g, ""))) fields.phone = text.match(/\d{10}/)[0];
      if (!fields.email && /\S+@\S+\.\S+/.test(m.text)) fields.email = m.text;
      if (!fields.address && /(road|lane|court|street|drive|boulevard|avenue|circle|way)/i.test(m.text)) fields.address = m.text;

      if (!fields.investment_type && /(single|multi|commercial|primary|flip)/i.test(text)) fields.investment_type = m.text;
      if (!fields.loan_purpose && /(purchase|refinance|renovation)/i.test(text)) fields.loan_purpose = text.match(/purchase|refinance|renovation/)[0];
      if (!fields.loan_amount && /\d{4,7}/.test(text.replace(/[^0-9]/g, ""))) {
        const amt = parseInt(text.replace(/[^0-9]/g, ""));
        if (amt > 5000 && amt < 10000000) fields.loan_amount = amt;
      }
      if (!fields.term_months && /(\d{1,3})\s?(months)?/.test(text)) {
        const match = text.match(/(\d{1,3})/);
        if (match) {
          const months = parseInt(match[1]);
          if (months >= 6 && months <= 480) fields.term_months = months;
        }
      }
    }
    return fields;
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
        onKeyDown={(e) => e.key === "Enter" && handleUserInput(input)}
        placeholder="Type your response..."
      />
    </div>
  );
}
