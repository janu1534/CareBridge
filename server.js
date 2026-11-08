
require("dotenv").config();

const path = require("path");
const http = require("http");
const express = require("express");
const helmet = require("helmet");
const rateLimit = require("express-rate-limit");
const session = require("express-session");
const pgSession = require("connect-pg-simple")(session);
const { Pool } = require("pg");
const bcrypt = require("bcryptjs");
const { Server } = require("socket.io");
const { askAssistant, askPublicAssistant } = require("./ai/assistant");

if (!process.env.DATABASE_URL || !process.env.SESSION_SECRET) {
  console.error("Set DATABASE_URL and SESSION_SECRET in .env");
  process.exit(1);
}

const app = express();
const server = http.createServer(app);
const io = new Server(server);

const prod = process.env.NODE_ENV === "production";

const pool = new Pool({
  connectionString: process.env.DATABASE_URL,
  ssl: process.env.PGSSL === "true"
    ? { rejectUnauthorized: false }
    : undefined
});

const sessionMiddleware = session({
  store: new pgSession({
    pool,
    tableName: "user_sessions",
    createTableIfMissing: true
  }),
  secret: process.env.SESSION_SECRET,
  resave: false,
  saveUninitialized: false,
  name: "carebridge.sid",
  cookie: {
    httpOnly: true,
    sameSite: "lax",
    secure: prod,
    maxAge: 28800000
  }
});

app.set("trust proxy", 1);

app.use(helmet({
  contentSecurityPolicy: {
    directives: {
      defaultSrc: ["'self'"],
      scriptSrc: ["'self'"],
      styleSrc: ["'self'"],
      connectSrc: ["'self'", "ws:", "wss:"],
      imgSrc: ["'self'", "data:"]
    }
  }
}));

app.use(express.json({ limit: "20kb" }));
app.use(sessionMiddleware);
app.use(express.static(path.join(__dirname, "public")));

const loginLimiter = rateLimit({
  windowMs: 900000,
  limit: 10,
  standardHeaders: "draft-7",
  legacyHeaders: false
});

const aiLimiter = rateLimit({
  windowMs: 15 * 60 * 1000,
  limit: 10,
  standardHeaders: true,
  legacyHeaders: false
});

const requireStaff = (req, res, next) =>
  req.session?.staff
    ? next()
    : res.status(401).json({ error: "Staff login required." });

const requirePatient = (req, res, next) =>
  req.session?.patient
    ? next()
    : res.status(401).json({ error: "Patient login required." });

const requireClinician = (req, res, next) => {
  if (!req.session?.staff) {
    return res.status(401).json({ error: "Staff login required." });
  }

  if (!["doctor", "admin"].includes(req.session.staff.role)) {
    return res.status(403).json({
      error: "Only authorised clinical staff can assess urgency."
    });
  }

  next();
};

