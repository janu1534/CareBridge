
/*
 * CareBridge Patient Portal
 * Frontend-only demonstration.
 */

document.addEventListener("DOMContentLoaded", () => {
  const loginForm = document.getElementById("patient-login-form");
  const loginSection = document.getElementById("login-section");
  const dashboard = document.getElementById("dashboard");
  const patientSelect = document.getElementById("patient-select");
  const patientName = document.getElementById("patient-name");
  const logoutButton = document.getElementById("logout-button");

  const demoPatients = {
    "demo-patient-1": "Demo Patient 1",
    "demo-patient-2": "Demo Patient 2"
  };

  loginForm.addEventListener("submit", (event) => {
    event.preventDefault();

    const selectedPatient = patientSelect.value;
    const displayName = demoPatients[selectedPatient];

    if (!displayName) {
      alert("Please select a demo patient.");
      return;
    }
sessionStorage.setItem("carebridgePatientId", selectedPatient);

patientName.textContent = displayName;
loginSection.hidden = true;
dashboard.hidden = false;

window.dispatchEvent(new Event("patientIdentityChanged"));

  });

  logoutButton.addEventListener("click", () => {
sessionStorage.removeItem("carebridgePatientId");  
  dashboard.hidden = true;
    loginSection.hidden = false;
    loginForm.reset();
    patientName.textContent = "Patient";
  });

  console.log("CareBridge patient portal loaded successfully.");
});
