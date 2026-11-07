# CareBridge custom backend (live queue prototype)

## Stack
Node.js/Express API, Socket.IO live updates, PostgreSQL persistence, bcrypt password hashes, PostgreSQL-backed sessions.

## Accounts/integrations needed
- GitHub: store code and connect deployment.
- Node.js LTS: local development (https://nodejs.org/en/download/).
- PostgreSQL: local or managed database.
- Render or another Node.js host that supports WebSockets and persistent processes.
- Optional later: SMS/email provider, maps API, push notification service. Not integrated in this starter.

## Run locally
1. Install Node.js and PostgreSQL; create database `carebridge`.
2. Copy `.env.example` to `.env`, then fill `DATABASE_URL` and a long unique `SESSION_SECRET`. Never commit `.env`.
3. If the DB host requires TLS, set `PGSSL=true`.
4. Add `STAFF_EMAIL`, `STAFF_PASSWORD` (12+ characters), and `STAFF_ROLE=admin` to `.env` temporarily/per your local development setup.
5. Run:
   ```
   npm install
   npm run create-staff
   npm start
   ```
6. Visit http://localhost:3000. Register a fictional patient, sign in as staff, and change status.
7. Open another browser/device to see live updates.

## Deploy to Render
1. Push this folder to GitHub; exclude `.env`, passwords, and database secrets.
2. Provision PostgreSQL with your chosen provider and copy its connection string.
3. Render dashboard → New → Web Service → connect repository.
4. Build command: `npm install`; Start command: `npm start`.
5. Set environment variables in the host dashboard: `NODE_ENV=production`, `DATABASE_URL`, `SESSION_SECRET`, and `PGSSL=true` if required.
6. Deploy and check `https://YOUR-SERVICE/api/health`.
7. Create the initial staff user using the host's one-off shell/job: set `STAFF_EMAIL`, `STAFF_PASSWORD`, `STAFF_ROLE=admin`, then run `npm run create-staff`. Do not put credentials in source code or public logs.
8. Test on two devices using fictional data.

Do not publish this as a GitHub Pages static site: Socket.IO and the API require a running server. Use a Node Web Service. Free web services may sleep after inactivity.

## Endpoints
- GET `/api/health`
- GET `/api/queue` (tokens/status only)
- POST `/api/patients`
- POST `/api/staff/login`
- POST `/api/staff/logout`
- GET `/api/staff/me`
- GET `/api/staff/queue` (staff only)
- PATCH `/api/staff/queue/:id` (staff only)
- Socket.IO event `queue:update`

## Limitations / before real hospital use
Demo only; not a certified medical or emergency system. Patient registration is public, token numbers are demo tokens (not guaranteed sequential), and all logged-in staff can change statuses. No role-specific permissions, hospital separation, validated triage, doctor-roster matching, cross-hospital coordination, audit logs, notification integrations, driver tracking, retention policy, backups, or disaster recovery. Before real patient data: add strict role/hospital authorization, CSRF protection, audit logs, input/security review, monitoring, backups, retention/deletion controls, privacy/legal review, and clinical workflow validation. Use TLS, keep secrets private, and restrict database network access.
