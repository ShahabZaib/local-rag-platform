/* ========= CONFIG ========= */
console.log("Java.js loaded!"); // DEBUG
const API = {
  BASE: "",                  // e.g., "http://localhost:8000" or leave "" for same-origin
  CHAT: "/api/chat/",        // POST: text/file query -> { reply, tokens_used }
  UPLOAD: "/api/upload/",    // POST: files -> { ok: true }
  TRAIN: "/api/train/",      // POST: { action: "train" } -> { ok: true }
  USERS: "/api/users/"       // POST: add/remove; GET: list -> { users: [...] }
};
// Optional: set an auth header if needed
const AUTH_HEADER = null;     // e.g., { "Authorization": "Bearer <token>" }

/* ========= DOM HOOKS ========= */
const chatForm = document.getElementById("chatForm");
const messageInput = document.getElementById("messageInput");
const fileInput = document.getElementById("fileInput");
const voiceBtn = document.getElementById("voiceBtn");
const chatWindow = document.getElementById("chatWindow");

const globalLoader = document.getElementById("globalLoader");
const loaderText = document.getElementById("loaderText");

const tokenSlider = document.getElementById("maxTokens");
const tokenValueLbl = document.getElementById("tokenValue");

const msgCountLbl = document.getElementById("messageCount");
const tokensUsedLbl = document.getElementById("tokensUsed");

const sidebar = document.getElementById("sidebar");
const sidebarToggle = document.getElementById("sidebarToggle");
const sidebarOverlay = document.getElementById("sidebarOverlay");

const adminModal = document.getElementById("adminModal");
const addUserModal = document.getElementById("addUserModal");
const removeUserModal = document.getElementById("removeUserModal");

const pdfInput = document.getElementById("pdfInput"); // added in step 1

/* ========= STATE ========= */
let messageCount = 0;
let totalTokens = 0;
let isRecording = false;
let mediaRecorder;
let recordedChunks = [];

// Render initial chat history on page load
const initialChatHistoryEl = document.getElementById('initialChatHistory');
if (initialChatHistoryEl) {
  try {
    const initialChatHistory = JSON.parse(initialChatHistoryEl.textContent);
    if (initialChatHistory.length > 0) {
      initialChatHistory.forEach(msg => {
        renderMessage("user", msg.user);
        renderMessage("assistant", msg.assistant);
      });
      // Update stats based on history
      messageCount = initialChatHistory.length;
      msgCountLbl.textContent = String(messageCount);
      // Note: tokens_used not stored, so totalTokens remains 0
    }
  } catch (e) {
    console.error('Error parsing initial chat history:', e);
  }
}

/* ========= UTIL ========= */
function apiURL(path) {
  return API.BASE + path;
}
function headers(extra = {}) {
  return {
    "Accept": "application/json",
    ... (AUTH_HEADER || {}),
    ...extra
  };
}
function showLoader(text = "Processing...") {
  loaderText.textContent = text;
  globalLoader.classList.remove("hidden");
  globalLoader.classList.add("flex");
}
function hideLoader() {
  globalLoader.classList.add("hidden");
  globalLoader.classList.remove("flex");
}
function scrollToBottom() {
  chatWindow.scrollTop = chatWindow.scrollHeight;
}
function addTypingIndicator() {
  const wrap = document.createElement("div");
  wrap.className = "typing-indicator";
  wrap.setAttribute("data-typing", "true");
  wrap.innerHTML = `
    <div class="typing-dot"></div>
    <div class="typing-dot"></div>
    <div class="typing-dot"></div>
  `;
  chatWindow.appendChild(wrap);
  scrollToBottom();
  return wrap;
}
function removeTypingIndicators() {
  [...chatWindow.querySelectorAll('[data-typing="true"]')].forEach(n => n.remove());
}

