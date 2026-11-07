
document.addEventListener("DOMContentLoaded", () => {
  const queueBox = document.getElementById("critical-queue");
  const highCount = document.getElementById("high-count");
  const mediumCount = document.getElementById("medium-count");
  const lowCount = document.getElementById("low-count");

  const escapeHTML = (value) =>
    String(value ?? "").replace(/[&<>"']/g, (char) => ({
      "&": "&amp;",
      "<": "&lt;",
      ">": "&gt;",
      '"': "&quot;",
      "'": "&#39;"
    })[char]);

  let socket = null;

  async function checkStaff() {
    const response = await fetch("/api/staff/me");

    if (!response.ok) {
      window.location.href = "/staff.html";
      return false;
    }

    const data = await response.json();

    if (!data.staff) {
      window.location.href = "/staff.html";
      return false;
    }

    return true;
  }

  function renderQueue(rows) {
    const counts = {
      high: 0,
      medium: 0,
      low: 0
    };

    rows.forEach(patient => {
      if (counts[patient.urgency] !== undefined) {
        counts[patient.urgency]++;
      }
    });

    highCount.textContent = counts.high;
    mediumCount.textContent = counts.medium;
    lowCount.textContent = counts.low;

    if (!rows.length) {
      queueBox.innerHTML = "<p class='muted'>No patients in the queue.</p>";
      return;
    }

    queueBox.innerHTML = rows.map(patient => {
      const urgency = patient.urgency || "unassessed";
      const urgencyLabel = urgency === "unassessed"
        ? "Not assessed"
        : urgency.toUpperCase();

      return `
        <article class="queue-item">
          <div>
            <strong>${escapeHTML(patient.patient_name)}</strong>
            <div class="meta">
              ${escapeHTML(patient.token)} ·
              ${escapeHTML(patient.department)} ·
              ${escapeHTML(patient.status)}
            </div>
            <p class="meta">
              Assessment: ${escapeHTML(urgencyLabel)}
            </p>
            ${patient.urgency_notes
              ? `<p class="meta">${escapeHTML(patient.urgency_notes)}</p>`
              : ""}
          </div>

          <div class="urgency-controls">
            <label for="urgency-${patient.id}">Clinical priority</label>
            <select id="urgency-${patient.id}">
              <option value="unassessed" ${urgency === "unassessed" ? "selected" : ""}>Not assessed</option>
              <option value="high" ${urgency === "high" ? "selected" : ""}>High</option>
              <option value="medium" ${urgency === "medium" ? "selected" : ""}>Medium</option>
              <option value="low" ${urgency === "low" ? "selected" : ""}>Low</option>
            </select>

            <label for="notes-${patient.id}">Assessment notes</label>
            <textarea id="notes-${patient.id}" maxlength="500"
              placeholder="Enter clinician assessment notes">${escapeHTML(patient.urgency_notes || "")}</textarea>

            <button type="button" data-patient-id="${patient.id}">
              Save assessment
            </button>
          </div>
        </article>
      `;
    }).join("");

    queueBox.querySelectorAll("button[data-patient-id]").forEach(button => {
      button.addEventListener("click", () => saveAssessment(button));
    });
  }

  async function refreshQueue() {
    try {
      const response = await fetch("/api/staff/critical-queue");

      if (response.status === 401) {
        window.location.href = "/staff.html";
        return;
      }

      if (!response.ok) {
        throw new Error("Unable to load the critical care queue.");
      }

      const rows = await response.json();
      renderQueue(rows);
    } catch (error) {
      queueBox.textContent = error.message;
    }
  }

  async function saveAssessment(button) {
    const id = button.dataset.patientId;
    const urgency = document.getElementById(`urgency-${id}`).value;
    const notes = document.getElementById(`notes-${id}`).value;

    if (urgency === "unassessed") {
      alert("Choose High, Medium or Low after a clinical assessment.");
      return;
    }

    button.disabled = true;
    button.textContent = "Saving...";

    try {
      const response = await fetch(`/api/staff/queue/${id}/urgency`, {
        method: "PATCH",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({
          urgency,
          urgency_notes: notes
        })
      });

      const data = await response.json();

      if (response.status === 401) {
        window.location.href = "/staff.html";
        return;
      }

      if (!response.ok) {
        throw new Error(data.error || "Could not save assessment.");
      }

      await refreshQueue();
      alert("Clinical assessment saved.");
    } catch (error) {
      alert(error.message);
      button.disabled = false;
      button.textContent = "Save assessment";
    }
  }

  async function start() {
    const authenticated = await checkStaff();
    if (!authenticated) return;

    await refreshQueue();

    if (typeof io === "function") {
      socket = io();

      socket.on("queue:update", refreshQueue);
    }
  }

  start();
});
