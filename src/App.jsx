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

function buildChatPrompt(messages, filledFields) {
  const remaining = REQUIRED_FIELDS.filter((f) => !filledFields.includes(f));
  if (remaining.length === 0) {
    return `You're a friendly AI loan officer. The user has already provided all the necessary information for their application. Thank them politely and let them know it's being submitted. Do not ask any more questions.`;
  }

  const historyText = messages
    .map((m) => `${m.sender === "user" ? "User" : "Assistant"}: ${m.text}`)
    .join("\n");

  return `You're a friendly AI loan officer. Your goal is to collect the following 8 fields for a loan application:
- full name
- phone number
- email
- property address
- investment type
- loan amount
- loan purpose
- desired loan term (months)

Fields already provided: ${filledFields.join(", ") || "none"}
Remaining fields: ${remaining.join(", ")}

Conversation so far:
${historyText}

Ask only one helpful and conversational question at a time to collect a missing field.
Keep it natural—like you're guiding someone through a form step-by-step. No need to repeat anything already answered.`;
}

function App() {
  const [messages, setMessages] = useState([
    {
      text: "Hi! I’m the Temple View AI assistant. What can I help you with today?",
      sender: "bot"
    }
  ]);
  const [input, setInput] = useState("");
  const [submitted, setSubmitted] = useState(false);

  const handleSubmit = async (inputText) => {
    const userMessage = { text: inputText, sender: "user" };
    const updatedMessages = [...messages, userMessage];
    setMessages(updatedMessages);
    setInput("");

    if (submitted) {
      setMessages((prev) => [
        ...prev,
        {
          text: "Your application has already been submitted. Let me know if there's anything else I can help you with!",
          sender: "bot"
        }
      ]);
      return;
    }

    const extracted = extractResponses(updatedMessages);
    const filledFields = Object.keys(extracted);
    const hasAllData = REQUIRED_FIELDS.every((f) => filledFields.includes(f));

    if (hasAllData) {
      await addDoc(collection(db, "loan_applications"), {
        ...mapToFirestore(extracted),
        created_at: serverTimestamp()
      });

      const loanAmt = Number(extracted.loan_amount) || 0;
      const term = extracted.term_months || 12;
      const estimate = loanAmt * 0.8;

      setMessages((prev) => [
        ...prev,
        { text: "Thanks! Submitting your application...", sender: "bot" },
        {
          text: `You're pre-approved for $${estimate.toLocaleString()} at 10% over ${term} months. We'll follow up soon!`,
          sender: "bot"
        },
        {
          text: "Is there anything else I can help you with today?",
          sender: "bot"
        }
      ]);

      setSubmitted(true);
      return;
    }

    const prompt = buildChatPrompt(updatedMessages, filledFields);
    const aiResponse = await callGemini(prompt);

    if (aiResponse) {
      const newMessages = [...updatedMessages, { text: aiResponse, sender: "bot" }];
      setMessages(newMessages);

      if (!submitted) {
        const finalExtracted = extractResponses(newMessages);
        const finalFilled = Object.keys(finalExtracted);
        const hasAllFinal = REQUIRED_FIELDS.every((f) => finalFilled.includes(f));

        if (hasAllFinal) {
          await addDoc(collection(db, "loan_applications"), {
            ...mapToFirestore(finalExtracted),
            created_at: serverTimestamp()
          });

          const loanAmt = Number(finalExtracted.loan_amount) || 0;
          const term = finalExtracted.term_months || 12;
          const estimate = loanAmt * 0.8;

          setMessages((prev) => [
            ...prev,
            { text: "Thanks! Submitting your application...", sender: "bot" },
            {
              text: `You're pre-approved for $${estimate.toLocaleString()} at 10% over ${term} months. We'll follow up soon!`,
              sender: "bot"
            },
            {
              text: "Is there anything else I can help you with today?",
              sender: "bot"
            }
          ]);

          setSubmitted(true);
        }
      }
    }
  };

  function extractResponses(messages) {
  const userMessages = messages.filter(m => m.sender === "user");
  const data = {};

  for (const msg of userMessages) {
    const text = msg.text.trim().toLowerCase();

    // Name: Looks for "Firstname Lastname" style
    if (!data.name && /^[a-z]+\s[a-z]+$/.test(msg.text.trim())) {
      data.name = msg.text.trim();
    }

    // Phone
    if (!data.phone && /\d{3}[-.\s]?\d{3}[-.\s]?\d{4}/.test(text)) {
      data.phone = msg.text.trim();
    }

    // Email
    if (!data.email && /\S+@\S+\.\S+/.test(text)) {
      data.email = msg.text.trim();
    }

    // Address: Check for common address keywords
    if (
      !data.address &&
      /(street|st\.?|road|rd\.?|drive|dr\.?|court|ct\.?|lane|ln\.?|ave|avenue|boulevard|blvd)/.test(text) &&
      /\d{2,5}/.test(text) // has a number like a street number or zip
    ) {
      data.address = msg.text.trim();
    }

    // Loan Amount: Try to detect large values but ignore zip codes
    // Loan Amount — only extract from messages that likely follow a loan amount question
    if (!data.loan_amount) {
      const isAmountReply = /(loan amount|how much|borrow|request|financing)/.test(
        messages[messages.indexOf(msg) - 1]?.text.toLowerCase() || ""
      );

      const allNums = [...text.matchAll(/\$?\d{4,7}/g)].map(m =>
        parseFloat(m[0].replace(/[^0-9.]/g, ""))
      );

      const filtered = allNums.filter(n => n > 5000 && n < 1_000_000); // ignore ZIP-like numbers

      if (filtered.length > 0 && isAmountReply) {
        data.loan_amount = filtered[0];
      }
    }


    // Loan Purpose
    if (!data.loan_purpose && /(purchase|refinance|renovation|fix|flip)/.test(text)) {
      data.loan_purpose = msg.text.trim();
    }

    // Investment Type
    if (
      !data.investment_type &&
      /(rental|flip|fix and flip|construction|bridge|residential|commercial|multi-family)/.test(text)
    ) {
      data.investment_type = msg.text.trim();
    }

    // Term
    if (!data.term_months) {
      const match = text.match(/\b\d{1,2}\b/);
      if (match && /month/.test(text)) {
        data.term_months = parseInt(match[0]);
      } else if (match && parseInt(match[0]) >= 6 && parseInt(match[0]) <= 36) {
        // fallback: likely valid term
        data.term_months = parseInt(match[0]);
      }
    }
  }

  return data;
}


  function mapToFirestore(data) {
    return {
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
      }
    };
  }

  const handleInput = (e) => setInput(e.target.value);
  const handleKeyPress = (e) => {
    if (e.key === "Enter" && input.trim()) {
      handleSubmit(input.trim());
    }
  };

  return (
    <div className="chat-container">
      {messages.map((m, i) => (
        <div key={i} className={`message ${m.sender}`}>{m.text}</div>
      ))}
      <input
        className="chat-input"
        value={input}
        onChange={handleInput}
        onKeyPress={handleKeyPress}
        placeholder="Type your response..."
      />
    </div>
  );
}

export default App;
