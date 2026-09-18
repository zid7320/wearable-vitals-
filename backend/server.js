const express = require('express');
const session = require('express-session');
const bcrypt = require('bcrypt');
const crypto = require('crypto');
const Database = require('better-sqlite3');
const path = require('path');
const { WebSocketServer } = require('ws');
const mqtt = require('mqtt');

const PORT = process.env.PORT || 3000;
const DB_PATH = path.resolve(__dirname, 'vitals.db');
const MQTT_BROKER = process.env.MQTT_BROKER || 'mqtt://localhost:1883';
const MQTT_TOPIC = 'wearable/+/vitals';
const SESSION_TTL_MS = 7 * 24 * 60 * 60 * 1000;
if (process.env.NODE_ENV === 'production' && !process.env.SESSION_SECRET) {
  throw new Error('SESSION_SECRET is required in production');
}
const SESSION_SECRET = process.env.SESSION_SECRET || crypto.randomBytes(32).toString('hex');
const ALLOWED_ORIGINS = new Set([
  'http://localhost:5173',
  'http://localhost:4173',
  'http://127.0.0.1:5173',
  'http://127.0.0.1:4173',
]);

const app = express();
const db = new Database(DB_PATH);

db.exec(`
  CREATE TABLE IF NOT EXISTS vitals (
    id INTEGER PRIMARY KEY AUTOINCREMENT,
    device_id TEXT,
    timestamp INTEGER,
    heart_rate REAL,
    temperature REAL,
    motion REAL
  );
  CREATE TABLE IF NOT EXISTS users (
    id INTEGER PRIMARY KEY AUTOINCREMENT,
    email TEXT NOT NULL UNIQUE,
    password_hash TEXT NOT NULL,
    created_at INTEGER NOT NULL
  );
  CREATE TABLE IF NOT EXISTS device_ownership (
    device_id TEXT PRIMARY KEY,
    user_id INTEGER NOT NULL,
    created_at INTEGER NOT NULL,
    FOREIGN KEY (user_id) REFERENCES users(id) ON DELETE CASCADE
  );
  CREATE TABLE IF NOT EXISTS sessions (
    sid TEXT PRIMARY KEY,
    sess TEXT NOT NULL,
    expires INTEGER NOT NULL
  );
`);

const columns = db.prepare('PRAGMA table_info(vitals)').all();
if (!columns.some((column) => column.name === 'device_id')) {
  try {
    db.exec('ALTER TABLE vitals ADD COLUMN device_id TEXT');
    console.log('Added device_id column to vitals table');
  } catch (error) {
    console.error('Failed to add device_id column:', error.message || error);
  }
}

class SQLiteSessionStore extends session.Store {
  get(sid, callback) {
    try {
      const row = db.prepare('SELECT sess, expires FROM sessions WHERE sid = ?').get(sid);
      if (!row || row.expires <= Date.now()) {
        if (row) db.prepare('DELETE FROM sessions WHERE sid = ?').run(sid);
        return callback(null, null);
      }
      return callback(null, JSON.parse(row.sess));
    } catch (error) {
      return callback(error);
    }
  }

  set(sid, sess, callback) {
    try {
      const expires = sess.cookie?.expires ? new Date(sess.cookie.expires).getTime() : Date.now() + SESSION_TTL_MS;
      db.prepare('INSERT INTO sessions (sid, sess, expires) VALUES (?, ?, ?) ON CONFLICT(sid) DO UPDATE SET sess = excluded.sess, expires = excluded.expires')
        .run(sid, JSON.stringify(sess), expires);
      return callback(null);
    } catch (error) {
      return callback(error);
    }
  }

  destroy(sid, callback) {
    try {
      db.prepare('DELETE FROM sessions WHERE sid = ?').run(sid);
      return callback(null);
    } catch (error) {
      return callback(error);
    }
  }

  touch(sid, sess, callback) {
    return this.set(sid, sess, callback);
  }
}

const sessionMiddleware = session({
  name: 'wearable.sid',
  secret: SESSION_SECRET,
  resave: false,
  saveUninitialized: false,
  store: new SQLiteSessionStore(),
  cookie: {
    httpOnly: true,
    secure: process.env.NODE_ENV === 'production',
    sameSite: 'lax',
    maxAge: SESSION_TTL_MS,
  },
});

app.use(express.json({ limit: '20kb' }));
app.use((req, res, next) => {
  const origin = req.headers.origin;
  if (origin && ALLOWED_ORIGINS.has(origin)) {
    res.header('Access-Control-Allow-Origin', origin);
    res.header('Access-Control-Allow-Credentials', 'true');
  }
  res.header('Access-Control-Allow-Methods', 'GET, POST, OPTIONS');
  res.header('Access-Control-Allow-Headers', 'Content-Type');
  if (req.method === 'OPTIONS') return res.sendStatus(204);
  return next();
});
app.use(sessionMiddleware);

