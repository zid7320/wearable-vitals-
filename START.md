# Running wearable-vitals

## Quick start (recommended)

From the project root in PowerShell:

```powershell
cd C:\Users\MSI\Desktop\wearable-vitals
.\start.ps1
```

If PowerShell blocks the script the first time, allow it for this session:

```powershell
Set-ExecutionPolicy -Scope Process -ExecutionPolicy Bypass
.\start.ps1
```

This opens three new terminal windows automatically:
1. Backend (`node backend\server.js`)
2. Simulator (`node simulator\simulate_device.js`)
3. Frontend (`npm run dev`)

It also starts the Mosquitto Docker container if it isn't already running. Once all three windows are up, open **http://localhost:5173/**.

---

## Manual start (if you prefer full control)

Open **three separate terminals**, all from the project root `C:\Users\MSI\Desktop\wearable-vitals`.

**1. MQTT broker (Docker must be running first)**
```powershell
docker start mosquitto
```
If the container doesn't exist yet:
```powershell
docker run -d --name mosquitto -p 1883:1883 eclipse-mosquitto:2.1.2
```

**2. Backend**
```powershell
node backend\server.js
```
Expect to see:
```
Server listening on http://localhost:3000
Server connected to MQTT broker at mqtt://localhost:1883
Subscribed to wearable/device1/vitals
```

**3. Simulator**
```powershell
node simulator\simulate_device.js
```
Expect repeated `Published to wearable/device1/vitals - {...}` lines.

**4. Frontend**
```powershell
cd frontend
npm run dev
```
Open the printed URL, typically **http://localhost:5173/**.

---

## Verifying it's working

The dashboard should show:
- Status badge: **LIVE** (not "Connecting")
- Heart rate, temperature, and motion updating every few seconds
- The Vitals History chart plotting a red (heart rate) and blue (temperature) line

## Common issues

| Symptom | Likely cause | Fix |
|---|---|---|
| `Cannot find module` error | Wrong path — scripts live in subfolders | Use `node backend\server.js` and `node simulator\simulate_device.js`, not the bare filenames |
| Dashboard stuck on "Connecting" | Backend or simulator not running | Check both terminals are open with no errors |
| Docker run fails: name already in use | Container already exists | Run `docker start mosquitto` instead of `docker run` |
| `npm run` with no output | Missing script argument | Use `npm run dev`, not just `npm run` |