// Database initialization and migrations
async function init() {
  await pool.query(`
    CREATE TABLE IF NOT EXISTS patients (
      id BIGSERIAL PRIMARY KEY,
      name TEXT NOT NULL,
      email TEXT UNIQUE NOT NULL,
      password_hash TEXT NOT NULL,
      created_at TIMESTAMPTZ DEFAULT NOW()
    );
  `);

  await pool.query(`
    CREATE TABLE IF NOT EXISTS staff_users (
      id BIGSERIAL PRIMARY KEY,
      email TEXT UNIQUE NOT NULL,
      password_hash TEXT NOT NULL,
      role TEXT NOT NULL
        CHECK(role IN ('admin','receptionist','doctor')),
      created_at TIMESTAMPTZ DEFAULT NOW()
    );
  `);

  await pool.query(`
    CREATE TABLE IF NOT EXISTS queue_entries (
      id BIGSERIAL PRIMARY KEY,
      token TEXT UNIQUE NOT NULL,
      patient_name TEXT NOT NULL,
      department TEXT NOT NULL,
      status TEXT NOT NULL DEFAULT 'waiting'
        CHECK(status IN ('waiting','serving','completed')),
      created_at TIMESTAMPTZ DEFAULT NOW(),
      updated_at TIMESTAMPTZ DEFAULT NOW()
    );
  `);

  // Add missing columns safely to existing databases
  await pool.query(`
    ALTER TABLE queue_entries
      ADD COLUMN IF NOT EXISTS urgency TEXT NOT NULL DEFAULT 'unassessed',
      ADD COLUMN IF NOT EXISTS patient_id BIGINT REFERENCES patients(id),
      ADD COLUMN IF NOT EXISTS urgency_notes TEXT,
      ADD COLUMN IF NOT EXISTS assessed_by BIGINT REFERENCES staff_users(id),
      ADD COLUMN IF NOT EXISTS assessed_at TIMESTAMPTZ,
      ADD COLUMN IF NOT EXISTS completed_at TIMESTAMPTZ,
      ADD COLUMN IF NOT EXISTS updated_at TIMESTAMPTZ DEFAULT NOW();

    ALTER TABLE queue_entries
      DROP CONSTRAINT IF EXISTS queue_entries_urgency_check;

    ALTER TABLE queue_entries
      ADD CONSTRAINT queue_entries_urgency_check
      CHECK (urgency IN ('unassessed','high','medium','low'));
  `);

  await pool.query(`
    CREATE TABLE IF NOT EXISTS chat_messages (
      id BIGSERIAL PRIMARY KEY,
      session_id TEXT NOT NULL,
      role TEXT NOT NULL CHECK (role IN ('user','assistant')),
      content TEXT NOT NULL,
      created_at TIMESTAMPTZ DEFAULT NOW()
    );

    CREATE INDEX IF NOT EXISTS idx_chat_session
    ON chat_messages(session_id, created_at);
  `);

  console.log("CareBridge database initialized.");
}

// Queue data
async function queueRows() {
  const result = await pool.query(`
    SELECT id, token, patient_name, department, status,
           created_at, completed_at, updated_at
    FROM queue_entries
    WHERE created_at >= CURRENT_DATE
    ORDER BY
      CASE WHEN status = 'completed' THEN 1 ELSE 0 END ASC,
      CASE
        WHEN status = 'completed'
        THEN COALESCE(completed_at, updated_at, created_at)
        ELSE created_at
      END ASC
  `);

  return result.rows;
}

function publicRows(rows) {
  return rows.map((r, i) => ({
    id: r.id,
    token: r.token,
    department: r.department,
    status: r.status,
    position: r.status === "waiting"
      ? rows.slice(0, i + 1).filter(
          x => x.status === "waiting" &&
               x.department === r.department
        ).length
      : null,
    createdAt: r.created_at
  }));
}

async function publish() {
  io.emit("queue:update", publicRows(await queueRows()));
}

// Health check
app.get("/api/health", (req, res) => {
  res.json({ ok: true, service: "CareBridge API" });
});

// Patient registration
app.post("/api/patient/register", loginLimiter, async (req, res, next) => {
  try {
    const name = typeof req.body.name === "string"
      ? req.body.name.trim()
      : "";

    const email = typeof req.body.email === "string"
      ? req.body.email.trim().toLowerCase()
      : "";

    const password = typeof req.body.password === "string"
      ? req.body.password
      : "";

    if (name.length < 2 || name.length > 80) {
      return res.status(400).json({
        error: "Name must be 2–80 characters."
      });
    }

    if (!/^[^\s@]+@[^\s@]+\.[^\s@]+$/.test(email)) {
      return res.status(400).json({
        error: "Enter a valid email address."
      });
    }

    if (password.length < 8 || Buffer.byteLength(password, "utf8") > 72) {
      return res.status(400).json({
        error: "Password must be at least 8 characters and no more than 72 bytes."
      });
    }

    const hash = await bcrypt.hash(password, 12);

    const result = await pool.query(
      `INSERT INTO patients (name, email, password_hash)
       VALUES ($1, $2, $3)
       RETURNING id, name, email`,
      [name, email, hash]
    );

    const patient = result.rows[0];

    req.session.regenerate(err => {
      if (err) return next(err);

      req.session.patient = patient;

      req.session.save(err2 => {
        if (err2) return next(err2);
        res.status(201).json({ patient });
      });
    });
  } catch (error) {
    if (error.code === "23505") {
      return res.status(409).json({
        error: "An account with this email already exists."
      });
    }

    next(error);
  }
});