const insertStmt = db.prepare('INSERT INTO vitals (device_id, timestamp, heart_rate, temperature, motion) VALUES (?, ?, ?, ?, ?)');

function parseRangeToMs(range) {
  if (!range) return 24 * 60 * 60 * 1000;
  const match = /^([0-9]+)\s*(m|h|d)?$/i.exec(range);
  if (!match) return 24 * 60 * 60 * 1000;
  const value = parseInt(match[1], 10);
  switch ((match[2] || 'h').toLowerCase()) {
    case 'm': return value * 60 * 1000;
    case 'h': return value * 60 * 60 * 1000;
    case 'd': return value * 24 * 60 * 60 * 1000;
    default: return 24 * 60 * 60 * 1000;
  }
}

function requireAuth(req, res, next) {
  if (!req.session.userId) return res.status(401).json({ error: 'authentication required' });
  return next();
}

function ownsDevice(userId, deviceId) {
  return Boolean(db.prepare('SELECT 1 FROM device_ownership WHERE user_id = ? AND device_id = ?').get(userId, deviceId));
}

function authorizedDeviceIds(userId) {
  return db.prepare('SELECT device_id FROM device_ownership WHERE user_id = ? ORDER BY device_id').all(userId).map((row) => row.device_id);
}

app.post('/auth/signup', async (req, res) => {
  const email = typeof req.body.email === 'string' ? req.body.email.trim().toLowerCase() : '';
  const password = typeof req.body.password === 'string' ? req.body.password : '';
  if (!email || password.length < 8) return res.status(400).json({ error: 'email and password (8+ characters) are required' });
  try {
    const passwordHash = await bcrypt.hash(password, 12);
    const result = db.prepare('INSERT INTO users (email, password_hash, created_at) VALUES (?, ?, ?)').run(email, passwordHash, Date.now());
    req.session.userId = result.lastInsertRowid;
    return req.session.save(() => res.status(201).json({ user: { id: result.lastInsertRowid, email } }));
  } catch (error) {
    if (error.code === 'SQLITE_CONSTRAINT_UNIQUE') return res.status(409).json({ error: 'account already exists' });
    console.error('Signup failed:', error.message || error);
    return res.status(500).json({ error: 'unable to create account' });
  }
});

app.post('/auth/login', async (req, res) => {
  const email = typeof req.body.email === 'string' ? req.body.email.trim().toLowerCase() : '';
  const password = typeof req.body.password === 'string' ? req.body.password : '';
  const user = db.prepare('SELECT id, email, password_hash FROM users WHERE email = ?').get(email);
  const valid = user ? await bcrypt.compare(password, user.password_hash) : false;
  if (!valid) return res.status(401).json({ error: 'invalid email or password' });
  req.session.userId = user.id;
  return req.session.save(() => res.json({ user: { id: user.id, email: user.email } }));
});

app.get('/auth/me', requireAuth, (req, res) => {
  const user = db.prepare('SELECT id, email FROM users WHERE id = ?').get(req.session.userId);
  if (!user) return res.status(401).json({ error: 'authentication required' });
  return res.json({ user });
});

app.post('/auth/logout', requireAuth, (req, res) => {
  req.session.destroy((error) => {
    if (error) return res.status(500).json({ error: 'unable to log out' });
    res.clearCookie('wearable.sid');
    return res.status(204).end();
  });
});

app.get('/devices', requireAuth, (req, res) => res.json({ devices: authorizedDeviceIds(req.session.userId) }));

app.post('/devices/pair', requireAuth, (req, res) => {
  const deviceId = typeof req.body.device_id === 'string' ? req.body.device_id.trim() : '';
  if (!deviceId || !/^[A-Za-z0-9_-]{1,80}$/.test(deviceId)) return res.status(400).json({ error: 'valid device_id is required' });
  try {
    db.prepare('INSERT INTO device_ownership (device_id, user_id, created_at) VALUES (?, ?, ?)').run(deviceId, req.session.userId, Date.now());
    return res.status(201).json({ device_id: deviceId });
  } catch (error) {
    if (error.code === 'SQLITE_CONSTRAINT_PRIMARYKEY') return res.status(409).json({ error: 'device is already paired' });
    console.error('Pairing failed:', error.message || error);
    return res.status(500).json({ error: 'unable to pair device' });
  }
});

