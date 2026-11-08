require("dotenv").config();
const path = require("path"), http = require("http");
const express = require("express"), helmet = require("helmet");
const rateLimit = require("express-rate-limit");
const session = require("express-session");
const pgSession = require("connect-pg-simple")(session);
const { Pool } = require("pg"), bcrypt = require("bcryptjs");
const { Server } = require("socket.io");
const { askAssistant } = require("./ai/assistant");
if (!process.env.DATABASE_URL || !process.env.SESSION_SECRET) {
  console.error("Set DATABASE_URL and SESSION_SECRET in .env"); process.exit(1);
}
const app = express(), server = http.createServer(app), io = new Server(server);
const prod = process.env.NODE_ENV === "production";
const pool = new Pool({ connectionString: process.env.DATABASE_URL,
  ssl: process.env.PGSSL === "true" ? { rejectUnauthorized: false } : undefined });
const sessionMiddleware = session({
  store: new pgSession({ pool, tableName: "user_sessions", createTableIfMissing: true }),
  secret: process.env.SESSION_SECRET, resave: false, saveUninitialized: false,
  name: "carebridge.sid", cookie: { httpOnly: true, sameSite: "lax", secure: prod, maxAge: 28800000 }
});
app.set("trust proxy", 1);
app.use(helmet({ contentSecurityPolicy: { directives: {
  defaultSrc:["'self'"], scriptSrc:["'self'"], styleSrc:["'self'"],
  connectSrc:["'self'","ws:","wss:"], imgSrc:["'self'","data:"]
}}}));
app.use(express.json({limit:"20kb"}));
app.use(sessionMiddleware);
app.use(express.static(path.join(__dirname,"public")));
const loginLimiter = rateLimit({ windowMs: 900000, limit: 10, standardHeaders: "draft-7", legacyHeaders: false });
const requireStaff = (req,res,next) => req.session?.staff ? next() : res.status(401).json({error:"Staff login required."});
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
async function queueRows() {
  return (await pool.query(`SELECT id,token,patient_name,department,status,created_at
    FROM queue_entries WHERE created_at >= CURRENT_DATE ORDER BY created_at ASC`)).rows;
}
function publicRows(rows) {
  return rows.map((r,i)=>({id:r.id,token:r.token,department:r.department,status:r.status,
    position:r.status==="waiting" ? rows.slice(0,i+1).filter(x=>x.status==="waiting"&&x.department===r.department).length : null,
    createdAt:r.created_at}));
}
async function publish() { io.emit("queue:update",publicRows(await queueRows())); }
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
  await pool.query(`CREATE TABLE IF NOT EXISTS staff_users (
    id BIGSERIAL PRIMARY KEY,email TEXT UNIQUE NOT NULL,password_hash TEXT NOT NULL,
    role TEXT NOT NULL CHECK(role IN ('admin','receptionist','doctor')),created_at TIMESTAMPTZ DEFAULT NOW());
    CREATE TABLE IF NOT EXISTS queue_entries (
    id BIGSERIAL PRIMARY KEY,token TEXT UNIQUE NOT NULL,patient_name TEXT NOT NULL,
    department TEXT NOT NULL,status TEXT NOT NULL DEFAULT 'waiting'
    CHECK(status IN ('waiting','serving','completed')),created_at TIMESTAMPTZ DEFAULT NOW(),updated_at TIMESTAMPTZ DEFAULT NOW());`);
  await pool.query(`
    ALTER TABLE queue_entries
    ADD COLUMN IF NOT EXISTS urgency TEXT NOT NULL DEFAULT 'unassessed'
      CHECK (urgency IN ('unassessed','high','medium','low')),
    ADD COLUMN IF NOT EXISTS urgency_notes TEXT,
    ADD COLUMN IF NOT EXISTS assessed_by BIGINT REFERENCES staff_users(id),
    ADD COLUMN IF NOT EXISTS assessed_at TIMESTAMPTZ;
  `);