// Patient login
app.post("/api/patient/login", loginLimiter, async (req, res, next) => {
  try {
    const email = typeof req.body.email === "string"
      ? req.body.email.trim().toLowerCase()
      : "";

    const password = typeof req.body.password === "string"
      ? req.body.password
      : "";

    const result = await pool.query(
      `SELECT id, name, email, password_hash
       FROM patients WHERE email = $1`,
      [email]
    );

    const patient = result.rows[0];

    if (!patient || !(await bcrypt.compare(password, patient.password_hash))) {
      return res.status(401).json({
        error: "Email or password is incorrect."
      });
    }

    req.session.regenerate(err => {
      if (err) return next(err);

      req.session.patient = {
        id: patient.id,
        name: patient.name,
        email: patient.email
      };

      req.session.save(err2 => {
        if (err2) return next(err2);
        res.json({ patient: req.session.patient });
      });
    });
  } catch (error) {
    next(error);
  }
});

// Check patient session
app.get("/api/patient/me", (req, res) => {
  res.json({ patient: req.session?.patient || null });
});

// Patient logout
app.post("/api/patient/logout", requirePatient, (req, res, next) => {
  req.session.destroy(error => {
    if (error) return next(error);

    res.clearCookie("carebridge.sid");
    res.json({ ok: true });
  });
});

// Patient joins queue
app.post("/api/patient/queue", requirePatient, async (req, res, next) => {
  try {
    const department = typeof req.body.department === "string"
      ? req.body.department.trim()
      : "";

    const departments = [
      "General Medicine",
      "Pediatrics",
      "Cardiology",
      "Orthopedics",
      "Dermatology"
    ];

    if (!departments.includes(department)) {
      return res.status(400).json({
        error: "Choose a valid department."
      });
    }

    const patientId = req.session.patient.id;
    const name = req.session.patient.name;

    // Prevent duplicate active queue entries
    const existing = await pool.query(
      `SELECT token, department, status
       FROM queue_entries
       WHERE patient_id = $1
         AND status IN ('waiting','serving')
         AND created_at >= CURRENT_DATE
       ORDER BY created_at DESC
       LIMIT 1`,
      [patientId]
    );

    if (existing.rowCount > 0) {
      return res.status(409).json({
        error: `You already have an active queue token: ${existing.rows[0].token}.`
      });
    }

    const token =
      `CB-${Date.now().toString().slice(-6)}-${Math.floor(Math.random() * 90 + 10)}`;

    const result = await pool.query(
      `INSERT INTO queue_entries
       (token, patient_name, department, patient_id)
       VALUES ($1, $2, $3, $4)
       RETURNING id, token, patient_name, department, status, created_at`,
      [token, name, department, patientId]
    );

    await publish();
    res.status(201).json(result.rows[0]);
  } catch (error) {
    next(error);
  }
});

// Get patient's queue entries
app.get("/api/patient/queue", requirePatient, async (req, res, next) => {
  try {
    const result = await pool.query(
      `SELECT id, token, department, status, created_at
       FROM queue_entries
       WHERE patient_id = $1
         AND created_at >= CURRENT_DATE
       ORDER BY created_at DESC`,
      [req.session.patient.id]
    );

    res.json({ queues: result.rows });
  } catch (error) {
    next(error);
  }
});

// Patient conversation history
app.get("/api/assistant/history", requirePatient, async (req, res, next) => {
  try {
    const sessionId = `patient:${req.session.patient.id}`;

    const result = await pool.query(
      `SELECT role, content, created_at
       FROM chat_messages
       WHERE session_id = $1
       ORDER BY created_at ASC
       LIMIT 50`,
      [sessionId]
    );

    res.json({ history: result.rows });
  } catch (error) {
    next(error);
  }
});

// Public queue
app.get("/api/queue", async (req, res, next) => {
  try {
    res.json(publicRows(await queueRows()));
  } catch (error) {
    next(error);
  }
});

