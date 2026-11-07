require("dotenv").config();
const bcrypt=require("bcryptjs"),{Pool}=require("pg");
(async()=>{
 const {DATABASE_URL,STAFF_EMAIL,STAFF_PASSWORD,STAFF_ROLE="admin",PGSSL}=process.env;
 if(!DATABASE_URL||!STAFF_EMAIL||!STAFF_PASSWORD){console.error("Set DATABASE_URL, STAFF_EMAIL and STAFF_PASSWORD.");process.exit(1)}
 if(STAFF_PASSWORD.length<12){console.error("Password must be at least 12 characters.");process.exit(1)}
 if(!["admin","receptionist","doctor"].includes(STAFF_ROLE)){console.error("STAFF_ROLE must be admin, receptionist or doctor.");process.exit(1)}
 const pool=new Pool({connectionString:DATABASE_URL,ssl:PGSSL==="true"?{rejectUnauthorized:false}:undefined});
 try{
  await pool.query(`CREATE TABLE IF NOT EXISTS staff_users(id BIGSERIAL PRIMARY KEY,email TEXT UNIQUE NOT NULL,password_hash TEXT NOT NULL,role TEXT NOT NULL CHECK(role IN ('admin','receptionist','doctor')),created_at TIMESTAMPTZ DEFAULT NOW())`);
  const hash=await bcrypt.hash(STAFF_PASSWORD,12);
  await pool.query(`INSERT INTO staff_users(email,password_hash,role) VALUES($1,$2,$3)
   ON CONFLICT(email) DO UPDATE SET password_hash=EXCLUDED.password_hash,role=EXCLUDED.role`,
   [STAFF_EMAIL.trim().toLowerCase(),hash,STAFF_ROLE]);
  console.log(`Staff account created/updated: ${STAFF_EMAIL} (${STAFF_ROLE})`);
 }finally{await pool.end()}
})().catch(e=>{console.error(e);process.exit(1)});
