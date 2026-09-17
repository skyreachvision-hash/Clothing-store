import { initializeApp } from "https://www.gstatic.com/firebasejs/12.19.0/firebase-app.js";
import {
  getAuth,
  onAuthStateChanged,
  signInWithEmailAndPassword,
  signOut
} from "https://www.gstatic.com/firebasejs/12.19.0/firebase-auth.js";

const firebaseConfig = {
  apiKey: "AIzaSyDQjotIJvYeEggt-zn5wlvRSoMcVcgPgaU",
  authDomain: "clothing-store-e7200.firebaseapp.com",
  projectId: "clothing-store-e7200",
  storageBucket: "clothing-store-e7200.firebasestorage.app",
  messagingSenderId: "631043708400",
  appId: "1:631043708400:web:43b15745d1a4b7c41f7935",
  measurementId: "G-XEZ10CHQHB"
};

const app = initializeApp(firebaseConfig);
const auth = getAuth(app);
const loginForm = document.querySelector("[data-admin-login]");
const loginStatus = document.querySelector("[data-login-status]");
const logoutButtons = document.querySelectorAll("[data-admin-logout]");
const accountLabels = document.querySelectorAll("[data-admin-account]");
const isLoginPage = Boolean(loginForm);

const setLoginStatus = (message) => {
  if (loginStatus) loginStatus.textContent = message;
};

const adminLoginPath = "/admin/login/";
const adminPath = "/admin/";
const adminAuthCheckPath = "/api/admin-auth-check";

async function verifyAdminSession(user) {
  const idToken = await user.getIdToken();
  const response = await fetch(adminAuthCheckPath, {
    method: "GET",
    headers: {
      Authorization: `Bearer ${idToken}`,
      Accept: "application/json"
    },
    cache: "no-store"
  });

  if (!response.ok) {
    throw new Error("Backend authentication check failed.");
  }

  const result = await response.json();
  if (!result?.success || result?.data?.authenticated !== true) {
    throw new Error("Backend authentication check failed.");
  }

  return result.data;
}

if (loginForm) {
  loginForm.addEventListener("submit", async (event) => {
    event.preventDefault();
    const email = loginForm.elements.namedItem("email")?.value.trim() || "";
    const password = loginForm.elements.namedItem("password")?.value || "";
    const submitButton = loginForm.querySelector("button[type=submit]");

    if (submitButton) submitButton.disabled = true;
    setLoginStatus("Signing in…");

    try {
      await signInWithEmailAndPassword(auth, email, password);
      setLoginStatus("Signed in. Opening admin dashboard…");
      window.location.assign(adminPath);
    } catch (error) {
      const message = error?.code === "auth/invalid-credential"
        ? "The email or password is incorrect."
        : "Unable to sign in. Check your details and try again.";
      setLoginStatus(message);
      if (submitButton) submitButton.disabled = false;
    }
  });
}

logoutButtons.forEach((button) => {
  button.addEventListener("click", async () => {
    button.disabled = true;
    try {
      await signOut(auth);
      window.location.assign(adminLoginPath);
    } catch {
      button.disabled = false;
    }
  });
});

onAuthStateChanged(auth, async (user) => {
  if (user) {
    accountLabels.forEach((element) => {
      element.textContent = user.email || "Admin account";
    });

    if (isLoginPage) {
      window.location.assign(adminPath);
      return;
    }

    try {
      await verifyAdminSession(user);
    } catch {
      await signOut(auth);
      window.location.replace(adminLoginPath);
    }
    return;
  }

  if (!isLoginPage) {
    window.location.replace(adminLoginPath);
  }
});
