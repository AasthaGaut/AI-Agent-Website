import { useState } from "react";
import { db } from "./firebase";
import { collection, addDoc, serverTimestamp } from "firebase/firestore";
import { callGemini } from "./callGemini";
import "./App.css";

const questions = [
  { field: "name", prompt: "What is your full name?" },
  { field: "phone", prompt: "What is your phone number?" },
  { field: "email", prompt: "What is your email?" },
  { field: "address", prompt: "What is the address of the property you are looking to finance?" },
  {
    field: "investment_type",
    prompt: "Please select the investment type",
    options: ["Rental Property", "Fix and Flip", "New Construction", "Bridge Loan", "Other"]
  },
  { field: "loan_amount", prompt: "How much money are you seeking?" },
  {
    field: "loan_purpose",
    prompt: "Please select the loan purpose",
    options: ["Property Purchase", "Refinance with Cash-out", "Rate and Term Refinance"]
  },
  { field: "term_months", prompt: "What is your desired loan term (months)?" }
];

function App() {
  const [current, setCurrent] = useState(0);
  const [responses, setResponses] = useState({});
  const [messages, setMessages] = useState([
    { text: "Welcome to Temple View Capital. I'm an AI assistant here to help you begin your loan application process.", sender: "bot" },
    { text: questions[0].prompt, sender: "bot" }
  ]);
  const [input, setInput] = useState("");

  const handleSubmit = async (response) => {
    const question = questions[current];
    const updated = { ...responses, [question.field]: response };
    setResponses(updated);

    setMessages((prev) => [
      ...prev,
      { text: response, sender: "user" }
    ]);

    // 🔹 NEW: Call Gemini if applicable
    let extraMessages = [];
    if (["loan_purpose", "loan_amount"].includes(question.field)) {
      const clarification = await callGemini(`The user answered: "${response}". Respond with a helpful clarification or follow-up question about their ${question.field.replace("_", " ")}.`);
      if (clarification) {
        extraMessages.push({ text: clarification, sender: "bot" });
      }
  }

    const nextIndex = current + 1;
    if (nextIndex < questions.length) {
      const next = questions[nextIndex];
      setMessages((prev) => [...prev, ...extraMessages, { text: next.prompt, sender: "bot" }]);
      setCurrent(nextIndex);
    } else {
      setMessages((prev) => [...prev, { text: "Thank you! Submitting your application...", sender: "bot" }]);
      await addDoc(collection(db, "loan_applications"), {
        ...mapToFirestore(updated),
        created_at: serverTimestamp()
      });
      setMessages((prev) => [...prev, { text: "Your application was submitted successfully!", sender: "bot" }]);
    }
    setInput("");
  };

  const handleInput = (e) => setInput(e.target.value);

  const handleKeyPress = (e) => {
    if (e.key === "Enter" && input.trim()) {
      handleSubmit(input.trim());
    }
  };

  const handleOptionClick = (option) => {
    handleSubmit(option);
  };

  const currentQuestion = questions[current];

  return (
    <div className="chat-container">
      {messages.map((m, i) => (
        <div key={i} className={`message ${m.sender}`}>{m.text}</div>
      ))}

      {currentQuestion?.options ? (
        <div className="options">
          {currentQuestion.options.map((opt) => (
            <button key={opt} onClick={() => handleOptionClick(opt)}>{opt}</button>
          ))}
        </div>
      ) : (
        <input
          className="chat-input"
          value={input}
          onChange={handleInput}
          onKeyPress={handleKeyPress}
          placeholder="Type your answer..."
        />
      )}
    </div>
  );
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

export default App;
