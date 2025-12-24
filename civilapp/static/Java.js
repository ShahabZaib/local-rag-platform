/* ========= CONFIG ========= */
console.log("Java.js loaded!"); // DEBUG
const API = {
  BASE: "",                  // e.g., "http://localhost:8000" or leave "" for same-origin
  CHAT: "/api/chat/",        // POST: text/file query -> { reply, tokens_used }
  UPLOAD: "/api/upload/",    // POST: files -> { ok: true }
  TRAIN: "/api/train/",      // POST: { action: "train" } -> { ok: true }
  USERS: "/api/users/",       // POST: add/remove; GET: list -> { users: [...] }
  STATS: "/api/status/"      // GET: live metrics
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
const welcomeScreen = document.getElementById("welcomeScreen");
const scrollToBottomBtn = document.getElementById("scrollToBottomBtn");

// Admin Pro+ Hooks
const confirmModal = document.getElementById("confirmModal");
const confirmTitle = document.getElementById("confirmTitle");
const confirmText = document.getElementById("confirmText");
const confirmBtn = document.getElementById("confirmBtn");

const syncProgressContainer = document.getElementById("syncProgressContainer");
const syncProgressLabel = document.getElementById("syncProgressLabel");
const syncProgressPercent = document.getElementById("syncProgressPercent");
const syncProgressBarFill = document.getElementById("syncProgressBarFill");

const statDocCount = document.getElementById("stat-doc-count");
const statUserCount = document.getElementById("stat-user-count");
const statUptime = document.getElementById("stat-uptime");
const statLatency = document.getElementById("stat-latency");

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

/* ========= ADMIN PRO+ LOGIC ========= */
async function loadDashboardStats() {
  try {
    const res = await fetch(apiURL(API.STATS), { headers: headers() });
    const data = await res.json();
    if (data.error) return;

    if (statDocCount) statDocCount.innerHTML = `${data.doc_count} <span class="text-sm font-normal text-gray-400">Docs</span>`;
    if (statUserCount) statUserCount.innerHTML = `${data.user_count} <span class="text-sm font-normal text-gray-400">Users</span>`;
    if (statUptime) statUptime.textContent = data.uptime;
    if (statLatency) statLatency.textContent = data.latency;
  } catch (e) {
    console.error("Failed to load dashboard stats", e);
  }
}

function showConfirmModal(title, text, onConfirm) {
  if (!confirmModal) return;
  confirmTitle.textContent = title;
  confirmText.textContent = text;
  confirmModal.classList.remove("hidden");
  confirmModal.classList.add("flex");

  // Clean old listeners
  const newBtn = confirmBtn.cloneNode(true);
  confirmBtn.parentNode.replaceChild(newBtn, confirmBtn);

  newBtn.onclick = () => {
    onConfirm();
    closeConfirmModal();
  };
}
window.showConfirmModal = showConfirmModal;

function closeConfirmModal() {
  if (confirmModal) {
    confirmModal.classList.add("hidden");
    confirmModal.classList.remove("flex");
  }
}
window.closeConfirmModal = closeConfirmModal;

function setSyncProgress(percent, label) {
  if (!syncProgressContainer) return;
  syncProgressContainer.classList.remove("hidden");
  syncProgressLabel.textContent = label;
  syncProgressPercent.textContent = `${percent}%`;
  syncProgressBarFill.style.width = `${percent}%`;

  if (percent >= 100) {
    setTimeout(() => syncProgressContainer.classList.add("hidden"), 3000);
  }
}

/* ========= PREMIUM INTERACTION ========= */
function quickStart(text) {
  if (messageInput) {
    messageInput.value = text;
    chatForm.dispatchEvent(new Event('submit'));
  }
}
window.quickStart = quickStart;

function handleScroll() {
  if (!chatWindow || !scrollToBottomBtn) return;
  const isScrolledUp = chatWindow.scrollHeight - chatWindow.scrollTop - chatWindow.clientHeight > 200;
  if (isScrolledUp) {
    scrollToBottomBtn.classList.add("scroll-btn-visible");
  } else {
    scrollToBottomBtn.classList.remove("scroll-btn-visible");
  }
}
if (chatWindow) chatWindow.addEventListener("scroll", handleScroll);

function scrollToBottom() {
  chatWindow.scrollTo({
    top: chatWindow.scrollHeight,
    behavior: 'smooth'
  });
}
window.scrollToBottom = scrollToBottom;

// Initialize Stats Polling
setInterval(loadDashboardStats, 30000); // Every 30s
loadDashboardStats();

/* ========= CHAT RENDER ========= */
function renderMessage(role, text) {
  const isUser = role === "user";

  // Hide welcome screen on first message
  if (welcomeScreen && !welcomeScreen.classList.contains("hidden")) {
    welcomeScreen.classList.add("hidden");
  }

  const bubble = document.createElement("div");
  bubble.className = `message-bubble chat-fade message-slide-in ${isUser ? "mb-3" : "mb-6"}`;

  bubble.innerHTML = `
    <div class="${isUser ? "flex justify-end" : "flex justify-start"}">
      <div class="max-w-3xl w-auto glass-card rounded-2xl p-4 ${isUser ? "bg-white" : "markdown-body"} shadow-sm">
        <div class="text-sm font-semibold flex items-center ${isUser ? "text-gray-700 justify-end" : "text-purple-700"} mb-1">
          ${isUser ? 'You <i class="fas fa-user-circle ml-2"></i>' : '<i class="fas fa-robot mr-2"></i> Assistant'}
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
      rec.onstart = () => voiceBtn.classList.add("voice-recording-pulse");
      rec.onend = () => voiceBtn.classList.remove("voice-recording-pulse");
      rec.onerror = () => voiceBtn.classList.remove("voice-recording-pulse");
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

/* ========= ADMIN: DASHBOARD & TABS ========= */
function switchTab(tabId) {
  // Hide all contents
  document.querySelectorAll(".tab-content").forEach(c => c.classList.add("hidden"));
  // Remove active from all buttons
  document.querySelectorAll(".tab-btn").forEach(b => b.classList.remove("active"));

  // Show selected
  const targetContent = document.getElementById(`content-${tabId}`);
  const targetBtn = document.getElementById(`tab-${tabId}`);

  if (targetContent) targetContent.classList.remove("hidden");
  if (targetBtn) targetBtn.classList.add("active");

  setAdminStatus(`Viewing ${tabId.toUpperCase()}...`);

  // Auto-load data if needed
  if (tabId === 'users') loadDashboardUsers();
}
window.switchTab = switchTab;

function setAdminStatus(text, color = "gray-400") {
  const bar = document.getElementById("adminStatusText");
  if (bar) {
    bar.textContent = text;
    bar.className = `text-[10px] font-bold text-${color} uppercase tracking-widest`;
  }
}

function toggleAdminPanel() {
  console.log("toggleAdminPanel called");
  const isHidden = adminModal.classList.contains("hidden");
  if (isHidden) {
    switchTab('status'); // Default tab
    adminModal.classList.remove("hidden");
    adminModal.classList.add("flex");
  } else {
    adminModal.classList.add("hidden");
    adminModal.classList.remove("flex");
  }
}
window.toggleAdminPanel = toggleAdminPanel;

/* File Preview Logic */
if (pdfInput) {
  pdfInput.addEventListener("change", () => {
    const preview = document.getElementById("filePreview");
    if (!preview) return;
    const files = pdfInput.files;
    if (files.length > 0) {
      preview.classList.remove("hidden");
      preview.innerHTML = Array.from(files).map(f => `
        <span class="bg-purple-100 text-purple-700 text-[10px] px-2 py-1 rounded-md border border-purple-200">
          ${f.name.substring(0, 15)}${f.name.length > 15 ? "..." : ""}
        </span>
      `).join("");
      setAdminStatus(`${files.length} Files selected`, "blue-500");
    } else {
      preview.classList.add("hidden");
    }
  });
}

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

async function loadDashboardUsers() {
  const tbody = document.getElementById("dashboardUserTable");
  if (!tbody) return;
  tbody.innerHTML = `<tr><td class="px-6 py-4" colspan="3">Loading Secure User List...</td></tr>`;
  try {
    const res = await fetch(apiURL(API.USERS), {
      method: "POST",
      headers: headers({ "Content-Type": "application/json" }),
      body: JSON.stringify({ action: "get_users" })
    });
    const data = await res.json();
    const users = data?.users || [];
    tbody.innerHTML = users.map(u => `
      <tr class="border-b border-gray-50 hover:bg-gray-50/50 transition-colors">
        <td class="px-6 py-4">
          <div class="flex items-center space-x-3">
             <div class="w-8 h-8 rounded-full bg-gradient-to-br from-purple-400 to-blue-400 flex items-center justify-center text-white font-bold text-[10px]">
               ${(u.Name || "U").charAt(0)}
             </div>
             <div>
               <p class="font-bold text-gray-800">${escapeHtml(String(u.Name || "Unknown"))}</p>
               <p class="text-[10px] text-gray-400">ID: ${escapeHtml(String(u.ID || ""))}</p>
             </div>
          </div>
        </td>
        <td class="px-6 py-4">
          <span class="px-2 py-1 rounded-full text-[10px] font-bold bg-green-100 text-green-700">AUTHORIZED</span>
        </td>
        <td class="px-6 py-4 text-right">
          <button class="text-red-400 hover:text-red-600 p-2 transition-colors" onclick="removeUser('${String(u.ID || "")}')">
            <i class="fas fa-trash-can"></i>
          </button>
        </td>
      </tr>
    `).join("");
  } catch (e) {
    tbody.innerHTML = `<tr><td class="px-6 py-4" colspan="3 text-red-500">Failed to fetch users.</td></tr>`;
  }
}
window.loadDashboardUsers = loadDashboardUsers;

// Keep search logic for dashboard
const dashboardSearch = document.getElementById("userDashboardSearch");
if (dashboardSearch) {
  dashboardSearch.addEventListener("input", () => {
    const q = dashboardSearch.value.toLowerCase();
    const rows = document.querySelectorAll("#dashboardUserTable tr");
    rows.forEach(r => {
      if (r.children.length > 1) {
        r.style.display = r.textContent.toLowerCase().includes(q) ? "" : "none";
      }
    });
  });
}

async function removeUser(id) {
  showConfirmModal(
    "Remove Identity?",
    `Are you sure you want to revoke access for ID: ${id}? This user will no longer be able to log in.`,
    async () => {
      showLoader("Revoking access...");
      try {
        const res = await fetch(apiURL(API.USERS), {
          method: "POST",
          headers: headers({ "Content-Type": "application/json" }),
          body: JSON.stringify({ action: "remove_user", user_id_to_remove: id })
        });
        const data = await res.json();
        if (data?.error) throw new Error(data?.error || "Remove failed");
        await loadDashboardUsers();
        await loadDashboardStats(); // Update user count
        setAdminStatus("Identity successfully revoked", "green-500");
      } catch (e) {
        alert("Error: " + e.message);
      } finally {
        hideLoader();
      }
    }
  );
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

  showLoader("Processing knowledge...");
  setSyncProgress(10, "Uploading source files...");

  try {
    const up = await fetch(apiURL(API.UPLOAD), { method: "POST", body: form, headers: { ...(AUTH_HEADER || {}) } });
    const upData = await up.json();
    if (upData?.error) throw new Error(upData?.error || "Upload failed");

    setSyncProgress(40, "Extracting text and chunking...");

    setTimeout(async () => {
      setSyncProgress(70, "Generating embeddings and indexing...");
      const tr = await fetch(apiURL(API.TRAIN), { method: "POST", headers: headers({ "Content-Type": "application/json" }), body: JSON.stringify({ action: "train" }) });
      const trData = await tr.json();
      if (trData?.error) throw new Error(trData?.error || "Training failed");

      setSyncProgress(100, "Knowledge Base Updated!");
      setAdminStatus("Database Synced Successfully", "green-500");
      await loadDashboardStats(); // Update doc count
      document.getElementById("filePreview").classList.add("hidden");
      hideLoader();
    }, 1500);

  } catch (e) {
    setSyncProgress(0, "Error");
    setAdminStatus(`Error: ${e.message}`, "red-500");
    alert("Error: " + e.message);
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
        <div id="welcomeScreen" class="h-full flex flex-col items-center justify-center text-center py-12">
            <div class="w-24 h-24 mb-6 rounded-full bg-gradient-to-br from-blue-500 to-purple-600 flex items-center justify-center shadow-2xl float-animation">
                <i class="fas fa-robot text-4xl text-white"></i>
            </div>
            <h2 class="text-3xl font-bold text-gray-800 mb-2">PFRP Assistant</h2>
            <p class="text-gray-500 mb-12 uppercase text-[10px] font-bold tracking-widest">Privacy-First RAG Platform</p>
            
            <div class="grid grid-cols-1 sm:grid-cols-2 gap-4 max-w-2xl w-full px-4">
                <button onclick="quickStart('Summarize the latest document')" class="quick-starter-card">
                    <i class="fas fa-file-lines text-blue-500"></i>
                    <span>Summarize the latest document</span>
                </button>
                <button onclick="quickStart('Who has access to this system?')" class="quick-starter-card">
                    <i class="fas fa-users text-purple-500"></i>
                    <span>Who has access to this system?</span>
                </button>
                <button onclick="quickStart('Explain the training process')" class="quick-starter-card">
                    <i class="fas fa-brain text-pink-500"></i>
                    <span>Explain the training process</span>
                </button>
                <button onclick="quickStart('How secure is my data?')" class="quick-starter-card">
                    <i class="fas fa-shield-heart text-green-500"></i>
                    <span>How secure is my data?</span>
                </button>
            </div>
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
