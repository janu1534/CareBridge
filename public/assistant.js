document.addEventListener("DOMContentLoaded", () => {
  const chatForm = document.getElementById("chat-form");
  const chatInput = document.getElementById("chat-input");
  const chatMessages = document.getElementById("chat-messages");
  const sendButton = document.getElementById("send-button");

  function addMessage(role, content) {
    const message = document.createElement("p");

    message.className =
      role === "user" ? "user-message" : "bot-message";

    message.textContent =
      (role === "user" ? "You: " : "CareBot: ") + content;

    chatMessages.appendChild(message);
    chatMessages.scrollTop = chatMessages.scrollHeight;
  }

  // Load previous conversation
async function loadHistory() {
  try {
const patientId = sessionStorage.getItem("carebridgePatientId");

if (!patientId) return;

const response = await fetch(
  `/api/assistant/history?patientId=${encodeURIComponent(patientId)}`
);
    const data = await response.json();

    if (!response.ok || !data.history) return;

    chatMessages.innerHTML = "";

    const historyBox = document.getElementById("conversation-history");
    const memoryBox = document.getElementById("patient-memory");
    const activityBox = document.getElementById("memory-activity");

    historyBox.innerHTML = "";

    if (data.history.length === 0) {
      historyBox.textContent = "No previous conversations yet.";
      memoryBox.textContent = "CareBot will remember messages from this browser session.";
      activityBox.textContent = "No saved messages yet.";
      return;
    }

    data.history.forEach(item => {
      addMessage(item.role, item.content);

      const entry = document.createElement("p");
      entry.textContent =
        (item.role === "user" ? "You: " : "CareBot: ") + item.content;

      historyBox.appendChild(entry);
    });

    memoryBox.textContent =
      `${data.history.length} saved messages available for conversation context.`;


    activityBox.textContent =
      "Previous messages successfully retrieved from PostgreSQL.";

  } catch (error) {
    console.error("Could not load chat history:", error);
  }
}
  // Send a new message
  chatForm.addEventListener("submit", async (event) => {
    event.preventDefault();

    const message = chatInput.value.trim();
    if (!message) return;

    addMessage("user", message);

    chatInput.value = "";
    sendButton.disabled = true;

    const loading = document.createElement("p");
    loading.className = "bot-message";
    loading.textContent = "CareBot is thinking...";
    chatMessages.appendChild(loading);

    try {
      const response = await fetch("/api/assistant", {
        method: "POST",
        headers: {
          "Content-Type": "application/json"
        },
body: JSON.stringify({
  message,
  patientId: sessionStorage.getItem("carebridgePatientId")
})
      });

      const data = await response.json();

      loading.textContent = response.ok
        ? "CareBot: " + data.reply
        : "CareBot: " + (data.error || "Unable to respond.");

    } catch (error) {
      loading.textContent =
        "CareBot: Connection error. Please try again.";
    } finally {
      sendButton.disabled = false;
      chatInput.focus();
      chatMessages.scrollTop = chatMessages.scrollHeight;
    }
  });

window.addEventListener("patientIdentityChanged", () => {
  chatMessages.innerHTML = "";
  loadHistory();
});
});
