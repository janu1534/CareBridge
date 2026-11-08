
/*
 * CareBridge Patient Portal
 * Frontend-only demonstration.
 */

document.addEventListener("DOMContentLoaded", async () => {
  const loginForm = document.getElementById("patient-login-form");
  const registerForm = document.getElementById("patient-register-form");
  const loginSection = document.getElementById("login-section");
  const dashboard = document.getElementById("dashboard");
  const patientName = document.getElementById("patient-name");
  const logoutButton = document.getElementById("logout-button");
  const authMessage = document.getElementById("auth-message");

  function showMessage(message, isError = true) {
    authMessage.textContent = message;
    authMessage.style.color = isError ? "#b42318" : "#26734d";
  }

  function enterPortal(patient) {
    patientName.textContent = patient.name;
    loginSection.hidden = true;
    dashboard.hidden = false;
    window.dispatchEvent(new Event("patientIdentityChanged"));
  }

  async function sendAuth(url, data) {
    const response = await fetch(url, {
      method: "POST",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify(data)
    });

    const result = await response.json();

    if (!response.ok) {
      throw new Error(result.error || "Authentication failed.");
    }

    return result.patient;
  }

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

  logoutButton.addEventListener("click", async () => {
    try {
      const response = await fetch("/api/patient/logout", {
        method: "POST"
      });

      if (!response.ok) throw new Error("Logout failed.");

      dashboard.hidden = true;
      loginSection.hidden = false;
      patientName.textContent = "Patient";
      showMessage("You have logged out successfully.", false);
      window.dispatchEvent(new Event("patientIdentityChanged"));
    } catch (error) {
      showMessage(error.message);
    }
  });

  try {
    const response = await fetch("/api/patient/me");
    const data = await response.json();

    if (data.patient) {
      enterPortal(data.patient);
    }
  } catch (error) {
    console.error("Could not check patient session:", error);
  }

  console.log("CareBridge patient portal loaded.");
});
