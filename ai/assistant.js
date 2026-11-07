const Groq = require("groq-sdk");
const { HindsightClient } = require("@vectorize-io/hindsight-client");

const groq = new Groq({
  apiKey: process.env.GROQ_API_KEY
});

const hindsight = new HindsightClient({
  baseUrl: process.env.HINDSIGHT_BASE_URL,
  apiKey: process.env.HINDSIGHT_API_KEY
});

const BANKS = {
  "demo-patient-1": "carebridge-demo-patient-1",
  "demo-patient-2": "carebridge-demo-patient-2"
};

// Avoid retaining conversations containing potentially sensitive medical details.
function isSafeForDemoMemory(message) {
  const sensitiveTerms =
    /\b(symptom|diagnos|disease|medication|medicine|prescription|medical history|blood pressure|sugar level|cancer|pregnan|allerg|patient id|date of birth)\b/i;

  return typeof message === "string" &&
    message.length > 0 &&
    !sensitiveTerms.test(message);
}

async function askAssistant(message, queueData = [], history = [], patientId) {
  if (!process.env.GROQ_API_KEY) {
    throw new Error("AI assistant is not configured.");
  }

  const bankId = BANKS[patientId];
  let memoryContext = "";

  // Recall patient-specific memories.
  if (bankId && process.env.HINDSIGHT_API_KEY) {
    try {
      const recalled = await hindsight.recall(bankId, message, {
        maxTokens: 500
      });

      memoryContext = (recalled.results || [])
        .map(item => item.text)
        .filter(Boolean)
        .join("\n");
    } catch (error) {
      console.error("Hindsight recall failed:", error.status || error.message);
    }
  }

  const systemPrompt = `You are CareBridge, a friendly hospital information assistant.

HOSPITAL DEPARTMENTS:
1. General Medicine
2. Pediatrics
3. Cardiology
4. Orthopedics
5. Dermatology

LIVE PUBLIC QUEUE DATA:
${JSON.stringify(queueData)}

RELEVANT PREVIOUSLY REMEMBERED CONTEXT:
${memoryContext || "No additional memories available."}

RULES:
- Recommend the appropriate department.
- Use supplied queue data for queue questions.
- Never invent queue positions or waiting times.
- Never reveal patient names or private information.
- Never diagnose or prescribe medicines.
- For emergencies, advise immediate emergency medical help.
- Keep answers short, friendly and supportive.
- Support English and Telugu when possible.
- Use previous conversation messages and remembered context to maintain continuity.`;

  const messages = [
    { role: "system", content: systemPrompt },
    ...history.slice(-10).filter(
      item =>
        ["user", "assistant"].includes(item.role) &&
        typeof item.content === "string"
    ),
    { role: "user", content: message }
  ];

  const completion = await groq.chat.completions.create({
    messages,
    model: "openai/gpt-oss-120b",
    temperature: 0.5,
    max_tokens: 400
  });

  const reply = completion.choices[0].message.content;

  // Retain only non-medical demo conversations.
  if (
    bankId &&
    process.env.HINDSIGHT_API_KEY &&
    isSafeForDemoMemory(message) &&
    isSafeForDemoMemory(reply)
  ) {
    try {
      await hindsight.retain(
        bankId,
        `User: ${message}\nCareBridge: ${reply}`,
        {
          context: "CareBridge synthetic hackathon demo conversation"
        }
      );
      console.log("Hindsight memory retained for", patientId);
    } catch (error) {
      console.error("Hindsight retain failed:", error.status || error.message);
    }
  }

  return reply;
}

module.exports = { askAssistant };
