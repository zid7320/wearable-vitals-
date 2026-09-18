import { useState } from 'react'
import { isValidThresholds } from '../utils/zones'

const fields = [
  ['heartRateWarningLow', 'HR Warning Low (BPM)', '0.1'],
  ['heartRateWarningHigh', 'HR Warning High (BPM)', '0.1'],
  ['heartRateCriticalLow', 'HR Critical Low (BPM)', '0.1'],
  ['heartRateCriticalHigh', 'HR Critical High (BPM)', '0.1'],
  ['temperatureWarning', 'Temperature Warning (°C)', '0.1'],
  ['temperatureCritical', 'Temperature Critical (°C)', '0.1'],
]

function SettingsPanel({ thresholds, onChange, onClose, notificationPermission, onEnableNotifications, devices, onPairDevice, userEmail, onLogout }) {
  const valid = isValidThresholds(thresholds)
  const [deviceId, setDeviceId] = useState('')
  const [pairError, setPairError] = useState('')

  const pairDevice = async () => {
    setPairError('')
    const result = await onPairDevice(deviceId)
    if (result.error) setPairError(result.error)
    else setDeviceId('')
  }

  return (
    <div className="settings-backdrop" role="presentation" onMouseDown={onClose}>
      <section
        className="settings-panel"
        role="dialog"
        aria-modal="true"
        aria-labelledby="settings-title"
        onMouseDown={(event) => event.stopPropagation()}
      >
        <div className="settings-panel__header">
          <div>
            <p className="eyebrow">Dashboard settings</p>
            <h2 id="settings-title">Alert thresholds</h2>
          </div>
          <button type="button" className="settings-close" onClick={onClose} aria-label="Close settings">
            ×
          </button>
        </div>

        <div className="settings-fields">
          {fields.map(([key, label, step]) => (
            <label key={key} className="settings-field">
              <span>{label}</span>
              <input
                type="number"
                step={step}
                value={thresholds[key]}
                onChange={(event) => onChange(key, event.target.value === '' ? '' : Number(event.target.value))}
              />
            </label>
          ))}
        </div>

        {!valid && (
          <p className="settings-error" role="alert">
            Warning limits must stay within their matching critical limits.
          </p>
        )}

        <p className="settings-note">Changes apply immediately and are saved on this device.</p>

        <div className="notification-settings">
          <div>
            <strong>Native critical alerts</strong>
            <p className="settings-note">Show critical alerts when this tab is in the background.</p>
          </div>
          <button
            type="button"
            className="download-button"
            onClick={onEnableNotifications}
            disabled={notificationPermission === 'granted' || notificationPermission === 'denied'}
          >
            {notificationPermission === 'granted' ? 'Enabled' : notificationPermission === 'denied' ? 'Blocked' : 'Enable'}
          </button>
        </div>

        <div className="pairing-settings">
          <strong>Pair a device</strong>
          <p className="settings-note">Only paired devices are visible to your account.</p>
          <div className="pairing-row">
            <input type="text" value={deviceId} onChange={(event) => setDeviceId(event.target.value)} placeholder="device1" aria-label="Device ID to pair" />
            <button type="button" className="download-button" onClick={pairDevice} disabled={!deviceId.trim()}>Pair</button>
          </div>
          {pairError && <p className="settings-error" role="alert">{pairError}</p>}
          {devices.length > 0 && <p className="settings-note">Paired: {devices.join(', ')}</p>}
        </div>

        <div className="account-settings">
          <span>{userEmail}</span>
          <button type="button" className="auth-switch" onClick={onLogout}>Log out</button>
        </div>
      </section>
    </div>
  )
}

export default SettingsPanel
