import { initializeApp } from "https://www.gstatic.com/firebasejs/12.19.0/firebase-app.js";
import { firebaseConfig } from "./firebase-config.js";
import {
  getAuth,
  onAuthStateChanged,
  signInWithEmailAndPassword,
  createUserWithEmailAndPassword,
  signOut
} from "https://www.gstatic.com/firebasejs/12.19.0/firebase-auth.js";

const app = initializeApp(firebaseConfig);
const auth = getAuth(app);
const accountPage = document.querySelector("[data-account-page]");
let mode = "login";

function setStatus(message, selector = "[data-account-status]") {
  const status = accountPage?.querySelector(selector);
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
  if (error?.code === "auth/invalid-api-key") return "Firebase rejected the project API key. Please verify the Firebase configuration.";
  return error?.code ? `Unable to complete the request (${error.code}). Please try again.` : "Unable to complete the request. Please try again.";
}

async function getCustomerProfile(user) {
  const token = await user.getIdToken();
  const response = await fetch("/api/customer-profile", {
    headers: {
      Authorization: `Bearer ${token}`,
      Accept: "application/json"
    },
    cache: "no-store"
  });
  const payload = await response.json().catch(() => ({}));
  if (!response.ok || !payload.success) {
    throw new Error(payload.error || "Unable to load your customer information.");
  }
  return payload.data || {};
}

async function saveCustomerProfile(user, form) {
  const token = await user.getIdToken();
  const details = Object.fromEntries(new FormData(form).entries());
  details.email = user.email || details.email || "";

  const response = await fetch("/api/customer-profile", {
    method: "PUT",
    headers: {
      Authorization: `Bearer ${token}`,
      "Content-Type": "application/json",
      Accept: "application/json"
    },
    body: JSON.stringify(details)
  });
  const responseText = await response.text();
  let payload = {};
  try {
    payload = responseText ? JSON.parse(responseText) : {};
  } catch {
    payload = {};
  }
  if (!response.ok || !payload.success) {
    const detail = payload.error || responseText || `HTTP ${response.status}`;
    throw new Error(`Customer profile request failed: ${detail}`);
  }
  return payload.data || details;
}

function renderCustomerAccount(user) {
  if (!accountPage) return;

  accountPage.innerHTML = `
    <div class="account-card">
      <div class="settings-heading">
        <div>
          <p class="eyebrow">Your account</p>
          <h1>Customer Information</h1>
          <p class="muted">Keep your contact and delivery details saved here. Checkout will use these details when you return.</p>
        </div>
        <button class="button button-outline" type="button" data-account-logout>Log out</button>
      </div>

      <form class="settings-form" data-customer-profile-form>
        <div class="settings-group">
          <p class="settings-readonly">Account</p>
          <label class="field">
            <span>Email address</span>
            <input name="email" type="email" autocomplete="email" readonly>
          </label>
        </div>

        <div class="settings-group">
          <p class="settings-readonly">Contact information</p>
          <div class="settings-fields">
            <label class="field">
              <span>Full name</span>
              <input name="full_name" type="text" autocomplete="name" required>
            </label>
            <label class="field">
              <span>Phone number</span>
              <input name="phone" type="tel" autocomplete="tel" required>
            </label>
          </div>
        </div>

        <div class="settings-group">
          <p class="settings-readonly">Delivery address</p>
          <div class="settings-fields">
            <label class="field">
              <span>Street / address</span>
              <input name="address" type="text" autocomplete="street-address" required>
            </label>
            <div class="settings-fields-two">
              <label class="field">
                <span>City / Town</span>
                <input name="city" type="text" autocomplete="address-level2" required>
              </label>
              <label class="field">
                <span>Province</span>
                <input name="province" type="text" autocomplete="address-level1" required>
              </label>
            </div>
            <div class="settings-fields-two">
              <label class="field">
                <span>Postal code</span>
                <input name="postal_code" type="text" autocomplete="postal-code" required>
              </label>
              <label class="field">
                <span>Country</span>
                <input name="country" type="text" autocomplete="country-name" value="South Africa" required>
              </label>
            </div>
          </div>
        </div>

        <p class="checkout-notice" data-profile-status aria-live="polite" hidden></p>
        <div class="settings-actions">
          <a class="button button-outline" href="index.html">Continue shopping</a>
          <button class="button button-primary" type="submit">Save Customer Information</button>
        </div>
      </form>
    </div>`;

  const form = accountPage.querySelector("[data-customer-profile-form]");
  const emailInput = form?.elements.email;
  if (emailInput) emailInput.value = user.email || "";

  accountPage.querySelector("[data-account-logout]")?.addEventListener("click", async () => {
    await signOut(auth);
    window.location.reload();
  });

  getCustomerProfile(user).then((profile) => {
    for (const field of ["full_name", "phone", "address", "city", "province", "postal_code", "country"]) {
      const input = form?.elements[field];
      if (input && profile[field]) input.value = profile[field];
    }
    if (profile.status === "suspended") {
      const message = profile.suspension_reason
        ? `Your customer account is suspended: ${profile.suspension_reason}`
        : "Your customer account is suspended. Please contact the store for assistance.";
      setStatus(message, "[data-profile-status]");
      const status = accountPage.querySelector("[data-profile-status]");
      if (status) status.hidden = false;
      form?.querySelectorAll("input:not([readonly])").forEach((input) => { input.disabled = true; });
      const saveButton = form?.querySelector('button[type="submit"]');
      if (saveButton) saveButton.disabled = true;
    }
  }).catch((error) => {
    setStatus(error.message || "Unable to load your customer information.", "[data-profile-status]");
    const status = accountPage.querySelector("[data-profile-status]");
    if (status) status.hidden = false;
  });

  form?.addEventListener("submit", async (event) => {
    event.preventDefault();
    if (!form.checkValidity()) {
      form.reportValidity();
      return;
    }

    const submitButton = form.querySelector('button[type="submit"]');
    submitButton.disabled = true;
    setStatus("Saving your customer information…", "[data-profile-status]");
    const status = accountPage.querySelector("[data-profile-status]");
    if (status) status.hidden = false;

    try {
      await saveCustomerProfile(user, form);
      setStatus("Your customer information has been saved.", "[data-profile-status]");
    } catch (error) {
      setStatus(error.message || "Unable to save your customer information.", "[data-profile-status]");
    } finally {
      submitButton.disabled = false;
    }
  });
}

