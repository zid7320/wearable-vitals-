const WebSocket = require('ws');

const ws = new WebSocket('ws://localhost:3000');

ws.on('open', () => console.log('ws test client connected'));
ws.on('message', (m) => {
  try {
    const obj = JSON.parse(m.toString());
    console.log('ws message:', JSON.stringify(obj));
  } catch (e) {
    console.log('ws raw:', m.toString());
  }
});

setTimeout(() => {
  console.log('ws test client exiting after 20s');
  process.exit(0);
}, 20000);
