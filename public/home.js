document.addEventListener("DOMContentLoaded", () => {
  const form = document.getElementById("home-chat-form");
  const input = document.getElementById("home-chat-input");
  const messages = document.getElementById("home-chat-messages");

  if (!form || !input || !messages) return;

  function addMessage(label, text) {
    const item = document.createElement("p");
    const strong = document.createElement("strong");

    strong.textContent = `${label}: `;
    item.appendChild(strong);
    item.appendChild(document.createTextNode(text));
    messages.appendChild(item);
    messages.scrollTop = messages.scrollHeight;
  }

  form.addEventListener("submit", async event => {
    event.preventDefault();

    const message = input.value.trim();
    if (!message) return;

    addMessage("You", message);
    input.value = "";

    const button = form.querySelector('button[type="submit"]');
    if (button) button.disabled = true;

    try {
      const response = await fetch("/api/public-assistant", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ message })
      });

      const data = await response.json();

      if (!response.ok) {
        throw new Error(data.error || "CareBot is unavailable.");
      }

      addMessage("CareBot", data.reply);
    } catch (error) {
      addMessage("CareBot", error.message || "Please try again later.");
    } finally {
      if (button) button.disabled = false;
      input.focus();
    }
  });
});
