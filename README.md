# CareBridge – AI-Powered Hospital Customer Support Agent

**CareBridge** is an AI-powered hospital customer support platform designed to make patient assistance faster, smarter, and more personalized.

It combines a multilingual AI chatbot, long-term conversational memory using Hindsight, patient registration, real-time queue management, and a staff dashboard.

Our goal is to reduce repetitive questions, improve hospital communication, and provide patients with a smoother support experience.

## Key Features

- **AI Customer Support – CareBot:** Provides friendly, hospital-related assistance using Groq-powered AI.
- **Multilingual Support:** Communicates in English and Telugu.
- **Long-Term Memory – Hindsight:** Remembers relevant patient preferences across conversations, reducing the need to repeat information.
- **Patient-Specific Memory:** Uses separate memory banks for individual demo patients.
- **Chat History:** Maintains conversation history for continuity.
- **Patient Registration:** Allows patients to register and receive queue tokens.
- **Live Queue Management:** Provides real-time queue updates using Socket.IO.
- **Staff Dashboard:** Enables authorized staff to monitor and update patient queue statuses.
- **Secure Authentication:** Uses bcrypt password hashing and PostgreSQL-backed sessions.

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

## How Hindsight Powers CareBridge

Hindsight provides long-term conversational memory for CareBot.

1. When a patient sends a message, CareBridge retrieves relevant memories from that patient's memory bank.
2. The retrieved context is provided to the AI assistant.
3. CareBot generates a personalized response using the available context.
4. Eligible demo conversation information is retained for future interactions.
5. Separate memory banks help prevent one demo patient's preferences from being recalled for another.

This demonstrates how an AI customer support agent can remember previous interactions instead of making users repeat the same information.

## System Workflow

1. A patient opens the CareBridge website.
2. The patient registers or signs in.
3. The patient interacts with CareBot for hospital-related assistance.
4. Hindsight retrieves relevant previous preferences when available.
5. CareBot provides contextual and personalized responses.
6. The patient can register for the queue and receive a token.
7. Staff monitor and update queue statuses through the staff dashboard.
8. Queue updates are reflected in real time.

## Technology Requirements

Before running CareBridge, install:

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

http://localhost:3000

## Deployment

CareBridge requires a Node.js hosting service that supports persistent server processes and WebSockets.

For deployment using Render:

1. Push the project to GitHub.
2. Create a PostgreSQL database.
3. Create a new Web Service in Render.
4. Connect