function renderAuthForm() {
  if (!accountPage) return;

  accountPage.innerHTML = `
    <div class="account-card">
      <p class="eyebrow">Customer account</p>
      <h1 data-account-title>${mode === "login" ? "Sign in" : "Create your account"}</h1>
      <p class="muted" data-account-text>${mode === "login" ? "Sign in to access your saved customer information and continue to checkout." : "Create an account so your customer information can be saved for future checkouts."}</p>
      <form class="settings-form" data-account-form>
        <label class="field"><span>Email address</span><input name="email" type="email" autocomplete="email" required></label>
        <label class="field"><span>Password</span><input name="password" type="password" autocomplete="${mode === "login" ? "current-password" : "new-password"}" minlength="6" required></label>
        <p class="checkout-notice" data-account-status aria-live="polite" hidden></p>
        <button class="button button-primary" type="submit">${mode === "login" ? "Sign in" : "Create account"}</button>
      </form>
      <button class="text-link" type="button" data-account-toggle>${mode === "login" ? "Need an account? Create one" : "Already have an account? Sign in"}</button>
    </div>`;

  accountPage.querySelector("[data-account-form]")?.addEventListener("submit", async (event) => {
    event.preventDefault();
    const email = event.currentTarget.elements.email.value.trim();
    const password = event.currentTarget.elements.password.value;
    setStatus(mode === "login" ? "Signing in…" : "Creating account…");
    const status = accountPage.querySelector("[data-account-status]");
    if (status) status.hidden = false;

    try {
      if (mode === "login") {
        await signInWithEmailAndPassword(auth, email, password);
      } else {
        await createUserWithEmailAndPassword(auth, email, password);
      }
      const destination = new URLSearchParams(window.location.search).get("redirect");
      window.location.assign(destination === "checkout" ? "checkout.html" : "account.html");
    } catch (error) {
      setStatus(authErrorMessage(error));
    }
  });

  accountPage.querySelector("[data-account-toggle]")?.addEventListener("click", () => {
    mode = mode === "login" ? "register" : "login";
    renderAuthForm();
  });
}

onAuthStateChanged(auth, (user) => {
  if (user) renderCustomerAccount(user);
  else renderAuthForm();
});