await pool.query(`
  CREATE TABLE IF NOT EXISTS chat_messages (
    id BIGSERIAL PRIMARY KEY,
    session_id TEXT NOT NULL,
    role TEXT NOT NULL CHECK (role IN ('user', 'assistant')),
    content TEXT NOT NULL,
    created_at TIMESTAMPTZ DEFAULT NOW()
  );

  CREATE INDEX IF NOT EXISTS idx_chat_session
  ON chat_messages(session_id, created_at);
`);
}

app.get("/api/health",(req,res)=>res.json({ok:true,service:"CareBridge API"}));
// Patient registration
app.post("/api/patient/register", loginLimiter, async (req, res, next) => {
  try {
    const name = typeof req.body.name === "string" ? req.body.name.trim() : "";
    const email = typeof req.body.email === "string" ? req.body.email.trim().toLowerCase() : "";
    const password = typeof req.body.password === "string" ? req.body.password : "";

    if (name.length < 2 || name.length > 80)
      return res.status(400).json({ error: "Name must be 2–80 characters." });

    if (!/^[^\s@]+@[^\s@]+\.[^\s@]+$/.test(email))
      return res.status(400).json({ error: "Enter a valid email address." });

    if (password.length < 8 || Buffer.byteLength(password, "utf8") > 72)
      return res.status(400).json({ error: "Password must be at least 8 characters and no more than 72 bytes." });

    const hash = await bcrypt.hash(password, 12);

    const result = await pool.query(
      `INSERT INTO patients(name, email, password_hash)
       VALUES($1, $2, $3)
       RETURNING id, name, email`,
      [name, email, hash]
    );

    const patient = result.rows[0];

    req.session.regenerate(err => {
      if (err) return next(err);

      req.session.patient = {
        id: patient.id,
        name: patient.name,
        email: patient.email
      };

      req.session.save(err2 => {
        if (err2) return next(err2);
        res.status(201).json({ patient });
      });
    });
  } catch (error) {
    if (error.code === "23505")
      return res.status(409).json({ error: "An account with this email already exists." });
    next(error);
  }
});

