const mqtt = require('mqtt');

const BROKER = process.env.MQTT_BROKER || 'mqtt://localhost:1883';
const TOPIC = 'wearable/device1/vitals';

const client = mqtt.connect(BROKER);

function clamp(v, min, max) {
  return Math.max(min, Math.min(max, v));
}

// Initial realistic starting values
let heart_rate = 75; // bpm
let temperature = 36.9; // C

function nextIntervalMs() {
  return 2000 + Math.floor(Math.random() * 3000); // 2000-5000 ms
}

function generateMotion(prev) {
  // Mostly low noise; occasional spike
  if (Math.random() < 0.08) {
    // spike: movement for this tick
    return +(Math.random() * 4 + 1).toFixed(2);
  }
  // baseline small jitter
  return +(Math.random() * 0.4).toFixed(2);
}

function publishReading() {
  // Random walk / drift for heart rate and temperature
  heart_rate += (Math.random() - 0.5) * 2; // small step
  heart_rate = clamp(heart_rate, 60, 90);
  heart_rate = Math.round(heart_rate);

  temperature += (Math.random() - 0.5) * 0.08; // small step
  temperature = clamp(temperature, 36.5, 37.5);
  temperature = +temperature.toFixed(2);

  const motion = generateMotion();
  const reading = {
    heart_rate,
    temperature,
    motion,
    timestamp: Date.now(),
  };

  const payload = JSON.stringify(reading);
  client.publish(TOPIC, payload, { qos: 0 }, (err) => {
    if (err) {
      console.error('Publish error:', err.message || err);
      return;
    }
    console.log('Published to', TOPIC, '-', payload);
  });

  // schedule next
  setTimeout(publishReading, nextIntervalMs());
}

client.on('connect', () => {
  console.log('Connected to MQTT broker at', BROKER);
  publishReading();
});

client.on('error', (err) => {
  console.error('MQTT error:', err && err.message ? err.message : err);
});

process.on('SIGINT', () => {
  console.log('\nShutting down simulator...');
  client.end(false, () => process.exit(0));
});
