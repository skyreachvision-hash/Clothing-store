const form = document.querySelector("[data-page-form]");
const list = document.querySelector("[data-page-list]");
const status = document.querySelector("[data-status]");
const title = document.querySelector("[data-page-title]");
const deleteButton = document.querySelector("[data-delete]");
const saveButton = document.querySelector("[data-save]");
const newButton = document.querySelector("[data-new]");
const idField = form?.elements.namedItem("id");
const slugField = form?.elements.namedItem("slug");

const setStatus = (message) => { if (status) status.textContent = message; };

async function getToken() {
  if (typeof window.getAdminIdToken !== "function") throw new Error("Admin authentication is still loading.");
  const token = await window.getAdminIdToken();
  if (!token) throw new Error("Authentication required. Please sign in again.");
  return token;
}

async function api(url, options = {}) {
  const token = await getToken();
  const headers = new Headers(options.headers || {});
  headers.set("Authorization", "Bearer " + token);
  if (options.body && !(options.body instanceof FormData) && !headers.has("Content-Type")) headers.set("Content-Type", "application/json");
  const response = await fetch(url, { ...options, headers });
  const payload = await response.json().catch(() => ({}));
  if (!response.ok || !payload.success) throw new Error(payload.error || "Request failed.");
  return payload;
}

const escapeHtml = (value) => String(value).replace(/[&<>"']/g, (character) => ({
  "&": "&amp;", "<": "&lt;", ">": "&gt;", '"': "&quot;", "'": "&#039;"
}[character]));

let pages = [];

function resetForm() {
  form.reset();
  idField.value = "";
  slugField.value = "";
  form.elements.is_published.checked = false;
  form.elements.sort_order.value = "0";
  title.textContent = "New information page";
  deleteButton.hidden = true;
  setStatus("Ready.");
}

function populate(page) {
  idField.value = page.id;
  slugField.value = page.slug;
  form.elements.title.value = page.title || "";
  form.elements.content.value = page.content || "";
  form.elements.is_published.checked = Number(page.is_published) === 1;
  form.elements.sort_order.value = Number(page.sort_order || 0);
  title.textContent = "Edit " + (page.title || "information page");
  deleteButton.hidden = false;
  setStatus("Page loaded.");
}

function renderList() {
  if (!list) return;
  list.innerHTML = pages.length
    ? pages.map((page) => '<div class="admin-panel"><div class="panel-icon">' +
        String(Number(page.sort_order || 0)).padStart(2, "0") +
        '</div><div><h2>' + escapeHtml(page.title || page.slug) + '</h2><p class="muted">' +
        escapeHtml(page.slug) + " · " + (Number(page.is_published) === 1 ? "Published" : "Draft") +
        '</p></div><button class="button button-outline" type="button" data-edit-id="' + page.id + '">Edit page</button></div>').join("")
    : '<p class="muted">No information pages yet.</p>';
  list.querySelectorAll("[data-edit-id]").forEach((button) => {
    button.addEventListener("click", () => {
      const page = pages.find((item) => String(item.id) === String(button.dataset.editId));
      if (page) populate(page);
      window.scrollTo({ top: 0, behavior: "smooth" });
    });
  });
}

async function loadPages() {
  setStatus("Loading information pages…");
  const result = await api("/api/content-pages");
  pages = result.data || [];
  renderList();
  setStatus("Information pages loaded.");
}

form?.addEventListener("submit", async (event) => {
  event.preventDefault();
  saveButton.disabled = true;
  setStatus("Saving…");
  try {
    const body = {
      title: form.elements.title.value.trim(),
      content: form.elements.content.value,
      is_published: form.elements.is_published.checked,
      sort_order: Math.max(0, Math.floor(Number(form.elements.sort_order.value || 0)))
    };
    if (!body.title) throw new Error("Page title is required.");

    if (idField.value) {
      await api("/api/content-pages?id=" + encodeURIComponent(idField.value), { method: "PUT", body: JSON.stringify(body) });
      await loadPages();
      const updated = pages.find((page) => String(page.id) === String(idField.value));
      if (updated) populate(updated);
      setStatus("Changes saved.");
    } else {
      body.slug = slugField.value.trim() || body.title;
      const result = await api("/api/content-pages", { method: "POST", body: JSON.stringify(body) });
      const created = pages.find((page) => String(page.id) === String(result.data?.id));
      await loadPages();
      const loaded = pages.find((page) => String(page.id) === String(result.data?.id));
      if (loaded) populate(loaded); else resetForm();
      setStatus(created ? "Page created." : "Page created and loaded.");
    }
  } catch (error) {
    setStatus(error.message);
  } finally {
    saveButton.disabled = false;
  }
});

deleteButton?.addEventListener("click", async () => {
  if (!idField.value || !confirm("Delete this information page?")) return;
  deleteButton.disabled = true;
  try {
    await api("/api/content-pages?id=" + encodeURIComponent(idField.value), { method: "DELETE" });
    resetForm();
    await loadPages();
    setStatus("Page deleted.");
  } catch (error) {
    setStatus(error.message);
  } finally {
    deleteButton.disabled = false;
  }
});

newButton?.addEventListener("click", () => {
  resetForm();
  window.scrollTo({ top: 0, behavior: "smooth" });
});

(async () => {
  try {
    resetForm();
    await loadPages();
  } catch (error) {
    setStatus(error.message);
    list.innerHTML = '<p class="muted">Unable to load information pages.</p>';
  }
})();