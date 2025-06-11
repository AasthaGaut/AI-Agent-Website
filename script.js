console.log("Chatbot placeholder loaded.");
const questions = [
  {
    field: "name",
    prompt: "What is your name?",
    path: "applicant_info.name"
  },
  {
    field: "phone",
    prompt: "What is your phone number?",
    path: "applicant_info.phone"
  },
  {
    field: "email",
    prompt: "What is your email?",
    path: "applicant_info.email"
  },
  {
    field: "address",
    prompt: "What is the address of the property you are looking to finance?",
    path: "property_info.address"
  },
  {
    field: "investment_type",
    prompt: "Please select the investment type you are interested in.",
    options: ["Rental Property", "Fix and Flip", "New Construction", "Bridge Loan", "Other"],
    path: "loan_details.investment_type"
  },
  {
    field: "loan_amount",
    prompt: "How much money are you seeking?",
    path: "loan_details.loan_amount"
  },
  {
    field: "loan_purpose",
    prompt: "Please select the intended purpose for this loan.",
    options: ["Property Purchase", "Refinance with Cash-out", "Rate and Term Refinance"],
    path: "loan_details.loan_purpose"
  },
  {
    field: "term_months",
    prompt: "Please provide your desired loan term in number of months.",
    path: "requested_terms.term_months"
  }
];

const chatContainer = document.getElementById("chat-container");
let currentQuestionIndex = 0; 
const responses = {};
const conversationLog = [];

//display the first question 
askNextQuestion();
console.log("Chatbot conversation started.");


function askNextQuestion() {
    if (currentQuestionIndex >= questions.length ) {
        console.log("All questions answered:", responses);
        console.log("Conversation log: ", conversationLog);
        //TODO: trigger firebase submission here to store the user data
        return;
    }

    const question = questions[currentQuestionIndex];
    addMessage(question.prompt, "bot");

    //options for multiple choice questions 
    if(question.options){
        const optionsDiv = document.createElement("div");
        optionsDiv.className = "options";
        question.options.forEach(option => {
            const btn = document.createElement("button");
            btn.textContent = option;
            btn.onclick = () => handleUserResponse(option);
            optionsDiv.appendChild(btn);
        });
        chatContainer.appendChild(optionsDiv); 
    } else{
        waitForUserInput();
    }
}

function waitForUserInput() {
    const input = document.createElement("input");
    input.type = "text";
    input.placeholder = "Type your answer...";
    input.className = "chat-input";
    input.addEventListener("keypress", function (e) {
        if(e.key === "Enter" && input.value.trim() !== ""){
            handleUserResponse(input.value);
            input.remove();
        }
    });

    chatContainer.appendChild(input);
    input.focus();
}

function handleUserResponse(answer) {
  const question = questions[currentQuestionIndex];
  addMessage(answer, "user");

  // Save to responses
  responses[question.field] = answer;

  // Log conversation
  conversationLog.push(
    { message: question.prompt, sender: "ai", message_type: "question", field_collected: question.field, timestamp: new Date() },
    { message: answer, sender: "user", message_type: "answer", field_collected: question.field, timestamp: new Date() }
  );

  // Remove options if they exist
  const options = document.querySelector(".options");
  if (options) options.remove();

  currentQuestionIndex++;
  setTimeout(askNextQuestion, 500);
}

function addMessage(text, sender) {
  const msgDiv = document.createElement("div");
  msgDiv.className = "message " + sender;
  msgDiv.textContent = text;
  chatContainer.appendChild(msgDiv);
  chatContainer.scrollTop = chatContainer.scrollHeight;
}