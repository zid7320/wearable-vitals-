const mqtt = require('mqtt');
const Database = require('better-sqlite3');
const path = require('path');

const BROKER = process.env.MQTT_BROKER || 'mqtt://localhost:1883';
const TOPIC = 'wearable/device1/vitals';
const DB_PATH = path.resolve(__dirname, 'vitals.db');

// Open or create database
const db = new Database(DB_PATH);

// Create table if not exists
db.exec(`
  CREATE TABLE IF NOT EXISTS vitals (
    id INTEGER PRIMARY KEY AUTOINCREMENT,
    timestamp INTEGER,
    heart_rate REAL,
    temperature REAL,
    motion REAL
  )
`);

const insertStmt = db.prepare(
  'INSERT INTO vitals (timestamp, heart_rate, temperature, motion) VALUES (?, ?, ?, ?)'
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
    const msg = JSON.parse(payload.toString());
    const { timestamp, heart_rate, temperature, motion } = msg;
    const info = insertStmt.run(timestamp, heart_rate, temperature, motion);
    console.log(`Inserted id=${info.lastInsertRowid} ts=${timestamp} hr=${heart_rate} temp=${temperature} motion=${motion}`);
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
