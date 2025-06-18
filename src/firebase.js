// src/firebase.js
import { initializeApp } from "firebase/app";
import { getFirestore } from "firebase/firestore";

const firebaseConfig = {
  apiKey: import.meta.env.VITE_GOOGLE_API_KEY,
  authDomain: "ai-agent-sample-dialogue.firebaseapp.com",
  projectId: "ai-agent-sample-dialogue",
  storageBucket: "ai-agent-sample-dialogue.appspot.com",
  messagingSenderId: "336645596515",
  appId: "1:336645596515:web:10d4d46c639299656adf56",
  measurementId: "G-BW22JV9RT7"
};

const app = initializeApp(firebaseConfig);
export const db = getFirestore(app);
