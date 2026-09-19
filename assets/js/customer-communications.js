import { initializeApp } from "https://www.gstatic.com/firebasejs/12.19.0/firebase-app.js";
import { firebaseConfig } from "./firebase-config.js";
import { getAuth, onAuthStateChanged } from "https://www.gstatic.com/firebasejs/12.19.0/firebase-auth.js";

const auth = getAuth(initializeApp(firebaseConfig));
const page = document.querySelector("[data-customer-chat-page]");
let user = null;
let selectedId = null;

const esc = value => String(value ?? "").replace(/[&<>"']/g, c => ({"&":"&amp;","<":"&lt;",">":"&gt;",'"':"&quot;","'":"&#039;"}[c]));
const api = async (url, options = {}) => {
  const headers = new Headers(options.headers || {});
  headers.set("Authorization", "Bearer " + await user.getIdToken());
  if (options.body) headers.set("Content-Type", "application/json");
  const response = await fetch(url, {...options, headers, cache: "no-store"});
  const data = await response.json().catch(() => ({}));
  if (!response.ok || !data.success) throw new Error(data.error || "Request failed.");
  return data;
};

async function load() {
  const data = await api("/api/customer-communications");
  const conversations = Array.isArray(data.data) ? data.data : [];
  page.innerHTML = '<div class="account-card customer-chat"><div class="settings-heading"><div><p class="eyebrow">Customer care</p><h1>Live Chat</h1><p class="muted">Ask a question before or after your purchase.</p></div><a class="button button-outline" href="account.html">Back to Account</a></div><div class="customer-chat-layout"><section class="settings-panel customer-chat-list"><div class="settings-heading"><h2>Conversations</h2><button class="button button-outline" type="button" data-new>New chat</button></div><div data-list></div></section><section class="settings-panel customer-chat-panel" data-panel><div class="chat-empty"><h2>Select a conversation</h2><p class="muted">Choose a conversation or start a new chat.</p></div></section></div></div>';
  const list = page.querySelector("[data-list]");
  list.innerHTML = conversations.length ? conversations.map(c => '<button class="customer-chat-conversation" type="button" data-id="' + c.id + '"><strong>' + esc(c.subject || "Customer question") + '</strong><small>' + esc(c.status) + '</small></button>').join("") : '<p class="muted">No conversations yet.</p>';
  list.onclick = event => { const id = event.target.closest("[data-id]")?.dataset.id; if (id) openConversation(Number(id)); };
  page.querySelector("[data-new]").onclick = newConversation;
}

function newConversation() {
  const panel = page.querySelector("[data-panel]");
  panel.innerHTML = '<div class="chat-heading"><p class="eyebrow">New conversation</p><h2>How can we help?</h2></div><form class="settings-form" data-form><label class="field"><span>Subject</span><input name="subject" maxlength="160" required></label><label class="field"><span>Message</span><textarea name="body" rows="6" maxlength="4000" required></textarea></label><div class="settings-actions"><span class="settings-load-status" data-status>Ready.</span><button class="button button-primary">Send message</button></div></form>';
  panel.querySelector("form").onsubmit = async event => {
    event.preventDefault();
    const form = event.currentTarget;
    try {
      const result = await api("/api/customer-communications", {method:"POST", body:JSON.stringify({subject:form.elements.subject.value.trim(), body:form.elements.body.value.trim()})});
      selectedId = result.data.id;
      await load();
      await openConversation(selectedId);
    } catch (error) { panel.querySelector("[data-status]").textContent = error.message; }
  };
}

async function openConversation(id) {
  selectedId = id;
  const result = await api("/api/customer-communications?id=" + id);
  const conversation = result.data.conversation;
  const messages = result.data.messages || [];
  const panel = page.querySelector("[data-panel]");
  panel.innerHTML = '<div class="chat-heading"><p class="eyebrow">' + esc(conversation.status) + '</p><h2>' + esc(conversation.subject || "Customer question") + '</h2></div><div class="chat-messages" data-messages></div>' + (conversation.status === "open" ? '<form class="chat-reply-form" data-reply><textarea name="body" rows="3" maxlength="4000" required placeholder="Write a reply…"></textarea><div class="settings-actions"><span class="settings-load-status" data-status>Messages update automatically.</span><button class="button button-primary">Send</button></div></form>' : '<p class="settings-notice">This conversation is closed.</p>');
  const box = panel.querySelector("[data-messages]");
  box.innerHTML = messages.map(m => '<article class="chat-message ' + (m.sender_type === "customer" ? "is-customer" : "is-admin") + '"><div><strong>' + esc(m.sender_type === "customer" ? "You" : (m.sender_name || "Customer care")) + '</strong></div><p>' + esc(m.body) + '</p></article>').join("");
  box.scrollTop = box.scrollHeight;
  panel.querySelector("[data-reply]")?.addEventListener("submit", async event => {
    event.preventDefault();
    const form = event.currentTarget;
    try { await api("/api/customer-communications", {method:"POST", body:JSON.stringify({conversation_id:id, body:form.elements.body.value.trim()})}); form.reset(); await openConversation(id); }
    catch (error) { panel.querySelector("[data-status]").textContent = error.message; }
  });
}

onAuthStateChanged(auth, async currentUser => {
  user = currentUser;
  if (!user) {
    page.innerHTML = '<div class="account-card"><p class="eyebrow">Customer care</p><h1>Sign in required</h1><p class="muted">Please sign in to use live chat.</p><a class="button button-primary" href="account.html">Go to Account</a></div>';
    return;
  }
  try { await load(); } catch (error) { page.innerHTML = '<div class="account-card"><p class="settings-notice">' + esc(error.message) + '</p></div>'; }
});