app.get('/vitals/latest', requireAuth, (req, res) => {
  try {
    const deviceId = req.query.device_id;
    if (deviceId && !ownsDevice(req.session.userId, deviceId)) return res.status(403).json({ error: 'device not owned by user' });
    const row = deviceId
      ? db.prepare('SELECT * FROM vitals WHERE device_id = ? ORDER BY timestamp DESC LIMIT 1').get(deviceId)
      : db.prepare('SELECT * FROM vitals WHERE device_id IN (SELECT device_id FROM device_ownership WHERE user_id = ?) ORDER BY timestamp DESC LIMIT 1').get(req.session.userId);
    if (!row) return res.status(404).json({ error: 'no vitals found' });
    return res.json(row);
  } catch (error) {
    console.error('Error /vitals/latest:', error.message || error);
    return res.status(500).json({ error: 'internal server error' });
  }
});

app.get('/vitals/history', requireAuth, (req, res) => {
  try {
    const range = req.query.range || '24h';
    const deviceId = req.query.device_id;
    if (deviceId && !ownsDevice(req.session.userId, deviceId)) return res.status(403).json({ error: 'device not owned by user' });
    const offsetMs = parseRangeToMs(range);
    const shiftMs = Number(req.query.offset_hours || 0) * 60 * 60 * 1000;
    const windowEnd = Date.now() - (Number.isFinite(shiftMs) ? shiftMs : 0);
    const since = windowEnd - offsetMs;
    const rows = deviceId
      ? db.prepare('SELECT * FROM vitals WHERE timestamp >= ? AND device_id = ? ORDER BY timestamp ASC').all(since, deviceId)
      : db.prepare('SELECT * FROM vitals WHERE timestamp >= ? AND device_id IN (SELECT device_id FROM device_ownership WHERE user_id = ?) ORDER BY timestamp ASC').all(since, req.session.userId);
    if (!rows.length) return res.status(404).json({ error: 'no vitals in range' });
    return res.json({ range, since, count: rows.length, data: rows });
  } catch (error) {
    console.error('Error /vitals/history:', error.message || error);
    return res.status(500).json({ error: 'internal server error' });
  }
});

app.use((req, res) => res.status(404).json({ error: 'not found' }));

const server = app.listen(PORT, () => {
  console.log(`Server listening on http://localhost:${PORT}`);
  console.log('Using database:', DB_PATH);
});

const wss = new WebSocketServer({ noServer: true });
server.on('upgrade', (req, socket, head) => {
  sessionMiddleware(req, {}, () => {
    if (!req.session?.userId) {
      socket.write('HTTP/1.1 401 Unauthorized\r\n\r\n');
      socket.destroy();
      return;
    }
    wss.handleUpgrade(req, socket, head, (ws) => {
      ws.userId = req.session.userId;
      wss.emit('connection', ws, req);
    });
  });
});

wss.on('connection', (ws) => {
  console.log('WebSocket client connected');
  const latest = db.prepare('SELECT * FROM vitals WHERE device_id IN (SELECT device_id FROM device_ownership WHERE user_id = ?) ORDER BY timestamp DESC LIMIT 1').get(ws.userId);
  if (latest) ws.send(JSON.stringify({ type: 'latest', data: latest }));
});

const mqttClient = mqtt.connect(MQTT_BROKER);
mqttClient.on('connect', () => {
  console.log('Server connected to MQTT broker at', MQTT_BROKER);
  mqttClient.subscribe(MQTT_TOPIC, (error) => {
    if (error) console.error('MQTT subscribe error:', error.message || error);
    else console.log('Subscribed to', MQTT_TOPIC);
  });
});

mqttClient.on('message', (topic, payload) => {
  try {
    const topicParts = topic.split('/');
    const deviceId = topicParts.length === 3 ? topicParts[1] : null;
    const msg = JSON.parse(payload.toString());
    const { timestamp, heart_rate, temperature, motion } = msg;
    const info = insertStmt.run(deviceId, timestamp, heart_rate, temperature, motion);
    const inserted = { id: info.lastInsertRowid, device_id: deviceId, timestamp, heart_rate, temperature, motion };
    const frame = JSON.stringify({ type: 'vital', data: inserted });
    wss.clients.forEach((client) => {
      if (client.readyState === client.OPEN && ownsDevice(client.userId, deviceId)) client.send(frame);
    });
  } catch (error) {
    console.error('Failed to process MQTT message:', error.message || error);
  }
});

process.on('SIGINT', () => {
  console.log('\nShutting down server...');
  try { mqttClient.end(false); } catch (e) {}
  try { wss.close(); } catch (e) {}
  try { server.close(); } catch (e) {}
  try { db.close(); } catch (e) {}
  process.exit(0);
});