// Public queue registration (existing demo flow)
app.post("/api/patients", async (req, res, next) => {
  try {
    const name = typeof req.body.name === "string"
      ? req.body.name.trim()
      : "";

    const department = typeof req.body.department === "string"
      ? req.body.department.trim()
      : "";

    const departments = [
      "General Medicine",
      "Pediatrics",
      "Cardiology",
      "Orthopedics",
      "Dermatology"
    ];

    if (name.length < 2 || name.length > 80) {
      return res.status(400).json({
        error: "Name must be 2–80 characters."
      });
    }

    if (!departments.includes(department)) {
      return res.status(400).json({
        error: "Choose a valid department."
      });
    }

    const token =
      `CB-${Date.now().toString().slice(-6)}-${Math.floor(Math.random() * 90 + 10)}`;

    const result = await pool.query(
      `INSERT INTO queue_entries (token, patient_name, department)
       VALUES ($1, $2, $3)
       RETURNING id, token, department, status, created_at`,
      [token, name, department]
    );

    await publish();
    res.status(201).json(result.rows[0]);
  } catch (error) {
    next(error);
  }
});

// Staff login
app.post("/api/staff/login", loginLimiter, async (req, res, next) => {
  try {
    const email = typeof req.body.email === "string"
      ? req.body.email.trim().toLowerCase()
      : "";

    const password = typeof req.body.password === "string"
      ? req.body.password
      : "";

    const result = await pool.query(
      `SELECT id, email, password_hash, role
       FROM staff_users WHERE email = $1`,
      [email]
    );

    const staff = result.rows[0];

    if (!staff || !(await bcrypt.compare(password, staff.password_hash))) {
      return res.status(401).json({
        error: "Email or password is incorrect."
      });
    }

    req.session.regenerate(err => {
      if (err) return next(err);

      req.session.staff = {
        id: staff.id,
        email: staff.email,
        role: staff.role
      };

      req.session.save(err2 => {
        if (err2) return next(err2);

        res.json({
          email: staff.email,
          role: staff.role
        });
      });
    });
  } catch (error) {
    next(error);
  }
});

// Staff logout
app.post("/api/staff/logout", requireStaff, (req, res, next) => {
  req.session.destroy(error => {
    if (error) return next(error);

    res.clearCookie("carebridge.sid");
    res.json({ ok: true });
  });
});

// Check staff session
app.get("/api/staff/me", (req, res) => {
  res.json({ staff: req.session?.staff || null });
});

// Staff queue
app.get("/api/staff/queue", requireStaff, async (req, res, next) => {
  try {
    res.json(await queueRows());
  } catch (error) {
    next(error);
  }
});

// Critical-care queue
app.get("/api/staff/critical-queue", requireClinician, async (req, res, next) => {
  try {
    const result = await pool.query(`
      SELECT id, token, patient_name, department, status,
             created_at, urgency, urgency_notes, assessed_at
      FROM queue_entries
      WHERE created_at >= CURRENT_DATE
      ORDER BY
        CASE urgency
          WHEN 'high' THEN 1
          WHEN 'medium' THEN 2
          WHEN 'low' THEN 3
          ELSE 4
        END,
        created_at ASC
    `);

    res.json(result.rows);
  } catch (error) {
    next(error);
  }
});

// Update queue status
app.patch("/api/staff/queue/:id", requireStaff, async (req, res, next) => {
  try {
    const { status } = req.body;

    if (!["waiting", "serving", "completed"].includes(status)) {
      return res.status(400).json({ error: "Invalid status." });
    }

    const result = await pool.query(`
      UPDATE queue_entries
      SET status = $1,
          updated_at = NOW(),
          completed_at = CASE
            WHEN $1 = 'completed' THEN COALESCE(completed_at, NOW())
            ELSE NULL
          END
      WHERE id = $2
      RETURNING id, token, patient_name, department, status,
                created_at, completed_at
    `, [status, req.params.id]);

    if (!result.rowCount) {
      return res.status(404).json({
        error: "Queue entry not found."
      });
    }

    await publish();
    res.json(result.rows[0]);
  } catch (error) {
    next(error);
  }
});

