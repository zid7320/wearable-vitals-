const express = require('express');
const Database = require('better-sqlite3');
const path = require('path');
const { WebSocketServer } = require('ws');
const mqtt = require('mqtt');

const PORT = process.env.PORT || 3000;
const DB_PATH = path.resolve(__dirname, 'vitals.db');
const MQTT_BROKER = process.env.MQTT_BROKER || 'mqtt://localhost:1883';
const MQTT_TOPIC = 'wearable/device1/vitals';

const app = express();

app.use((req, res, next) => {
  res.header('Access-Control-Allow-Origin', '*');
  res.header('Access-Control-Allow-Methods', 'GET, OPTIONS');
  res.header('Access-Control-Allow-Headers', 'Content-Type');

  if (req.method === 'OPTIONS') {
    return res.sendStatus(204);
  }

  return next();
});

// Use writable DB here so we can ingest and serve from same process
const db = new Database(DB_PATH);

// ensure table exists
db.exec(`
  CREATE TABLE IF NOT EXISTS vitals (
    id INTEGER PRIMARY KEY AUTOINCREMENT,
    timestamp INTEGER,
    heart_rate REAL,
    temperature REAL,
    motion REAL
  )
`);

const insertStmt = db.prepare('INSERT INTO vitals (timestamp, heart_rate, temperature, motion) VALUES (?, ?, ?, ?)');

function parseRangeToMs(range) {
  if (!range) return 24 * 60 * 60 * 1000; // default 24h
  const m = /^([0-9]+)\s*(m|h|d)?$/i.exec(range);
  if (!m) return 24 * 60 * 60 * 1000;
  const val = parseInt(m[1], 10);
  const unit = (m[2] || 'h').toLowerCase();
  switch (unit) {
    case 'm': return val * 60 * 1000;
    case 'h': return val * 60 * 60 * 1000;
    case 'd': return val * 24 * 60 * 60 * 1000;
    default: return 24 * 60 * 60 * 1000;
  }
}

app.get('/vitals/latest', (req, res) => {
  try {
    const row = db.prepare('SELECT * FROM vitals ORDER BY timestamp DESC LIMIT 1').get();
    if (!row) return res.status(404).json({ error: 'no vitals found' });
    return res.json(row);
  } catch (e) {
    console.error('Error /vitals/latest', e.message || e);
    return res.status(500).json({ error: 'internal server error' });
  }
});

app.get('/vitals/history', (req, res) => {
  try {
    const range = req.query.range || '24h';
    const offsetMs = parseRangeToMs(range);
    const since = Date.now() - offsetMs;
    const rows = db.prepare('SELECT * FROM vitals WHERE timestamp >= ? ORDER BY timestamp ASC').all(since);
    if (!rows || rows.length === 0) return res.status(404).json({ error: 'no vitals in range' });
    return res.json({ range, since, count: rows.length, data: rows });
  } catch (e) {
    console.error('Error /vitals/history', e.message || e);
    return res.status(500).json({ error: 'internal server error' });
  }
});

app.use((req, res) => res.status(404).json({ error: 'not found' }));

// start HTTP server
const server = app.listen(PORT, () => {
  console.log(`Server listening on http://localhost:${PORT}`);
  console.log('Using database:', DB_PATH);
});

// attach WebSocket server
const wss = new WebSocketServer({ server });

wss.on('connection', (ws) => {
  console.log('WebSocket client connected');
  // send latest reading immediately if available
  try {
    const latest = db.prepare('SELECT * FROM vitals ORDER BY timestamp DESC LIMIT 1').get();
    if (latest) ws.send(JSON.stringify({ type: 'latest', data: latest }));
  } catch (e) {
    console.error('Error fetching latest for WS client', e && e.message ? e.message : e);
  }
});

// MQTT ingestion and broadcasting
const mqttClient = mqtt.connect(MQTT_BROKER);

mqttClient.on('connect', () => {
  console.log('Server connected to MQTT broker at', MQTT_BROKER);
  mqttClient.subscribe(MQTT_TOPIC, (err) => {
    if (err) console.error('MQTT subscribe error:', err.message || err);
    else console.log('Subscribed to', MQTT_TOPIC);
  });
});

mqttClient.on('message', (topic, payload) => {
  try {
    const msg = JSON.parse(payload.toString());
    const { timestamp, heart_rate, temperature, motion } = msg;
    const info = insertStmt.run(timestamp, heart_rate, temperature, motion);
    const inserted = { id: info.lastInsertRowid, timestamp, heart_rate, temperature, motion };
    // broadcast to all ws clients
    const frame = JSON.stringify({ type: 'vital', data: inserted });
    wss.clients.forEach((c) => {
      if (c.readyState === c.OPEN) c.send(frame);
    });
    console.log(`Ingested & broadcast id=${inserted.id}`);
  } catch (e) {
    console.error('Failed to process MQTT message:', e && e.message ? e.message : e);
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
