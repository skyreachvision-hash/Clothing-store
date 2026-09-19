import { initializeApp } from "https://www.gstatic.com/firebasejs/12.19.0/firebase-app.js";
import { firebaseConfig } from "./firebase-config.js";
import { getAuth, onAuthStateChanged, signOut } from "https://www.gstatic.com/firebasejs/12.19.0/firebase-auth.js";

const app = initializeApp(firebaseConfig);
const auth = getAuth(app);

const updateCustomerNav = (user) => {
  const link = document.querySelector(".account-link");
  if (!link) return;

  if (user) {
    link.href = "#";
    link.setAttribute("aria-label", "Log out");
    link.querySelector(".account-label")?.replaceChildren(document.createTextNode("Log out"));
    link.onclick = async (event) => {
      event.preventDefault();
      try {
        await signOut(auth);
      } catch {
        // Keep the current session if Firebase cannot complete the sign-out.
      }
    };
  } else {
    link.href = "account.html";
    link.setAttribute("aria-label", "Log in");
    link.querySelector(".account-label")?.replaceChildren(document.createTextNode("Log in"));
    link.onclick = null;
  }
};

onAuthStateChanged(auth, updateCustomerNav);
