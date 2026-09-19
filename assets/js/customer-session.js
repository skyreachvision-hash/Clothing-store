import { initializeApp } from "https://www.gstatic.com/firebasejs/12.19.0/firebase-app.js";
import { getAuth, onAuthStateChanged } from "https://www.gstatic.com/firebasejs/12.19.0/firebase-auth.js";

const firebaseConfig = {
  apiKey: "AIzaSyDQjotIJvYeEggt-zn5wlvRSoMcvCgPgaU",
  authDomain: "clothing-store-e7200.firebaseapp.com",
  projectId: "clothing-store-e7200",
  storageBucket: "clothing-store-e7200.firebasestorage.app",
  messagingSenderId: "631043708400",
  appId: "1:631043708400:web:43b15745d1a4b7c41f7935",
  measurementId: "G-XEZ10CHQHB"
};

const app = initializeApp(firebaseConfig);
const auth = getAuth(app);

window.customerAuthReady = new Promise((resolve) => {
  onAuthStateChanged(auth, (user) => resolve(user));
});
