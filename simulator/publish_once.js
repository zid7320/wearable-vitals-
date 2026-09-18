const mqtt = require('mqtt');

const BROKER = process.env.MQTT_BROKER || 'mqtt://localhost:1883';
const [, , deviceId = 'device1', heartRate = '75', temperature = '36.9', motion = '0.2'] = process.argv;

const reading = {
  device_id: deviceId,
  heart_rate: Number(heartRate),
  temperature: Number(temperature),
  motion: Number(motion),
  timestamp: Date.now(),
};

console.log('Connecting to', BROKER, '...');
const client = mqtt.connect(BROKER, { connectTimeout: 5000 });

const timeout = setTimeout(() => {
  console.log('TIMED OUT waiting to connect to broker.');
  process.exit(1);
}, 8000);

client.on('connect', () => {
  clearTimeout(timeout);
  const topic = `wearable/${deviceId}/vitals`;
  client.publish(topic, JSON.stringify(reading), { qos: 0 }, (err) => {
    if (err) {
      console.log('PUBLISH FAILED:', err.message);
    } else {
      console.log('Published to', topic, '-', JSON.stringify(reading));
    }
    client.end(false, () => process.exit(err ? 1 : 0));
  });
});

client.on('error', (err) => {
  clearTimeout(timeout);
  console.log('CONNECTION ERROR:', err.message);
  process.exit(1);
});
