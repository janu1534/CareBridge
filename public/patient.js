
/*
 * CareBridge Patient Portal
 * Patient authentication, queue management and dashboard.
 */

document.addEventListener("DOMContentLoaded", async () => {
  const loginForm = document.getElementById("patient-login-form");
  const registerForm = document.getElementById("patient-register-form");
  const loginSection = document.getElementById("login-section");
  const dashboard = document.getElementById("dashboard");
  const patientName = document.getElementById("patient-name");
  const logoutButton = document.getElementById("logout-button");
  const authMessage = document.getElementById("auth-message");

  const queueForm = document.getElementById("patient-queue-form");
  const queueMessage = document.getElementById("queue-message");
  const queueStatus = document.getElementById("queue-status");
  const queueToken = document.getElementById("queue-token");
  const queueDepartmentName = document.getElementById("queue-department-name");
  const queueCurrentStatus = document.getElementById("queue-current-status");
  const queuePosition = document.getElementById("queue-position");

  let activeQueueToken = null;

  function showMessage(message, isError = true) {
    if (!authMessage) return;

    authMessage.textContent = message;
    authMessage.style.color = isError ? "#b42318" : "#26734d";
  }

  // Load the logged-in patient's queue
  async function loadPatientQueue() {
    try {
      const response = await fetch("/api/patient/queue");

      if (!response.ok) return;

      const data = await response.json();
      const queues = data.queues || [];

      const activeQueue = queues.find(
        item => item.status !== "completed"
      );

      if (!activeQueue) {
        if (queueStatus) queueStatus.hidden = true;
        activeQueueToken = null;
        return;
      }

      activeQueueToken = activeQueue.token;

      if (queueToken) queueToken.textContent = activeQueue.token;
      if (queueDepartmentName) {
        queueDepartmentName.textContent = activeQueue.department;
      }
      if (queueCurrentStatus) {
        queueCurrentStatus.textContent = activeQueue.status;
      }

      const publicResponse = await fetch("/api/queue");

      if (!publicResponse.ok) return;

      const publicRows = await publicResponse.json();

      const matching = publicRows.find(
        item => item.token === activeQueue.token
      );

      if (queuePosition) {
        queuePosition.textContent =
          matching?.position ?? "Not available";
      }

      if (queueStatus) queueStatus.hidden = false;

    } catch (error) {
      console.error("Could not load patient queue:", error);
    }
  }

  // Enter patient dashboard
  function enterPortal(patient) {
    patientName.textContent = patient.name;

    loginSection.hidden = true;
    dashboard.hidden = false;

    loadPatientQueue();

    window.dispatchEvent(new Event("patientIdentityChanged"));
  }

  // Register or login
  async function sendAuth(url, data) {
    const response = await fetch(url, {
      method: "POST",
      headers: {
        "Content-Type": "application/json"
      },
      body: JSON.stringify(data)
    });

    const result = await response.json();

    if (!response.ok) {
      throw new Error(result.error || "Authentication failed.");
    }

    return result.patient;
  }

  // Patient registration
  registerForm.addEventListener("submit", async event => {
    event.preventDefault();

    try {
      const patient = await sendAuth("/api/patient/register", {
        name: document.getElementById("register-name").value,
        email: document.getElementById("register-email").value,
        password: document.getElementById("register-password").value
      });

      showMessage("Account created successfully!", false);

      registerForm.reset();
      enterPortal(patient);

    } catch (error) {
      showMessage(error.message);
    }
  });

  // Patient login
  loginForm.addEventListener("submit", async event => {
    event.preventDefault();

    try {
      const patient = await sendAuth("/api/patient/login", {
        email: document.getElementById("login-email").value,
        password: document.getElementById("login-password").value
      });

      showMessage("Login successful!", false);

      loginForm.reset();
      enterPortal(patient);

    } catch (error) {
      showMessage(error.message);
    }
  });

  // Join hospital queue
  if (queueForm) {
    queueForm.addEventListener("submit", async event => {
      event.preventDefault();

      try {
        const response = await fetch("/api/patient/queue", {
          method: "POST",
          headers: {
            "Content-Type": "application/json"
          },
          body: JSON.stringify({
            department: document.getElementById("queue-department").value
          })
        });

        const data = await response.json();

        if (!response.ok) {
          throw new Error(data.error || "Could not join queue.");
        }

        queueMessage.textContent =
          `Success! Your queue token is ${data.token}. Department: ${data.department}.`;

        queueForm.reset();

        await loadPatientQueue();

      } catch (error) {
        queueMessage.textContent = error.message;
      }
    });
  }

  // Patient logout
  logoutButton.addEventListener("click", async () => {
    try {
      const response = await fetch("/api/patient/logout", {
        method: "POST"
      });

      if (!response.ok) {
        throw new Error("Logout failed.");
      }

      dashboard.hidden = true;
      loginSection.hidden = false;

      patientName.textContent = "Patient";

      if (queueStatus) queueStatus.hidden = true;
      if (queueMessage) queueMessage.textContent = "";

      activeQueueToken = null;

      showMessage("You have logged out successfully.", false);

      window.dispatchEvent(new Event("patientIdentityChanged"));

    } catch (error) {
      showMessage(error.message);
    }
  });

  // Restore existing patient session
  try {
    const response = await fetch("/api/patient/me");
    const data = await response.json();

    if (data.patient) {
      enterPortal(data.patient);
    }

  } catch (error) {
    console.error("Could not check patient session:", error);
  }console.log("CareBridge patient portal loaded.");
  // Live queue updates using Socket.IO
if (typeof io !== "undefined") {
  const socket = io();

  socket.on("queue:update", rows => {
    if (!activeQueueToken) return;

    const matching = rows.find(
      item => item.token === activeQueueToken
    );

    if (!matching) return;

    queueCurrentStatus.textContent = matching.status;
    queuePosition.textContent = matching.position ?? "Not available";

    if (matching.status === "completed") {
      queueCurrentStatus.textContent = "Completed";
      queuePosition.textContent = "Finished";
    }
  });
}


  console.log("CareBridge patient portal loaded.");
});