// Delete completed queue entry
app.delete("/api/staff/queue/:id", requireStaff, async (req, res, next) => {
  try {
    const result = await pool.query(
      `DELETE FROM queue_entries
       WHERE id = $1 AND status = 'completed'
       RETURNING id`,
      [req.params.id]
    );

    if (!result.rowCount) {
      return res.status(404).json({
        error: "Only completed patients can be deleted."
      });
    }

    await publish();
    res.json({
      message: "Completed patient deleted successfully."
    });
  } catch (error) {
    next(error);
  }
});

// Assess queue urgency
app.patch(
  "/api/staff/queue/:id/urgency",
  requireClinician,
  async (req, res, next) => {
    try {
      const { urgency, urgency_notes } = req.body;

      if (!["high", "medium", "low"].includes(urgency)) {
        return res.status(400).json({
          error: "Invalid urgency level."
        });
      }

      const notes = typeof urgency_notes === "string"
        ? urgency_notes.trim().slice(0, 500)
        : "";

      const result = await pool.query(
        `UPDATE queue_entries
         SET urgency = $1,
             urgency_notes = $2,
             assessed_by = $3,
             assessed_at = NOW(),
             updated_at = NOW()
         WHERE id = $4
         RETURNING id, token, patient_name, department, status,
                   created_at, urgency, urgency_notes, assessed_at`,
        [urgency, notes, req.session.staff.id, req.params.id]
      );

      if (!result.rowCount) {
        return res.status(404).json({
          error: "Patient not found."
        });
      }

      res.json(result.rows[0]);
    } catch (error) {
      next(error);
    }
  }
);

// Public homepage CareBot
app.post("/api/public-assistant", aiLimiter, async (req, res) => {
  try {
    const message = typeof req.body.message === "string"
      ? req.body.message.trim()
      : "";

    if (!message || message.length > 1000) {
      return res.status(400).json({
        error: "Message must be between 1 and 1000 characters."
      });
    }

    const reply = await askPublicAssistant(message);
    res.json({ reply });
  } catch (error) {
    console.error("Public CareBot error:", error.message);

    res.status(503).json({
      error: "CareBot is temporarily unavailable."
    });
  }
});

// Authenticated patient CareBot
app.post("/api/assistant", requirePatient, aiLimiter, async (req, res) => {
  try {
    const message = typeof req.body.message === "string"
      ? req.body.message.trim()
      : "";

    if (!message || message.length > 1000) {
      return res.status(400).json({
        error: "Message must be between 1 and 1000 characters."
      });
    }

    const patientId = String(req.session.patient.id);
    const sessionId = `patient:${patientId}`;

    await pool.query(
      `INSERT INTO chat_messages (session_id, role, content)
       VALUES ($1, 'user', $2)`,
      [sessionId, message]
    );

    const historyResult = await pool.query(
      `SELECT role, content
       FROM chat_messages
       WHERE session_id = $1
       ORDER BY created_at DESC
       LIMIT 10`,
      [sessionId]
    );

    const history = historyResult.rows.reverse().slice(0, -1);
    const queueData = publicRows(await queueRows());

    const reply = await askAssistant(
      message,
      queueData,
      history,
      patientId
    );

    await pool.query(
      `INSERT INTO chat_messages (session_id, role, content)
       VALUES ($1, 'assistant', $2)`,
      [sessionId, reply]
    );

    res.json({ reply });
  } catch (error) {
    console.error("AI assistant error:", error.message);

    res.status(503).json({
      error: "AI assistant is temporarily unavailable."
    });
  }
});

// Socket.IO session support and live queue updates
io.engine.use(sessionMiddleware);

io.on("connection", async socket => {
  try {
    socket.emit("queue:update", publicRows(await queueRows()));
  } catch (error) {
    console.error("Socket queue error:", error.message);
  }
});

// Error handler
app.use((err, req, res, next) => {
  console.error(err);

  if (!res.headersSent) {
    res.status(500).json({
      error: "Server error; check logs."
    });
  } else {
    next(err);
  }
});

// Start server
const port = Number(process.env.PORT || 3000);

init()
  .then(() => {
    server.listen(port, "0.0.0.0", () => {
      console.log(`CareBridge listening on ${port}`);
    });
  })
  .catch(error => {
    console.error("Database initialization failed:", error);
    process.exit(1);
  });

process.on("SIGTERM", async () => {
  server.close();
  await pool.end();
  process.exit(0);
});
