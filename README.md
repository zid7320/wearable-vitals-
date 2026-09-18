# Wearable Vitals Monitor

A wearable health-monitoring system that streams real-time heart rate, temperature, and motion data from a device to a live web dashboard over MQTT.

## Overview

Wearable Vitals Monitor is designed around an ESP32-class wearable device that continuously measures a person's vital signs and publishes them to an MQTT broker. A Node.js backend ingests that stream, persists it to a database, and relays it to a React dashboard in real time over WebSockets, so a caregiver or the wearer can watch heart rate, temperature, and motion update live and review historical trends. Since no physical ESP32 firmware is included in this repository, a Node.js simulator stands in for the device, publishing the same MQTT payloads a real ESP32 would send.

## Hardware Note

This project was originally built and tested on physical ESP32 hardware provided by EPI Digital School, measuring real vital signs and transmitting them via MQTT. Since the hardware belonged to the school and isn't available anymore, this repository includes a simulator (`simulator/simulate_device.js`) that replicates the same MQTT payload format, so the backend and dashboard can still be demonstrated end-to-end without the physical device.

## Features

- **Real-time vitals monitoring** — live heart rate, temperature, and motion readings pushed to the dashboard over a WebSocket as soon as they arrive
- **Continuous data transmission** — the (simulated) device publishes a new reading every 2–5 seconds over MQTT, which the backend ingests and stores continuously
- **Historical charting** — a history view (1h / 6h / 24h ranges) backed by SQLite-stored readings, rendered with Chart.js, including an optional "compare to yesterday" overlay
- **Threshold-based alerts** — configurable warning/critical thresholds for heart rate and temperature, with in-app toast notifications and browser Notifications when a reading crosses a zone
- **Trend anomaly detection** — a rolling statistical (standard-deviation) check flags unusual heart-rate/temperature readings independent of fixed thresholds
- **Multi-device support** — a device selector in the dashboard lets a user switch between multiple paired wearables
- **User accounts & device pairing** — email/password signup and login (bcrypt-hashed, session-cookie based), with devices explicitly paired to a user account so vitals are only visible to their owner
- **Light/dark theme** and an installable **PWA** (offline app shell via a Vite PWA manifest and service worker; live vitals/history data itself is always fetched fresh over the network, never served from cache)

## Tech Stack

