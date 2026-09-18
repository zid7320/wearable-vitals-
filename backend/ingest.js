const mqtt = require('mqtt');
const Database = require('better-sqlite3');
const path = require('path');

const BROKER = process.env.MQTT_BROKER || 'mqtt://localhost:1883';
const TOPIC = 'wearable/+/vitals';
const DB_PATH = path.resolve(__dirname, 'vitals.db');

// Open or create database
const db = new Database(DB_PATH);

// Create table if not exists
db.exec(`
  CREATE TABLE IF NOT EXISTS vitals (
    id INTEGER PRIMARY KEY AUTOINCREMENT,
    device_id TEXT,
    timestamp INTEGER,
    heart_rate REAL,
    temperature REAL,
    motion REAL
  )
`);

const columns = db.prepare('PRAGMA table_info(vitals)').all();
if (!columns.some((column) => column.name === 'device_id')) {
  try {
    db.exec('ALTER TABLE vitals ADD COLUMN device_id TEXT');
    console.log('Added device_id column to vitals table');
  } catch (e) {
    console.error('Failed to add device_id column:', e.message || e);
  }
}

const insertStmt = db.prepare(
  'INSERT INTO vitals (device_id, timestamp, heart_rate, temperature, motion) VALUES (?, ?, ?, ?, ?)'
);

const client = mqtt.connect(BROKER);

client.on('connect', () => {
  console.log('Ingest service connected to MQTT broker at', BROKER);
  client.subscribe(TOPIC, (err) => {
    if (err) console.error('Subscribe error:', err.message || err);
    else console.log('Subscribed to', TOPIC);
  });
});

client.on('message', (topic, payload) => {
  try {
    const topicParts = topic.split('/');
    const deviceId = topicParts.length === 3 ? topicParts[1] : null;
    const msg = JSON.parse(payload.toString());
    const { timestamp, heart_rate, temperature, motion } = msg;
    const info = insertStmt.run(deviceId, timestamp, heart_rate, temperature, motion);
    console.log(`Inserted id=${info.lastInsertRowid} device=${deviceId} ts=${timestamp} hr=${heart_rate} temp=${temperature} motion=${motion}`);
  } catch (e) {
    console.error('Failed to process message:', e && e.message ? e.message : e);
  }
});

client.on('error', (err) => {
  console.error('MQTT error:', err && err.message ? err.message : err);
});

process.on('SIGINT', () => {
  console.log('\nShutting down ingest service...');
  try { client.end(false); } catch (e) {}
  try { db.close(); } catch (e) {}
  process.exit(0);
});

console.log('Ingest service started, database at', DB_PATH);