/* ========= CHAT RENDER ========= */
function renderMessage(role, text) {
  const isUser = role === "user";
  const bubble = document.createElement("div");
  bubble.className = `message-bubble chat-fade ${isUser ? "mb-3" : "mb-6"}`;

  bubble.innerHTML = `
    <div class="${isUser ? "flex justify-end" : "flex justify-start"}">
      <div class="max-w-3xl w-auto glass-card rounded-2xl p-4 ${isUser ? "bg-white" : "markdown-body"}">
        <div class="text-sm font-semibold ${isUser ? "text-gray-700" : "text-purple-700"} mb-1">
          ${isUser ? "You" : "Assistant"}
        </div>
        ${isUser
      ? `<div class="text-gray-800 whitespace-pre-wrap">${escapeHtml(text)}</div>`
      : `<div class="text-gray-800">${text}</div>`
    }
      </div>
    </div>
  `;
  chatWindow.appendChild(bubble);
  scrollToBottom();
}
function escapeHtml(s) {
  return s.replace(/[&<>"']/g, m => ({ "&": "&amp;", "<": "&lt;", ">": "&gt;", '"': "&quot;", "'": "&#39;" }[m]));
}

/* ========= STATS ========= */
function bumpStats(tokens = 0) {
  messageCount += 1;
  totalTokens += tokens;
  msgCountLbl.textContent = String(messageCount);
  tokensUsedLbl.textContent = String(totalTokens);
}

/* ========= SIDEBAR ========= */
function openSidebar() {
  sidebar.classList.remove("-translate-x-full");
  sidebarOverlay.classList.remove("hidden");
}
function closeSidebar() {
  sidebar.classList.add("-translate-x-full");
  sidebarOverlay.classList.add("hidden");
}
if (sidebarToggle) sidebarToggle.addEventListener("click", openSidebar);
if (sidebarOverlay) sidebarOverlay.addEventListener("click", closeSidebar);

/* ========= TOKEN SLIDER ========= */
if (tokenSlider && tokenValueLbl) {
  tokenValueLbl.textContent = tokenSlider.value;
  tokenSlider.addEventListener("input", () => {
    tokenValueLbl.textContent = tokenSlider.value;
  });
}

/* ========= FILE UPLOAD BUTTON ========== */
const fileUploadBtn = document.getElementById("fileUploadBtn");
if (fileUploadBtn && fileInput) {
  fileUploadBtn.addEventListener("click", () => fileInput.click());
}

/* ========= CHAT SUBMIT ========= */
if (chatForm) {
  chatForm.addEventListener("submit", async (e) => {
    e.preventDefault();
    const text = (messageInput?.value || "").trim();
    const file = fileInput?.files?.[0] || null;
    if (!text && !file) return;

    renderMessage("user", text || (file ? `Uploaded file: ${file.name}` : ""));
    if (messageInput) messageInput.value = "";
    if (fileInput) fileInput.value = "";

    const typing = addTypingIndicator();
    showLoader("Thinking...");

    try {
      let res, data;
      if (file) {
        // multipart for file + text
        const form = new FormData();
        if (text) form.append("query", text);
        form.append("max_tokens", tokenSlider?.value || "1000");
        form.append("file", file);
        res = await fetch(apiURL(API.CHAT), {
          method: "POST",
          headers: { ...(AUTH_HEADER || {}) }, // don't set content-type for FormData
          body: form
        });
      } else {
        // JSON for text only
        res = await fetch(apiURL(API.CHAT), {
          method: "POST",
          headers: headers({ "Content-Type": "application/json" }),
          body: JSON.stringify({
            query: text,
            max_tokens: Number(tokenSlider?.value || 1000)
          })
        });
      }
      const contentType = res.headers.get('content-type');
      if (!contentType || !contentType.includes('application/json')) {
        const text = await res.text();
        throw new Error(`Unexpected response type: ${contentType}. Response: ${text.substring(0, 200)}...`);
      }
      data = await res.json();

      removeTypingIndicators();
      renderMessage("assistant", data?.reply ?? "(No response)");
      bumpStats(Number(data?.tokens_used || 0));
    } catch (err) {
      removeTypingIndicators();
      renderMessage("assistant", `Error: ${err?.message || err}`);
    } finally {
      hideLoader();
    }
  });
}

/* ========= VOICE (MIC) ========= */
if (voiceBtn) {
  voiceBtn.addEventListener("click", async () => {
    // Use Web Speech API if available, otherwise MediaRecorder
    const SpeechRecognition = window.SpeechRecognition || window.webkitSpeechRecognition;
    if (SpeechRecognition) {
      const rec = new SpeechRecognition();
      rec.lang = "en-US";
      rec.interimResults = false;
      rec.maxAlternatives = 1;
      rec.onstart = () => voiceBtn.classList.add("pulse-record");
      rec.onend = () => voiceBtn.classList.remove("pulse-record");
      rec.onerror = () => voiceBtn.classList.remove("pulse-record");
      rec.onresult = (evt) => {
        const transcript = evt.results?.[0]?.[0]?.transcript || "";
        if (messageInput) messageInput.value = transcript;
        chatForm?.dispatchEvent(new Event("submit", { cancelable: true }));
      };
      rec.start();
      return;
    }

    // Fallback: record audio blob and POST to /chat as file (if backend supports STT)
    if (!isRecording) {
      try {
        const stream = await navigator.mediaDevices.getUserMedia({ audio: true });
        mediaRecorder = new MediaRecorder(stream);
        recordedChunks = [];
        mediaRecorder.ondataavailable = e => e.data.size && recordedChunks.push(e.data);
        mediaRecorder.onstop = async () => {
          const blob = new Blob(recordedChunks, { type: "audio/webm" });
          const form = new FormData();
          form.append("audio", blob, "voice.webm");
          form.append("max_tokens", tokenSlider?.value || "1000");
          showLoader("Transcribing...");
          try {
            const res = await fetch(apiURL(API.CHAT), { method: "POST", body: form, headers: { ...(AUTH_HEADER || {}) } });
            const data = await res.json();
            renderMessage("assistant", data?.reply ?? "(No response)");
            bumpStats(Number(data?.tokens_used || 0));
          } catch (err) {
            renderMessage("assistant", `Voice error: ${err?.message || err}`);
          } finally {
            hideLoader();
          }
        };
        mediaRecorder.start();
        isRecording = true;
        voiceBtn.classList.add("pulse-record");
      } catch (e) {
        alert("Mic access denied.");
      }
    } else {
      mediaRecorder?.stop();
      isRecording = false;
      voiceBtn.classList.remove("pulse-record");
    }
  });
}

/* ========= ADMIN: PANEL TOGGLE ========= */
const adminMainMenu = document.getElementById("adminMainMenu");
const adminTrainingSection = document.getElementById("adminTrainingSection");
const adminUserSection = document.getElementById("adminUserSection");

function showAdminMenu() {
  adminMainMenu.classList.remove("hidden");
  adminTrainingSection.classList.add("hidden");
  adminUserSection.classList.add("hidden");
}

function showTrainingSection() {
  adminMainMenu.classList.add("hidden");
  adminTrainingSection.classList.remove("hidden");
  adminUserSection.classList.add("hidden");
}

function showUserSection() {
  adminMainMenu.classList.add("hidden");
  adminTrainingSection.classList.add("hidden");
  adminUserSection.classList.remove("hidden");
}

// Global exposes for HTML onclicks
window.showAdminMenu = showAdminMenu;
window.showTrainingSection = showTrainingSection;
window.showUserSection = showUserSection;

function toggleAdminPanel() {
  console.log("toggleAdminPanel called"); // DEBUG
  const isHidden = adminModal.classList.contains("hidden");
  if (isHidden) {
    showAdminMenu(); // Reset to menu when opening
    adminModal.classList.remove("hidden");
    adminModal.classList.add("flex");
  } else {
    adminModal.classList.add("hidden");
    adminModal.classList.remove("flex");
  }
}
window.toggleAdminPanel = toggleAdminPanel;

/* ========= ADMIN: ADD USER ========= */
function showAddUserModal() {
  addUserModal.classList.remove("hidden");
  addUserModal.classList.add("flex");
}
function hideAddUserModal() {
  addUserModal.classList.add("hidden");
  addUserModal.classList.remove("flex");
}
window.showAddUserModal = showAddUserModal;
window.hideAddUserModal = hideAddUserModal;

async function addNewUser() {
  const id = document.getElementById("newUserId")?.value?.trim();
  const name = document.getElementById("newUserName")?.value?.trim();
  const email = document.getElementById("newUserEmail")?.value?.trim();
  const role = document.getElementById("newUserRole")?.value;

  if (!id || !name) return alert("User ID and Name are required.");

  showLoader("Adding user...");
  try {
    const res = await fetch(apiURL(API.USERS), {
      method: "POST",
      headers: headers({ "Content-Type": "application/json" }),
      body: JSON.stringify({ action: "add_user", new_user_id: id, new_user_name: name })
    });
    const data = await res.json();
    if (data?.error) throw new Error(data?.error || "Add failed");
    hideAddUserModal();
    alert("User added.");
  } catch (e) {
    alert("Error: " + e.message);
  } finally {
    hideLoader();
  }
}
window.addNewUser = addNewUser;

/* ========= ADMIN: REMOVE USER ========= */
function showRemoveUserModal() {
  removeUserModal.classList.remove("hidden");
  removeUserModal.classList.add("flex");
  loadUsersForRemoval();
}
function hideRemoveUserModal() {
  removeUserModal.classList.add("hidden");
  removeUserModal.classList.remove("flex");
}
window.showRemoveUserModal = showRemoveUserModal;
window.hideRemoveUserModal = hideRemoveUserModal;

async function loadUsersForRemoval() {
  const tbody = document.getElementById("removeUserTableBody");
  if (!tbody) return;
  tbody.innerHTML = `<tr><td class="px-6 py-4" colspan="4">Loading...</td></tr>`;
  try {
    const res = await fetch(apiURL(API.USERS), {
      method: "POST",
      headers: headers({ "Content-Type": "application/json" }),
      body: JSON.stringify({ action: "get_users" })
    });
    const data = await res.json();
    const users = data?.users || [];
    tbody.innerHTML = users.map(u => `
      <tr class="border-b border-gray-100">
        <td class="px-6 py-4">${escapeHtml(String(u.ID || ""))}</td>
        <td class="px-6 py-4">${escapeHtml(String(u.Name || ""))}</td>
        <td class="px-6 py-4">-</td>
        <td class="px-6 py-4 text-center">
          <button class="px-4 py-2 rounded-xl bg-red-500 text-white hover-lift" onclick="removeUser('${String(u.ID || "")}')">
            Remove
          </button>
        </td>
      </tr>
    `).join("");
  } catch (e) {
    tbody.innerHTML = `<tr><td class="px-6 py-4" colspan="4">Error loading users</td></tr>`;
  }
}

async function removeUser(id) {
  if (!confirm(`Remove user ${id}?`)) return;
  showLoader("Removing user...");
  try {
    const res = await fetch(apiURL(API.USERS), {
      method: "POST",
      headers: headers({ "Content-Type": "application/json" }),
      body: JSON.stringify({ action: "remove_user", user_id_to_remove: id })
    });
    const data = await res.json();
    if (data?.error) throw new Error(data?.error || "Remove failed");
    await loadUsersForRemoval();
  } catch (e) {
    alert("Error: " + e.message);
  } finally {
    hideLoader();
  }
}
window.removeUser = removeUser;

/* ========= ADMIN: TRAINING ========= */
async function trainModel() {
  showLoader("Training model...");
  try {
    const res = await fetch(apiURL(API.TRAIN), {
      method: "POST",
      headers: headers({ "Content-Type": "application/json" }),
      body: JSON.stringify({ action: "train" })
    });
    const data = await res.json();
    if (data?.error) throw new Error(data?.error || "Training failed");
    alert("Training started.");
  } catch (e) {
    alert("Error: " + e.message);
  } finally {
    hideLoader();
  }
}
window.trainModel = trainModel;

async function uploadAndTrain() {
  if (!pdfInput || !pdfInput.files?.length) return alert("Select one or more PDFs first.");
  const form = new FormData();
  [...pdfInput.files].forEach(f => form.append("files", f));
  showLoader("Uploading PDFs...");
  try {
    const up = await fetch(apiURL(API.UPLOAD), { method: "POST", body: form, headers: { ...(AUTH_HEADER || {}) } });
    const upData = await up.json();
    if (upData?.error) throw new Error(upData?.error || "Upload failed");

    loaderText.textContent = "Indexing & training...";
    const tr = await fetch(apiURL(API.TRAIN), { method: "POST", headers: headers({ "Content-Type": "application/json" }), body: JSON.stringify({ action: "train" }) });
    const trData = await tr.json();
    if (trData?.error) throw new Error(trData?.error || "Training failed");
    alert("Upload complete. Training started.");
  } catch (e) {
    alert("Error: " + e.message);
  } finally {
    hideLoader();
  }
}
window.uploadAndTrain = uploadAndTrain;

/* ========= CLEAR HISTORY ========= */
async function clearHistory() {
  showLoader("Clearing history...");
  try {
    const form = new FormData();
    form.append("action", "clear_history");
    const res = await fetch(window.location.href, {
      method: "POST",
      body: form,
      headers: { ...(AUTH_HEADER || {}) }
    });
    if (res.ok) {
      chatWindow.innerHTML = `
        <div class="text-center text-gray-500 py-16 float-animation">
          <div class="w-24 h-24 mx-auto mb-6 rounded-full bg-gradient-to-br from-blue-400 flex items-center justify-center shadow-2xl">
            <i class="fas fa-comments text-3xl text-white"></i>
          </div>
          <p class="text-xl font-medium mb-2">Welcome to FACE!</p>
          <p class="text-gray-400">How can I assist you today?</p>
        </div>`;
      messageCount = 0;
      totalTokens = 0;
      msgCountLbl.textContent = "0";
      tokensUsedLbl.textContent = "0";
    } else {
      alert("Failed to clear history on server.");
    }
  } catch (e) {
    alert("Error clearing history: " + e.message);
  } finally {
    hideLoader();
  }
}
window.clearHistory = clearHistory;

/* ========= SEARCH IN REMOVE MODAL ========= */
const userSearch = document.getElementById("userSearch");
if (userSearch) {
  userSearch.addEventListener("input", () => {
    const q = userSearch.value.toLowerCase();
    const rows = document.querySelectorAll("#removeUserTableBody tr");
    rows.forEach(r => r.style.display = r.textContent.toLowerCase().includes(q) ? "" : "none");
  });
}