**Backend** (`backend/`)
- Node.js, CommonJS modules
- [Express 5](https://expressjs.com/) — HTTP API
- [ws](https://github.com/websockets/ws) — WebSocket server for pushing live readings to the frontend
- [mqtt](https://github.com/mqttjs/MQTT.js) — MQTT client, subscribing to device telemetry
- [better-sqlite3](https://github.com/WiseLibs/better-sqlite3) — SQLite storage for vitals, users, device ownership, and sessions
- [express-session](https://github.com/expressjs/session) with a custom SQLite-backed session store
- [bcrypt](https://github.com/kelektiv/node.bcrypt.js) — password hashing
- [nodemon](https://github.com/remy/nodemon) (dev dependency) for auto-restart

**Frontend** (`frontend/`)
- [React 19](https://react.dev/) + [Vite](https://vite.dev/)
- [chart.js](https://www.chartjs.org/) + [react-chartjs-2](https://github.com/reactchartjs/react-chartjs-2) — history charting
- [vite-plugin-pwa](https://vite-plugin-pwa.netlify.app/) — installable PWA support (manifest + service worker)
- Native `WebSocket` and `fetch` APIs for talking to the backend
- [oxlint](https://oxc.rs/) for linting

**Simulator** (`simulator/`)
- Node.js + the `mqtt` client library, publishing synthetic vitals in place of real ESP32 firmware

## Architecture / How It Works

```
[ESP32 wearable / simulator] --MQTT (mqtt://broker:1883)--> [Mosquitto broker]
                                                                    |
                                                                    v
                                                      [Backend: subscribes to
                                                       "wearable/+/vitals"]
                                                            |            \
                                                    stores in SQLite   pushes live
                                                            |          readings over
                                                            v          WebSocket
                                                   [HTTP API: /vitals/*,       |
                                                    /auth/*, /devices/*]       v
                                                            |          [Frontend: React
                                                            +--------> dashboard, live +
                                                                       history views]
```

- The device (or `simulator/simulate_device.js`) publishes a JSON payload (`device_id`, `heart_rate`, `temperature`, `motion`, `timestamp`) to the MQTT topic `wearable/<device_id>/vitals` on a Mosquitto broker.
- `backend/server.js` connects to that broker as an MQTT subscriber, writes every incoming reading into a `vitals` table in SQLite (`backend/vitals.db`), and broadcasts it to connected dashboard clients over a **WebSocket** (`ws`), scoped to clients whose logged-in user owns that `device_id`.
- The frontend authenticates via a session-cookie-based REST API (`/auth/signup`, `/auth/login`, `/auth/me`, `/auth/logout`), pairs devices to the account (`/devices`, `/devices/pair`), opens a WebSocket to receive live readings, and calls `/vitals/latest` and `/vitals/history` (HTTP) to render current values and historical charts.
- `backend/ingest.js` is a standalone alternative ingestion process — it subscribes to the same MQTT topic and writes to the same SQLite database independent of the HTTP/WebSocket server, useful for running storage separately from the API/WebSocket layer.

## Folder Structure

```
wearable-vitals/
├── backend/
│   ├── server.js          # Express API + WebSocket server + MQTT subscriber (main backend entry point)
│   ├── ingest.js           # Standalone MQTT-to-SQLite ingestion process
│   ├── ws_test_client.js   # Manual test client for the WebSocket endpoint
│   └── vitals.db           # SQLite database (created/used at runtime)
├── frontend/
│   ├── src/
│   │   ├── App.jsx                    # Root component: auth gate, theme, thresholds, layout
│   │   ├── components/
│   │   │   ├── AuthScreen.jsx         # Login / signup form
│   │   │   ├── LiveVitals.jsx         # Live heart rate/temperature/motion cards + WebSocket client
│   │   │   ├── HistoryChart.jsx       # Historical vitals chart (Chart.js)
│   │   │   ├── SettingsPanel.jsx      # Threshold config, device pairing, notifications, logout
│   │   │   └── ToastProvider.jsx      # Toast notification context/UI
│   │   └── utils/
│   │       ├── zones.js               # Warning/critical threshold logic
│   │       ├── anomaly.js             # Rolling standard-deviation anomaly detection
│   │       └── motion.js              # Motion value classification
│   ├── public/                        # PWA icons, favicon, manifest assets
│   └── vite.config.js                 # Vite + PWA plugin configuration
└── simulator/
    ├── simulate_device.js  # Continuously publishes simulated vitals over MQTT (stands in for the ESP32)
    ├── publish_once.js     # Publishes a single reading (useful for manual testing)
    └── subscribe.js        # Minimal MQTT subscriber for debugging the broker/topic
```

## Setup / Installation

These steps are based on the actual `package.json` scripts and the project's own `START.md`.

### Prerequisites

- Node.js
- An MQTT broker reachable at `mqtt://localhost:1883` (the project's `START.md` uses a Docker Mosquitto container: `docker run -d --name mosquitto -p 1883:1883 eclipse-mosquitto:2.1.2`)

### 1. Install dependencies

From the project root (installs backend/simulator dependencies):
```bash
npm install
```

Then install the frontend's dependencies separately:
```bash
cd frontend
npm install
```

### 2. Start the MQTT broker

```bash
docker start mosquitto
# or, if the container doesn't exist yet:
docker run -d --name mosquitto -p 1883:1883 eclipse-mosquitto:2.1.2
```

### 3. Start the backend

From the project root:
```bash
npm run server
```
This runs `nodemon backend/server.js`, which starts the Express API on `http://localhost:3000`, opens the WebSocket server, and subscribes to MQTT vitals.

### 4. Start the simulator (in place of a real ESP32 device)

From the project root, in a separate terminal:
```bash
npm run simulate
```
This runs `node simulator/simulate_device.js`, which publishes a simulated reading to `wearable/device1/vitals` every 2–5 seconds. Pass a different device id as an argument to simulate another device, e.g. `node simulator/simulate_device.js device2`.

### 5. Start the frontend

```bash
cd frontend
npm run dev
```
Open the printed URL (typically `http://localhost:5173/`). Sign up for an account, then pair the simulated device's id (default `device1`) from the settings panel to see live data.

Other available scripts:
- Root: `npm run ingest` — runs the standalone `backend/ingest.js` MQTT-to-SQLite ingestion process
- Frontend: `npm run build` (production build), `npm run preview` (preview the build), `npm run lint` (oxlint)

## Author

**Aymen Zid**
Software Engineer, Sousse, Tunisia
GitHub: [github.com/zid7320](https://github.com/zid7320)
