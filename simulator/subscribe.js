const mqtt = require('mqtt');

const BROKER = process.env.MQTT_BROKER || 'mqtt://localhost:1883';
const TOPIC = 'wearable/device1/vitals';

const client = mqtt.connect(BROKER);

client.on('connect', () => {
  console.log('Subscriber connected to', BROKER, 'subscribing to', TOPIC);
  client.subscribe(TOPIC, (err) => {
    if (err) console.error('Subscribe error:', err.message || err);
  });
});

client.on('message', (topic, payload) => {
  try {
    const msg = JSON.parse(payload.toString());
    console.log('Received:', JSON.stringify(msg));
  } catch (e) {
    console.log('Received raw:', payload.toString());
  }
});

client.on('error', (err) => {
  console.error('MQTT error:', err && err.message ? err.message : err);
});

process.on('SIGINT', () => {
  client.end(false, () => process.exit(0));
});
