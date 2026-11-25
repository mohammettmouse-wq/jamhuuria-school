require('dotenv').config();
const express = require('express');
const session = require('express-session');
const SQLiteStore = require('connect-sqlite3')(session);
const Database = require('better-sqlite3');
const bcrypt = require('bcryptjs');
const helmet = require('helmet');
const path = require('path');
const fs = require('fs');

const app = express();
const PORT = process.env.PORT || 3000;
const dataDir = path.join(__dirname, 'data');
fs.mkdirSync(dataDir, { recursive: true });
const db = new Database(path.join(dataDir, 'jamhuuria.sqlite'));
db.pragma('journal_mode = WAL');
db.pragma('foreign_keys = ON');
db.exec(`
CREATE TABLE IF NOT EXISTS users (id INTEGER PRIMARY KEY, username TEXT UNIQUE NOT NULL, full_name TEXT NOT NULL, password_hash TEXT NOT NULL, role TEXT NOT NULL CHECK(role IN ('admin','teacher')), active INTEGER DEFAULT 1, created_at TEXT DEFAULT CURRENT_TIMESTAMP);
CREATE TABLE IF NOT EXISTS students (id INTEGER PRIMARY KEY, student_no TEXT UNIQUE NOT NULL, full_name TEXT NOT NULL, gender TEXT, class_name TEXT, guardian TEXT, phone TEXT, monthly_fee REAL DEFAULT 0, status TEXT DEFAULT 'Active', created_at TEXT DEFAULT CURRENT_TIMESTAMP);
CREATE TABLE IF NOT EXISTS attendance (id INTEGER PRIMARY KEY, student_id INTEGER NOT NULL REFERENCES students(id) ON DELETE CASCADE, day TEXT NOT NULL, status TEXT NOT NULL CHECK(status IN ('Present','Absent','Late','Excused')), note TEXT, marked_by INTEGER REFERENCES users(id), UNIQUE(student_id,day));
CREATE TABLE IF NOT EXISTS fees (id INTEGER PRIMARY KEY, student_id INTEGER NOT NULL REFERENCES students(id) ON DELETE CASCADE, amount REAL NOT NULL, paid_on TEXT NOT NULL, month_label TEXT, method TEXT DEFAULT 'Cash', note TEXT, received_by INTEGER REFERENCES users(id));
CREATE TABLE IF NOT EXISTS exams (id INTEGER PRIMARY KEY, student_id INTEGER NOT NULL REFERENCES students(id) ON DELETE CASCADE, exam_name TEXT NOT NULL, subject TEXT NOT NULL, score REAL NOT NULL, max_score REAL NOT NULL DEFAULT 100, exam_date TEXT NOT NULL, note TEXT, entered_by INTEGER REFERENCES users(id));
`);
const userCount = db.prepare('SELECT COUNT(*) n FROM users').get().n;
if (!userCount) {
  const username = process.env.ADMIN_USERNAME || 'admin';
  const password = process.env.ADMIN_PASSWORD || 'ChangeMe123!';
  db.prepare('INSERT INTO users(username,full_name,password_hash,role) VALUES(?,?,?,?)').run(username, 'Sir Amein Mouse Abdilahi', bcrypt.hashSync(password, 12), 'admin');
  console.log(`Initial admin created: ${username}. Change the password after first login.`);
}
app.use(helmet({ contentSecurityPolicy: false }));
app.use(express.json({limit:'1mb'}));
app.use(session({
  store: new SQLiteStore({ db: 'sessions.sqlite', dir: dataDir }),
  secret: process.env.SESSION_SECRET || 'please-change-this-session-secret-before-deployment',
  resave: false, saveUninitialized: false,
  cookie: { httpOnly: true, sameSite: 'lax', secure: process.env.NODE_ENV === 'production', maxAge: 8*60*60*1000 }
}));
const api = express.Router();
const auth = (req,res,next) => req.session.user ? next() : res.status(401).json({error:'Fadlan marka hore gal.'});
const admin = (req,res,next) => req.session.user?.role === 'admin' ? next() : res.status(403).json({error:'Admin keliya ayaa samayn kara hawshan.'});
const safe = u => ({id:u.id,username:u.username,full_name:u.full_name,role:u.role});
const wrap = fn => (req,res,next) => { try { fn(req,res,next); } catch(e) { console.error(e); res.status(400).json({error:e.message || 'Codsiga lama fulin.'}); } };
api.post('/login', wrap((req,res)=>{
 const {username,password}=req.body||{}; const u=db.prepare('SELECT * FROM users WHERE username=? AND active=1').get(String(username||''));
 if(!u || !bcrypt.compareSync(String(password||''),u.password_hash)) return res.status(401).json({error:'Username ama password waa khaldan yahay.'});
 req.session.user=safe(u); res.json({user:req.session.user});
}));
api.post('/logout',(req,res)=>req.session.destroy(()=>res.json({ok:true})));
api.get('/me',(req,res)=>res.json({user:req.session.user||null}));
api.use(auth);
api.get('/dashboard',wrap((req,res)=>{
 const students=db.prepare("SELECT COUNT(*) n FROM students WHERE status='Active'").get().n;
 const teachers=db.prepare("SELECT COUNT(*) n FROM users WHERE role='teacher' AND active=1").get().n;
 const today=new Date().toISOString().slice(0,10);
 const att=db.prepare("SELECT COUNT(*) total, SUM(status='Present') present FROM attendance WHERE day=?").get(today);
 const fees=db.prepare('SELECT COALESCE(SUM(amount),0) total FROM fees').get().total;
 const recent=db.prepare(`SELECT 'Attendance' kind, day date, status detail FROM attendance ORDER BY id DESC LIMIT 4`).all();
 res.json({students,teachers,attendance:att.total?Math.round((att.present||0)/att.total*100):0,fees,recent});
}));
api.get('/students',wrap((req,res)=>res.json(db.prepare('SELECT * FROM students ORDER BY id DESC').all())));
api.post('/students',admin,wrap((req,res)=>{const b=req.body; if(!b.student_no||!b.full_name) throw Error('Student ID iyo magaca ardayga waa loo baahan yahay.'); const r=db.prepare('INSERT INTO students(student_no,full_name,gender,class_name,guardian,phone,monthly_fee,status) VALUES(?,?,?,?,?,?,?,?)').run(b.student_no,b.full_name,b.gender||'',b.class_name||'',b.guardian||'',b.phone||'',Number(b.monthly_fee)||0,b.status||'Active');res.json({id:r.lastInsertRowid});}));
api.put('/students/:id',admin,wrap((req,res)=>{const b=req.body;db.prepare('UPDATE students SET student_no=?,full_name=?,gender=?,class_name=?,guardian=?,phone=?,monthly_fee=?,status=? WHERE id=?').run(b.student_no,b.full_name,b.gender||'',b.class_name||'',b.guardian||'',b.phone||'',Number(b.monthly_fee)||0,b.status||'Active',req.params.id);res.json({ok:true});}));
api.delete('/students/:id',admin,wrap((req,res)=>{db.prepare('DELETE FROM students WHERE id=?').run(req.params.id);res.json({ok:true});}));
api.get('/attendance',wrap((req,res)=>{const day=req.query.day||new Date().toISOString().slice(0,10);res.json(db.prepare(`SELECT a.*,s.student_no,s.full_name,s.class_name FROM attendance a JOIN students s ON s.id=a.student_id WHERE a.day=? ORDER BY s.class_name,s.full_name`).all(day));}));
api.post('/attendance',wrap((req,res)=>{const b=req.body;db.prepare(`INSERT INTO attendance(student_id,day,status,note,marked_by) VALUES(?,?,?,?,?) ON CONFLICT(student_id,day) DO UPDATE SET status=excluded.status,note=excluded.note,marked_by=excluded.marked_by`).run(b.student_id,b.day,b.status,b.note||'',req.session.user.id);res.json({ok:true});}));
api.get('/fees',wrap((req,res)=>res.json(db.prepare('SELECT f.*,s.student_no,s.full_name,s.class_name FROM fees f JOIN students s ON s.id=f.student_id ORDER BY f.paid_on DESC,f.id DESC').all())));
api.post('/fees',wrap((req,res)=>{const b=req.body;if(!(Number(b.amount)>0))throw Error('Geli lacag sax ah.');const r=db.prepare('INSERT INTO fees(student_id,amount,paid_on,month_label,method,note,received_by) VALUES(?,?,?,?,?,?,?)').run(b.student_id,Number(b.amount),b.paid_on,b.month_label||'',b.method||'Cash',b.note||'',req.session.user.id);res.json({id:r.lastInsertRowid});}));
api.get('/exams',wrap((req,res)=>res.json(db.prepare('SELECT e.*,s.student_no,s.full_name,s.class_name FROM exams e JOIN students s ON s.id=e.student_id ORDER BY e.exam_date DESC,e.id DESC').all())));
api.post('/exams',wrap((req,res)=>{const b=req.body;if(!b.exam_name||!b.subject||Number(b.max_score)<=0||Number(b.score)<0||Number(b.score)>Number(b.max_score))throw Error('Hubi magaca imtixaanka iyo dhibcaha.');const r=db.prepare('INSERT INTO exams(student_id,exam_name,subject,score,max_score,exam_date,note,entered_by) VALUES(?,?,?,?,?,?,?,?)').run(b.student_id,b.exam_name,b.subject,Number(b.score),Number(b.max_score),b.exam_date,b.note||'',req.session.user.id);res.json({id:r.lastInsertRowid});}));
api.get('/teachers',admin,wrap((req,res)=>res.json(db.prepare("SELECT id,username,full_name,active,created_at FROM users WHERE role='teacher' ORDER BY full_name").all())));
api.post('/teachers',admin,wrap((req,res)=>{const b=req.body;if(!b.username||!b.full_name||String(b.password||'').length<8)throw Error('Username, magaca iyo password ugu yaraan 8 xaraf geli.');const r=db.prepare('INSERT INTO users(username,full_name,password_hash,role) VALUES(?,?,?,\'teacher\')').run(b.username,b.full_name,bcrypt.hashSync(b.password,12));res.json({id:r.lastInsertRowid});}));
api.patch('/account/password',wrap((req,res)=>{const {current,newPassword}=req.body;if(String(newPassword||'').length<8)throw Error('Password-ka cusub ha ka yaraan 8 xaraf.');const u=db.prepare('SELECT * FROM users WHERE id=?').get(req.session.user.id);if(!bcrypt.compareSync(String(current||''),u.password_hash))return res.status(400).json({error:'Password-kii hore sax ma aha.'});db.prepare('UPDATE users SET password_hash=? WHERE id=?').run(bcrypt.hashSync(newPassword,12),u.id);res.json({ok:true});}));
api.get('/export',admin,wrap((req,res)=>{const data={students:db.prepare('SELECT * FROM students').all(),attendance:db.prepare('SELECT * FROM attendance').all(),fees:db.prepare('SELECT * FROM fees').all(),exams:db.prepare('SELECT * FROM exams').all(),exportedAt:new Date().toISOString()};res.setHeader('Content-Disposition','attachment; filename=jamhuuria-backup.json');res.json(data);}));
app.use('/api',api);
app.use(express.static(path.join(__dirname,'public')));
app.get('*',(req,res)=>res.sendFile(path.join(__dirname,'public','index.html')));
app.listen(PORT,()=>console.log(`JAMHUURIA system running at http://localhost:${PORT}`));
