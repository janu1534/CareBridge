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
    const response = await fetch("/api/assistant/history");

    if (response.status === 401) return;

    const data = await response.json();

    if (!response.ok || !data.history) return;

    const historyBox = document.getElementById("conversation-history");

    if (!historyBox) return;

    historyBox.innerHTML = "";

    if (data.history.length === 0) {
      historyBox.textContent = "No previous conversations yet.";
      return;
    }

    data.history.forEach(item => {
      const entry = document.createElement("p");

      entry.textContent =
        (item.role === "user" ? "You: " : "CareBot: ") + item.content;

      historyBox.appendChild(entry);
    });

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
body: JSON.stringify({ message })
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
