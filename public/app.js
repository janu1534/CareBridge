
document.addEventListener("DOMContentLoaded", () => {
  const publicBox = document.getElementById("public-queue");
  const staffBox = document.getElementById("staff-queue");
  const loginForm = document.getElementById("login-form");
  const loginSection = document.getElementById("login-section");
  const patientForm = document.getElementById("patient-form");
  const staffArea = document.getElementById("staff-area");

  let loggedIn = false;
  let staffRows = [];

  const escapeHTML = value =>
    String(value ?? "").replace(/[&<>"']/g, char => ({
      "&": "&amp;",
      "<": "&lt;",
      ">": "&gt;",
      '"': "&quot;",
      "'": "&#39;"
    })[char]);

  async function api(url, options = {}) {
    const response = await fetch(url, {
      ...options,
      headers: {
        "Content-Type": "application/json",
        ...(options.headers || {})
      }
    });

    const data = await response.json().catch(() => ({}));

    if (!response.ok) {
      throw new Error(data.error || "Request failed");
    }

    return data;
  }

  // PUBLIC PATIENT QUEUE
  function renderPublicQueue(rows) {
    if (!publicBox) return;

    publicBox.innerHTML = rows.length
      ? rows.map(patient => `
          <div class="queue-item">
            <div>
              <b>${escapeHTML(patient.token)}</b>
              <div class="meta">
                ${escapeHTML(patient.department)}
                ${patient.position
                  ? ` · Position ${escapeHTML(patient.position)}`
                  : ""}
              </div>
            </div>
            <span class="status ${escapeHTML(patient.status)}">
              ${patient.status === "serving"
                ? "Now serving"
                : escapeHTML(patient.status)}
            </span>
          </div>
        `).join("")
      : "<p class='muted'>No entries yet.</p>";
  }

  // STAFF DASHBOARD VISIBILITY
  function showStaff(staff) {
    loggedIn = true;

    if (loginSection) loginSection.hidden = true;
    if (staffArea) staffArea.hidden = false;

    const welcome = document.getElementById("staff-welcome");

    if (welcome) {
      welcome.textContent =
        `Signed in: ${staff.email} (${staff.role})`;
    }

    refreshStaff();
  }

  // UPDATE STATISTICS
  function updateStats(rows) {
    const counts = {
      total: rows.length,
      waiting: 0,
      serving: 0,
      completed: 0
    };

    rows.forEach(patient => {
      if (counts[patient.status] !== undefined) {
        counts[patient.status]++;
      }
    });

    const elements = {
      "total-count": counts.total,
      "waiting-count": counts.waiting,
      "serving-count": counts.serving,
      "completed-count": counts.completed
    };

    Object.entries(elements).forEach(([id, value]) => {
      const element = document.getElementById(id);
      if (element) element.textContent = value;
    });
  }

  // DEPARTMENT FILTER
  function updateDepartmentOptions(rows) {
    const filter = document.getElementById("department-filter");
    if (!filter) return;

    const selected = filter.value;

    const departments = [
      ...new Set(rows.map(patient => patient.department).filter(Boolean))
    ].sort();

    filter.innerHTML =
      '<option value="">All departments</option>' +
      departments.map(department =>
        `<option value="${escapeHTML(department)}">
          ${escapeHTML(department)}
        </option>`
      ).join("");

    if (departments.includes(selected)) {
      filter.value = selected;
    }
  }
function getDepartmentColor(department) {
  let hash = 0;

  for (const char of String(department || "")) {
    hash = (hash * 31 + char.charCodeAt(0)) | 0;
  }

  return `dept-tone-${Math.abs(hash) % 6}`;
}
  // RENDER INDIVIDUAL PATIENT CARDS
  function renderStaffQueue() {
    if (!staffBox) return;

    const search =
      document.getElementById("queue-search")?.value
        .trim().toLowerCase() || "";

    const department =
      document.getElementById("department-filter")?.value || "";

    const status =
      document.getElementById("status-filter")?.value || "";

    const filtered = staffRows.filter(patient => {
      const matchesSearch =
        String(patient.patient_name || "").toLowerCase().includes(search) ||
        String(patient.token || "").toLowerCase().includes(search);

      const matchesDepartment =
        !department || patient.department === department;

      const matchesStatus =
        !status || patient.status === status;

      return matchesSearch && matchesDepartment && matchesStatus;
    });

    staffBox.innerHTML = filtered.length
      ? filtered.map(patient => `
<article class="queue-item staff-row ${getDepartmentColor(patient.department)}">
            <div class="patient-card-info">
              <div class="patient-token">
                ${escapeHTML(patient.token)}
              </div>

              <h3>${escapeHTML(patient.patient_name)}</h3>

              <p class="meta">
                ${escapeHTML(patient.department)}
              </p>

              <span class="status ${escapeHTML(patient.status)}">
                ${escapeHTML(patient.status)}
              </span>
            </div>

            <div class="actions">
              <button class="secondary"
                data-id="${escapeHTML(patient.id)}"
                data-status="waiting"
                ${patient.status === "waiting" ? "disabled" : ""}>
                Waiting
              </button>

              <button
                data-id="${escapeHTML(patient.id)}"
                data-status="serving"
                ${patient.status === "serving" ? "disabled" : ""}>
                Serve
              </button>

              <button class="secondary"
                data-id="${escapeHTML(patient.id)}"
                data-status="completed"
                ${patient.status === "completed" ? "disabled" : ""}>
                Complete
              </button>
            </div>
          </article>
        `).join("")
      : "<p class='muted'>No patients match your search.</p>";
  }

  // LOAD STAFF QUEUE
  async function refreshStaff() {
    if (!loggedIn || !staffBox) return;

    try {
      const rows = await api("/api/staff/queue");

      staffRows = Array.isArray(rows) ? rows : [];

      updateStats(staffRows);
      updateDepartmentOptions(staffRows);
      renderStaffQueue();

    } catch (error) {
      staffBox.textContent = error.message;
    }
  }

  // SEARCH AND FILTER EVENTS
  document.getElementById("queue-search")
    ?.addEventListener("input", renderStaffQueue);

  document.getElementById("department-filter")
    ?.addEventListener("change", renderStaffQueue);

  document.getElementById("status-filter")
    ?.addEventListener("change", renderStaffQueue);

  // LIVE QUEUE CONNECTION
  if (typeof io !== "undefined") {
    const socket = io();

    socket.on("connect", () => {
      const state = document.getElementById("connection-state");
      if (state) state.textContent = "Connected";
    });

    socket.on("disconnect", () => {
      const state = document.getElementById("connection-state");
      if (state) state.textContent = "Reconnecting...";
    });

    socket.on("queue:update", rows => {
      renderPublicQueue(rows);
      refreshStaff();
    });
  }

  // PATIENT REGISTRATION
  if (patientForm) {
    patientForm.addEventListener("submit", async event => {
      event.preventDefault();

      const message = document.getElementById("join-message");

      try {
        const data = await api("/api/patients", {
          method: "POST",
          body: JSON.stringify({
            name: document.getElementById("patient-name").value,
            department: document.getElementById("department").value
          })
        });

        if (message) {
          message.textContent =
            `Registered successfully. Demo token: ${data.token}`;
        }

        patientForm.reset();

      } catch (error) {
        if (message) message.textContent = error.message;
      }
    });
  }

  // STAFF LOGIN
  if (loginForm) {
    loginForm.addEventListener("submit", async event => {
      event.preventDefault();

      const message = document.getElementById("login-message");
      const submitButton = loginForm.querySelector("button[type='submit']");

      if (submitButton) submitButton.disabled = true;

      try {
        const user = await api("/api/staff/login", {
          method: "POST",
          body: JSON.stringify({
            email: document.getElementById("staff-email").value,
            password: document.getElementById("staff-password").value
          })
        });

        if (message) message.textContent = "";

        showStaff(user);

      } catch (error) {
        if (message) message.textContent = error.message;

      } finally {
        if (submitButton) submitButton.disabled = false;
      }
    });
  }

  // STAFF QUEUE STATUS ACTIONS
  if (staffBox) {
    staffBox.addEventListener("click", async event => {
      const button = event.target.closest("button[data-id]");
      if (!button || button.disabled) return;

      button.disabled = true;

      try {
        await api(
          `/api/staff/queue/${encodeURIComponent(button.dataset.id)}`,
          {
            method: "PATCH",
            body: JSON.stringify({
              status: button.dataset.status
            })
          }
        );

        await refreshStaff();

      } catch (error) {
        alert(error.message);
        button.disabled = false;
      }
    });
  }

  // STAFF LOGOUT
  const logoutButton = document.getElementById("logout-button");

  if (logoutButton) {
    logoutButton.addEventListener("click", async () => {
      try {
        await api("/api/staff/logout", {
          method: "POST",
          body: "{}"
        });

        loggedIn = false;
        staffRows = [];

        if (staffArea) staffArea.hidden = true;
        if (loginSection) loginSection.hidden = false;
        if (staffBox) staffBox.innerHTML = "";

        updateStats([]);

        const message = document.getElementById("login-message");
        if (message) message.textContent = "Signed out successfully.";

      } catch (error) {
        alert(error.message);
      }
    });
  }

  // RESTORE EXISTING STAFF SESSION
  if (staffBox) {
    api("/api/staff/me")
      .then(data => {
        if (data.staff) {
          showStaff(data.staff);
        }
      })
      .catch(() => {});
  }

  // AI CHAT
  const chatForm = document.getElementById("chat-form");
  const chatInput = document.getElementById("chat-input");
  const chatMessages = document.getElementById("chat-messages");

  if (chatForm && chatInput && chatMessages) {
    chatForm.addEventListener("submit", async event => {
      event.preventDefault();

      const message = chatInput.value.trim();
      if (!message) return;

      const userMessage = document.createElement("p");
      userMessage.textContent = "You: " + message;
      chatMessages.appendChild(userMessage);

      chatInput.value = "";

      const reply = document.createElement("p");
      reply.textContent = "CareBridge is thinking...";
      chatMessages.appendChild(reply);

      try {
        const data = await api("/api/assistant", {
          method: "POST",
          body: JSON.stringify({ message })
        });

        reply.textContent = "CareBridge: " + data.reply;

      } catch (error) {
        reply.textContent = "CareBridge: " + error.message;
      }
    });
  }
});