// Patient login
app.post("/api/patient/login", loginLimiter, async (req, res, next) => {
  try {
    const email = typeof req.body.email === "string" ? req.body.email.trim().toLowerCase() : "";
    const password = typeof req.body.password === "string" ? req.body.password : "";

    const result = await pool.query(
      "SELECT id, name, email, password_hash FROM patients WHERE email = $1",
      [email]
    );

    const patient = result.rows[0];

    if (!patient || !(await bcrypt.compare(password, patient.password_hash)))
      return res.status(401).json({ error: "Email or password is incorrect." });

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

// Check current patient session
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
app.get("/api/queue",async(req,res,next)=>{try{res.json(publicRows(await queueRows()))}catch(e){next(e)}});
app.post("/api/patients",async(req,res,next)=>{
  try {
    const name=typeof req.body.name==="string"?req.body.name.trim():"";
    const dept=typeof req.body.department==="string"?req.body.department.trim():"";
    const depts=["General Medicine","Pediatrics","Cardiology","Orthopedics","Dermatology"];
    if(name.length<2||name.length>80) return res.status(400).json({error:"Name must be 2–80 characters."});
    if(!depts.includes(dept)) return res.status(400).json({error:"Choose a valid department."});
    const token=`CB-${Date.now().toString().slice(-6)}-${Math.floor(Math.random()*90+10)}`;
    const r=await pool.query("INSERT INTO queue_entries(token,patient_name,department) VALUES($1,$2,$3) RETURNING id,token,department,status,created_at",[token,name,dept]);
    await publish(); res.status(201).json(r.rows[0]);
  } catch(e){next(e)}
});
app.post("/api/staff/login",loginLimiter,async(req,res,next)=>{
  try {
    const email=typeof req.body.email==="string"?req.body.email.trim().toLowerCase():"";
    const pass=typeof req.body.password==="string"?req.body.password:"";
    const r=await pool.query("SELECT id,email,password_hash,role FROM staff_users WHERE email=$1",[email]);
    const u=r.rows[0]; if(!u||!(await bcrypt.compare(pass,u.password_hash))) return res.status(401).json({error:"Email or password is incorrect."});
    req.session.regenerate(err=>{if(err)return next(err);req.session.staff={id:u.id,email:u.email,role:u.role};
      req.session.save(err2=>err2?next(err2):res.json({email:u.email,role:u.role}));});
  }catch(e){next(e)}
});
app.post("/api/staff/logout",requireStaff,(req,res,next)=>req.session.destroy(e=>e?next(e):(res.clearCookie("carebridge.sid"),res.json({ok:true}))));
app.get("/api/staff/me",(req,res)=>res.json({staff:req.session?.staff||null}));
app.get("/api/staff/queue",requireStaff,async(req,res,next)=>{try{res.json(await queueRows())}catch(e){next(e)}});
// Protected Critical Care patient queue
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
app.patch("/api/staff/queue/:id",requireStaff,async(req,res,next)=>{
  try {
    if(!["waiting","serving","completed"].includes(req.body.status)) return res.status(400).json({error:"Invalid status."});
    const r=await pool.query("UPDATE queue_entries SET status=$1,updated_at=NOW() WHERE id=$2 RETURNING id,token,patient_name,department,status,created_at",[req.body.status,req.params.id]);
    if(!r.rowCount)return res.status(404).json({error:"Queue entry not found."});
    await publish();res.json(r.rows[0]);
  }catch(e){next(e)}
});
// Protected Critical Care urgency assessment
app.patch("/api/staff/queue/:id/urgency", requireClinician, async (req, res, next) => {
  try {
    const { urgency, urgency_notes } = req.body;

    if (!["high", "medium", "low"].includes(urgency)) {
      return res.status(400).json({ error: "Invalid urgency level." });
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
      return res.status(404).json({ error: "Patient not found." });
    }

    res.json(result.rows[0]);
  } catch (error) {
    next(error);
  }
});
const aiLimiter = rateLimit({
  windowMs: 15 * 60 * 1000,
  limit: 10,
  standardHeaders: true,
  legacyHeaders: false
});
app.post("/api/assistant", requirePatient, aiLimiter, async (req, res, next) => {
  try {
    const message = typeof req.body.message === "string"
      ? req.body.message.trim()
      : "";

    if (!message || message.length > 1000) {
      return res.status(400).json({
        error: "Message must be between 1 and 1000 characters."
      });
    }
    req.session.chatStarted = true;

// Identify the authenticated patient
const patientId = String(req.session.patient.id);
const sessionId = `patient:${patientId}`;
    // Save the patient's message
    await pool.query(
      `INSERT INTO chat_messages (session_id, role, content)
       VALUES ($1, 'user', $2)`,
      [sessionId, message]
    );

    // Retrieve previous conversation
    const historyResult = await pool.query(
      `SELECT role, content
       FROM chat_messages
       WHERE session_id = $1
       ORDER BY created_at DESC
       LIMIT 10`,
      [sessionId]
    );

    const history = historyResult.rows.reverse()
      .slice(0, -1);

    // Get live queue data
    const queueData = publicRows(await queueRows());

    // Generate AI response with conversation history
    const reply = await askAssistant(message, queueData, history, patientId);

    // Save AI response
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
io.engine.use(sessionMiddleware);
io.on("connection",async s=>{try{s.emit("queue:update",publicRows(await queueRows()))}catch(e){console.error(e.message)}});
app.use((err,req,res,next)=>{console.error(err);if(!res.headersSent)res.status(500).json({error:"Server error; check logs."});else next(err)});
const port=Number(process.env.PORT||3000);
init().then(()=>server.listen(port,"0.0.0.0",()=>console.log(`CareBridge listening on ${port}`)))
.catch(e=>{console.error(e);process.exit(1)});
process.on("SIGTERM",async()=>{server.close();await pool.end();process.exit(0)});
