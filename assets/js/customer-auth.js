import { initializeApp } from "https://www.gstatic.com/firebasejs/12.19.0/firebase-app.js";
import {
  getAuth,
  onAuthStateChanged,
  signInWithEmailAndPassword,
  createUserWithEmailAndPassword,
  signOut
} from "https://www.gstatic.com/firebasejs/12.19.0/firebase-auth.js";

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
const accountPage = document.querySelector("[data-account-page]");
let mode = "login";

function setStatus(message) {
  const status = accountPage?.querySelector("[data-account-status]");
  if (status) status.textContent = message;
}

function authErrorMessage(error) {
  const messages = {
    "auth/email-already-in-use": "That email already has an account. Please sign in instead.",
    "auth/invalid-credential": "The email or password is incorrect.",
    "auth/invalid-email": "Please enter a valid email address.",
    "auth/weak-password": "Your password must be at least 6 characters.",
    "auth/operation-not-allowed": "Email/password customer sign-in is not enabled in Firebase yet.",
    "auth/network-request-failed": "The connection to customer sign-in failed. Check your internet connection and try again.",
    "auth/too-many-requests": "Too many attempts. Please wait a moment and try again."
  };
  if (error?.code === "auth/unauthorized-domain") return "This website is not authorized in Firebase Authentication. Add the current website domain under Firebase Authentication → Settings → Authorized domains.";
  if (error?.code === "auth/invalid-api-key") return "Firebase rejected the project API key. Please verify the Firebase configuration".
  return error?.code ? `Unable to complete the request (${error.code}). Please try again.` : "Unable to complete the request. Please try again.";
}

function render(user) {
  if (!accountPage) return;
  if (user) {
    accountPage.innerHTML = `
      <div class="account-card">
        <p class="eyebrow">Your account</p>
        <h1>Welcome back</h1>
        <p class="muted">${user.email || "Signed-in customer"}</p>
        <div class="settings-actions">
          <a class="button button-primary" href="checkout.html">Continue to checkout</a>
          <button class="button button-outline" type="button" data-account-logout>Log out</button>
        </div>
      </div>`;
    accountPage.querySelector("[data-account-logout]")?.addEventListener("click", async () => {
      await signOut(auth);
      window.location.reload();
    });
    return;
  }

  accountPage.innerHTML = `
    <div class="account-card">
      <p class="eyebrow">Customer account</p>
      <h1 data-account-title>${mode === "login" ? "Sign in" : "Create your account"}</h1>
      <p class="muted" data-account-text>${mode === "login" ? "Sign in to continue to checkout." : "Create an account to continue to checkout."}</p>
      <form class="settings-form" data-account-form>
        <label class="field"><span>Email address</span><input name="email" type="email" autocomplete="email" required></label>
        <label class="field"><span>Password</span><input name="password" type="password" autocomplete="${mode === "login" ? "current-password" : "new-password"}" minlength="6" required></label>
        <p class="checkout-notice" data-account-status aria-live="polite"></p>
        <button class="button button-primary" type="submit">${mode === "login" ? "Sign in" : "Create account"}</button>
      </form>
      <button class="text-link" type="button" data-account-toggle>${mode === "login" ? "Need an account? Create one" : "Already have an account? Sign in"}</button>
    </div>`;

  accountPage.querySelector("[data-account-form]")?.addEventListener("submit", async (event) => {
    event.preventDefault();
    const email = event.currentTarget.elements.email.value.trim();
    const password = event.currentTarget.elements.password.value;
    setStatus(mode === "login" ? "Signing in…" : "Creating account…");
    try {
      if (mode === "login") await signInWithEmailAndPassword(auth, email, password);
      else await createUserWithEmailAndPassword(auth, email, password);
      const destination = new URLSearchParams(window.location.search).get("redirect");
      window.location.assign(destination === "checkout" ? "checkout.html" : "account.html");
    } catch (error) {
      setStatus(authErrorMessage(error));
    }
  });
  accountPage.querySelector("[data-account-toggle]")?.addEventListener("click", () => {
    mode = mode === "login" ? "register" : "login";
    render(null);
  });
}

onAuthStateChanged(auth, (user) => render(user));
