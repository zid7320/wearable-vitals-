import { useCallback, useEffect, useState } from 'react'
import './App.css'
import AuthScreen from './components/AuthScreen'
import HistoryChart from './components/HistoryChart'
import LiveVitals from './components/LiveVitals'
import SettingsPanel from './components/SettingsPanel'
import ToastProvider from './components/ToastProvider'
import { DEFAULT_THRESHOLDS, isValidThresholds } from './utils/zones'

const MAX_HISTORY_POINTS = 500
const THRESHOLDS_STORAGE_KEY = 'wearable-vitals-thresholds'
const THEME_STORAGE_KEY = 'wearable-vitals-theme'

function loadThresholds() {
  try {
    const stored = window.localStorage.getItem(THRESHOLDS_STORAGE_KEY)
    if (!stored) return DEFAULT_THRESHOLDS

    const parsed = { ...DEFAULT_THRESHOLDS, ...JSON.parse(stored) }
    return isValidThresholds(parsed) ? parsed : DEFAULT_THRESHOLDS
  } catch {
    return DEFAULT_THRESHOLDS
  }
}

function loadTheme() {
  const stored = window.localStorage.getItem(THEME_STORAGE_KEY)
  if (stored === 'light' || stored === 'dark') return stored
  return window.matchMedia('(prefers-color-scheme: dark)').matches ? 'dark' : 'light'
}

function App() {
  const [chartData, setChartData] = useState([])
  const [thresholds, setThresholds] = useState(loadThresholds)
  const [activeThresholds, setActiveThresholds] = useState(loadThresholds)
  const [settingsOpen, setSettingsOpen] = useState(false)
  const [theme, setTheme] = useState(loadTheme)
  const [notificationPermission, setNotificationPermission] = useState(
    typeof Notification === 'undefined' ? 'unsupported' : Notification.permission,
  )
  const [devices, setDevices] = useState([])
  const [selectedDevice, setSelectedDevice] = useState('')
  const [user, setUser] = useState(null)
  const [authLoading, setAuthLoading] = useState(true)

  useEffect(() => {
    document.documentElement.dataset.theme = theme
    window.localStorage.setItem(THEME_STORAGE_KEY, theme)
  }, [theme])

  useEffect(() => {
    if (isValidThresholds(thresholds)) {
      window.localStorage.setItem(THRESHOLDS_STORAGE_KEY, JSON.stringify(thresholds))
    }
  }, [thresholds])

  useEffect(() => {
    fetch('http://localhost:3000/auth/me', { credentials: 'include' })
      .then((response) => response.ok ? response.json() : null)
      .then((result) => setUser(result?.user || null))
      .catch(() => setUser(null))
      .finally(() => setAuthLoading(false))
  }, [])

  useEffect(() => {
    if (!user) return
    fetch('http://localhost:3000/devices', { credentials: 'include' })
      .then((response) => response.json())
      .then((result) => {
        const owned = Array.isArray(result.devices) ? result.devices : []
        setDevices(owned)
        setSelectedDevice((current) => current && owned.includes(current) ? current : owned[0] || '')
      })
      .catch(() => setDevices([]))
  }, [user])

  const handleThresholdChange = (key, value) => {
    const nextThresholds = { ...thresholds, [key]: value }
    setThresholds(nextThresholds)

    if (isValidThresholds(nextThresholds)) {
      setActiveThresholds(nextThresholds)
    }
  }

  const enableNotifications = async () => {
    if (typeof Notification === 'undefined') return
    const permission = await Notification.requestPermission()
    setNotificationPermission(permission)
  }

  const pairDevice = async (deviceId) => {
    try {
      const response = await fetch('http://localhost:3000/devices/pair', {
        method: 'POST', credentials: 'include', headers: { 'Content-Type': 'application/json' }, body: JSON.stringify({ device_id: deviceId }),
      })
      const result = await response.json()
      if (!response.ok) return result
      setDevices((current) => [...new Set([...current, result.device_id])].sort())
      setSelectedDevice(result.device_id)
      return result
    } catch {
      return { error: 'Unable to pair device' }
    }
  }

  const logout = async () => {
    await fetch('http://localhost:3000/auth/logout', { method: 'POST', credentials: 'include' })
    setUser(null)
    setDevices([])
    setSelectedDevice('')
  }

  const handleDeviceSeen = useCallback((deviceId) => {
    setDevices((current) => {
      if (current.includes(deviceId)) return current
      return [...current, deviceId].sort()
    })
    setSelectedDevice((current) => current || deviceId)
  }, [])

  const handleLiveReading = useCallback((reading) => {
    if (!reading || reading.timestamp == null) return

    setChartData((current) => {
      const next = [...current, reading]
      return next.slice(-MAX_HISTORY_POINTS)
    })
  }, [])

  if (authLoading) return <div className="auth-loading">Loading secure dashboard…</div>
  if (!user) return <AuthScreen onAuthenticated={setUser} />

  return (
    <ToastProvider>
      <main className="app-shell app-shell--stacked">
        <header className="topbar">
          <div className="brand">
            <div className="brand__mark">W</div>
            <div>
              <p className="brand__eyebrow">Wearable telemetry</p>
              <h1>Vitals Dashboard</h1>
            </div>
          </div>
          <button
            type="button"
            className="settings-button"
            onClick={() => setSettingsOpen(true)}
            aria-label="Open alert threshold settings"
            title="Alert threshold settings"
          >
            <span aria-hidden="true">&#9881;</span>
          </button>
          {devices.length > 0 && (
            <label className="device-selector">
              <span className="sr-only">Select device</span>
              <select value={selectedDevice} onChange={(event) => setSelectedDevice(event.target.value)}>
                {devices.map((deviceId) => (
                  <option key={deviceId} value={deviceId}>{deviceId}</option>
                ))}
              </select>
            </label>
          )}
          <button
            type="button"
            className="theme-button"
            onClick={() => setTheme((current) => current === 'dark' ? 'light' : 'dark')}
            aria-label={`Switch to ${theme === 'dark' ? 'light' : 'dark'} theme`}
            title={`Switch to ${theme === 'dark' ? 'light' : 'dark'} theme`}
          >
            <span aria-hidden="true">{theme === 'dark' ? '☀' : '☾'}</span>
          </button>
        </header>

        <LiveVitals
          onReading={handleLiveReading}
          onDeviceSeen={handleDeviceSeen}
          selectedDevice={selectedDevice}
          thresholds={activeThresholds}
        />
        <HistoryChart data={chartData} onDataChange={setChartData} theme={theme} deviceId={selectedDevice} />
      </main>
      {settingsOpen && (
        <SettingsPanel
          thresholds={thresholds}
          onChange={handleThresholdChange}
          onClose={() => setSettingsOpen(false)}
          notificationPermission={notificationPermission}
          onEnableNotifications={enableNotifications}
          devices={devices}
          onPairDevice={pairDevice}
          userEmail={user.email}
          onLogout={logout}
        />
      )}
    </ToastProvider>
  )
}

export default App
