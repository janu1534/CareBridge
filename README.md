# CareBridge – AI-Powered Hospital Customer Support Agent

**CareBridge** is an AI-powered hospital customer support platform designed to make patient assistance faster, smarter, and more personalized.

It combines an AI chatbot, long-term conversational memory using Hindsight, patient registration, real-time queue management, chat history, and a staff dashboard.

Our goal is to reduce repetitive questions, improve hospital communication, and provide patients with a smoother support experience.

## Live Demo

**Live Website:** https://carebridge-6mhz.onrender.com

**Patient Portal:** https://carebridge-6mhz.onrender.com/patient.html

**Staff/Admin Portal:** https://carebridge-6mhz.onrender.com/staff.html

**GitHub Repository:** https://github.com/janu1534/CareBridge

## Key Features

- **AI Customer Support – CareBot:** Provides friendly, hospital-related assistance using Groq-powered AI.
- **Multilingual Interaction:** Supports English and Telugu conversations.
- **Long-Term Memory – Hindsight:** Retains relevant patient preferences across conversations.
- **Patient-Specific Memory:** Uses separate memory banks for individual demo patients.
- **Chat History:** Maintains previous conversations for continuity.
- **Patient Registration:** Allows patients to register and receive queue tokens.
- **Live Queue Management:** Provides real-time queue updates using Socket.IO.
- **Staff Dashboard:** Allows authorized staff to monitor and update patient queue statuses.
- **Secure Authentication:** Uses bcrypt password hashing and PostgreSQL-backed sessions.

## What Makes CareBridge Different?

Traditional customer support systems often require patients to repeat the same information during every interaction.

CareBridge addresses this problem by combining conversational AI with long-term memory.

For example, when a patient tells CareBot that their preferred language is Telugu, Hindsight can retain that preference. In a fresh conversation, CareBot can retrieve the stored preference and respond accordingly.

This makes the interaction more personalized and reduces repetitive communication.

## How Hindsight Powers CareBridge

Hindsight provides long-term conversational memory for CareBot.

1. A patient sends a message to CareBot.
2. CareBridge retrieves relevant memories from that patient's memory bank.
3. The retrieved context is provided to the AI assistant.
4. CareBot generates a personalized response using the available context.
5. Eligible conversation information is retained for future interactions.
6. Separate memory banks help isolate demo patients' preferences.

### Memory Demonstration

We tested the following scenario:

- A patient tells CareBot: "My preferred language is Telugu."
- A fresh conversation is started.
- The patient asks: "What language do I prefer?"
- CareBot recalls the preference as Telugu.

This demonstrates the persistent-memory capability of the project.

## System Workflow

1. A patient opens the CareBridge website.
2. The patient registers or signs in.
3. The patient interacts with CareBot for hospital-related assistance.
4. Hindsight retrieves relevant previous preferences when available.
5. CareBot provides contextual and personalized responses.
6. The patient can register for the queue and receive a token.
7. Staff monitor and update queue statuses through the staff dashboard.
8. Queue updates are reflected in real time.

## Technology Stack

| Component | Technology |
|---|---|
| Frontend | HTML, CSS, JavaScript |
| Backend | Node.js, Express.js |
| Database | PostgreSQL |
| Real-time Communication | Socket.IO |
| AI Assistant | Groq API |
| Long-Term Memory | Hindsight |
| Authentication | bcryptjs, Express Sessions |
| Deployment | Render |

## Demo Verification

The following project capabilities have been tested during development:

- Live deployed website loads successfully.
- CareBot responds to patient messages.
- Telugu-language interaction was demonstrated.
- Hindsight successfully recalled a patient language preference in a fresh conversation.
- Patient portal and queue management features are included in the application.
- Staff login and dashboard access were tested successfully.

## Technology Requirements

Before running CareBridge locally, install:

- Node.js
- PostgreSQL
- Groq API credentials
- Hindsight API credentials

## Installation and Setup

### 1. Clone the Repository

```bash
git clone https://github.com/janu1534/CareBridge.git
cd CareBridge
```

### 2. Install Dependencies

```bash
npm install
```

### 3. Configure Environment Variables

Create a `.env` file using `.env.example` as a template.

Configure the required variables:

```env
DATABASE_URL=your_database_url
SESSION_SECRET=your_secure_session_secret
NODE_ENV=development
PORT=3000
GROQ_API_KEY=your_groq_api_key
HINDSIGHT_API_KEY=your_hindsight_api_key
HINDSIGHT_BASE_URL=your_hindsight_base_url
STAFF_EMAIL=your_staff_email
STAFF_PASSWORD=your_strong_password
STAFF_ROLE=admin
```

If your PostgreSQL provider requires SSL, configure:

```env
PGSSL=true
```

**Security:** Never upload `.env`, passwords, API keys, or database credentials to GitHub.

### 4. Create the Staff Account

```bash
npm run create-staff
```

### 5. Start the Application

```bash
npm start
```

Open the application in your browser:

```text
http://localhost:3000
```

## Deployment

CareBridge is deployed using Render.

For a new deployment:

1. Push the project to GitHub.
2. Create a PostgreSQL database.
3. Create a new Web Service in Render.
4. Connect the CareBridge GitHub repository.
5. Set the build command to `npm install`.
6. Set the start command to `npm start`.
7. Configure the required environment variables.
8. Deploy and test the application.

Create the initial staff account using the hosting provider's shell or a one-off job with the required environment variables, then run:

```bash
npm run create-staff
```

CareBridge requires a running Node.js server because its backend and Socket.IO functionality cannot run as a static GitHub Pages website.

## Project Limitations

CareBridge is a hackathon demonstration and is not a certified medical or emergency service.

- AI responses must not replace professional medical advice.
- Only fictional demo information should be used for testing.
- Current memory filtering requires stronger privacy controls before real-world use.
- Production deployment requires additional security reviews, role-based access controls, audit logs, monitoring, backups, and data-retention policies.
- Queue management is a demonstration workflow and does not provide clinically validated triage.

## Future Enhancements

- Voice-based patient assistance.
- SMS and email notifications.
- Advanced patient memory and privacy controls.
- Hospital-specific staff roles and permissions.
- Multi-hospital support.
- Doctor appointment and scheduling integration.
- Improved analytics and queue management.

## Team Members

| Team Member | Role |
|---|---|
| M. V. Padmavathi | Team Lead & Backend Development |
| M. Jahnavi | Backend Development |
| N. Tirumalesh | Testing & Quality Assurance |

## Project Goal

Our goal is to transform hospital customer support through conversational AI and long-term memory, making healthcare assistance more accessible, efficient, and personalized.

**CareBridge – Remembering Patients, Improving Care.**
